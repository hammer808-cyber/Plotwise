import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useFirebase } from '../contexts/FirebaseContext';
import { averageVigor } from '../lib/vigor';
import { plantOccupiesBed } from '../lib/plotStats';
import { useActivePlot } from '../contexts/ActivePlotContext';
import { ArrowLeft, Leaf, Ruler, Activity, Plus, Stethoscope, Pencil, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { duplicateBed } from '../lib/duplicateBed';
import { handleFirestoreError, OperationType } from '../firebase';
import { cn } from '@/src/lib/utils';
import { AnimatePresence } from 'motion/react';
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

  const handleDuplicateBed = async () => {
    if (!user || !bed || !plotId || duplicating) return;
    setDuplicating(true);
    try {
      const result = await duplicateBed({
        bed: { ...bed, plotId, ownerUid: user.uid },
        plants,
        siblingBeds: otherBeds,
        plotCols: gridDims.cols,
        plotRows: gridDims.rows,
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
    if (!user || !plotId || !bedId) return;
    const unsubPlot = onSnapshot(doc(db, 'spatial_plots', plotId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setPlotName((data.name as string) || 'Plot');
        const gc = data.gridConfig as { cols?: number; rows?: number } | undefined;
        if (gc) setGridDims({ cols: gc.cols || 30, rows: gc.rows || 20 });
      }
    });
    const unsubBeds = onSnapshot(
      query(collection(db, 'planters'), where('ownerUid', '==', user.uid), where('plotId', '==', plotId)),
      (snap) => {
        setOtherBeds(
          snap.docs
            .filter((d) => d.id !== bedId)
            .map((d) => ({ id: d.id, ...(d.data() as Omit<BedLike, 'id'>) }))
        );
      }
    );
    const unsubBed = onSnapshot(doc(db, 'planters', bedId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.plotId !== plotId || data.ownerUid !== user.uid) {
          setBed(null);
        } else {
          setBed({ id: snap.id, ...(data as Omit<Bed, 'id'>) });
        }
      } else {
        setBed(null);
      }
      setLoading(false);
    });
    const q = query(
      collection(db, 'inhabitants'),
      where('ownerUid', '==', user.uid),
      where('plotId', '==', plotId)
    );
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
        <Link to={`/plots/${plotId}`} className="text-primary font-bold">Back to plot</Link>
      </div>
    );
  }

  const bedPlants = plants.filter((p) => plantOccupiesBed(p, bed));
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
          onClick={() => navigate(`/plots/${plotId}`)}
          className="p-2 rounded-full hover:bg-primary/10 text-primary transition-colors"
          aria-label="Back to plot"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant">{plotName}</p>
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
        <div className="flex items-center gap-4 text-[11px] font-bold text-on-surface-variant mb-4">
          <span className="flex items-center gap-1"><Ruler size={12} /> {bed.size.w}×{bed.size.h} cells</span>
          <span className="flex items-center gap-1"><Leaf size={12} /> {bedPlants.length} plant{bedPlants.length === 1 ? '' : 's'}</span>
          <span className="capitalize">{bed.type}</span>
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
