import assert from 'node:assert/strict';
import {
  coerceInhabitantStatus,
  coercePlotHealth,
  coercePlotStatus,
  coerceTaskFrequency,
} from './firestoreEnums.ts';

assert.equal(coercePlotStatus('Active'), 'Active');
assert.equal(coercePlotStatus('Planned'), 'Planned');
assert.equal(coercePlotStatus('Retired'), 'Retired');
assert.equal(coercePlotStatus('Quarantine'), 'Quarantine');
assert.equal(coercePlotStatus('Inactive'), 'Retired');
assert.equal(coercePlotStatus(''), 'Active');
assert.equal(coercePlotStatus(undefined), 'Active');

assert.equal(coercePlotHealth('Excellent'), 'Excellent');
assert.equal(coercePlotHealth('Stable'), 'Stable');
assert.equal(coercePlotHealth('Stressed'), 'Stressed');
assert.equal(coercePlotHealth('Critical'), 'Critical');
assert.equal(coercePlotHealth('Thriving'), 'Excellent');
assert.equal(coercePlotHealth('Dormant'), 'Stable');

assert.equal(coerceInhabitantStatus('Healthy'), 'Healthy');
assert.equal(coerceInhabitantStatus('Dormant'), 'Dormant');
assert.equal(coerceInhabitantStatus('Thirsty'), 'Thirsty');
assert.equal(coerceInhabitantStatus('Harvested'), 'Healthy');
assert.equal(coerceInhabitantStatus('Planted'), 'Healthy');

assert.equal(coerceTaskFrequency('Daily'), 'Daily');
assert.equal(coerceTaskFrequency('Weekly'), 'Weekly');
assert.equal(coerceTaskFrequency('Bi-weekly'), 'Daily');
assert.equal(coerceTaskFrequency(undefined), 'Daily');

console.log('firestoreEnums tests passed');
