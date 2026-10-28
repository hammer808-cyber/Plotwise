import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useFirebase } from './FirebaseContext';
import { mergePlotLists, nextActivePlotId, type PlotChoice } from '../lib/activePlot';

const STORAGE_KEY = 'plotwise-active-plot';

interface ActivePlotContextValue {
  /** Firestore id of the globally active plot, or null when none is set yet. */
  activePlotId: string | null;
  /** Switch the active plot. Persists to localStorage. */
  setActivePlotId: (id: string | null) => void;
  /** All of the user's plots (for pickers/switchers). */
  plots: PlotChoice[];
  /** The active plot object, when loaded. */
  activePlot: PlotChoice | null;
}

const ActivePlotContext = createContext<ActivePlotContextValue>({
  activePlotId: null,
  setActivePlotId: () => {},
  plots: [],
  activePlot: null,
});

export function ActivePlotProvider({ children }: { children: React.ReactNode }) {
  const { user } = useFirebase();
  const [plots, setPlots] = useState<PlotChoice[]>([]);
  // Uid whose owned AND shared lists have both been applied. Null until then
  // so a partial listener result cannot replace the saved active plot.
  const [loadedForUid, setLoadedForUid] = useState<string | null>(null);
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
      setLoadedForUid(null);
      return;
    }
    const uid = user.uid;
    // Drop the previous account's "lists are complete" flag immediately.
    // The reconcile effect below refuses to run until this uid's listeners
    // have both reported, so a stale list cannot retarget the active plot.
    setLoadedForUid((prev) => (prev === uid ? prev : null));

    // Owned plots plus plots shared with me (invite code).
    const ownedQ = query(collection(db, 'spatial_plots'), where('ownerUid', '==', uid));
    const sharedQ = query(collection(db, 'spatial_plots'), where('collaboratorUids', 'array-contains', uid));
    let ownedList: PlotChoice[] = [];
    let sharedList: PlotChoice[] = [];
    let ownedSeen = false;
    let sharedSeen = false;
    const publish = () => {
      if (!ownedSeen || !sharedSeen) return;
      setPlots(mergePlotLists(ownedList, sharedList));
      setLoadedForUid(uid);
    };
    const rows = (snap: { docs: Array<{ id: string; data: () => { name?: string } }> }): PlotChoice[] =>
      snap.docs.map((d) => ({ id: d.id, name: d.data().name || 'Untitled Plot' }));
    const unsubOwned = onSnapshot(ownedQ, (snap) => {
      ownedList = rows(snap);
      ownedSeen = true;
      publish();
    }, () => {
      ownedSeen = true;
      publish();
    });
    const unsubShared = onSnapshot(sharedQ, (snap) => {
      sharedList = rows(snap);
      sharedSeen = true;
      publish();
    }, () => {
      sharedSeen = true;
      publish();
    });
    return () => {
      unsubOwned();
      unsubShared();
    };
  }, [user]);

  // Default to the first plot only once both lists have loaded and the
  // saved garden is actually gone. A partial list must not overwrite it.
  useEffect(() => {
    if (!user || loadedForUid !== user.uid) return;
    const next = nextActivePlotId(activePlotId, plots, true);
    if (next !== activePlotId) setActivePlotId(next);
  }, [user, loadedForUid, plots, activePlotId, setActivePlotId]);

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
