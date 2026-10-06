import assert from 'node:assert/strict';
import { buildTaxonomyDoc, TAXONOMY_OWNER_FIELD } from './taxonomy';

const weed = buildTaxonomyDoc({
  name: 'Unknown Invasive',
  type: 'weed',
  threat: 5,
  icon: '🌿',
  discoveredBy: 'user-1',
  imageUrl: 'data:image/jpeg;base64,abc',
});

assert.equal(weed[TAXONOMY_OWNER_FIELD], 'user-1');
assert.equal('ownerUid' in weed, false, 'list query filters discoveredBy; ownerUid would miss the doc');
assert.equal(weed.threat, 5);
assert.equal(weed.imageUrl, 'data:image/jpeg;base64,abc');

const oversized = buildTaxonomyDoc({
  name: 'Camera Capture',
  type: 'weed',
  threat: 3,
  icon: '🌿',
  discoveredBy: 'user-1',
  imageUrl: 'data:image/png;base64,' + 'A'.repeat(800_000),
});
assert.equal('imageUrl' in oversized, false, 'a full camera PNG exceeds the 1 MiB document limit');
assert.equal(oversized.name, 'Camera Capture');

const plant = buildTaxonomyDoc({
  name: 'Mystery Sprout',
  type: 'plant',
  icon: '🌱',
  discoveredBy: 'user-1',
});
assert.equal('threat' in plant, false, 'undefined threat is rejected by the Firestore client');

console.log('taxonomy tests passed');
