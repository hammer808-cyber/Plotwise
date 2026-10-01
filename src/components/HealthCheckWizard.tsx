import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowLeft, Droplets, Leaf, Bug, HeartPulse, Check, Stethoscope } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { logEvent } from '../services/eventService';
import { db, doc, updateDoc, serverTimestamp } from '../firebase';
import { useFirebase } from '../contexts/FirebaseContext';
import { calculateVigor, scoreHealthSnapshot, type HealthCheckAnswers } from '../lib/vigor';
import { lastWateredValue } from '../lib/wateringUpdate';
import type { Inhabitant } from '../types';
import { toast } from 'sonner';

interface Props {
  plant: Inhabitant;
  onClose: () => void;
  /** called after a check is logged; receives the new vigor so parents can refresh */
  onDone?: (newVigor: number) => void;
  /** jump straight into logging a treatment (for pests/disease findings) */
  onLogTreatment?: (plant: Inhabitant) => void;
}

type Step = 0 | 1 | 2 | 3 | 4;

const STEP_TITLES = ['Water', 'Leaves', 'Pests', 'Overall'];

export default function HealthCheckWizard({ plant, onClose, onDone, onLogTreatment }: Props) {
  const { user } = useFirebase();
  const [step, setStep] = useState<Step>(0);
  const [answers, setAnswers] = useState<Partial<HealthCheckAnswers>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ snapshot: number; before: number | null; after: number } | null>(null);

  const pick = (key: keyof HealthCheckAnswers, value: string) => {
    const next = { ...answers, [key]: value } as HealthCheckAnswers;
    setAnswers(next);
    // auto-advance, except on the last question where they tap "Log check"
    if (step < 3) setStep((step + 1) as Step);
  };

  const finish = async () => {
    if (!user || !plant.id || saving) return;
    if (!answers.watered || !answers.leaves || !answers.pests || !answers.overall) {
      toast.error('Answer all four questions first');
      return;
    }
    setSaving(true);
    try {
      const full = answers as HealthCheckAnswers;
      const snapshot = scoreHealthSnapshot(full);
      const before = typeof plant.vigorIndex === 'number' ? plant.vigorIndex : null;

      // Q1 "yes" is a real watering — log it as one so hydration history stays honest.
      const waterLogs: any[] = [];
      if (full.watered === 'yes') {
        const w = await logEvent({
          ownerUid: user.uid,
          category: 'event_logs',
          eventType: 'Watering',
          data: {
            targetId: plant.id,
            targetType: 'Inhabitant',
            type: 'Watering',
            plotId: plant.plotId || null,
            notes: `Watered during quick health check`,
            date: new Date().toISOString(),
          },
          calendarTitle: `Watered: ${plant.name}`,
          calendarDescription: `Hydration logged from a quick health check.`,
        });
        void w;
        waterLogs.push({ type: 'Watering', targetId: plant.id, date: new Date().toISOString() });
      }

      // Status follows the gardener's read: struggling overall, or pests/disease spotted.
      const badNews = full.overall === 'struggling' || full.pests === 'pests' || full.pests === 'disease';
      const nextStatus = badNews ? 'Struggling' : plant.status;

      const leafNote: Record<string, string> = {
        healthy: 'leaves healthy', yellowing: 'leaves yellowing', spots: 'leaf spots', wilting: 'wilting',
      };
      const pestNote: Record<string, string> = {
        none: 'no pests', pests: 'pests spotted', disease: 'disease signs', unsure: 'unsure about pests',
      };
      const stamp = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
      const checkNote = `Quick check ${stamp}: ${leafNote[full.leaves]}, ${pestNote[full.pests]}, ${full.overall}.`;
      const nextNotes = plant.notes ? `${plant.notes}\n${checkNote}` : checkNote;

      const nextPlant = {
        ...plant,
        status: nextStatus,
        notes: nextNotes,
        needsWater: full.watered === 'yes' ? false : plant.needsWater,
        lastWatered: full.watered === 'yes' ? new Date().toISOString() : plant.lastWatered,
      };

      // Engine recompute on the updated plant, then blend the snapshot in at 30%:
      // the check updates the score, it doesn't replace it.
      const calc = calculateVigor(nextPlant as Inhabitant, waterLogs, undefined as any);
      const base = before ?? calc.total;
      const after = Math.round(base * 0.7 + snapshot * 0.3);

      await updateDoc(doc(db, 'inhabitants', plant.id), {
        status: nextStatus,
        notes: nextNotes,
        needsWater: full.watered === 'yes' ? false : (plant.needsWater ?? false),
        ...(full.watered === 'yes' ? { lastWatered: lastWateredValue() } : {}),
        vigorIndex: after,
        vigorBreakdown: { ...calc, total: after },
        vigorUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // The check itself is an event — structured, queryable later.
      await logEvent({
        ownerUid: user.uid,
        category: 'event_logs',
        eventType: 'Health Check',
        data: {
          targetId: plant.id,
          targetType: 'Inhabitant',
          type: 'Health Check',
          plotId: plant.plotId || null,
          notes: checkNote,
          date: new Date().toISOString(),
          answers: full,
          snapshot,
          vigorBefore: before,
          vigorAfter: after,
        },
        calendarTitle: `Health check: ${plant.name}`,
        calendarDescription: checkNote,
      });

      setResult({ snapshot, before, after });
      onDone?.(after);
      toast.success(`Health check logged for ${plant.name}`);
    } catch (e) {
      console.error('health check failed', e);
      toast.error('Could not save the health check — try again.');
    } finally {
      setSaving(false);
    }
  };

  const Option = ({ label, sub, icon: Icon, selected, onClick }: any) => (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-4 p-5 rounded-3xl border-2 text-left transition-all touch-target min-h-[76px]',
        selected ? 'border-primary bg-primary/10 shadow-md' : 'border-stone-200 bg-white active:border-primary/50'
      )}
    >
      <span className={cn('p-3 rounded-2xl shrink-0', selected ? 'bg-primary text-white' : 'bg-stone-100 text-stone-500')}>
        <Icon size={22} />
      </span>
      <span>
        <span className="block font-black text-on-surface">{label}</span>
        {sub && <span className="block text-xs font-medium text-on-surface-variant mt-0.5">{sub}</span>}
      </span>
      {selected && <Check size={20} className="ml-auto text-primary shrink-0" />}
    </button>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#faf9f7] w-full sm:max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-6 pb-8 max-h-[92dvh] overflow-y-auto"
      >
        {/* header */}
        <div className="flex items-center gap-3 mb-2">
          <span className="p-2.5 rounded-2xl bg-primary text-white"><Stethoscope size={20} /></span>
          <div className="flex-1 min-w-0">
            <h2 className="font-headline text-lg font-black text-on-surface truncate">Quick health check</h2>
            <p className="text-xs font-bold text-on-surface-variant truncate">{plant.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-stone-200/70 text-stone-600 touch-target" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* progress */}
        {!result && (
          <div className="flex items-center gap-2 my-4">
            {STEP_TITLES.map((t, i) => (
              <div key={t} className="flex-1">
                <div className={cn('h-1.5 rounded-full', i <= step ? 'bg-primary' : 'bg-stone-200')} />
                <p className={cn('text-[10px] font-black uppercase tracking-wider mt-1', i === step ? 'text-primary' : 'text-stone-400')}>{t}</p>
              </div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {result ? (
            <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center py-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant">Snapshot score</p>
              <p className="font-headline text-6xl font-black text-primary my-2">{result.snapshot}<span className="text-2xl">%</span></p>
              <p className="text-sm font-bold text-on-surface-variant">
                {result.before === null ? `Vigor set to ${result.after}%` : `Vigor ${result.before}% → ${result.after}%`}
              </p>
              <p className="text-xs text-on-surface-variant font-medium mt-2 max-w-[260px] mx-auto">
                A quick read, blended into the full score — it nudges vigor, it doesn't replace it.
              </p>
              {(answers.pests === 'pests' || answers.pests === 'disease') && onLogTreatment && (
                <button
                  onClick={() => { onLogTreatment(plant); onClose(); }}
                  className="mt-5 w-full bg-amber-500 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl touch-target"
                >
                  Log a treatment
                </button>
              )}
              <button
                onClick={onClose}
                className="mt-3 w-full bg-primary text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl touch-target"
              >
                Done
              </button>
            </motion.div>
          ) : (
            <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
              {step === 0 && (
                <div className="space-y-3">
                  <p className="font-headline text-xl font-black text-on-surface mb-1">Watered recently?</p>
                  <Option label="Yes" sub="Watered in the last couple days" icon={Droplets} selected={answers.watered === 'yes'} onClick={() => pick('watered', 'yes')} />
                  <Option label="No" sub="It's been a while" icon={Droplets} selected={answers.watered === 'no'} onClick={() => pick('watered', 'no')} />
                </div>
              )}
              {step === 1 && (
                <div className="space-y-3">
                  <p className="font-headline text-xl font-black text-on-surface mb-1">How do the leaves look?</p>
                  <Option label="Healthy green" icon={Leaf} selected={answers.leaves === 'healthy'} onClick={() => pick('leaves', 'healthy')} />
                  <Option label="Yellowing" icon={Leaf} selected={answers.leaves === 'yellowing'} onClick={() => pick('leaves', 'yellowing')} />
                  <Option label="Spots" sub="Dark or discolored spots" icon={Leaf} selected={answers.leaves === 'spots'} onClick={() => pick('leaves', 'spots')} />
                  <Option label="Wilting" sub="Droopy or limp" icon={Leaf} selected={answers.leaves === 'wilting'} onClick={() => pick('leaves', 'wilting')} />
                </div>
              )}
              {step === 2 && (
                <div className="space-y-3">
                  <p className="font-headline text-xl font-black text-on-surface mb-1">Any pests or disease?</p>
                  <Option label="None" sub="Looks clean" icon={Bug} selected={answers.pests === 'none'} onClick={() => pick('pests', 'none')} />
                  <Option label="Pests" sub="Bugs, holes, webs" icon={Bug} selected={answers.pests === 'pests'} onClick={() => pick('pests', 'pests')} />
                  <Option label="Disease" sub="Mildew, rot, fuzz" icon={Bug} selected={answers.pests === 'disease'} onClick={() => pick('pests', 'disease')} />
                  <Option label="Not sure" icon={Bug} selected={answers.pests === 'unsure'} onClick={() => pick('pests', 'unsure')} />
                </div>
              )}
              {step === 3 && (
                <div className="space-y-3">
                  <p className="font-headline text-xl font-black text-on-surface mb-1">Overall, how's it doing?</p>
                  <Option label="Thriving" icon={HeartPulse} selected={answers.overall === 'thriving'} onClick={() => setAnswers({ ...answers, overall: 'thriving' })} />
                  <Option label="Okay" sub="Getting by" icon={HeartPulse} selected={answers.overall === 'okay'} onClick={() => setAnswers({ ...answers, overall: 'okay' })} />
                  <Option label="Struggling" icon={HeartPulse} selected={answers.overall === 'struggling'} onClick={() => setAnswers({ ...answers, overall: 'struggling' })} />
                  <button
                    onClick={finish}
                    disabled={saving || !answers.overall}
                    className="w-full mt-2 bg-primary text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl touch-target disabled:opacity-40"
                  >
                    {saving ? 'Logging…' : 'Log check'}
                  </button>
                </div>
              )}
              {step > 0 && (
                <button
                  onClick={() => setStep((step - 1) as Step)}
                  className="mt-4 flex items-center gap-1 text-xs font-black uppercase tracking-widest text-on-surface-variant touch-target px-2 py-2"
                >
                  <ArrowLeft size={14} /> Back
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
