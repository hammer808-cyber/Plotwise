declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string;
}

import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

const usersStart = rules.indexOf('match /users/{userId}');
if (usersStart < 0) throw new Error('users match is missing');
const usersBody = rules.slice(usersStart, rules.indexOf('match /plants/', usersStart));

const createAllow = usersBody
  .split('allow ')
  .slice(1)
  .map((statement) => statement.slice(0, statement.indexOf(';')))
  .find((statement) => statement.trim().startsWith('create'));

if (!createAllow) throw new Error('users create allow is missing');
if (!createAllow.includes("!('role' in request.resource.data)")) {
  throw new Error(
    `users create still lets the caller set role (admin grant): ${createAllow.replace(/\s+/g, ' ').trim()}`
  );
}

console.log('users create cannot self-assign role');
