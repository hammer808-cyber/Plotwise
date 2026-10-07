import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useFirebase } from '../contexts/FirebaseContext';
import { Sprout, LogIn, UserRound } from 'lucide-react';

/**
 * Front door. Everyone who opens the link lands here unless they have a
 * persisted session — so nobody ever wanders into someone else's garden.
 * Google keeps the garden across devices; guest keeps it in this browser.
 */
export default function Login() {
  const { signInWithGoogle, continueAsGuest, loading } = useFirebase();
  const [busy, setBusy] = useState(false);

  if (loading) return null;

  const withBusy = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-[3rem] p-10 sm:p-12 shadow-2xl border border-outline-variant/10 text-center"
      >
        <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-8">
          <Sprout className="text-primary" size={48} />
        </div>

        <h1 className="font-headline text-4xl font-black text-on-surface mb-3 tracking-tight">Plotwise</h1>
        <p className="font-body text-on-surface-variant mb-10 text-lg">
          Your garden, mapped. Beds, plants, and care — all in one place.
        </p>

        <div className="space-y-3">
          <button
            onClick={withBusy(signInWithGoogle)}
            disabled={busy}
            className="w-full botanical-gradient text-white font-headline font-black py-5 rounded-full shadow-xl shadow-emerald-900/20 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase tracking-[0.15em] text-sm disabled:opacity-60 touch-target"
          >
            <LogIn size={22} />
            <span>Continue with Google</span>
          </button>

          <button
            onClick={withBusy(continueAsGuest)}
            disabled={busy}
            className="w-full bg-surface-container-high text-on-surface font-headline font-black py-5 rounded-full active:scale-95 transition-all flex items-center justify-center gap-3 uppercase tracking-[0.15em] text-sm disabled:opacity-60 touch-target"
          >
            <UserRound size={22} />
            <span>Continue as guest</span>
          </button>
        </div>

        <p className="mt-6 text-xs font-medium text-on-surface-variant leading-relaxed">
          Google keeps your garden synced across devices and lets you share plots.
          Guest mode keeps it in this browser only.
        </p>

        <p className="mt-8 text-[10px] font-black uppercase tracking-widest text-outline">
          Everyone gets their own garden
        </p>
      </motion.div>
    </div>
  );
}
