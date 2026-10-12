import assert from 'node:assert/strict';
import { bedAddPlantsPath, rowsForBedPage } from './bedLinks';

assert.equal(bedAddPlantsPath(undefined), null);
assert.equal(bedAddPlantsPath(null), null);
assert.equal(bedAddPlantsPath(''), null);
assert.equal(bedAddPlantsPath('plot-1'), '/plots/plot-1');

const rail = { id: 'rail', planterId: undefined, name: 'Waiting' };
const here = { id: 'here', planterId: 'bed-1', name: 'Basil' };
const other = { id: 'other', planterId: 'bed-2', name: 'Mint' };

assert.deepEqual(
  rowsForBedPage([rail, here, other], 'bed-1', false).map((p) => p.id),
  ['here'],
  'a standalone bed must not adopt unassigned plants or another bed\'s plants'
);
assert.deepEqual(
  rowsForBedPage([rail, here, other], 'bed-1', true).map((p) => p.id),
  ['rail', 'here', 'other'],
  'a plot-scoped listener already excludes other plots'
);

console.log('bedLinks.test.ts ok');
