import assert from 'node:assert/strict';
import type { Inhabitant } from '../types';
import { calculateVigor, healthCheckBreakdown } from './vigor';

const sick = {
  id: 'tomato-1',
  ownerUid: 'alice',
  name: 'Tomato',
  type: 'Vegetable',
  status: 'Struggling',
  notes: 'powdery mildew on the lower leaves',
  vigorIndex: 48,
  vigorBreakdown: { hydration: 90, condition: 25, pests: 40, care: 100, total: 61 },
} as Inhabitant;

const kept = healthCheckBreakdown(sick, []);
assert.equal(kept.pests, 40, `health check erased pest pressure (${kept.pests})`);
assert.equal(kept.care, 100, `health check erased care momentum (${kept.care})`);
assert.equal(kept.condition, calculateVigor(sick, [], []).condition);

const watered = healthCheckBreakdown(
  { ...sick, status: 'Healthy', needsWater: false, lastWatered: new Date().toISOString() } as Inhabitant,
  [{ type: 'Watering', targetId: 'tomato-1', date: new Date().toISOString() }]
);
assert.equal(watered.pests, 40, 'a watering answer must not clear an active treatment');
assert.equal(watered.care, 100, 'a single watering log must not replace care history');
assert.ok(watered.hydration >= 90, `watering should keep hydration high (${watered.hydration})`);

const unscored = healthCheckBreakdown({ id: 'basil-1', name: 'Basil', status: 'Healthy' } as Inhabitant, []);
assert.equal(unscored.pests, 100, 'a plant with no saved breakdown still has no pest history');

const wiped = calculateVigor(sick, [], []);
assert.equal(wiped.pests, 100, 'empty treatment list is what the wizard used to persist');

console.log('healthCheckVigor.test.ts ok');
