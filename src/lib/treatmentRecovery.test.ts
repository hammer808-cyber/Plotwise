import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recoveryCalendarDate, RESOLVED_TREATMENT_STATUS } from './treatmentRecovery';

const calendarDate = /^\d{4}-\d{2}-\d{2}$/;

const localNoon = new Date(2026, 10, 17, 12, 0, 0);
const date = recoveryCalendarDate(localNoon);
assert.equal(date, '2026-11-17');
assert.match(date, calendarDate);

// The old payload used toISOString(), which calendar rules reject.
const iso = new Date(2026, 10, 17, 12, 0, 0).toISOString();
assert.equal(calendarDate.test(iso), false);

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const start = rules.indexOf('function isValidTreatment');
const end = rules.indexOf('function isValidInhabitant');
assert.ok(start >= 0 && end > start, 'isValidTreatment block missing');
const fn = rules.slice(start, end);
assert.match(fn, /'Resolved'/);
assert.equal(RESOLVED_TREATMENT_STATUS, 'Resolved');

console.log('treatmentRecovery: ok');
