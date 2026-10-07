import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where, updateDoc, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useFirebase } from '../contexts/FirebaseContext';
import { averageVigor } from '../lib/vigor';
import { useActivePlot } from '../contexts/ActivePlotContext';
import { ArrowLeft, Leaf, Ruler, Activity, Plus, Stethoscope, Pencil, Copy, Fence, X } from 'lucide-react';
import { findFreeSpot } from '../lib/bedPlacement';
import { toast } from 'sonner';
import { duplicateBed } from '../lib/duplicateBed';
import { handleFirestoreError, OperationType } from '../firebase';
import { cn } from '@/src/lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import HealthCheckWizard from './HealthCheckWizard';
import BedEditModal, { BedLike } from './BedEditModal';
import PlantImage from './PlantImage';
import type { Inhabitant } from '../types';

interface Bed {
  id: string;
  name: string;
  type: string;
  gridPosition: { x: number; y: number };
  size: { w: number; h: number };
  color: string;
  plotId: string;
}

function vigorColor(v: number | null) {
  if (v === null) return 'text-on-surface-variant/50';
  if (v >= 70) return 'text-emerald-600';
  if (v >= 40) return 'text-amber-600';
  return 'text-rose-600';
}

export default function BedDetail() {
  const { plotId, bedId } = useParams<{ plotId: string; bedId: string }>();
  const { user } = useFirebase();
  const { setActivePlotId } = useActivePlot();
  const navigate = useNavigate();
  const [plotName, setPlotName] = useState('');
  const [bed, setBed] = useState<Bed | null>(null);
  const [plants, setPlants] = useState<Inhabitant[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkPlant, setCheckPlant] = useState<Inhabitant | null>(null);
  const [otherBeds, setOtherBeds] = useState<BedLike[]>([]);
  const [gridDims, setGridDims] = useState({ cols: 30, rows: 20 });
  const [showEditor, setShowEditor] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [showAddToPlot, setShowAddToPlot] = useState(false);
  const [plotChoices, setPlotChoices] = useState<{ id: string; name: string; shared?: boolean }[]>([]);
  const [addingToPlot, setAddingToPlot] = useState(false);

  /** Combine this standalone bed into a plot: auto-places it, then opens the plot. */
  const handleAddToPlot = async (targetPlotId: string) => {
    if (!user || !bed || addingToPlot) return;
    setAddingToPlot(true);
    try {
      const [targetSnap, bedsSnap] = await Promise.all([
        getDoc(doc(db, 'spatial_plots', targetPlotId)),
        getDocs(query(collection(db, 'planters'), where('plotId', '==', targetPlotId))),
      ]);
      if (!targetSnap.exists()) {
        toast.error('Could not open that plot.');
        return;
      }
      const gc = (targetSnap.data().gridConfig as { cols?: number; rows?: number } | undefined) || {};
      const cols = gc.cols || 30;
      const rows = gc.rows || 20;
      const spot = findFreeSpot(
        bedsSnap.docs.map((d) => ({ gridPosition: d.data().gridPosition, size: d.data().size })),
        bed.size.w,
        bed.size.h,
        cols,
        rows
      );
      if (!spot) {
        toast.warning('No room for this bed in that plot.');
        return;
      }
      await updateDoc(doc(db, 'planters', bed.id), { plotId: targetPlotId, gridPosition: spot });
      toast.success(`"${bed.name || 'Bed'}" is now in "${(targetSnap.data().name as string) || 'the plot'}" — drag it wherever you want.`);
      setShowAddToPlot(false);
      navigate(`/plots/${targetPlotId}/beds/${bed.id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `planters/${bed.id}`);
    } finally {
      setAddingToPlot(false);
    }
  };

  const openAddToPlot = async () => {
    if (!user) return;
    try {
      const [owned, shared] = await Promise.all([
        getDocs(query(collection(db, 'spatial_plots'), where('ownerUid', '==', user.uid))),
        getDocs(query(collection(db, 'spatial_plots'), where('collaboratorUids', 'array-contains', user.uid))),
      ]);
      const seen = new Set<string>();
      const list: { id: string; name: string; shared?: boolean }[] = [];
      for (const d of owned.docs) {
        seen.add(d.id);
        list.push({ id: d.id, name: (d.data().name as string) || 'Untitled Plot' });
      }
      for (const d of shared.docs) {
        if (!seen.has(d.id)) list.push({ id: d.id, name: (d.data().name as string) || 'Shared Plot', shared: true });
      }
      setPlotChoices(list);
      setShowAddToPlot(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'spatial_plots');
    }
  };

  const handleDuplicateBed = async () => {
    if (!user || !bed || !plotId || duplicating) return;
    setDuplicating(true);
    try {
      const result = await duplicateBed({
        bed: { ...bed, plotId: plotId || null, ownerUid: user.uid },
        plants,
        siblingBeds: otherBeds,
        plotCols: gridDims.cols,
        plotRows: gridDims.rows,
        standalone: !plotId,
      });
      if (!result) {
        toast.warning('No room for a copy — the plot is full.');
      } else {
        toast.success(
          `Duplicated as "${result.name}"${result.plantsCopied ? ` with ${result.plantsCopied} plant${result.plantsCopied === 1 ? '' : 's'}` : ''}`
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'planters');
    } finally {
      setDuplicating(false);
    }
  };

  useEffect(() => {
    if (plotId) setActivePlotId(plotId);
  }, [plotId, setActivePlotId]);

  useEffect(() => {
    if (!user || !bedId) return;
    // Standalone beds (no plotId) live outside any plot until combined into one.
    let unsubPlot: () => void;
    if (plotId) {
      unsubPlot = onSnapshot(doc(db, 'spatial_plots', plotId), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setPlotName((data.name as string) || 'Plot');
          const gc = data.gridConfig as { cols?: number; rows?: number } | undefined;
          if (gc) setGridDims({ cols: gc.cols || 30, rows: gc.rows || 20 });
        }
      });
    } else {
      setPlotName('');
      setGridDims({ cols: 60, rows: 60 }); // free growth while unplotted
      unsubPlot = () => {};
    }
    const unsubBeds = onSnapshot(
      plotId
        ? query(collection(db, 'planters'), where('plotId', '==', plotId))
        : query(collection(db, 'planters'), where('ownerUid', '==', user.uid), where('plotId', '==', null)),
      (snap) => {
        setOtherBeds(
          snap.docs
            .filter((d) => d.id !== bedId)
            .map((d) => ({ id: d.id, ...(d.data() as Omit<BedLike, 'id'>) }))
        );
      }
    );
    const unsubBed = onSnapshot(
      doc(db, 'planters', bedId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          // Read access itself is enforced by the Firestore rules (plot
          // members can open each other's beds in a shared plot).
          const plotMatch = plotId ? data.plotId === plotId : data.plotId == null;
          if (!plotMatch) {
            setBed(null);
          } else {
            setBed({ id: snap.id, ...(data as Omit<Bed, 'id'>) });
          }
        } else {
          setBed(null);
        }
        setLoading(false);
      },
      () => {
        setBed(null);
        setLoading(false);
      }
    );
    const q = plotId
      ? query(collection(db, 'inhabitants'), where('plotId', '==', plotId))
      : query(collection(db, 'inhabitants'), where('planterId', '==', bedId));
    const unsubPlants = onSnapshot(q, (snap) => {
      setPlants(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Inhabitant));
    });
    return () => {
      unsubPlot();
      unsubBed();
      unsubBeds();
      unsubPlants();
    };
  }, [user, plotId, bedId]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!bed) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="font-bold text-on-surface">This bed couldn't be found.</p>
        <Link to={plotId ? `/plots/${plotId}` : '/plots'} className="text-primary font-bold">Back</Link>
      </div>
    );
  }

  const bedPlants = plants.filter(
    (p) =>
      p.planterId === bed.id ||
      (!p.planterId &&
        p.gridPosition &&
        p.gridPosition.x >= bed.gridPosition.x &&
        p.gridPosition.x < bed.gridPosition.x + bed.size.w &&
        p.gridPosition.y >= bed.gridPosition.y &&
        p.gridPosition.y < bed.gridPosition.y + bed.size.h)
  );
  const bedVigor = averageVigor(bedPlants);

  /**
   * Resolve a plant's cell within this bed. The app-wide convention is
   * plot-global coordinates (cell = gridPosition - bed.gridPosition), but a
   * tap-to-place bug on Sep 24 wrote bed-local coordinates for a few plants.
   * Prefer the global reading; fall back to the bed-local one so misplaced
   * plants still render (PlotDetail repairs the stored data on load).
   */
  const cellOf = (pl: Inhabitant): { gx: number; gy: number } | null => {
    if (!pl.gridPosition || !bed) return null;
    const gx = pl.gridPosition.x - bed.gridPosition.x;
    const gy = pl.gridPosition.y - bed.gridPosition.y;
    if (gx >= 0 && gy >= 0 && gx < bed.size.w && gy < bed.size.h) return { gx, gy };
    if (pl.planterId === bed.id) {
      const lx = pl.gridPosition.x;
      const ly = pl.gridPosition.y;
      if (lx >= 0 && ly >= 0 && lx < bed.size.w && ly < bed.size.h) return { gx: lx, gy: ly };
    }
    return null;
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(plotId ? `/plots/${plotId}` : '/plots')}
          className="p-2 rounded-full hover:bg-primary/10 text-primary transition-colors"
          aria-label={plotId ? 'Back to plot' : 'Back to My Plots'}
        >
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0">
          {plotId ? (
            <p className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant">{plotName}</p>
          ) : (
            <p className="text-[11px] font-black uppercase tracking-widest text-primary">Not in a plot yet</p>
          )}
          <h1 className="font-headline font-black text-2xl text-on-surface tracking-tight truncate">{bed.name || 'Bed'}</h1>
        </div>
        <div className={cn('ml-auto text-right', vigorColor(bedVigor))}>
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Bed vigor</p>
          <p className="font-black text-2xl">{bedVigor === null ? '—' : `${bedVigor}%`}</p>
        </div>
        <button
          onClick={handleDuplicateBed}
          disabled={duplicating}
          className="p-3 rounded-2xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors touch-target disabled:opacity-50"
          aria-label={`Duplicate ${bed.name || 'bed'}`}
        >
          <Copy size={18} />
        </button>
        <button
          onClick={() => setShowEditor(true)}
          className="p-3 rounded-2xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors touch-target"
          aria-label={`Edit ${bed.name || 'bed'}`}
        >
          <Pencil size={18} />
        </button>
      </div>

      {/* Focused single-bed viewfinder — only this bed, nothing else */}
      <div className="bg-white rounded-[2rem] border border-outline-variant/30 p-5 shadow-sm">
        <div className="flex items-center gap-4 text-[11px] font-bold text-on-surface-variant mb-4 flex-wrap">
          <span className="flex items-center gap-1"><Ruler size={12} /> {bed.size.w}×{bed.size.h} cells</span>
          <span className="flex items-center gap-1"><Leaf size={12} /> {bedPlants.length} plant{bedPlants.length === 1 ? '' : 's'}</span>
          <span className="capitalize">{bed.type}</span>
          {!plotId && (
            <button
              onClick={openAddToPlot}
              className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-white text-[11px] font-black uppercase tracking-wider hover:scale-105 transition-transform touch-target"
            >
              <Fence size={14} /> Add to plot
            </button>
          )}
        </div>
        <div className="flex justify-center">
          <div
            className="grid gap-1.5 p-3 rounded-2xl w-full"
            style={{
              gridTemplateColumns: `repeat(${bed.size.w}, minmax(0, 1fr))`,
              maxWidth: bed.size.w * 76 + 24,
              backgroundColor: `${bed.color || '#8fce62'}22`,
              border: `2px solid ${bed.color || '#8fce62'}55`,
            }}
          >
            {Array.from({ length: bed.size.w * bed.size.h }).map((_, i) => {
              const gx = i % bed.size.w;
              const gy = Math.floor(i / bed.size.w);
              const plant = bedPlants.find((pl) => {
                const c = cellOf(pl);
                return c !== null && c.gx === gx && c.gy === gy;
              });
              return (
                <button
                  key={i}
                  onClick={() => plant && navigate(`/plant/${plant.id}`)}
                  disabled={!plant}
                  className={cn(
                    'rounded-xl aspect-square w-full flex items-center justify-center overflow-hidden transition-transform',
                    plant ? 'bg-white border-2 border-primary/40 shadow-sm hover:scale-105 cursor-pointer' : 'border border-dashed border-primary/15'
                  )}
                  aria-label={plant ? plant.name : `Empty cell ${gx + 1}, ${gy + 1}`}
                >
                  {plant ? (
                    plant.image ? (
                      <PlantImage src={plant.image} alt={plant.name} className="w-full h-full object-cover" />
                    ) : (
                      <Leaf size={26} className="text-primary" />
                    )
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-[11px] font-bold text-on-surface-variant text-center mt-4">
          Tap a plant to open it. To move plants, drag them on the plot grid.
        </p>
      </div>

      {/* Plants in this bed */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">Plants in this bed</h2>
          <button
            onClick={() => navigate(`/plots/${plotId}`)}
            className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          >
            <Plus size={14} /> Add plants
          </button>
        </div>
        {bedPlants.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-outline-variant/50 p-8 text-center">
            <Leaf size={28} className="mx-auto text-on-surface-variant/40 mb-2" />
            <p className="text-sm font-bold text-on-surface-variant">No plants in this bed yet.</p>
            <p className="text-xs text-on-surface-variant/70 mt-1">Drag plants onto it from the plot grid to get growing.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {bedPlants.map((plant) => (
              <button
                key={plant.id}
                onClick={() => navigate(`/plant/${plant.id}`)}
                className="w-full flex items-center gap-3 bg-white rounded-2xl border border-outline-variant/30 p-3 hover:border-primary/40 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                  {plant.image ? (
                    <PlantImage src={plant.image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Leaf size={18} className="text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-on-surface truncate">{plant.name}</p>
                  <p className="text-[11px] text-on-surface-variant">{plant.status || 'Planted'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setCheckPlant(plant); }}
                    className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors touch-target"
                    aria-label={`Quick health check for ${plant.name}`}
                  >
                    <Stethoscope size={16} />
                  </button>
                  <Activity size={14} className={vigorColor(plant.vigorIndex ?? null)} />
                  <span className={cn('text-sm font-black', vigorColor(plant.vigorIndex ?? null))}>
                    {typeof plant.vigorIndex === 'number' ? `${plant.vigorIndex}%` : '—'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showEditor && (
          <BedEditModal
            bed={bed}
            cols={gridDims.cols}
            rows={gridDims.rows}
            otherBeds={otherBeds}
            plants={bedPlants}
            onClose={() => setShowEditor(false)}
          />
        )}
      </AnimatePresence>

      {/* Add standalone bed to a plot */}
      <AnimatePresence>
        {showAddToPlot && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Add bed to plot">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAddToPlot(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative w-full sm:max-w-md bg-white rounded-t-[2rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden p-6 space-y-4 max-h-[85dvh] overflow-y-auto"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Combine beds into a plot</p>
                  <h3 className="text-xl font-headline font-black tracking-tight mt-1">Put "{bed.name || 'Bed'}" in…</h3>
                  <p className="text-xs text-on-surface-variant font-medium mt-1">
                    It lands in the first free spot — drag it wherever you want after.
                  </p>
                </div>
                <button onClick={() => setShowAddToPlot(false)} className="p-2 hover:bg-stone-100 rounded-full text-on-surface-variant touch-target" aria-label="Close">
                  <X size={22} />
                </button>
              </div>
              {plotChoices.length === 0 ? (
                <p className="text-sm font-medium text-on-surface-variant text-center py-6">
                  No plots yet — create one first, then bring this bed along.
                </p>
              ) : (
                <div className="space-y-2">
                  {plotChoices.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleAddToPlot(p.id)}
                      disabled={addingToPlot}
                      className="w-full flex items-center justify-between p-5 rounded-2xl bg-surface-container-low hover:bg-primary/10 transition-colors disabled:opacity-40 touch-target text-left"
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <Fence size={18} className="text-primary shrink-0" />
                        <span className="font-black truncate">{p.name}</span>
                        {p.shared && (
                          <span className="text-[10px] font-black uppercase tracking-widest bg-primary/15 text-primary px-2 py-0.5 rounded-full shrink-0">Shared</span>
                        )}
                      </span>
                      {addingToPlot ? <span className="text-xs font-bold text-on-surface-variant">Placing…</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {checkPlant && (
          <HealthCheckWizard
            plant={checkPlant}
            onClose={() => setCheckPlant(null)}
            onDone={(v) => {
              setPlants((prev) => prev.map((x) => (x.id === checkPlant.id ? { ...x, vigorIndex: v } : x)));
              setCheckPlant(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
