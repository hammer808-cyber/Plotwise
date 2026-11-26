import assert from 'node:assert/strict';
import { taskCalendarRecord, taskHistoryRecord } from './taskCompletion.ts';

const CALENDAR_TYPES = [
  'Manual', 'Watering', 'Fertilizing', 'Pruning', 'Harvesting', 'Pest Control',
  'Soil Amendment', 'Propagation', 'Task', 'Treatment', 'Weeding',
];

const now = new Date(2026, 10, 26, 15, 4, 0);
const completionDate = { __sentinel: 'serverTimestamp' };

const history = taskHistoryRecord({
  ownerUid: 'gardener',
  taskId: 'task-1',
  task: 'Prune the hydrangeas',
  plotId: null,
  plantId: null,
  plantName: null,
  category: undefined,
  completionDate,
}, now);

assert.equal(history.ownerUid, 'gardener');
assert.equal(history.task, 'Prune the hydrangeas');
assert.ok(history.task.length > 0 && history.task.length < 500);
assert.equal(history.completionDate, completionDate);
assert.equal(history.category, 'Maintenance');
assert.equal(typeof history.timestamp, 'string');
assert.ok(history.timestamp.length > 0);

const longTask = 'A'.repeat(480);
const longHistory = taskHistoryRecord({
  ownerUid: 'gardener',
  taskId: 'task-2',
  task: longTask,
  category: 'Daily',
  completionDate,
}, now);
assert.ok(longHistory.task.length < 500);
assert.equal(longHistory.category, 'Daily');

const calendar = taskCalendarRecord({
  ownerUid: 'gardener',
  task: longTask,
  description: `Task completed for plant: ${'Basil '.repeat(400)}`,
  createdAt: completionDate,
  context: 'Herb plot',
}, now);

assert.match(String(calendar.date), /^\d{4}-\d{2}-\d{2}$/);
assert.equal(calendar.date, '2026-11-26');
assert.ok(CALENDAR_TYPES.includes(String(calendar.type)));
assert.equal(calendar.type, 'Task');
assert.equal(typeof calendar.title, 'string');
assert.ok((calendar.title as string).length > 0 && (calendar.title as string).length < 200);
assert.ok((calendar.description as string).length < 2000);
assert.equal(calendar.priority, 'Medium');
assert.equal(calendar.createdAt, completionDate);

console.log('taskCompletion tests passed');
