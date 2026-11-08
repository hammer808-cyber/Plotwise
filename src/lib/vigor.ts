import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { Inhabitant } from '../types';

/**
 * Event-based vigor engine.
 *
 * A plant's vigor (0-100) is CALCULATED from real recorded events — never
 * hand-entered. Four factors:
 *  - hydration (30%): days since the last Watering event vs the expected window
 *  - condition (30%): the plant's status + health keywords in its notes
 *  - pests     (25%): active (unresolved) treatments drag it down; resolved ones recover it
 *  - care      (15%): recent care events (fertilizing, pruning, treatments) show attention
 *
 * Bed vigor = average of its plants. Plot vigor = average of all its plants.
 * Empty beds/plots report null (shown as "—", never 0%).
 */

export interface VigorBreakdown {
  hydration: number;
  condition: number;
  pests: number;
  care: number;
  total: number;
}

export interface VigorEvent {
  id?: string;
  type?: string;
  eventType?: string;
  targetId?: string;
  targetType?: string;
  date?: string;
  createdAt?: any;
  notes?: string;
}

export interface VigorTreatment {
  id?: string;
  plantId?: string;
  status?: string;
  successRate?: number;
  resolvedAt?: any;
  createdAt?: any;
}

const DAY_MS = 86_400_000;
const WATER_WINDOW_DAYS = 3; // expected watering interval when nothing else is known

function toDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === 'function') {
    try { return v.toDate(); } catch { return null; }
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function daysSince(d: Date | null): number | null {
  if (!d) return null;
  return (Date.now() - d.getTime()) / DAY_MS;
}

function plantAgeDays(plant: Inhabitant): number | null {
  const d = toDate((plant as any).plantedAt) || toDate((plant as any).createdAt) || toDate((plant as any).startDate);
  const days = daysSince(d);
  return days === null ? null : Math.max(0, days);
}

function lastWateringDate(plant: Inhabitant, logs: VigorEvent[]): Date | null {
  const dates: Date[] = [];
  const lw = toDate((plant as any).lastWatered);
  if (lw) dates.push(lw);
  for (const log of logs) {
    const t = (log.type || log.eventType || '').toLowerCase();
    if (t !== 'watering') continue;
    if (log.targetId && plant.id && log.targetId !== plant.id) continue;
    const d = toDate(log.date) || toDate(log.createdAt);
    if (d) dates.push(d);
  }
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

/** 0-100 from watering history. */
function scoreHydration(plant: Inhabitant, logs: VigorEvent[]): number {
  if ((plant as any).needsWater === true) return 35;
  const next = (plant as any).nextWatering as string | undefined;
  if (next) {
    const nextDate = new Date(next + 'T23:59:59');
    if (!isNaN(nextDate.getTime()) && nextDate.getTime() >= Date.now() - DAY_MS) return 95; // on schedule
  }
  const last = lastWateringDate(plant, logs);
  if (!last) {
    const age = plantAgeDays(plant);
    if (age === null) return 60;
    return age < 7 ? 65 : 30; // young plant, benefit of the doubt; old + never watered = dry
  }
  const days = Math.max(0, daysSince(last) ?? 0);
  if (days <= WATER_WINDOW_DAYS) return 100;
  if (days >= WATER_WINDOW_DAYS * 3) return 15;
  // linear decay between the window and 3x the window
  return Math.round(100 - ((days - WATER_WINDOW_DAYS) / (WATER_WINDOW_DAYS * 2)) * 85);
}

const STATUS_SCORES: Record<string, number> = {
  excellent: 95,
  healthy: 90,
  thriving: 95,
  flowering: 90,
  fruiting: 90,
  planted: 80,
  growing: 80,
  vegetative: 80,
  seedling: 70,
  pending: 70,
  dormant: 60,
  stressed: 35,
  struggling: 25,
  dying: 8,
  dead: 3,
};

const NEGATIVE_NOTE_WORDS = ['dying', 'dead', 'wilt', 'yellow', 'brown', 'rot', 'mold', 'mildew', 'pest', 'infest', 'aphid', 'sick', 'droop', 'burn', 'spot', 'fungus'];
const POSITIVE_NOTE_WORDS = ['thriv', 'sprout', 'bloom', 'flower', 'healthy', 'great', 'growing well', 'new growth', 'recovered'];

/** 0-100 from the gardener's own condition notes (status + free text). */
function scoreCondition(plant: Inhabitant): number {
  const status = String(plant.status || '').toLowerCase().trim();
  let score = STATUS_SCORES[status] ?? 60;
  const notes = `${plant.notes || ''} ${plant.description || ''}`.toLowerCase();
  if (notes.trim()) {
    if (NEGATIVE_NOTE_WORDS.some((w) => notes.includes(w))) score -= 15;
    if (POSITIVE_NOTE_WORDS.some((w) => notes.includes(w))) score += 10;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** 0-100 from pest/disease pressure: active treatments hurt, resolved ones recover. */
function scorePests(plant: Inhabitant, treatments: VigorTreatment[]): number {
  const mine = treatments.filter((t) => !t.plantId || !plant.id || t.plantId === plant.id);
  const active = mine.filter((t) => String(t.status || '').toLowerCase() === 'active');
  if (active.length > 0) return Math.max(0, 70 - active.length * 30);
  const resolved = mine
    .filter((t) => String(t.status || '').toLowerCase() === 'resolved')
    .map((t) => ({ t, days: daysSince(toDate(t.resolvedAt) || toDate(t.createdAt)) }))
    .filter((x) => x.days !== null) as { t: VigorTreatment; days: number }[];
  if (resolved.length === 0) return 100;
  const recent = resolved.filter((x) => x.days <= 30);
  if (recent.length === 0) return 100;
  // recently recovered: partial credit scaled by the recorded success rate
  const avgSuccess = recent.reduce((a, x) => a + (x.t.successRate ?? 80), 0) / recent.length;
  return Math.round(70 + (avgSuccess / 100) * 30);
}

const CARE_TYPES = new Set(['fertilizing', 'pruning', 'treatment', 'pest control', 'soil amendment', 'watering', 'transplanting']);

/** 0-100 from how recently the plant received any care. */
function scoreCare(plant: Inhabitant, logs: VigorEvent[]): number {
  let latest: Date | null = null;
  for (const log of logs) {
    const t = (log.type || log.eventType || '').toLowerCase();
    if (!CARE_TYPES.has(t)) continue;
    if (log.targetId && plant.id && log.targetId !== plant.id) continue;
    const d = toDate(log.date) || toDate(log.createdAt);
    if (d && (!latest || d > latest)) latest = d;
  }
  const days = daysSince(latest);
  if (days === null) return 40;
  if (days <= 14) return 100;
  if (days <= 30) return 70;
  return 40;
}

export function calculateVigor(
  plant: Inhabitant,
  logs: VigorEvent[] = [],
  treatments: VigorTreatment[] = []
): VigorBreakdown {
  const hydration = scoreHydration(plant, logs);
  const condition = scoreCondition(plant);
  const pests = scorePests(plant, treatments);
  const care = scoreCare(plant, logs);
  const total = Math.round(hydration * 0.3 + condition * 0.3 + pests * 0.25 + care * 0.15);
  return { hydration, condition, pests, care, total: Math.max(0, Math.min(100, total)) };
}

/** Average vigor across a set of plants; null when none have a score (renders as "—"). */
export function averageVigor(plants: Inhabitant[]): number | null {  const scored = plants.filter((p) => typeof p.vigorIndex === 'number');
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((a, p) => a + (p.vigorIndex || 0), 0) / scored.length);
}

/**
 * Score one plant. A missing `logs` or `treatments` argument keeps that
 * factor from the saved breakdown. An empty array means the caller loaded
 * that list and it was empty — it does not mean "unknown".
 */
export function assembleVigor(
  plant: Inhabitant,
  logs?: VigorEvent[],
  treatments?: VigorTreatment[]
): VigorBreakdown {
  const prev = (plant as any).vigorBreakdown as VigorBreakdown | undefined;
  const hydration = logs ? scoreHydration(plant, logs) : (prev?.hydration ?? scoreHydration(plant, []));
  const condition = scoreCondition(plant);
  const pests = treatments ? scorePests(plant, treatments) : (prev?.pests ?? scorePests(plant, []));
  const care = logs ? scoreCare(plant, logs) : (prev?.care ?? scoreCare(plant, []));
  const total = Math.max(0, Math.min(100, Math.round(hydration * 0.3 + condition * 0.3 + pests * 0.25 + care * 0.15)));
  return { hydration, condition, pests, care, total };
}

/**
 * Recompute one plant's vigor from live events and persist it.
 * Pass only the inputs you have: `logs` and `treatments` are each optional,
 * and any factor whose input is missing is preserved from the previously
 * saved breakdown (so a watering refresh never wipes out pest pressure).
 * Condition (status + notes) is always recomputed — it's the gardener's
 * current word on the plant.
 * Writes only when the score actually moved, so routine refreshes don't
 * churn Firestore.
 */
export async function recalculateVigor(
  plant: Inhabitant,
  logs?: VigorEvent[],
  treatments?: VigorTreatment[]
): Promise<VigorBreakdown | null> {
  if (!plant.id) return null;
  const prev = (plant as any).vigorBreakdown as VigorBreakdown | undefined;
  const breakdown = assembleVigor(plant, logs, treatments);
  const total = breakdown.total;
  const prevTotal = typeof plant.vigorIndex === 'number' ? plant.vigorIndex : null;
  if (prev && prevTotal === total) return breakdown;
  if (prev && prevTotal !== null && Math.abs(prevTotal - total) < 1) return breakdown;
  try {
    await updateDoc(doc(db, 'inhabitants', plant.id), {
      vigorIndex: total,
      vigorBreakdown: breakdown,
      vigorUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[vigor] persist failed', e);
  }
  return breakdown;
}

const STALE_HOURS = 24;

/**
 * Background refresh: recompute vigor for plants whose saved score is missing
 * or older than STALE_HOURS. Fire-and-forget; never blocks rendering.
 *
 * Omit `treatments` (and `logs`) when that list was not loaded. Defaulting
 * them to [] used to mean "no pests" and erased active disease pressure.
 */
export async function refreshStaleVigor(
  plants: Inhabitant[],
  logs?: VigorEvent[],
  treatments?: VigorTreatment[]
): Promise<void> {
  const cutoff = Date.now() - STALE_HOURS * 3_600_000;
  const stale = plants.filter((p) => {
    if (!p.id) return false;
    const updated = toDate((p as any).vigorUpdatedAt);
    if (!updated) return true;
    if (!(p as any).vigorBreakdown) return true;
    return updated.getTime() < cutoff;
  });
  if (stale.length === 0) return;
  // Don't hammer Firestore: cap the batch, rest refresh next time.
  for (const plant of stale.slice(0, 25)) {
    await recalculateVigor(plant, logs, treatments);
  }
}

/* ------------------------------------------------------------------ */
/* Quick health-check snapshots                                        */
/* ------------------------------------------------------------------ */

export interface HealthCheckAnswers {
  watered: 'yes' | 'no';
  leaves: 'healthy' | 'yellowing' | 'spots' | 'wilting';
  pests: 'none' | 'pests' | 'disease' | 'unsure';
  overall: 'thriving' | 'okay' | 'struggling';
}

const SNAPSHOT_SCORES: Record<keyof HealthCheckAnswers, Record<string, number>> = {
  watered: { yes: 100, no: 45 },
  leaves: { healthy: 100, yellowing: 60, spots: 50, wilting: 35 },
  pests: { none: 100, unsure: 70, pests: 40, disease: 40 },
  overall: { thriving: 100, okay: 70, struggling: 30 },
};

/**
 * Score a 4-question health check (0-100). This is a snapshot — callers
 * blend it into the persisted vigor (e.g. 30% weight) so a quick check
 * updates the score without replacing it.
 */
export function scoreHealthSnapshot(answers: HealthCheckAnswers): number {
  const parts = (Object.keys(SNAPSHOT_SCORES) as (keyof HealthCheckAnswers)[]).map(
    (k) => SNAPSHOT_SCORES[k][answers[k]] ?? 60
  );
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
}

/**
 * Blend a snapshot into an existing vigor score. The check nudges;
 * the event-based score keeps the majority of the weight.
 */
export function blendSnapshot(currentVigor: number | null, snapshot: number, weight = 0.3): number {
  const base = currentVigor ?? snapshot;
  return Math.round(base * (1 - weight) + snapshot * weight);
}
