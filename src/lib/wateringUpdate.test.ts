import { lastWateredValue, waterNowUpdate } from './wateringUpdate';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const now = new Date('2026-10-01T11:00:00.000Z');

{
  const value = lastWateredValue(now);
  assert(value instanceof Date, 'lastWatered must be a Date so Firestore stores a timestamp');
  assert(value.getTime() === now.getTime(), 'lastWatered must keep the watering instant');
  assert(typeof value !== 'string', 'an ISO string is rejected by inhabitant rules');
}

{
  const patch = waterNowUpdate(now);
  assert(patch.lastWatered instanceof Date, 'Water Now must not write an ISO string');
  assert(typeof patch.lastWatered !== 'string', 'string lastWatered fails inhabitant rules');
  assert(patch.status === 'Healthy', 'Water Now marks the plant healthy');
}

console.log('wateringUpdate tests passed');
