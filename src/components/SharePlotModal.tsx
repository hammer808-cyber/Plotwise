import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Copy, Check, RefreshCw, UserMinus, LogOut, Share2, TriangleAlert } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useFirebase } from '../contexts/FirebaseContext';
import { toast } from 'sonner';
import {
  createInvite,
  revokeInvite,
  leaveSharedPlot,
  removeCollaborator,
} from '../lib/sharing';

interface SharePlotModalProps {
  plotId: string;
  plotName: string;
  isOwner: boolean;
  onClose: () => void;
}

/**
 * Plot sharing: the owner creates an invite code and hands it to a friend.
 * The friend enters it under My Plots → "Join with code" and lands in the
 * same plot — no rebuilding. Collaborators garden; only the owner deletes
 * or manages sharing.
 */
export default function SharePlotModal({ plotId, plotName, isOwner, onClose }: SharePlotModalProps) {
  const { user, isAnonymous } = useFirebase();
  const [code, setCode] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState(true);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [collaborators, setCollaborators] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'spatial_plots', plotId),
      (snap) => {
        const data = snap.data() as { activeInviteCode?: string; collaboratorNames?: Record<string, string> } | undefined;
        setCode(data?.activeInviteCode || null);
        setCollaborators(data?.collaboratorNames || {});
        setLoadingCode(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `spatial_plots/${plotId}`);
        setLoadingCode(false);
      }
    );
    return () => unsub();
  }, [plotId]);

  const handleCreate = async () => {
    if (!user || working) return;
    setWorking(true);
    try {
      const c = await createInvite(plotId, user.uid);
      setCode(c);
      toast.success('Invite code created — share it with your friend.');
    } catch {
      // handleFirestoreError already toasted
    } finally {
      setWorking(false);
    }
  };

  const handleRegenerate = async () => {
    if (!user || working || !code) return;
    setWorking(true);
    try {
      await revokeInvite(plotId, code);
      const c = await createInvite(plotId, user.uid);
      setCode(c);
      toast.success('New invite code created. The old one no longer works.');
    } catch {
      // toasted
    } finally {
      setWorking(false);
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — long-press the code to copy it.');
    }
  };

  const handleRemove = async (uid: string, name: string) => {
    if (working) return;
    setWorking(true);
    try {
      await removeCollaborator(plotId, uid);
      toast.success(`${name} was removed from this plot.`);
    } catch {
      // toasted
    } finally {
      setWorking(false);
    }
  };

  const handleLeave = async () => {
    if (!user || working) return;
    setWorking(true);
    try {
      await leaveSharedPlot(plotId, user.uid);
      toast.success(`You left "${plotName}".`);
      onClose();
    } catch {
      // toasted
    } finally {
      setWorking(false);
    }
  };

  const collaboratorEntries = Object.entries(collaborators);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Share ${plotName}`}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div
        initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative w-full sm:max-w-md bg-white rounded-t-[2rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col"
      >
        <div className="p-6 pb-0 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-1">
              <Share2 size={12} /> Share plot
            </p>
            <h3 className="text-2xl font-headline font-black tracking-tight mt-1">{plotName}</h3>
            <p className="text-xs text-on-surface-variant font-medium mt-1">
              {isOwner
                ? 'Give the code to a friend — they join your plot instead of rebuilding it.'
                : 'You are gardening in this shared plot.'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full text-on-surface-variant touch-target" aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {isAnonymous && isOwner && (
            <div className="flex gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
              <TriangleAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-amber-800 leading-relaxed">
                You're gardening as a guest. Back up with Google in Settings first — if this
                browser's data is cleared, guests lose their plots and their shares.
              </p>
            </div>
          )}

          {isOwner ? (
            <>
              {loadingCode ? (
                <div className="flex justify-center py-6">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : code ? (
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-1">Invite code</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-surface-container-low rounded-2xl px-6 py-4 text-center">
                      <span className="font-black text-3xl tracking-[0.3em] text-on-surface">{code}</span>
                    </div>
                    <button
                      onClick={handleCopy}
                      className="p-4 rounded-2xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors touch-target"
                      aria-label="Copy invite code"
                    >
                      {copied ? <Check size={20} /> : <Copy size={20} />}
                    </button>
                  </div>
                  <button
                    onClick={handleRegenerate}
                    disabled={working}
                    className="flex items-center gap-2 text-xs font-black text-on-surface-variant hover:text-primary transition-colors disabled:opacity-40 mx-auto"
                  >
                    <RefreshCw size={14} /> New code (revokes this one)
                  </button>
                  <p className="text-[11px] text-on-surface-variant/70 font-medium text-center">
                    Your friend opens the app, taps <span className="font-black">Join with code</span> under My Plots, and types this in.
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleCreate}
                  disabled={working}
                  className="w-full py-4 rounded-2xl bg-primary text-white font-black shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all disabled:opacity-40 touch-target"
                >
                  {working ? 'Creating…' : 'Create invite code'}
                </button>
              )}

              {collaboratorEntries.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-1">
                    Gardening here ({collaboratorEntries.length})
                  </p>
                  {collaboratorEntries.map(([uid, name]) => (
                    <div key={uid} className="flex items-center justify-between bg-surface-container-low rounded-2xl px-5 py-3">
                      <span className="font-bold text-sm text-on-surface">{name}</span>
                      <button
                        onClick={() => handleRemove(uid, name)}
                        disabled={working}
                        className="p-2 rounded-xl text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                        aria-label={`Remove ${name} from plot`}
                      >
                        <UserMinus size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <button
              onClick={handleLeave}
              disabled={working}
              className="w-full py-4 rounded-2xl bg-red-50 text-red-600 font-black hover:bg-red-100 transition-colors disabled:opacity-40 touch-target flex items-center justify-center gap-2"
            >
              <LogOut size={18} /> {working ? 'Leaving…' : 'Leave this shared plot'}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
