import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plotOwnerKeepsOrReleases } from './plotOwnerUpdate.ts';

const owner = { isPlotOwner: true as const };

assert.equal(
  plotOwnerKeepsOrReleases({ ...owner, oldPlotId: 'plot-a', newPlotId: 'plot-a' }),
  true,
  'the plot owner can keep editing a plant that stays in their plot',
);
assert.equal(
  plotOwnerKeepsOrReleases({ ...owner, oldPlotId: 'plot-a', newPlotId: null }),
  true,
  'clearing plotId releases the plant when the plot is deleted',
);
assert.equal(
  plotOwnerKeepsOrReleases({ ...owner, oldPlotId: 'plot-a', newPlotId: undefined }),
  true,
);
assert.equal(
  plotOwnerKeepsOrReleases({ ...owner, oldPlotId: 'plot-a', newPlotId: 'plot-b' }),
  false,
  'a plot owner must not move someone else\'s plant into another garden',
);
assert.equal(
  plotOwnerKeepsOrReleases({ ...owner, oldPlotId: 'plot-a', newPlotId: '' }),
  false,
  'an empty plotId misses the rail query, so it is not a release',
);
assert.equal(
  plotOwnerKeepsOrReleases({ isPlotOwner: false, oldPlotId: 'plot-a', newPlotId: 'plot-a' }),
  false,
);
assert.equal(
  plotOwnerKeepsOrReleases({ ...owner, oldPlotId: null, newPlotId: 'plot-a' }),
  false,
);
assert.equal(
  plotOwnerKeepsOrReleases({ ...owner, oldPlotId: '', newPlotId: null }),
  false,
);

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');

assert.match(rules, /function plotOwnerKeepsOrReleases\(\)/);
assert.match(rules, /nextPlot == resource\.data\.plotId \|\| nextPlot == null/);

function updateClause(start: string, end: string): string {
  const section = rules.slice(rules.indexOf(start), rules.indexOf(end));
  const from = section.indexOf('allow update:');
  const to = section.indexOf('allow delete:');
  return section.slice(from, to);
}

for (const [start, end] of [
  ['match /inhabitants/{id}', 'match /photos/{photoId}'],
  ['match /planters/{planterId}', 'match /fertilizing_events/{eventId}'],
] as const) {
  const update = updateClause(start, end);
  assert.match(update, /plotOwnerKeepsOrReleases\(\)/);
  assert.equal(
    update.includes('plotDoc(resource.data.plotId).ownerUid'),
    false,
    `${start} update must not treat plot ownership as permission to retarget plotId`,
  );
}

console.log('plotOwnerUpdate.test.ts ok');
