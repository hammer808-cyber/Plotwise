import assert from 'node:assert/strict';
import { rowsForPlant } from './plantRecords.ts';

const rows = [
  { plantId: 'tomato', name: 'Water tomato' },
  { plantId: 'basil', name: 'Water basil' },
  { plantId: null, name: 'Unassigned' },
  { name: 'Missing id' },
];

const kept = rowsForPlant(rows, 'tomato');
assert.deepEqual(kept.map((row) => row.name), ['Water tomato']);
assert.equal(rowsForPlant(rows, 'missing').length, 0);

console.log('plantRecords tests passed');
