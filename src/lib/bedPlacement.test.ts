import { cellInBed, firstFreeBedCell } from './bedPlacement';

function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

const bed = { gridPosition: { x: 10, y: 10 }, size: { w: 4, h: 4 } };

eq(cellInBed({ x: 10, y: 10 }, bed), true, 'origin cell is inside');
eq(cellInBed({ x: 13, y: 13 }, bed), true, 'far corner is inside');
eq(cellInBed({ x: 14, y: 10 }, bed), false, 'width edge is outside');
eq(cellInBed({ x: 8, y: 8 }, bed), false, 'stale plot cell is outside');
eq(cellInBed(undefined, bed), false, 'missing cell is outside');

// A plant left at a stale plot cell must be offered a cell inside the bed,
// skipping cells other plants already occupy.
eq(
  firstFreeBedCell(bed, [
    { x: 10, y: 10 },
    { x: 11, y: 10 },
  ]),
  { x: 12, y: 10 },
  'skips occupied cells'
);

// A full bed still returns a cell inside the footprint so the plant rides the bed.
const tiny = { gridPosition: { x: 2, y: 3 }, size: { w: 1, h: 1 } };
eq(firstFreeBedCell(tiny, [{ x: 2, y: 3 }]), { x: 2, y: 3 }, 'full bed stays inside');

console.log('bedPlacement tests passed');
