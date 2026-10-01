/**
 * Inhabitant rules require `lastWatered` to be a Firestore timestamp.
 * An ISO string fails that check, so the whole update is rejected and the
 * watering never persists.
 *
 * A Date is stored as a timestamp by the client SDK. Callers must write
 * this value, not `date.toISOString()`.
 */
export function lastWateredValue(now: Date = new Date()): Date {
  return now;
}

export function waterNowUpdate(now: Date = new Date()): { lastWatered: Date; status: 'Healthy' } {
  return { lastWatered: lastWateredValue(now), status: 'Healthy' };
}
