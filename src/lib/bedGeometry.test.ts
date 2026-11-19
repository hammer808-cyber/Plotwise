import { findFreeBedSpot, rotateBedClockwise, type CellRect, type PlantCell } from './bedGeometry';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function cellsOf(bed: CellRect): PlantCell[] {
  const plants: PlantCell[] = [];
  for (let y = 0; y < bed.h; y++) {
    for (let x = 0; x < bed.w; x++) {
      plants.push({ id: `${x},${y}`, x: bed.x + x, y: bed.y + y });
    }
  }
  return plants;
}

// Default quiz bed is 4×8. Rotating used to clamp the long axis onto the
// last row, so plants past y=3 piled onto one cell and the write stuck.
{
  const bed: CellRect = { x: 0, y: 0, w: 4, h: 8 };
  const plants = cellsOf(bed);
  const result = rotateBedClockwise({ bed, plants, cols: 30, rows: 20, otherBeds: [] });
  assert(result.ok, 'rotation should fit');
  if (!result.ok) throw new Error('unreachable');
  assert(result.size.w === 8 && result.size.h === 4, `size ${result.size.w}x${result.size.h}`);
  const keys = result.plants.map((p) => `${p.x},${p.y}`);
  assert(new Set(keys).size === plants.length, 'rotated plants must keep distinct cells');
  const far = result.plants.find((p) => p.id === '1,6');
  assert(far && !(far.x === 1 && far.y === 3), 'plant at (1,6) must not collapse onto the new edge');
  // Four clockwise turns restore the original arrangement.
  let cursor = bed;
  let placed = plants;
  for (let i = 0; i < 4; i++) {
    const step = rotateBedClockwise({ bed: cursor, plants: placed, cols: 30, rows: 20, otherBeds: [] });
    assert(step.ok, `turn ${i + 1} should fit`);
    if (!step.ok) throw new Error('unreachable');
    cursor = { x: step.origin.x, y: step.origin.y, w: step.size.w, h: step.size.h };
    placed = step.plants;
  }
  for (const original of plants) {
    const back = placed.find((p) => p.id === original.id);
    assert(back && back.x === original.x && back.y === original.y, `${original.id} did not return`);
  }
}

// A bed against the right edge must slide left so the swapped footprint fits,
// and its plants stay inside that new rectangle.
{
  const bed: CellRect = { x: 8, y: 0, w: 2, h: 4 };
  const plants = cellsOf(bed);
  const result = rotateBedClockwise({ bed, plants, cols: 10, rows: 10, otherBeds: [] });
  assert(result.ok, 'shifted rotation should fit');
  if (!result.ok) throw new Error('unreachable');
  assert(result.origin.x === 6 && result.origin.y === 0, 'origin should slide left to fit');
  for (const p of result.plants) {
    const inside =
      p.x >= result.origin.x &&
      p.x < result.origin.x + result.size.w &&
      p.y >= result.origin.y &&
      p.y < result.origin.y + result.size.h;
    assert(inside, `${p.id} landed outside the rotated bed at ${p.x},${p.y}`);
  }
}

// Refuse rather than cover a neighbor.
{
  const bed: CellRect = { x: 0, y: 0, w: 4, h: 8 };
  const result = rotateBedClockwise({
    bed,
    plants: [{ id: 'a', x: 1, y: 6 }],
    cols: 30,
    rows: 20,
    otherBeds: [{ x: 4, y: 0, w: 4, h: 4 }],
  });
  assert(result.ok === false && result.reason === 'overlap', 'rotation onto a neighbor must be refused');
}

// Wider than the plot after the swap.
{
  const result = rotateBedClockwise({
    bed: { x: 0, y: 0, w: 4, h: 8 },
    plants: [],
    cols: 6,
    rows: 20,
    otherBeds: [],
  });
  assert(result.ok === false && result.reason === 'out-of-bounds', 'rotation that cannot fit must be refused');
}

// A plot already covered by one bed has no spot for another. Falling back
// to (0, 0) is what stacked the new bed on the first.
{
  const full: CellRect = { x: 0, y: 0, w: 20, h: 15 };
  const spot = findFreeBedSpot({ w: 4, h: 8 }, 20, 15, [full]);
  assert(spot === null, 'a full plot must not invent an origin spot');
}

{
  const spot = findFreeBedSpot({ w: 4, h: 8 }, 20, 15, [{ x: 0, y: 0, w: 4, h: 8 }]);
  assert(spot && spot.x === 4 && spot.y === 0, `expected (4,0), got ${spot && spot.x},${spot && spot.y}`);
}

{
  const spot = findFreeBedSpot({ w: 4, h: 8 }, 20, 15, []);
  assert(spot && spot.x === 0 && spot.y === 0, 'empty plot starts at the origin');
}

console.log('bedGeometry tests passed');
