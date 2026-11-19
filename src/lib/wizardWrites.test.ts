import assert from 'node:assert/strict';
import {
  infestationBand,
  newProgressDocument,
  wizardTreatmentRecord,
  wizardWeedingRecord,
} from './wizardWrites';

assert.equal(infestationBand(1), 'Low');
assert.equal(infestationBand(3), 'Low');
assert.equal(infestationBand(4), 'Moderate');
assert.equal(infestationBand(6), 'Moderate');
assert.equal(infestationBand(7), 'High');
assert.equal(infestationBand(8), 'High');
assert.equal(infestationBand(9), 'Extreme');
assert.equal(infestationBand(10), 'Extreme');
assert.equal(infestationBand(Number.NaN), 'Moderate');

const now = new Date('2026-09-26T11:08:00.000Z');
const weeding = wizardWeedingRecord(
  {
    weedType: 'Crabgrass',
    intensity: 5,
    method: 'Hand Pull',
    areaCleared: 10,
    timeSpent: 15,
    isSeeding: false,
    weq: 1.5,
    xp: 20,
    plotId: undefined,
    plotName: undefined,
  },
  now
);

assert.equal(weeding.zone, 'Garden');
assert.equal(weeding.intensity, 'Moderate');
assert.equal(weeding.canopyCover, 5);
assert.equal(weeding.date, '2026-09-26');
assert.equal(weeding.timestamp, now.toISOString());
assert.equal('plotId' in weeding, false, 'undefined plotId must not be sent to Firestore');
assert.equal('plotName' in weeding, false, 'undefined plotName must not be sent to Firestore');
assert.equal(Object.values(weeding).includes(undefined), false);

const named = wizardWeedingRecord(
  { weedType: 'Bindweed', intensity: 9, xp: 10, plotId: 'plot-1', plotName: 'North bed' },
  now
);
assert.equal(named.zone, 'North bed');
assert.equal(named.intensity, 'Extreme');
assert.equal(named.plotId, 'plot-1');

const longZone = 'x'.repeat(80);
assert.equal(
  (wizardWeedingRecord({ plotName: longZone, weedType: 'Dock' }, now).zone as string).length <= 49,
  true
);

const treatment = wizardTreatmentRecord({
  diagnosis: 'Powdery mildew',
  treatment: 'Neem oil',
  dosage: 1,
  notes: '',
  xp: 25,
  plotId: undefined,
  plotName: undefined,
  timestamp: now.toISOString(),
});
assert.equal(treatment.diagnosis, 'Powdery mildew');
assert.equal(treatment.treatment, 'Neem oil');
assert.equal(treatment.timestamp, now.toISOString());
assert.equal('plotId' in treatment, false);
assert.equal('plotName' in treatment, false);
assert.equal(Object.values(treatment).includes(undefined), false);

const progress = newProgressDocument();
assert.deepEqual(progress, { xp: 0, level: 1, streak: 0, totalEvents: 0 });
assert.equal('lastEventDate' in progress, false, 'null lastEventDate is rejected by user_progress rules');

console.log('wizardWrites.test.ts ok');
