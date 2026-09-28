import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Images, X, Trash2, Check, Loader2, ImagePlus } from 'lucide-react';
import { format } from 'date-fns';
import { deleteObject } from 'firebase/storage';
import {
  db, collection, query, where, onSnapshot, addDoc, deleteDoc, doc,
  serverTimestamp, handleFirestoreError, OperationType, storage, ref,
} from '../firebase';
import { useFirebase } from '../contexts/FirebaseContext';
import { uploadPlantPhoto } from '../lib/photoUpload';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';

export interface PlantPhoto {
  id: string;
  url: string;
  storagePath: string;
  caption?: string;
  createdAt?: any;
  ownerUid: string;
}

function photoTime(photo: PlantPhoto): number {
  const created = photo.createdAt as { toMillis?: () => number } | undefined;
  return typeof created?.toMillis === 'function' ? created.toMillis() : 0;
}

interface Props {
  plantId: string;
  plantName: string;
  currentImage?: string;
  onSetProfilePhoto: (url: string) => Promise<void>;
}

/**
 * Per-plant visual timeline: snap photos over time to watch growth,
 * compare before/after treatments, or just document the season.
 * Any photo can become the plant's profile photo with one tap.
 */
export default function PlantPhotoLog({ plantId, plantName, currentImage, onSetProfilePhoto }: Props) {
  const { user } = useFirebase();
  const [photos, setPhotos] = useState<PlantPhoto[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [lightbox, setLightbox] = useState<PlantPhoto | null>(null);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [settingProfile, setSettingProfile] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!plantId || !user) return;
    // Photo rules allow a read only when ownerUid matches. A bare orderBy
    // query is rejected, so uploads succeed and the timeline stays empty.
    const q = query(
      collection(db, 'inhabitants', plantId, 'photos'),
      where('ownerUid', '==', user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PlantPhoto, 'id'>) }));
      list.sort((a, b) => photoTime(b) - photoTime(a));
      setPhotos(list);
    }, () => {
      toast.error('Could not load the photo log');
    });
    return unsub;
  }, [plantId, user]);

  const savePhoto = async (file: File) => {
    if (!user) return;
    setSaving(true);
    const toastId = toast.loading('Saving photo...');
    try {
      const { url, storagePath } = await uploadPlantPhoto(user, plantId, file);
      await addDoc(collection(db, 'inhabitants', plantId, 'photos'), {
        url,
        storagePath,
        caption: caption.trim() || null,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
      });
      toast.success('Photo saved to the log', { id: toastId });
      setShowAdd(false);
      setCaption('');
    } catch (e) {
      console.error('Photo save error:', e);
      handleFirestoreError(e, OperationType.WRITE, `inhabitants/${plantId}/photos`);
      toast.error('Could not save the photo', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) savePhoto(file);
  };

  const makeProfile = async (photo: PlantPhoto) => {
    if (photo.url === currentImage) {
      toast.info('Already the profile photo');
      return;
    }
    setSettingProfile(true);
    try {
      await onSetProfilePhoto(photo.url);
      toast.success('Profile photo updated');
      setLightbox(null);
    } catch {
      toast.error('Could not update the profile photo');
    } finally {
      setSettingProfile(false);
    }
  };

  const deletePhoto = async (photo: PlantPhoto) => {
    if (!confirm('Delete this photo from the log?')) return;
    try {
      await deleteDoc(doc(db, 'inhabitants', plantId, 'photos', photo.id));
      if (photo.storagePath) {
        try { await deleteObject(ref(storage, photo.storagePath)); } catch { /* already gone */ }
      }
      toast.success('Photo deleted');
      setLightbox(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `inhabitants/${plantId}/photos`);
      toast.error('Could not delete the photo');
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Images size={18} className="text-primary" />
          <h3 className="text-lg font-black text-on-surface tracking-tight">Photo log</h3>
          {photos.length > 0 && (
            <span className="text-xs font-bold text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">
              {photos.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary text-white text-sm font-black active:scale-95 transition-transform touch-target"
        >
          <ImagePlus size={16} /> Add photo
        </button>
      </div>

      {photos.length === 0 ? (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full rounded-3xl border-2 border-dashed border-outline-variant/40 bg-surface-container-low/50 p-6 flex flex-col items-center gap-2 text-on-surface-variant active:scale-[0.99] transition-transform"
        >
          <Camera size={28} className="text-primary" />
          <p className="text-sm font-bold">Snap the first photo</p>
          <p className="text-xs">Track {plantName} visually — growth, blooms, before and after treatments.</p>
        </button>
      ) : (
        <div className="flex gap-3 overflow-x-auto hide-scrollbar -mx-1 px-1 pb-1">
          {photos.map((p) => (
            <button
              key={p.id}
              onClick={() => setLightbox(p)}
              className="relative shrink-0 w-28 h-36 rounded-2xl overflow-hidden bg-surface-container-low active:scale-95 transition-transform"
            >
              <img src={p.url} alt={p.caption || plantName} className="w-full h-full object-cover" loading="lazy" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-4 pb-1.5">
                <p className="text-[10px] font-bold text-white text-left">
                  {p.createdAt?.toDate ? format(p.createdAt.toDate(), 'MMM d') : '…'}
                </p>
              </div>
              {p.url === currentImage && (
                <span className="absolute top-1.5 left-1.5 bg-primary text-white rounded-full p-1">
                  <Check size={12} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Add photo sheet */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end justify-center"
            onClick={() => !saving && setShowAdd(false)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-surface rounded-t-[2rem] p-6 pb-10 space-y-4"
            >
              <div className="w-12 h-1.5 bg-outline-variant/40 rounded-full mx-auto" />
              <h4 className="text-lg font-black text-on-surface">Add a photo</h4>

              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
              <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={saving}
                  className="rounded-2xl bg-primary text-white p-5 flex flex-col items-center gap-2 font-black text-sm active:scale-95 transition-transform disabled:opacity-50"
                >
                  <Camera size={26} /> Take photo
                </button>
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={saving}
                  className="rounded-2xl bg-surface-container-high text-on-surface p-5 flex flex-col items-center gap-2 font-black text-sm active:scale-95 transition-transform disabled:opacity-50"
                >
                  <Images size={26} /> From gallery
                </button>
              </div>

              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a note — “first bloom”, “after treatment”… (optional)"
                className="w-full rounded-2xl bg-surface-container-low border border-outline-variant/20 px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />

              {saving && (
                <div className="flex items-center justify-center gap-2 text-sm font-bold text-on-surface-variant">
                  <Loader2 size={16} className="animate-spin" /> Compressing and uploading…
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] bg-black/90 flex flex-col"
            onClick={() => setLightbox(null)}
          >
            <div className="flex justify-end p-4">
              <button
                onClick={() => setLightbox(null)}
                className="w-11 h-11 rounded-full bg-white/20 text-white flex items-center justify-center active:scale-90"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center px-4 min-h-0" onClick={(e) => e.stopPropagation()}>
              <img src={lightbox.url} alt={lightbox.caption || plantName} className="max-h-full max-w-full rounded-2xl object-contain" />
            </div>
            <div className="p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
              {lightbox.caption && <p className="text-white font-bold text-center">{lightbox.caption}</p>}
              <p className="text-white/60 text-xs font-bold text-center uppercase tracking-widest">
                {lightbox.createdAt?.toDate ? format(lightbox.createdAt.toDate(), 'EEEE, MMM d, yyyy') : ''}
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => makeProfile(lightbox)}
                  disabled={settingProfile || lightbox.url === currentImage}
                  className={cn(
                    'flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-sm active:scale-95 transition-transform disabled:opacity-40',
                    lightbox.url === currentImage ? 'bg-white/20 text-white' : 'bg-primary text-white'
                  )}
                >
                  {settingProfile ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  {lightbox.url === currentImage ? 'Current profile photo' : 'Set as profile photo'}
                </button>
                <button
                  onClick={() => deletePhoto(lightbox)}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/15 text-white font-black text-sm active:scale-95 transition-transform"
                >
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
