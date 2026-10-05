import assert from 'node:assert/strict';
import test from 'node:test';
import {
  persistedBedLocalRepair,
  plantCellAfterBedMove,
  type BedFootprint,
  type GridCell,
} from './bedCoords.ts';

/**
 * The removed PlotDetail effect. Reproduced here so the regression is explicit:
 * if stored coords are outside the bed but numerically inside its size, it
 * added the bed origin and wrote the result back.
 */
function unsafeBedLocalRewrite(plant: GridCell, bed: BedFootprint): GridCell | null {
  const gx = plant.x - bed.x;
  const gy = plant.y - bed.y;
  const globalOk = gx >= 0 && gy >= 0 && gx < bed.w && gy < bed.h;
  const localOk = plant.x >= 0 && plant.y >= 0 && plant.x < bed.w && plant.y < bed.h;
  if (!globalOk && localOk) return { x: bed.x + plant.x, y: bed.y + plant.y };
  return null;
}

test('bed move keeps the plant on the translated plot-global cell', () => {
  // Bed was at (2, 0); plant at plot cell (3, 1). Bed moves to (6, 0).
  const moved = plantCellAfterBedMove({ x: 3, y: 1 }, 4, 0, 20, 15);
  assert.deepEqual(moved, { x: 7, y: 1 });
});

test('stale plot-global coords must not be rewritten as bed-local', () => {
  // Same move, observed before the plant write lands. Bed is already at (6, 0)
  // size 8×4; the plant document still says (3, 1).
  const bed: BedFootprint = { x: 6, y: 0, w: 8, h: 4 };
  const stale: GridCell = { x: 3, y: 1 };

  const unsafe = unsafeBedLocalRewrite(stale, bed);
  assert.deepEqual(unsafe, { x: 9, y: 1 });

  assert.equal(persistedBedLocalRepair(stale, bed), null);
});

test('a consistent plot-global plant is left alone by the old check too', () => {
  const bed: BedFootprint = { x: 6, y: 0, w: 8, h: 4 };
  assert.equal(unsafeBedLocalRewrite({ x: 7, y: 1 }, bed), null);
  assert.equal(persistedBedLocalRepair({ x: 7, y: 1 }, bed), null);
});
