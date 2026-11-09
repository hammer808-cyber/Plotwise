import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import type { SpatialPlot } from '../types';
import { PLOT_HEALTH, PLOT_STATUSES, coercePlotHealth, coercePlotStatus } from '../lib/firestoreEnums';

/**
 * The one and only plot edit form. Used everywhere a plot can be edited
 * (Plots list, Plot detail) so every entry point asks the same questions,
 * always pre-filled from the plot being edited.
 */
export interface PlotEditData {
  name: string;
  sunExposure: string;
  soilType: string;
  status: string;
  healthStatus: string;
  description: string;
  notes: string;
}

export const SUN_OPTIONS = ['Full Sun', 'Partial Shade', 'Full Shade'];
export const SOIL_OPTIONS = ['Loam', 'Clay', 'Sandy', 'Raised Bed Mix'];
const STATUS_OPTIONS = [...PLOT_STATUSES];
const HEALTH_OPTIONS = [...PLOT_HEALTH];

interface PlotEditFormProps {
  initial: SpatialPlot;
  isSaving: boolean;
  onSave: (data: PlotEditData) => void;
  onCancel: () => void;
}

function withCurrent<T extends string>(options: T[], current: string | undefined): string[] {
  if (current && !options.includes(current as T)) return [current, ...options];
  return options;
}

export default function PlotEditForm({ initial, isSaving, onSave, onCancel }: PlotEditFormProps) {
  const [form, setForm] = useState<PlotEditData>({
    name: initial.name || '',
    sunExposure: initial.sunExposure || initial.sunlight || 'Full Sun',
    soilType: initial.soilType || 'Loam',
    status: initial.status || 'Active',
    healthStatus: initial.healthStatus || 'Stable',
    description: initial.description || '',
    notes: initial.notes || '',
  });

  // Re-fill when a different plot is opened in the same mounted form
  useEffect(() => {
    setForm({
      name: initial.name || '',
      sunExposure: initial.sunExposure || initial.sunlight || 'Full Sun',
      soilType: initial.soilType || 'Loam',
      status: initial.status || 'Active',
      healthStatus: initial.healthStatus || 'Stable',
      description: initial.description || '',
      notes: initial.notes || '',
    });
  }, [initial.id]);

  const set = (key: keyof PlotEditData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [key]: e.target.value }));

  const label = 'text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 ml-4';
  const input = 'w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-primary/20 transition-all';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...form,
          status: coercePlotStatus(form.status),
          healthStatus: coercePlotHealth(form.healthStatus),
        });
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <label className={label}>Plot name</label>
        <input type="text" required value={form.name} onChange={set('name')} className={input} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className={label}>Sun exposure</label>
          <select value={form.sunExposure} onChange={set('sunExposure')} className={`${input} appearance-none`}>
            {withCurrent(SUN_OPTIONS, form.sunExposure).map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className={label}>Soil type</label>
          <select value={form.soilType} onChange={set('soilType')} className={`${input} appearance-none`}>
            {withCurrent(SOIL_OPTIONS, form.soilType).map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className={label}>Status</label>
          <select value={form.status} onChange={set('status')} className={`${input} appearance-none`}>
            {withCurrent(STATUS_OPTIONS, form.status).map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className={label}>Health</label>
          <select value={form.healthStatus} onChange={set('healthStatus')} className={`${input} appearance-none`}>
            {withCurrent(HEALTH_OPTIONS, form.healthStatus).map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className={label}>Description</label>
        <textarea value={form.description} onChange={set('description')} className={`${input} min-h-[80px]`} />
      </div>

      <div className="space-y-2">
        <label className={label}>Notes</label>
        <textarea value={form.notes} onChange={set('notes')} className={`${input} min-h-[80px]`} />
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-4 rounded-2xl font-black text-on-surface-variant hover:bg-surface-container-high transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="flex-1 bg-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
        >
          {isSaving ? (<><Check size={20} className="animate-bounce" /> Saved!</>) : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
