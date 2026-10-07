import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flag, CheckCircle2, Trash2, ChevronDown, Sprout } from 'lucide-react';
import { useFirebase } from '../contexts/FirebaseContext';
import { db, collection, query, where, onSnapshot, handleFirestoreError, OperationType, updateDoc, doc, deleteDoc } from '../firebase';
import { cn } from '@/src/lib/utils';
import { toast } from 'sonner';

export interface DiagnosisCorrection {
  id: string;
  plantId?: string;
  plantName?: string;
  symptoms?: string;
  candidates?: { id: string; name: string; confidence: number }[];
  correctionText?: string;
  reviewed?: boolean;
  createdAt?: { toDate?: () => Date; seconds?: number };
}

function formatDate(c: DiagnosisCorrection): string {
  try {
    if (c.createdAt && typeof c.createdAt.toDate === 'function') return c.createdAt.toDate().toLocaleDateString();
    if (c.createdAt?.seconds) return new Date(c.createdAt.seconds * 1000).toLocaleDateString();
  } catch { /* fall through */ }
  return 'Recently';
}

export default function CorrectionReviewList() {
  const { user } = useFirebase();
  const [corrections, setCorrections] = useState<DiagnosisCorrection[]>([]);
  const [showReviewed, setShowReviewed] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'ai_diagnosis_corrections'), where('ownerUid', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DiagnosisCorrection));
      list.sort((a, b) => {
        const at = a.createdAt?.seconds || 0;
        const bt = b.createdAt?.seconds || 0;
        return bt - at;
      });
      setCorrections(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ai_diagnosis_corrections');
    });
    return () => unsub();
  }, [user]);

  const markReviewed = async (id: string) => {
    try {
      await updateDoc(doc(db, 'ai_diagnosis_corrections', id), { reviewed: true, reviewedAt: new Date().toISOString() });
      toast.success('Marked as reviewed.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ai_diagnosis_corrections/${id}`);
    }
  };

  const deleteCorrection = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'ai_diagnosis_corrections', id));
      setConfirmDeleteId(null);
      toast.success('Correction deleted.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `ai_diagnosis_corrections/${id}`);
    }
  };

  const pending = corrections.filter(c => !c.reviewed);
  const reviewed = corrections.filter(c => c.reviewed);

  const renderCard = (c: DiagnosisCorrection) => (
    <motion.div
      key={c.id}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-2xl border p-5 space-y-3 bg-surface',
        c.reviewed ? 'border-outline-variant/20 opacity-75' : 'border-amber-600/30'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={cn('p-2 rounded-xl', c.reviewed ? 'bg-surface-container-high text-on-surface-variant' : 'bg-amber-500/15 text-amber-700')}>
            <Flag size={16} />
          </div>
          <div>
            <p className="font-bold text-on-surface text-sm">{c.plantName || 'Unknown plant'}</p>
            <p className="text-[11px] text-on-surface-variant">{formatDate(c)}</p>
          </div>
        </div>
        {!c.reviewed && (
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-500/15 px-2.5 py-1 rounded-full shrink-0">
            Needs review
          </span>
        )}
      </div>

      {c.symptoms && (
        <p className="text-xs text-on-surface-variant italic leading-snug">“{c.symptoms}”</p>
      )}

      {c.candidates && c.candidates.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">AI suggested</p>
          {c.candidates.map((cand, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-on-surface font-medium">{cand.name}</span>
              <span className="text-on-surface-variant font-bold">{cand.confidence}%</span>
            </div>
          ))}
        </div>
      )}

      {c.correctionText && (
        <div className="rounded-xl bg-surface-container-low p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1">Gardener correction</p>
          <p className="text-xs text-on-surface leading-snug">{c.correctionText}</p>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        {!c.reviewed ? (
          <button
            onClick={() => markReviewed(c.id)}
            className="flex-1 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={14} /> Mark reviewed
          </button>
        ) : (
          <span className="flex-1 text-center text-[11px] font-bold text-on-surface-variant py-2.5">
            Reviewed
          </span>
        )}
        {confirmDeleteId === c.id ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => deleteCorrection(c.id)}
              className="px-3 py-2.5 rounded-xl bg-error/10 text-error text-xs font-black uppercase tracking-widest"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmDeleteId(null)}
              className="px-3 py-2.5 rounded-xl border border-outline-variant/30 text-on-surface-variant text-xs font-bold"
            >
              Keep
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDeleteId(c.id)}
            className="p-2.5 rounded-xl text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
            aria-label="Delete correction"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </motion.div>
  );

  return (
    <section className="space-y-6 relative">
      <div className="flex items-center justify-between relative z-10">
        <div>
          <h3 className="font-headline text-2xl font-bold text-primary flex items-center gap-3">
            <Sprout size={24} /> AI Correction Review
          </h3>
          <p className="text-on-surface-variant text-sm mt-1">
            Wrong AI calls you report land here. Review them to spot patterns and improve future suggestions.
          </p>
        </div>
        {pending.length > 0 && (
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-500/15 px-3 py-1.5 rounded-full shrink-0">
            {pending.length} pending
          </span>
        )}
      </div>

      {corrections.length === 0 ? (
        <div className="glass-card rounded-[2rem] p-10 text-center border border-outline-variant/10 relative z-10">
          <Flag size={28} className="mx-auto text-on-surface-variant mb-3" />
          <p className="font-bold text-on-surface">No corrections yet</p>
          <p className="text-sm text-on-surface-variant mt-1 max-w-md mx-auto">
            When the AI gets a diagnosis wrong, tap “None of these look right” in the checkup and tell it what the problem actually was. It will show up here for review.
          </p>
        </div>
      ) : (
        <div className="relative z-10 space-y-4">
          <AnimatePresence>
            {pending.map(renderCard)}
          </AnimatePresence>

          {reviewed.length > 0 && (
            <div>
              <button
                onClick={() => setShowReviewed(s => !s)}
                className="flex items-center gap-2 text-xs font-bold text-on-surface-variant py-2"
              >
                <ChevronDown size={14} className={cn('transition-transform', showReviewed && 'rotate-180')} />
                Reviewed ({reviewed.length})
              </button>
              {showReviewed && (
                <div className="space-y-4 mt-2">
                  {reviewed.map(renderCard)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
