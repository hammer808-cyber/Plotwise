/**
 * Locks the stale-refresh contract: omitting treatments keeps saved pest
 * pressure, and an explicit empty list means there are no active treatments.
 */
import type { Inhabitant } from '../src/types';
import { assembleVigor, type VigorTreatment } from '../src/lib/vigor';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const saved = { hydration: 90, condition: 25, pests: 40, care: 100, total: 61 };
const plant = {
  id: 'tomato-1',
  ownerUid: 'alice',
  name: 'Tomato',
  status: 'Struggling',
  vigorIndex: 61,
  vigorBreakdown: saved,
} as Inhabitant;

const active: VigorTreatment[] = [{ plantId: 'tomato-1', status: 'Active' }];

const omitted = assembleVigor(plant, [], undefined);
assert(omitted.pests === 40, `omitted treatments erased pest pressure (${omitted.pests})`);

const none = assembleVigor(plant, [], []);
assert(none.pests === 100, `empty treatment list should clear pest pressure (${none.pests})`);

const sick = assembleVigor(plant, [], active);
assert(sick.pests === 40, `one active treatment should score 40 pests, got ${sick.pests}`);

console.log('vigor preserve check passed');
