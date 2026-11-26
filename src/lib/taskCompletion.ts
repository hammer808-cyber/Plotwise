/**
 * Payloads for marking a task complete.
 *
 * task_history requires completionDate (timestamp). calendar_events requires
 * a YYYY-MM-DD date and type "Task", and rejects titles of 200+ characters.
 * The old writers omitted those fields, so Firestore rejected the completion
 * and the task stayed open.
 */

const CALENDAR_TITLE_MAX = 199;
const TASK_TEXT_MAX = 499;
const CALENDAR_DESCRIPTION_MAX = 1999;

export function calendarDay(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/** Calendar rule: title.size() < 200. */
export function completedTaskTitle(task: string, context?: string): string {
  const suffix = context ? ` (${context})` : '';
  return clip(`Completed: ${task}${suffix}`, CALENDAR_TITLE_MAX);
}

export interface TaskHistoryInput {
  ownerUid: string;
  taskId: string;
  task: string;
  plotId?: string | null;
  plantId?: string | null;
  plantName?: string | null;
  category?: string | null;
  /** Firestore Timestamp or serverTimestamp() sentinel. */
  completionDate: unknown;
}

/**
 * task_history document. `timestamp` is included so a logEvent copy into
 * global_events still satisfies isValidGlobalEvent (timestamp is string).
 */
export function taskHistoryRecord(input: TaskHistoryInput, now = new Date()) {
  const category = input.category?.trim();
  return {
    ownerUid: input.ownerUid,
    taskId: input.taskId,
    task: clip(input.task, TASK_TEXT_MAX),
    plotId: input.plotId ?? null,
    plantId: input.plantId ?? null,
    plantName: input.plantName ?? null,
    category: category ? category : 'Maintenance',
    status: 'Completed',
    completionDate: input.completionDate,
    timestamp: now.toISOString(),
  };
}

export interface TaskCalendarInput {
  ownerUid: string;
  task: string;
  description: string;
  createdAt: unknown;
  plotId?: string | null;
  context?: string;
}

/** calendar_events document that passes isValidCalendarEvent. */
export function taskCalendarRecord(input: TaskCalendarInput, now = new Date()) {
  const record: Record<string, unknown> = {
    ownerUid: input.ownerUid,
    title: completedTaskTitle(input.task, input.context),
    description: clip(input.description, CALENDAR_DESCRIPTION_MAX),
    date: calendarDay(now),
    type: 'Task',
    priority: 'Medium',
    createdAt: input.createdAt,
  };
  if (input.plotId) record.plotId = input.plotId;
  return record;
}
