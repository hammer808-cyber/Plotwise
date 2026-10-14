import assert from 'node:assert/strict';
import { releasePlantPatch } from './plotDelete';

const healthy = releasePlantPatch('Healthy');
assert.equal(healthy.plotId, null);
assert.equal(healthy.planterId, null);
assert.deepEqual(healthy.gridPosition, { x: 0, y: 0 });
assert.equal('status' in healthy, false);

const legacy = releasePlantPatch('Planted');
assert.equal(legacy.status, 'Pending');
assert.equal(legacy.plotId, null);
assert.equal(legacy.planterId, null);

console.log('plotDelete tests passed');
