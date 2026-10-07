import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Loader2, MapPin, Sprout } from 'lucide-react';
import { useFirebase } from '../contexts/FirebaseContext';
import { db, collection, addDoc, serverTimestamp, handleFirestoreError, OperationType, query, where, getDocs, updateDoc, doc } from '../firebase';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import { findFreeSpot } from '../lib/bedPlacement';

interface PlotCreateModalProps {
  onClose: () => void;
  onComplete: (plotId: string) => void;
}

/**
 * The one place plots get created: name, location, and the plot's
 * footprint. The footprint sizes the plot grid, so beds added later
 * are always constrained to fit inside it.
 */
export default function PlotCreateModal({ onClose, onComplete }: PlotCreateModalProps) {
  const { user } = useFirebase();
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [widthFt, setWidthFt] = useState('20');
  const [depthFt, setDepthFt] = useState('15');
  const [looseBeds, setLooseBeds] = useState<{ id: string; name: string; size: { w: number; h: number } }[]>([]);
  const [pickedBeds, setPickedBeds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'planters'), where('ownerUid', '==', user.uid), where('plotId', '==', null))
        );
        setLooseBeds(
          snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) || 'Bed', size: d.data().size as { w: number; h: number } }))
        );
      } catch {
        // non-fatal: the beds step just won't show
      }
    })();
  }, [user]);

  const toggleBed = (id: string) => {
    setPickedBeds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSave = name.trim().length > 0 && Number(widthFt) > 0 && Number(depthFt) > 0;

  const handleCreate = async () => {
    if (!user || isSaving || !canSave) return;
    setIsSaving(true);
    try {
      const w = Math.max(1, Math.min(100, Math.round(Number(widthFt) || 20)));
      const h = Math.max(1, Math.min(100, Math.round(Number(depthFt) || 15)));
      const ref = await addDoc(collection(db, 'spatial_plots'), {
        ownerUid: user.uid,
        name: name.trim(),
        location: location.trim() || null,
        status: 'Active',
        gridConfig: { cols: w, rows: h },
        healthStatus: 'Stable',
        createdAt: serverTimestamp(),
        mapLayout: [],
      });
      // Combine picked standalone beds into the new plot (auto-placed).
      const placed: { gridPosition: { x: number; y: number }; size: { w: number; h: number } }[] = [];
      let placedCount = 0;
      let skippedCount = 0;
      for (const bed of looseBeds.filter((b) => pickedBeds.has(b.id))) {
        const spot = findFreeSpot(placed, bed.size.w, bed.size.h, w, h);
        if (!spot) {
          skippedCount++;
          continue;
        }
        placed.push({ gridPosition: spot, size: bed.size });
        await updateDoc(doc(db, 'planters', bed.id), { plotId: ref.id, gridPosition: spot });
        placedCount++;
      }
      toast.success(
        `"${name.trim()}" created${placedCount > 0 ? ` with ${placedCount} bed${placedCount === 1 ? '' : 's'} placed` : ' — now add beds inside it'}${skippedCount > 0 ? ` (${skippedCount} didn't fit)` : ''}.`
      );
      onComplete(ref.id);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'spatial_plots');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative w-full sm:max-w-md bg-white rounded-t-[2rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col"
      >
        <div className="p-6 pb-0 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">New plot</p>
            <h3 className="text-2xl font-headline font-black tracking-tight mt-1">Tell us about your plot</h3>
            <p className="text-xs text-on-surface-variant font-medium mt-1">
              Beds get added inside the plot next — the size you set here is the boundary they have to fit in.
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-on-surface-variant touch-target" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-1">Plot name</label>
            <input
              type="text" autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Community Garden Plot"
              className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-1">Location <span className="normal-case font-medium">(optional)</span></label>
            <div className="relative">
              <MapPin size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
              <input
                type="text" value={location} onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Backyard, Lot B"
                className="w-full bg-surface-container-low border-none rounded-2xl pl-12 pr-6 py-4 font-bold focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-1">Plot size</label>
            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <input
                  type="number" min={1} max={100} value={widthFt} onChange={e => setWidthFt(e.target.value)}
                  className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20"
                  aria-label="Width in feet"
                />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-xs font-black text-on-surface-variant/60">FT WIDE</span>
              </div>
              <div className="relative">
                <input
                  type="number" min={1} max={100} value={depthFt} onChange={e => setDepthFt(e.target.value)}
                  className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20"
                  aria-label="Depth in feet"
                />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-xs font-black text-on-surface-variant/60">FT DEEP</span>
              </div>
            </div>
            <p className={cn('text-[11px] font-bold ml-1', Number(widthFt) > 0 && Number(depthFt) > 0 ? 'text-on-surface-variant/70' : 'text-on-surface-variant/40')}>
              {Number(widthFt) > 0 && Number(depthFt) > 0
                ? `That's a ${Number(widthFt)} × ${Number(depthFt)} ft grid — ${Number(widthFt) * Number(depthFt)} square feet to work with.`
                : 'Enter the full footprint of the plot.'}
            </p>
          </div>

          {looseBeds.length > 0 && (
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-1">
                Bring your beds <span className="normal-case font-medium">(optional)</span>
              </label>
              <p className="text-[11px] font-medium text-on-surface-variant/70 ml-1">
                Beds not in a plot yet — they'll auto-place inside. Drag them around after.
              </p>
              <div className="space-y-2">
                {looseBeds.map((bed) => {
                  const picked = pickedBeds.has(bed.id);
                  return (
                    <button
                      key={bed.id}
                      type="button"
                      onClick={() => toggleBed(bed.id)}
                      aria-pressed={picked}
                      className={cn(
                        'w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left touch-target',
                        picked ? 'border-primary bg-primary/5' : 'border-transparent bg-surface-container-low'
                      )}
                    >
                      <span className={cn(
                        'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0',
                        picked ? 'border-primary bg-primary text-white' : 'border-outline-variant/40'
                      )}>
                        {picked && <Check size={14} />}
                      </span>
                      <Sprout size={18} className="text-primary shrink-0" />
                      <span className="min-w-0">
                        <span className="block font-black truncate">{bed.name}</span>
                        <span className="text-xs font-medium text-on-surface-variant">{bed.size.w} × {bed.size.h} cells</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 pt-2 flex gap-3">
          <button onClick={onClose}
            className="px-6 py-4 rounded-2xl font-black text-on-surface-variant hover:bg-surface-container-high transition-colors">
            Cancel
          </button>
          <div className="flex-1" />
          <button
            onClick={handleCreate}
            disabled={!canSave || isSaving}
            className="px-8 py-4 bg-primary text-white rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all flex items-center gap-2 disabled:opacity-40 disabled:hover:scale-100 touch-target">
            {isSaving ? <><Loader2 size={18} className="animate-spin" /> Creating...</> : <><Check size={18} /> Create plot</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
