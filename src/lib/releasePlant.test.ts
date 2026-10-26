import assert from 'node:assert/strict';
import { releasePlantUpdate } from './releasePlant';

const released = releasePlantUpdate('Healthy');
assert.equal(released.plotId, null);
assert.equal(released.planterId, null);
assert.deepEqual(released.gridPosition, { x: 0, y: 0 });
assert.equal('status' in released, false);

const legacy = releasePlantUpdate('Planted');
assert.equal(legacy.status, 'Pending');
assert.equal(legacy.plotId, null);
