import type { HealthCheckAnswers } from './vigor';

/**
 * Payloads for the quick health check's dual-write.
 *
 * logEvent copies `data` onto the category doc and the global_events doc,
 * but the id it stores is the `targetId` argument — a targetId that exists
 * only inside `data` is replaced by plotId. global_events also requires a
 * string `timestamp`, which is not added for the caller. Both care rows
 * therefore have to carry those fields themselves, and both `type` values
 * have to be ones the Firestore rules allow.
 */
export interface CareLogCall {
  ownerUid: string;
  category: 'event_logs';
  eventType: 'Watering' | 'Health Check';
  targetId: string;
  targetType: 'Inhabitant';
  calendarTitle: string;
  calendarDescription: string;
  data: {
    targetId: string;
    targetType: 'Inhabitant';
    type: 'Watering' | 'Health Check';
    plotId: string | null;
    notes: string;
    date: string;
    timestamp: string;
    answers?: HealthCheckAnswers;
    snapshot?: number;
    vigorBefore?: number | null;
    vigorAfter?: number;
  };
}

export function buildWateringCheckLog(opts: {
  ownerUid: string;
  plantId: string;
  plantName: string;
  plotId?: string | null;
  now?: Date;
}): CareLogCall {
  const now = opts.now ?? new Date();
  const stamp = now.toISOString();
  return {
    ownerUid: opts.ownerUid,
    category: 'event_logs',
    eventType: 'Watering',
    targetId: opts.plantId,
    targetType: 'Inhabitant',
    calendarTitle: `Watered: ${opts.plantName}`,
    calendarDescription: 'Hydration logged from a quick health check.',
    data: {
      targetId: opts.plantId,
      targetType: 'Inhabitant',
      type: 'Watering',
      plotId: opts.plotId || null,
      notes: 'Watered during quick health check',
      date: stamp,
      timestamp: stamp,
    },
  };
}

export function buildHealthCheckLog(opts: {
  ownerUid: string;
  plantId: string;
  plantName: string;
  plotId?: string | null;
  notes: string;
  answers: HealthCheckAnswers;
  snapshot: number;
  vigorBefore: number | null;
  vigorAfter: number;
  now?: Date;
}): CareLogCall {
  const now = opts.now ?? new Date();
  const stamp = now.toISOString();
  return {
    ownerUid: opts.ownerUid,
    category: 'event_logs',
    eventType: 'Health Check',
    targetId: opts.plantId,
    targetType: 'Inhabitant',
    calendarTitle: `Health check: ${opts.plantName}`,
    calendarDescription: opts.notes,
    data: {
      targetId: opts.plantId,
      targetType: 'Inhabitant',
      type: 'Health Check',
      plotId: opts.plotId || null,
      notes: opts.notes,
      date: stamp,
      timestamp: stamp,
      answers: opts.answers,
      snapshot: opts.snapshot,
      vigorBefore: opts.vigorBefore,
      vigorAfter: opts.vigorAfter,
    },
  };
}
