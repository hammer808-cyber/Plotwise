import assert from 'node:assert/strict';
import { coerceInhabitantType, INHABITANT_TYPES } from './inhabitantEdit';

for (const type of INHABITANT_TYPES) {
  assert.equal(coerceInhabitantType(type), type);
}

assert.equal(coerceInhabitantType('Fruit'), 'Vegetable');
assert.equal(coerceInhabitantType('Fruit Tree'), 'Vegetable');
assert.equal(coerceInhabitantType('Succulent'), 'Flower');
assert.equal(coerceInhabitantType('Wildflower'), 'Flower');
assert.equal(coerceInhabitantType('Shrub'), 'Perennial');
assert.equal(coerceInhabitantType('Tree'), 'Perennial');
assert.equal(coerceInhabitantType(''), 'Annual');
assert.equal(coerceInhabitantType(undefined), 'Annual');

console.log('inhabitantEdit.test.ts passed');
