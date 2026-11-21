import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildHealthCheckLog, buildWateringCheckLog, type CareLogCall } from './quickCheckLogs';

/**
 * Same field selection as eventService.logEvent. Kept here so the test
 * fails if a health-check payload would be rejected after that mapping.
 */
function projectLogEvent(call: {
  ownerUid: string;
  eventType: string;
  targetId?: string;
  targetType?: string;
  calendarTitle: string;
  calendarDescription: string;
  data: Record<string, any>;
}): { technicalRecord: Record<string, any>; calendar: Record<string, any>; globalEvent: Record<string, any> } {
  const data = call.data;
  const technicalRecord = {
    ...data,
    ownerUid: call.ownerUid,
    targetId: call.targetId || data.plantId || data.plotId || null,
    targetType: call.targetType || (data.plantId ? 'Inhabitant' : data.plotId ? 'SpatialPlot' : null),
    createdAt: 'timestamp',
    updatedAt: 'timestamp',
  };
  const calendar = {
    ownerUid: call.ownerUid,
    title: call.calendarTitle,
    description: call.calendarDescription,
    date: '2026-11-21',
    type: call.eventType,
    priority: 'Medium',
    plotId: data.plotId || (call.targetType === 'SpatialPlot' ? call.targetId : null),
    createdAt: 'timestamp',
  };
  const globalEvent = {
    ...technicalRecord,
    eventType: call.eventType,
    xpEarned: data.xpEarned || 0,
  };
  return { technicalRecord, calendar, globalEvent };
}

function quotedList(rules: string, fnName: string): string[] {
  const fn = rules.match(new RegExp(`function ${fnName}\\(data\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(fn, `missing ${fnName}`);
  const list = fn[0].match(/data\.type in \[([\s\S]*?)\]/);
  assert.ok(list, `${fnName} has no type list`);
  return [...list[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

function problems(call: CareLogCall, eventLogTypes: string[], calendarTypes: string[]): string[] {
  const { technicalRecord, calendar, globalEvent } = projectLogEvent(call);
  const found: string[] = [];
  if (typeof technicalRecord.ownerUid !== 'string' || !technicalRecord.ownerUid) found.push('event owner');
  if (typeof technicalRecord.targetId !== 'string' || !technicalRecord.targetId) found.push('event targetId');
  if (!eventLogTypes.includes(technicalRecord.type)) found.push(`event type ${technicalRecord.type}`);
  if (typeof technicalRecord.date !== 'string') found.push('event date');
  if (technicalRecord.createdAt !== 'timestamp') found.push('event createdAt');
  if (!['Inhabitant', 'SpatialPlot'].includes(technicalRecord.targetType)) found.push('event targetType');
  if (typeof calendar.title !== 'string' || calendar.title.length === 0 || calendar.title.length >= 200) found.push('calendar title');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calendar.date)) found.push('calendar date');
  if (!calendarTypes.includes(calendar.type)) found.push(`calendar type ${calendar.type}`);
  if (calendar.priority !== 'Medium') found.push('calendar priority');
  if (typeof calendar.description !== 'string' || calendar.description.length >= 2000) found.push('calendar description');
  if (typeof globalEvent.timestamp !== 'string' || !globalEvent.timestamp) found.push('global timestamp');
  if (typeof globalEvent.eventType !== 'string') found.push('global eventType');
  return found;
}

const rules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const eventLogTypes = quotedList(rules, 'isValidEventLog');
const calendarTypes = quotedList(rules, 'isValidCalendarEvent');

const answers = { watered: 'no', leaves: 'healthy', pests: 'none', overall: 'okay' } as const;
const planted = {
  ownerUid: 'gardener',
  plantId: 'plant-1',
  plantName: 'Tomato',
  plotId: 'plot-9',
  now: new Date('2026-11-21T15:00:00.000Z'),
};

const check = buildHealthCheckLog({
  ...planted,
  notes: 'Quick check 11/21: leaves healthy, no pests, okay.',
  answers,
  snapshot: 80,
  vigorBefore: 70,
  vigorAfter: 73,
});
const watering = buildWateringCheckLog(planted);

const checkProblems = problems(check, eventLogTypes, calendarTypes);
const waterProblems = problems(watering, eventLogTypes, calendarTypes);
assert.deepEqual(checkProblems, [], `health check payload rejected: ${checkProblems.join(', ')}`);
assert.deepEqual(waterProblems, [], `watering payload rejected: ${waterProblems.join(', ')}`);

const projected = projectLogEvent(check);
assert.equal(projected.technicalRecord.targetId, 'plant-1');
assert.notEqual(projected.technicalRecord.targetId, 'plot-9');
assert.equal(projected.technicalRecord.targetType, 'Inhabitant');
assert.equal(typeof projected.globalEvent.timestamp, 'string');

// The previous call put the plant id only inside data and omitted timestamp.
// logEvent then stored the plot id and global_events had no timestamp string.
const broken = projectLogEvent({
  ownerUid: 'gardener',
  eventType: 'Health Check',
  calendarTitle: 'Health check: Tomato',
  calendarDescription: 'Quick check',
  data: {
    targetId: 'plant-1',
    targetType: 'Inhabitant',
    type: 'Health Check',
    plotId: 'plot-9',
    notes: 'Quick check',
    date: '2026-11-21T15:00:00.000Z',
  },
});
assert.equal(broken.technicalRecord.targetId, 'plot-9');
assert.equal(broken.globalEvent.timestamp, undefined);

console.log('quickCheckLogs.test.ts passed');
