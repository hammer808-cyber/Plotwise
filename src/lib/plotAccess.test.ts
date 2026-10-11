import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownerMayDeletePlacedDoc, ownerPlotUpdateAllowed } from './plotAccess.ts';

const memberOf = (ids: string[]) => (plotId: string) => ids.includes(plotId);
const plots = (ids: string[]) => (plotId: string) => ids.includes(plotId);

// Personal plant edited, or attached only to a plot the owner belongs to.
assert.equal(
  ownerPlotUpdateAllowed({
    isDocOwner: true,
    oldPlotId: null,
    newPlotId: null,
    isMember: memberOf([]),
  }),
  true,
);
assert.equal(
  ownerPlotUpdateAllowed({
    isDocOwner: true,
    oldPlotId: '',
    newPlotId: 'plot-a',
    isMember: memberOf(['plot-a']),
  }),
  true,
);
assert.equal(
  ownerPlotUpdateAllowed({
    isDocOwner: true,
    oldPlotId: null,
    newPlotId: 'plot-a',
    isMember: memberOf([]),
  }),
  false,
  'knowing a plot id must not be enough to plant into it',
);

// Current member can edit in place, move to another of their plots, or unassign.
assert.equal(
  ownerPlotUpdateAllowed({
    isDocOwner: true,
    oldPlotId: 'plot-a',
    newPlotId: 'plot-a',
    isMember: memberOf(['plot-a']),
  }),
  true,
);
assert.equal(
  ownerPlotUpdateAllowed({
    isDocOwner: true,
    oldPlotId: 'plot-a',
    newPlotId: 'plot-b',
    isMember: memberOf(['plot-a', 'plot-b']),
  }),
  true,
);
assert.equal(
  ownerPlotUpdateAllowed({
    isDocOwner: true,
    oldPlotId: 'plot-a',
    newPlotId: '',
    isMember: memberOf(['plot-a']),
  }),
  true,
);
assert.equal(
  ownerPlotUpdateAllowed({
    isDocOwner: true,
    oldPlotId: 'plot-a',
    newPlotId: 'plot-b',
    isMember: memberOf(['plot-a']),
  }),
  false,
  'a member cannot move their plant into a plot they do not belong to',
);

// Removed collaborator: edits that stay in the plot are rejected; clearing plotId is allowed.
assert.equal(
  ownerPlotUpdateAllowed({
    isDocOwner: true,
    oldPlotId: 'plot-a',
    newPlotId: 'plot-a',
    isMember: memberOf([]),
  }),
  false,
  'removal must stop further edits inside the shared plot',
);
assert.equal(
  ownerPlotUpdateAllowed({
    isDocOwner: true,
    oldPlotId: 'plot-a',
    newPlotId: null,
    isMember: memberOf([]),
  }),
  true,
  'a removed collaborator can pull their own record back out',
);
assert.equal(
  ownerPlotUpdateAllowed({
    isDocOwner: false,
    oldPlotId: null,
    newPlotId: null,
    isMember: memberOf(['plot-a']),
  }),
  false,
);

// Bed delete: not from a plot you left, unless that plot is already gone.
assert.equal(
  ownerMayDeletePlacedDoc({
    isDocOwner: true,
    plotId: null,
    isMember: memberOf([]),
    plotExists: plots([]),
  }),
  true,
);
assert.equal(
  ownerMayDeletePlacedDoc({
    isDocOwner: true,
    plotId: 'plot-a',
    isMember: memberOf(['plot-a']),
    plotExists: plots(['plot-a']),
  }),
  true,
);
assert.equal(
  ownerMayDeletePlacedDoc({
    isDocOwner: true,
    plotId: 'plot-a',
    isMember: memberOf([]),
    plotExists: plots(['plot-a']),
  }),
  false,
  'a removed collaborator cannot delete a bed out of the garden they left',
);
assert.equal(
  ownerMayDeletePlacedDoc({
    isDocOwner: true,
    plotId: 'plot-a',
    isMember: memberOf([]),
    plotExists: plots([]),
  }),
  true,
);

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');

assert.match(rules, /function ownerPlotUpdateAllowed\(\)/);
assert.match(rules, /function ownerMayDeletePlacedDoc\(\)/);
assert.match(rules, /function isAttachedPlot\(plotId\)/);
assert.match(
  rules,
  /exists\(\/databases\/\$\(database\)\/documents\/spatial_plots\/\$\(plotId\)\)/,
);

const inhabitants = rules.slice(rules.indexOf('match /inhabitants/'), rules.indexOf('match /spatial_plots/'));
assert.match(inhabitants, /ownerPlotUpdateAllowed\(\)/);
assert.equal(
  inhabitants.includes('&& (isDocOwner()\n          ||'),
  false,
  'inhabitant updates must not treat document ownership as plot access',
);
assert.match(inhabitants, /parentPlotStillAllowsOwner\(\)/);

const planters = rules.slice(rules.indexOf('match /planters/'), rules.indexOf('match /fertilizing_events/'));
assert.match(planters, /ownerPlotUpdateAllowed\(\)/);
assert.match(planters, /ownerMayDeletePlacedDoc\(\)/);
assert.equal(
  planters.includes('&& (isDocOwner()\n          ||'),
  false,
  'planter updates must not treat document ownership as plot access',
);

console.log('plotAccess.test.ts ok');
