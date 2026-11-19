import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, ArrowRight, Shield, Zap, Target, History, Trash2, Info, Sparkles } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { WEED_LIBRARY, calculateWEQ } from '../services/botanyService';
import { toast } from 'sonner';
import DiscoverySubWizard from './DiscoverySubWizard';
import { useFirebase } from '../contexts/FirebaseContext';
import { db, collection, query, where, onSnapshot } from '../firebase';
import { TAXONOMY_OWNER_FIELD } from '../lib/taxonomy';

interface WeedWarriorWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  plotId?: string;
  plotName?: string;
}

const STEPS = [
  { id: 'target', title: 'Identify Target', icon: <Target size={20} /> },
  { id: 'intensity', title: 'Assess Infestation', icon: <Shield size={20} /> },
  { id: 'method', title: 'Tactical Removal', icon: <Zap size={20} /> },
  { id: 'victory', title: 'Victory Log', icon: <History size={20} /> },
];

const METHODS = [
  { id: 'Hand Pull', label: 'Hand Pull', icon: '🤲', energy: 'High' },
  { id: 'Hula Hoe', label: 'Hula Hoe', icon: '⛏️', energy: 'Medium' },
  { id: 'Mulch Smother', label: 'Mulch Smother', icon: '🪵', energy: 'Low' },
  { id: 'Solarization', label: 'Solarization', icon: '☀️', energy: 'Low' },
];

export default function WeedWarriorWizard({ isOpen, onClose, onSave, plotId, plotName }: WeedWarriorWizardProps) {
  const { user } = useFirebase();
  const [step, setStep] = useState(0);
  const [selectedWeed, setSelectedWeed] = useState<string | null>(null);
  const [intensity, setIntensity] = useState(5);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [areaCleared, setAreaCleared] = useState(10);
  const [timeSpent, setTimeSpent] = useState(15);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [customWeeds, setCustomWeeds] = useState<Record<string, any>>({});

  // Fetch custom taxonomy
  useEffect(() => {
    if (!user || !isOpen) return;

    // Single-field equality uses the automatic index. Pairing it with `type`
    // needs a composite index this project does not ship, so the listener
    // failed and custom weeds never appeared.
    const q = query(
      collection(db, 'custom_taxonomy'),
      where(TAXONOMY_OWNER_FIELD, '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const weeds: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.type !== 'weed') return;
        weeds[data.name] = data;
      });
      setCustomWeeds(weeds);
    });

    return () => unsubscribe();
  }, [user, isOpen]);

  const allWeeds = { ...WEED_LIBRARY, ...customWeeds };

  // Audio Context for feedback
  const playSound = (type: 'snap' | 'squish' | 'victory') => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'snap') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'squish') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'victory') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    }
  };

  const currentStepId = STEPS[step].id;

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleFinalize();
    }
  };

  const handleFinalize = () => {
    if (!selectedWeed || !selectedMethod) return;

    const weed = allWeeds[selectedWeed];
    // A custom discovery is stored under discoveredBy. Looking it up by
    // ownerUid left it out of allWeeds, and this read threw before the log.
    if (!weed || typeof weed.threat !== 'number') {
      toast.error('Pick a weed from the list before logging the victory.');
      return;
    }
    const weq = calculateWEQ(areaCleared, intensity, timeSpent);
    const xp = Math.round((weed.threat * intensity * areaCleared) / 10);

    playSound('victory');
    onSave({
      weedType: selectedWeed,
      intensity,
      method: selectedMethod,
      areaCleared,
      timeSpent,
      isSeeding,
      weq,
      xp,
      plotId,
      plotName
    });
    onClose();
    toast.success(`Victory! Earned ${xp} XP for clearing ${selectedWeed}.`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-8 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
              <Trash2 size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black font-headline tracking-tight">Weed Warrior Wizard</h2>
              <p className="text-xs font-bold text-on-surface-variant opacity-50 uppercase tracking-widest">Tactical Briefing: {plotName || 'All Zones'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-stone-200 rounded-full transition-colors"><X /></button>
        </div>

        {/* Progress Bar */}
        <div className="flex px-8 pt-6 gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex-1 space-y-2">
              <div className={cn(
                "h-1.5 rounded-full transition-all",
                i <= step ? "bg-primary" : "bg-stone-200"
              )} />
              <p className={cn(
                "text-[8px] font-black uppercase tracking-widest text-center",
                i === step ? "text-primary" : "text-stone-400"
              )}>{s.title}</p>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              className="space-y-8"
            >
              {currentStepId === 'target' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {Object.entries(allWeeds).map(([name, data]) => (
                    <button
                      key={name}
                      onClick={() => {
                        setSelectedWeed(name);
                        playSound('squish');
                      }}
                      className={cn(
                        "p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 group",
                        selectedWeed === name 
                          ? "bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105" 
                          : "bg-stone-50 border-transparent hover:border-primary/30"
                      )}
                    >
                      <span className="text-4xl group-hover:scale-110 transition-transform">{data.icon}</span>
                      <div className="text-center">
                        <p className="font-black text-sm">{name}</p>
                        <p className={cn(
                          "text-[10px] font-bold uppercase tracking-widest opacity-60",
                          selectedWeed === name ? "text-white" : "text-on-surface-variant"
                        )}>Threat: {data.threat}/10</p>
                      </div>
                    </button>
                  ))}
                  
                  {/* Discovery Option */}
                  <button
                    onClick={() => setIsDiscoveryOpen(true)}
                    className="p-6 rounded-3xl border-2 border-dashed border-secondary/30 bg-secondary/5 text-secondary transition-all flex flex-col items-center justify-center gap-3 hover:bg-secondary/10"
                  >
                    <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
                      <Sparkles size={24} />
                    </div>
                    <div className="text-center">
                      <p className="font-black text-sm">Other / Not Listed</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Discovery Protocol</p>
                    </div>
                  </button>
                </div>
              )}

              {currentStepId === 'intensity' && (
                <div className="space-y-8">
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Canopy Cover Estimation</label>
                      <span className="text-4xl font-black text-primary">{intensity * 10}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="1" 
                      max="10" 
                      value={intensity} 
                      onChange={(e) => setIntensity(parseInt(e.target.value))}
                      className="w-full h-3 bg-stone-100 rounded-full appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                      <span>Sparse</span>
                      <span>Moderate</span>
                      <span>Total Infestation</span>
                    </div>
                  </div>

                  <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 flex gap-4 items-center">
                    <div className="w-12 h-12 bg-amber-500 text-white rounded-2xl flex items-center justify-center shrink-0">
                      <Info size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-amber-900">Seed Bank Potential</p>
                      <p className="text-xs font-medium text-amber-700">Are these weeds currently seeding? This increases re-emergence risk by 10x.</p>
                      <button 
                        onClick={() => setIsSeeding(!isSeeding)}
                        className={cn(
                          "mt-3 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                          isSeeding ? "bg-amber-500 text-white" : "bg-white text-amber-500 border border-amber-200"
                        )}
                      >
                        {isSeeding ? '⚠️ Seeding Detected' : 'No Seeds Visible'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {currentStepId === 'method' && (
                <div className="grid grid-cols-2 gap-4">
                  {METHODS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedMethod(m.id);
                        playSound('snap');
                      }}
                      className={cn(
                        "p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 group",
                        selectedMethod === m.id 
                          ? "bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105" 
                          : "bg-stone-50 border-transparent hover:border-primary/30"
                      )}
                    >
                      <span className="text-4xl group-hover:scale-110 transition-transform">{m.icon}</span>
                      <div className="text-center">
                        <p className="font-black text-sm">{m.label}</p>
                        <p className={cn(
                          "text-[10px] font-bold uppercase tracking-widest opacity-60",
                          selectedMethod === m.id ? "text-white" : "text-on-surface-variant"
                        )}>Energy: {m.energy}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {currentStepId === 'victory' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Area Cleared (sq ft)</label>
                      <input 
                        type="number" 
                        value={areaCleared}
                        onChange={(e) => setAreaCleared(parseInt(e.target.value))}
                        className="w-full bg-stone-100 border-none rounded-2xl px-6 py-4 font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Time Spent (mins)</label>
                      <input 
                        type="number" 
                        value={timeSpent}
                        onChange={(e) => setTimeSpent(parseInt(e.target.value))}
                        className="w-full bg-stone-100 border-none rounded-2xl px-6 py-4 font-bold"
                      />
                    </div>
                  </div>

                  <div className="bg-primary/5 p-8 rounded-[2.5rem] border border-primary/10 flex flex-col items-center text-center space-y-4">
                    <div className="w-20 h-20 bg-primary text-white rounded-full flex items-center justify-center shadow-xl shadow-primary/20">
                      <Check size={40} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black font-headline">Zone Secured!</h3>
                      <p className="text-sm font-medium text-on-surface-variant">You've successfully neutralized the {selectedWeed} infestation.</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="bg-white px-6 py-3 rounded-2xl shadow-sm">
                        <p className="text-[8px] font-black uppercase tracking-widest text-stone-400">XP Reward</p>
                        <p className="text-xl font-black text-primary">+{Math.round(((allWeeds[selectedWeed || '']?.threat || 5) * intensity * areaCleared) / 10)}</p>
                      </div>
                      <div className="bg-white px-6 py-3 rounded-2xl shadow-sm">
                        <p className="text-[8px] font-black uppercase tracking-widest text-stone-400">Efficiency (WEQ)</p>
                        <p className="text-xl font-black text-secondary">{(calculateWEQ(areaCleared, intensity, timeSpent)).toFixed(1)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-stone-100 bg-stone-50/50 flex gap-4">
          {step > 0 && (
            <button 
              onClick={() => setStep(step - 1)}
              className="px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-on-surface-variant hover:bg-stone-200 transition-all"
            >
              Back
            </button>
          )}
          <button 
            onClick={handleNext}
            disabled={
              (step === 0 && !selectedWeed) ||
              (step === 2 && !selectedMethod)
            }
            className="flex-1 bg-primary text-white font-black py-4 rounded-2xl hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {step === STEPS.length - 1 ? 'Log Victory' : 'Continue Mission'}
            <ArrowRight size={18} />
          </button>
        </div>

        <DiscoverySubWizard 
          isOpen={isDiscoveryOpen}
          onClose={() => setIsDiscoveryOpen(false)}
          onDiscovery={(newSpecies) => {
            // Show it immediately — the snapshot may not have landed yet,
            // and Log Victory reads threat off this map.
            setCustomWeeds((prev) => ({ ...prev, [newSpecies.name]: newSpecies }));
            setSelectedWeed(newSpecies.name);
            setIsDiscoveryOpen(false);
          }}
          type="weed"
        />
      </motion.div>
    </div>
  );
}
