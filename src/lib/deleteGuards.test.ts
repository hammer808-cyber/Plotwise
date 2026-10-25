import assert from 'node:assert/strict';
import { canDeleteBed, canDeletePlot } from './deleteGuards.ts';

const owner = 'owner-1';
const friend = 'friend-2';
const stranger = 'stranger-3';

assert.equal(canDeletePlot({ userId: owner, plotOwnerUid: owner }), true);
assert.equal(
  canDeletePlot({ userId: friend, plotOwnerUid: owner }),
  false,
  'a collaborator must not start a plot delete — it removes their beds before the plot delete is denied',
);
assert.equal(canDeletePlot({ userId: undefined, plotOwnerUid: owner }), false);
assert.equal(canDeletePlot({ userId: owner, plotOwnerUid: undefined }), false);

assert.equal(
  canDeleteBed({ userId: friend, bedOwnerUid: friend, plotOwnerUid: owner }),
  true,
  'a collaborator can delete a bed they created',
);
assert.equal(
  canDeleteBed({ userId: owner, bedOwnerUid: friend, plotOwnerUid: owner }),
  true,
  'the plot owner can delete any bed in the plot',
);
assert.equal(
  canDeleteBed({ userId: friend, bedOwnerUid: owner, plotOwnerUid: owner }),
  false,
  'deleting someone else\'s bed unassigns its plants before the bed delete is denied',
);
assert.equal(
  canDeleteBed({ userId: stranger, bedOwnerUid: owner, plotOwnerUid: owner }),
  false,
);
assert.equal(
  canDeleteBed({ userId: friend, bedOwnerUid: undefined, plotOwnerUid: owner }),
  false,
);

console.log('delete guard tests passed');
