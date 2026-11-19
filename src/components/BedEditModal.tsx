import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { X, Check, Minus, Plus } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import type { Inhabitant } from '../types';
import { plantOccupiesBed } from '../lib/plotStats';

/** Minimal bed shape — works with PlotDetail's Planter and BedDetail's Bed. */
export interface BedLike {
  id: string;
  name: string;
  gridPosition: { x: number; y: number };
  size: { w: number; h: number };
  color?: string;
}

interface BedEditModalProps {
  bed: BedLike;
  /** Plot grid dimensions in cells — sizes are clamped to these. */
  cols: number;
  rows: number;
  /** Other beds in the same plot, for the overlap check when growing. */
  otherBeds: BedLike[];
  /** Plants currently in/around the bed — pulled inside the new footprint on save. */
  plants: Inhabitant[];
  onClose: () => void;
}

const BED_COLORS = ['#4CAF50', '#8B4513', '#795548', '#607D8B', '#3F51B5', '#E91E63'];

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const btn =
    'w-12 h-12 rounded-2xl bg-stone-100 active:bg-stone-200 flex items-center justify-center font-black text-xl text-on-surface disabled:opacity-30 touch-target';
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{label}</label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          className={btn}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <Minus size={20} />
        </button>
        <div className="flex-1 text-center bg-stone-100 rounded-2xl py-3">
          <span className="font-black text-2xl text-on-surface">{value}</span>
          <span className="text-xs font-bold text-on-surface-variant ml-1">cells</span>
        </div>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          className={btn}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          <Plus size={20} />
        </button>
      </div>
      {value >= max && (
        <p className="text-[11px] font-bold text-amber-600">At the plot edge — move the bed to grow further.</p>
      )}
    </div>
  );
}

/**
 * The one bed editor. Used from the plot grid's bed sheet and from the
 * bed detail page — name, width/height (steppers, clamped to the plot and
 * blocked when they'd overlap another bed), and color.
 */
export default function BedEditModal({ bed, cols, rows, otherBeds, plants, onClose }: BedEditModalProps) {
  const maxW = Math.max(1, cols - bed.gridPosition.x);
  const maxH = Math.max(1, rows - bed.gridPosition.y);
  const [name, setName] = useState(bed.name || '');
  const [width, setWidth] = useState(Math.min(bed.size.w, maxW));
  const [height, setHeight] = useState(Math.min(bed.size.h, maxH));
  const [color, setColor] = useState(bed.color || '#4CAF50');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    const w = Math.max(1, Math.min(maxW, width));
    const h = Math.max(1, Math.min(maxH, height));

    // Growing into another bed is not allowed — say so instead of stacking.
    const overlaps = otherBeds.some(
      (b) =>
        b.id !== bed.id &&
        bed.gridPosition.x < b.gridPosition.x + b.size.w &&
        bed.gridPosition.x + w > b.gridPosition.x &&
        bed.gridPosition.y < b.gridPosition.y + b.size.h &&
        bed.gridPosition.y + h > b.gridPosition.y
    );
    if (overlaps) {
      toast.warning("That size would overlap another bed — move this bed or shrink it.");
      return;
    }

    setSaving(true);
    try {
      // Targeted update — never writes the doc id or server timestamps back.
      await updateDoc(doc(db, 'planters', bed.id), {
        name: name.trim() || bed.name,
        size: { w, h },
        color,
      });

      // Pull riders back inside the new footprint (shrinking orphans edge plants).
      const bx = bed.gridPosition.x;
      const by = bed.gridPosition.y;
      // Rail plants live at (0, 0) with no planterId. A bed that starts at the
      // origin must not adopt them — that stacks the whole rail into one cell.
      const riders = plants.filter((p) => plantOccupiesBed(p, bed));
      for (const r of riders) {
        const rx = Math.max(bx, Math.min(bx + w - 1, r.gridPosition?.x ?? bx));
        const ry = Math.max(by, Math.min(by + h - 1, r.gridPosition?.y ?? by));
        if (rx !== r.gridPosition?.x || ry !== r.gridPosition?.y || r.planterId !== bed.id) {
          await updateDoc(doc(db, 'inhabitants', r.id), {
            gridPosition: { x: rx, y: ry },
            planterId: bed.id,
          });
        }
      }

      toast.success('Bed updated');
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `planters/${bed.id}`);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl"
      >
        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black font-headline tracking-tight">Edit Bed</h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-stone-100 rounded-full transition-colors"
              aria-label="Close bed editor"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Bed Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-stone-100 border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 ring-primary/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Stepper label="Width" value={width} min={1} max={maxW} onChange={setWidth} />
            <Stepper label="Height" value={height} min={1} max={maxH} onChange={setHeight} />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Bed Color</label>
            <div className="flex flex-wrap gap-2">
              {BED_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Bed color ${c}`}
                  className={cn(
                    'w-10 h-10 rounded-full border-4 transition-all',
                    color === c ? 'border-primary scale-110' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-primary text-white font-black py-4 rounded-2xl hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? (
              <>
                <Check size={20} className="animate-bounce" /> Saving…
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
