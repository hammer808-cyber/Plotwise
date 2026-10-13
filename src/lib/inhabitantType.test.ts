import assert from 'node:assert/strict';
import { PLANT_DATABASE } from '../constants/plants';
import { INHABITANT_TYPES, normalizeInhabitantType } from './inhabitantType';

const allowed = new Set<string>(INHABITANT_TYPES);

assert.equal(normalizeInhabitantType('Herb'), 'Herb');
assert.equal(normalizeInhabitantType('Perennial'), 'Perennial');
assert.equal(normalizeInhabitantType('Fruit'), 'Vegetable');
assert.equal(normalizeInhabitantType('Fruit Tree'), 'Vegetable');
assert.equal(normalizeInhabitantType('Succulent'), 'Flower');
assert.equal(normalizeInhabitantType('Wildflower'), 'Flower');
assert.equal(normalizeInhabitantType('Shrub'), 'Perennial');
assert.equal(normalizeInhabitantType('Shrub/Tree'), 'Perennial');
assert.equal(normalizeInhabitantType('Tree'), 'Perennial');
assert.equal(normalizeInhabitantType('Vine'), 'Perennial');
assert.equal(normalizeInhabitantType('Grass'), 'Perennial');
assert.equal(normalizeInhabitantType(undefined), 'Annual');
assert.equal(normalizeInhabitantType(''), 'Annual');

for (const plant of PLANT_DATABASE) {
  const mapped = normalizeInhabitantType(plant.type);
  assert.ok(allowed.has(mapped), `${plant.name} type ${plant.type} mapped to ${mapped}`);
}

const libraryInvalid = PLANT_DATABASE.filter((p) => !allowed.has(p.type));
assert.ok(libraryInvalid.length > 0, 'library should contain types outside the rules enum');

console.log(`inhabitantType.test.ts ok (${libraryInvalid.length} library types remapped)`);
