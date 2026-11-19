export type WeedingIntensity = 'Low' | 'Moderate' | 'High' | 'Extreme';

function calendarDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The weed wizard's canopy slider is 1–10. weeding_events rules only accept
 * the Low | Moderate | High | Extreme enum, so a raw number is rejected.
 */
export function infestationBand(score: number): WeedingIntensity {
  const n = Number.isFinite(score) ? score : 5;
  if (n <= 3) return 'Low';
  if (n <= 6) return 'Moderate';
  if (n <= 8) return 'High';
  return 'Extreme';
}

/** Firestore's client throws if any field is undefined, which aborts the whole write. */
export function omitUndefined(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

/**
 * Shape a Weed Warrior payload so weeding_events rules accept it.
 * The global + button does not pick a plot, so plotId/plotName arrive undefined.
 * zone and date are required and the wizard never collected them.
 */
export function wizardWeedingRecord(
  data: {
    weedType?: string;
    intensity?: number;
    method?: string;
    areaCleared?: number;
    timeSpent?: number;
    isSeeding?: boolean;
    weq?: number;
    xp?: number;
    plotId?: string;
    plotName?: string;
  },
  now = new Date()
): Record<string, unknown> {
  const zoneSource = (data.plotName || 'Garden').trim() || 'Garden';
  const weedType = (data.weedType || 'Weed').trim().slice(0, 99) || 'Weed';
  const xp = Number.isFinite(data.xp) ? data.xp : 0;
  return omitUndefined({
    zone: zoneSource.slice(0, 49),
    weedType,
    intensity: infestationBand(Number(data.intensity)),
    canopyCover: Number.isFinite(Number(data.intensity)) ? Number(data.intensity) : 5,
    date: calendarDate(now),
    method: data.method,
    areaCleared: data.areaCleared,
    timeSpent: data.timeSpent,
    isSeeding: data.isSeeding,
    weq: Number.isFinite(data.weq) ? data.weq : undefined,
    xp,
    xpEarned: xp,
    plotId: typeof data.plotId === 'string' && data.plotId ? data.plotId : undefined,
    plotName: typeof data.plotName === 'string' && data.plotName ? data.plotName : undefined,
    timestamp: now.toISOString(),
  });
}

/**
 * Shape a treatment-wizard payload so treatment_events rules accept it.
 * Undefined plot fields from the global action button must be dropped.
 */
export function wizardTreatmentRecord(data: {
  diagnosis?: string;
  treatment?: string;
  dosage?: number;
  notes?: string;
  xp?: number;
  plotId?: string;
  plotName?: string;
  timestamp?: string;
}): Record<string, unknown> {
  const xp = Number.isFinite(data.xp) ? data.xp : 0;
  return omitUndefined({
    diagnosis: (data.diagnosis || 'Undiagnosed').slice(0, 500),
    treatment: (data.treatment || 'Treatment').slice(0, 500),
    dosage: Number.isFinite(data.dosage) ? data.dosage : undefined,
    notes: typeof data.notes === 'string' ? data.notes.slice(0, 2000) : undefined,
    xp,
    xpEarned: xp,
    plotId: typeof data.plotId === 'string' && data.plotId ? data.plotId : undefined,
    plotName: typeof data.plotName === 'string' && data.plotName ? data.plotName : undefined,
    timestamp:
      typeof data.timestamp === 'string' && data.timestamp.length > 0
        ? data.timestamp
        : new Date().toISOString(),
  });
}

/**
 * user_progress rules reject a null lastEventDate. Omit it until the first event.
 */
export function newProgressDocument(): { xp: number; level: number; streak: number; totalEvents: number } {
  return { xp: 0, level: 1, streak: 0, totalEvents: 0 };
}
