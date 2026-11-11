import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canCreatePlantPhoto } from './photoAccess';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

assert.match(rules, /function parentPlantPlot\(plantId\)/);
assert.match(rules, /function parentPlantOwner\(plantId\)/);
assert.doesNotMatch(rules, /function parentPlantPlot\(\)/);
assert.doesNotMatch(
  rules,
  /inhabitants\/\$\(id\)/,
  'photo helpers must not read the inhabitants wildcard from outside its match'
);
assert.match(rules, /parentPlantPlot\(id\)/);
assert.match(rules, /parentPlantOwner\(id\) == request\.auth\.uid/);
assert.doesNotMatch(
  rules,
  /parentPlantPlot\(id\) == null/,
  'a plant with no plot must not be writable by every signed-in account'
);

const owner = {
  signedIn: true,
  authUid: 'owner',
  photoOwnerUid: 'owner',
  plantOwnerUid: 'owner',
  plotId: null as string | null,
  isPlotMember: false,
};

assert.equal(canCreatePlantPhoto(owner), true, 'the plant owner can log a photo on an unassigned plant');
assert.equal(
  canCreatePlantPhoto({ ...owner, authUid: 'stranger', photoOwnerUid: 'stranger' }),
  false,
  'another account that only knows the plant id cannot attach a photo'
);
assert.equal(
  canCreatePlantPhoto({
    ...owner,
    authUid: 'friend',
    photoOwnerUid: 'friend',
    plantOwnerUid: 'owner',
    plotId: 'plot-1',
    isPlotMember: true,
  }),
  true,
  'a plot member can add a photo to a plant in the shared plot'
);
assert.equal(
  canCreatePlantPhoto({
    ...owner,
    authUid: 'removed',
    photoOwnerUid: 'removed',
    plantOwnerUid: 'owner',
    plotId: 'plot-1',
    isPlotMember: false,
  }),
  false,
  'a removed collaborator cannot keep writing photos into the plot'
);
assert.equal(
  canCreatePlantPhoto({ ...owner, photoOwnerUid: 'someone-else' }),
  false,
  'a photo cannot be filed under another account'
);
assert.equal(canCreatePlantPhoto({ ...owner, signedIn: false }), false);

console.log('photoAccess.test.ts ok');
