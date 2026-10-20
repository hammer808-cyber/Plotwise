declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string;
}

import { readFileSync } from 'node:fs';
import { ownerReassignmentHoles } from './firestoreRuleGuards';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const holes = ownerReassignmentHoles(rules);

if (holes.length > 0) {
  for (const hole of holes) {
    console.error(`${hole.collection}: ${hole.detail}`);
  }
  throw new Error(`firestore.rules lets an owner reassign ${holes.length} owned collection(s)`);
}

const tasksMatches = rules.split('match /tasks/').length - 1;
if (tasksMatches !== 1) {
  throw new Error(`expected a single tasks match, found ${tasksMatches}`);
}

console.log('firestore rule owner-reassignment guards ok');
