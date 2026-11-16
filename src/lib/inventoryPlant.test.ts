import assert from 'node:assert/strict';
import test from 'node:test';
import { unassignedPlantPlacement } from './inventoryPlant.ts';

test('new inventory plants store null plot and bed ids', () => {
  const placement = unassignedPlantPlacement();
  assert.equal(placement.plotId, null);
  assert.equal(placement.planterId, null);
  assert.deepEqual(placement.gridPosition, { x: 0, y: 0 });
});
