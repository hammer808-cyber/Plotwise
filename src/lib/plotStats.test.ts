import assert from 'node:assert/strict';
import { plantOccupiesBed } from './plotStats.ts';
import type { Inhabitant } from '../types.ts';

const originBed = {
  id: 'bed-origin',
  gridPosition: { x: 0, y: 0 },
  size: { w: 4, h: 8 },
};

function plant(partial: Partial<Inhabitant> & Pick<Inhabitant, 'id'>): Inhabitant {
  return { name: 'Tomato', ...partial };
}

const rail = plant({ id: 'rail', status: 'Pending', gridPosition: { x: 0, y: 0 } });
assert.equal(plantOccupiesBed(rail, originBed), false);

const plantedCorner = plant({
  id: 'corner',
  status: 'Healthy',
  planterId: 'bed-origin',
  gridPosition: { x: 0, y: 0 },
});
assert.equal(plantOccupiesBed(plantedCorner, originBed), true);

const otherBed = plant({
  id: 'other',
  planterId: 'bed-other',
  gridPosition: { x: 1, y: 1 },
});
assert.equal(plantOccupiesBed(otherBed, originBed), false);

const legacy = plant({
  id: 'legacy',
  status: 'Healthy',
  gridPosition: { x: 2, y: 3 },
});
assert.equal(plantOccupiesBed(legacy, originBed), true);
assert.equal(
  plantOccupiesBed(legacy, { id: 'far', gridPosition: { x: 6, y: 6 }, size: { w: 2, h: 2 } }),
  false
);

const shifted = plant({
  id: 'shifted',
  planterId: 'bed-origin',
  gridPosition: { x: 9, y: 9 },
});
assert.equal(plantOccupiesBed(shifted, originBed), true);

console.log('plotStats tests passed');
