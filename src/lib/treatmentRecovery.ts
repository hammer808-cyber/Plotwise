import { format } from 'date-fns';

/**
 * Status written when a gardener marks a treatment recovered.
 * Firestore `isValidTreatment` must allow this value. The treatment log and
 * the vigor engine both look for "Resolved", not "Completed".
 */
export const RESOLVED_TREATMENT_STATUS = 'Resolved';

/**
 * Calendar rules only accept YYYY-MM-DD. A full ISO timestamp is rejected,
 * which aborts Mark as Recovered after the plant has already been updated.
 */
export function recoveryCalendarDate(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}
