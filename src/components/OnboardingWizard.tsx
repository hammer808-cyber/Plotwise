import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sprout, Minus, Plus, Check, ArrowRight } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useFirebase } from '../contexts/FirebaseContext';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';

const BED_COLORS = ['#4CAF50', '#8B4513', '#795548', '#607D8B', '#3F51B5', '#E91E63'];

function Stepper({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  const btn =
    'w-14 h-14 rounded-2xl bg-stone-100 active:bg-stone-200 flex items-center justify-center font-black text-xl text-on-surface disabled:opacity-30 touch-target';
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{label}</label>
      <div className="flex items-center gap-3">
        <button type="button" aria-label={`Decrease ${label}`} className={btn} disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}>
          <Minus size={22} />
        </button>
        <div className="flex-1 text-center bg-stone-100 rounded-2xl py-3">
          <span className="font-black text-2xl text-on-surface">{value}</span>
          <span className="text-xs font-bold text-on-surface-variant ml-1">cells</span>
        </div>
        <button type="button" aria-label={`Increase ${label}`} className={btn} disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}>
          <Plus size={22} />
        </button>
      </div>
    </div>
  );
}

/**
 * First-run flow: every new account starts by building ONE bed — no plot
 * questions up front. The bed lives on its own until the gardener puts it
 * in a plot (from the bed page or while creating a plot).
 */
export default function OnboardingWizard({ onDone }: { onDone: () => void }) {
  const { user } = useFirebase();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [w, setW] = useState(4);
  const [h, setH] = useState(2);
  const [color, setColor] = useState(BED_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [bedId, setBedId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, 'planters'), {
        ownerUid: user.uid,
        plotId: null, // standalone until it joins a plot
        name: name.trim() || 'My First Bed',
        type: 'Raised Bed',
        gridPosition: { x: 0, y: 0 },
        size: { w, h },
        color,
        createdAt: serverTimestamp(),
      });
      setBedId(ref.id);
      setStep(2);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'planters');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center p-6">
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-[3rem] p-10 shadow-2xl border border-outline-variant/10"
      >
        {step === 0 && (
          <div className="text-center space-y-6">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Sprout className="text-primary" size={48} />
            </div>
            <h1 className="font-headline text-3xl font-black tracking-tight">Welcome to Plotwise</h1>
            <p className="text-on-surface-variant font-medium leading-relaxed">
              Every garden starts with a single bed. Let's build yours — you can
              put it in a plot whenever you're ready.
            </p>
            <button
              onClick={() => setStep(1)}
              className="w-full botanical-gradient text-white font-black py-5 rounded-full shadow-xl shadow-emerald-900/20 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase tracking-[0.15em] text-sm touch-target"
            >
              Build my first bed <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Your first bed</p>
              <h2 className="text-2xl font-headline font-black tracking-tight mt-1">Name it and size it</h2>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Bed name</label>
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Herb Bed"
                className="w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <Stepper label="Width" value={w} min={1} max={12} onChange={setW} />
            <Stepper label="Height" value={h} min={1} max={12} onChange={setH} />

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Color</label>
              <div className="flex gap-3">
                {BED_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Bed color ${c}`}
                    className={cn(
                      'w-11 h-11 rounded-full border-4 transition-all touch-target',
                      color === c ? 'border-on-surface scale-110' : 'border-transparent'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={saving}
              className="w-full botanical-gradient text-white font-black py-5 rounded-full shadow-xl shadow-emerald-900/20 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase tracking-[0.15em] text-sm disabled:opacity-60 touch-target"
            >
              {saving ? 'Building…' : <><Check size={18} /> Create my bed</>}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="text-center space-y-6">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Check className="text-primary" size={48} />
            </div>
            <h2 className="font-headline text-3xl font-black tracking-tight">Bed's ready</h2>
            <p className="text-on-surface-variant font-medium leading-relaxed">
              <span className="font-black text-on-surface">{name.trim() || 'My First Bed'}</span> ({w} × {h} cells)
              is yours. Open it anytime to put it in a plot — or make a plot and
              bring your beds along.
            </p>
            <button
              onClick={onDone}
              className="w-full botanical-gradient text-white font-black py-5 rounded-full shadow-xl shadow-emerald-900/20 active:scale-95 transition-all uppercase tracking-[0.15em] text-sm touch-target"
            >
              Start gardening
            </button>
            {bedId && (
              <p className="text-[11px] text-on-surface-variant/60 font-medium">
                Find it under My Plots → Beds not in a plot.
              </p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
