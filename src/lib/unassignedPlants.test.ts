import assert from 'node:assert/strict';
import { isUnassignedPlant, unassignPlantUpdate } from './unassignedPlants';

assert.equal(isUnassignedPlant({ plotId: null }), true);
assert.equal(isUnassignedPlant({}), true);
assert.equal(isUnassignedPlant({ plotId: 'plot-1' }), false);

const cleared = unassignPlantUpdate('Healthy');
assert.equal(cleared.plotId, null);
assert.equal(cleared.planterId, null);
assert.deepEqual(cleared.gridPosition, { x: 0, y: 0 });
assert.equal('status' in cleared, false);

const legacy = unassignPlantUpdate('Planted');
assert.equal(legacy.status, 'Pending');
assert.equal(legacy.plotId, null);

console.log('unassignedPlants tests passed');
