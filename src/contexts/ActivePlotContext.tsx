import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useFirebase } from './FirebaseContext';

const STORAGE_KEY = 'plotwise-active-plot';

interface ActivePlotContextValue {
  /** Firestore id of the globally active plot, or null when none is set yet. */
  activePlotId: string | null;
  /** Switch the active plot. Persists to localStorage. */
  setActivePlotId: (id: string | null) => void;
  /** All of the user's plots (for pickers/switchers). */
  plots: Array<{ id: string; name: string }>;
  /** The active plot object, when loaded. */
  activePlot: { id: string; name: string } | null;
}

const ActivePlotContext = createContext<ActivePlotContextValue>({
  activePlotId: null,
  setActivePlotId: () => {},
  plots: [],
  activePlot: null,
});

export function ActivePlotProvider({ children }: { children: React.ReactNode }) {
  const { user } = useFirebase();
  const [plots, setPlots] = useState<Array<{ id: string; name: string }>>([]);
  const [activePlotId, setActivePlotIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const setActivePlotId = useCallback((id: string | null) => {
    setActivePlotIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage unavailable — session-only
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setPlots([]);
      return;
    }
    // Owned plots plus plots shared with me (invite code).
    const ownedQ = query(collection(db, 'spatial_plots'), where('ownerUid', '==', user.uid));
    const sharedQ = query(collection(db, 'spatial_plots'), where('collaboratorUids', 'array-contains', user.uid));
    const apply = (owned: typeof plots, shared: typeof plots) => {
      const seen = new Set(owned.map((p) => p.id));
      setPlots([...owned, ...shared.filter((p) => !seen.has(p.id))]);
    };
    let ownedList: typeof plots = [];
    let sharedList: typeof plots = [];
    const unsubOwned = onSnapshot(ownedQ, (snap) => {
      ownedList = snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) || 'Untitled Plot' }));
      apply(ownedList, sharedList);
    });
    const unsubShared = onSnapshot(sharedQ, (snap) => {
      sharedList = snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) || 'Untitled Plot' }));
      apply(ownedList, sharedList);
    });
    return () => {
      unsubOwned();
      unsubShared();
    };
  }, [user]);

  // Default to the first plot when nothing is selected yet (or the saved one is gone).
  useEffect(() => {
    if (plots.length === 0) return;
    if (!activePlotId || !plots.some((p) => p.id === activePlotId)) {
      setActivePlotId(plots[0].id);
    }
  }, [plots, activePlotId, setActivePlotId]);

  const activePlot = activePlotId ? plots.find((p) => p.id === activePlotId) ?? null : null;

  return (
    <ActivePlotContext.Provider value={{ activePlotId, setActivePlotId, plots, activePlot }}>
      {children}
    </ActivePlotContext.Provider>
  );
}

export function useActivePlot() {
  return useContext(ActivePlotContext);
}
