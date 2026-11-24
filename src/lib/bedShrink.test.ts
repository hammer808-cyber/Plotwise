import assert from 'node:assert/strict';
import { placementAfterShrink, type ShrinkPlant } from './bedShrink.ts';

const bed = { id: 'bed-1', gridPosition: { x: 2, y: 0 } };

function plant(partial: Partial<ShrinkPlant> & Pick<ShrinkPlant, 'id'>): ShrinkPlant {
  return { planterId: 'bed-1', ...partial };
}

// 4-wide bed at x=2 shrunk to 2 cells covers x=2 and x=3 only.
const kept = placementAfterShrink(plant({ id: 'a', gridPosition: { x: 3, y: 0 } }), bed, 2, 2);
assert.equal(kept.action, 'keep');

const dropped = placementAfterShrink(plant({ id: 'b', gridPosition: { x: 5, y: 1 } }), bed, 2, 2);
assert.equal(dropped.action, 'release');
if (dropped.action === 'release') {
  assert.deepEqual(dropped.gridPosition, { x: 0, y: 0 });
  assert.equal(dropped.plotId, null);
  assert.equal(dropped.planterId, null);
  assert.equal(dropped.status, undefined);
}

// Two plants past the new edge must not be rewritten onto the same cell.
const edge = [
  plant({ id: 'c', gridPosition: { x: 5, y: 0 } }),
  plant({ id: 'd', gridPosition: { x: 5, y: 1 } }),
].map((p) => placementAfterShrink(p, bed, 2, 2));
assert.equal(edge.every((w) => w.action === 'release'), true);

// A plant that is only geometrically inside (no planterId) is not this bed's rider.
const waiting = placementAfterShrink(
  { id: 'rail', planterId: null, gridPosition: { x: 2, y: 0 } },
  bed,
  2,
  2
);
assert.equal(waiting.action, 'keep');

const legacy = placementAfterShrink(
  plant({ id: 'old', status: 'Planted', gridPosition: { x: 9, y: 0 } }),
  bed,
  2,
  2
);
assert.equal(legacy.action, 'release');
if (legacy.action === 'release') assert.equal(legacy.status, 'Pending');

console.log('bedShrink tests passed');
