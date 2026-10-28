import assert from 'node:assert/strict';
import { mergePlotLists, nextActivePlotId } from './activePlot';

const owned = { id: 'owned', name: 'Backyard' };
const shared = { id: 'shared', name: 'Community' };

assert.deepEqual(
  mergePlotLists([owned], [shared]).map((p) => p.id),
  ['owned', 'shared']
);
assert.deepEqual(
  mergePlotLists([owned], [owned, shared]).map((p) => p.id),
  ['owned', 'shared'],
  'a plot the user owns and is also listed on must appear once'
);

// Shared listener wins the race and the saved garden is the owned plot.
assert.equal(
  nextActivePlotId('owned', [shared], false),
  'owned',
  'a partial shared list must not replace the saved owned plot'
);

// Owned listener wins the race and the saved garden is the shared plot.
assert.equal(
  nextActivePlotId('shared', [owned], false),
  'shared',
  'a partial owned list must not replace the saved shared plot'
);

assert.equal(nextActivePlotId('owned', [owned, shared], true), 'owned');
assert.equal(nextActivePlotId('shared', [owned, shared], true), 'shared');
assert.equal(
  nextActivePlotId('deleted', [owned, shared], true),
  'owned',
  'a saved id that is on neither list falls back once both lists are in'
);
assert.equal(nextActivePlotId(null, [owned, shared], true), 'owned');
assert.equal(
  nextActivePlotId('owned', [], true),
  'owned',
  'an empty full list does not clear a saved id'
);

console.log('activePlot.test.ts ok');
