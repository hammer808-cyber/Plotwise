import assert from 'node:assert/strict';
import { normalizeInhabitantType, plantAssignmentPatch } from './plantAssignment';

const unassigned = plantAssignmentPatch({ plotId: '', planterId: 'bed-1' });
assert.equal(unassigned.plotId, null, 'Unassigned must be null so the rail query matches');
assert.equal(unassigned.planterId, null);
assert.deepEqual(unassigned.gridPosition, { x: 0, y: 0 });

const noBed = plantAssignmentPatch({ plotId: 'plot-1', planterId: '' });
assert.equal(noBed.plotId, 'plot-1');
assert.equal(noBed.planterId, null);
assert.deepEqual(noBed.gridPosition, { x: 0, y: 0 });

const kept = plantAssignmentPatch({ plotId: 'plot-1', planterId: 'bed-1' });
assert.equal(kept.plotId, 'plot-1');
assert.equal(kept.planterId, 'bed-1');
assert.equal('gridPosition' in kept, false, 'a real bed assignment must keep its cell');

const untouched = plantAssignmentPatch({});
assert.deepEqual(untouched, {}, 'absent plot/bed fields must be omitted, not written as undefined');

assert.equal(normalizeInhabitantType('Herb'), 'Herb');
assert.equal(normalizeInhabitantType('Fruit'), 'Vegetable');
assert.equal(normalizeInhabitantType('Fruit Tree'), 'Vegetable');
assert.equal(normalizeInhabitantType('Succulent'), 'Flower');
assert.equal(normalizeInhabitantType('Wildflower'), 'Flower');
assert.equal(normalizeInhabitantType('Shrub'), 'Annual');
assert.equal(normalizeInhabitantType(undefined), 'Annual');

console.log('plantAssignment.test.ts ok');
