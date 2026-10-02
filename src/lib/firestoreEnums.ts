/**
 * Values Firestore security rules actually accept.
 * The editors used to offer nearby labels (`Inactive`, `Thriving`, `Harvested`,
 * `Bi-weekly`) that fail `isValidSpatialPlot`, `isValidInhabitant`, or
 * `isValidTask`, so the whole save was rejected.
 */

export const PLOT_STATUSES = ['Active', 'Planned', 'Retired', 'Quarantine'] as const;
export const PLOT_HEALTH = ['Excellent', 'Stable', 'Stressed', 'Critical'] as const;
export const INHABITANT_STATUSES = [
  'Healthy',
  'Struggling',
  'Excellent',
  'Dormant',
  'Flowering',
  'Vegetative',
  'Pending',
  'Thirsty',
] as const;
export const TASK_FREQUENCIES = ['Daily', 'Weekly'] as const;

export type PlotStatusValue = (typeof PLOT_STATUSES)[number];
export type PlotHealthValue = (typeof PLOT_HEALTH)[number];
export type InhabitantStatusValue = (typeof INHABITANT_STATUSES)[number];
export type TaskFrequencyValue = (typeof TASK_FREQUENCIES)[number];

function isOneOf<T extends string>(value: string | undefined, allowed: readonly T[]): value is T {
  return !!value && (allowed as readonly string[]).includes(value);
}

/** `Inactive` was the editor's stand-in for a plot that is no longer active. */
export function coercePlotStatus(status: string | undefined): PlotStatusValue {
  if (status === 'Inactive') return 'Retired';
  return isOneOf(status, PLOT_STATUSES) ? status : 'Active';
}

/** `Thriving` was offered next to Excellent; plant-health `Dormant` is not a plot health. */
export function coercePlotHealth(health: string | undefined): PlotHealthValue {
  if (health === 'Thriving') return 'Excellent';
  return isOneOf(health, PLOT_HEALTH) ? health : 'Stable';
}

/**
 * `Harvested` and legacy `Planted` are not inhabitant statuses. Healthy keeps
 * the plant editable; placement still comes from planterId, not this label.
 */
export function coerceInhabitantStatus(status: string | undefined): InhabitantStatusValue {
  return isOneOf(status, INHABITANT_STATUSES) ? status : 'Healthy';
}

/** Task rules only allow Daily and Weekly. Anything else must not be written. */
export function coerceTaskFrequency(frequency: string | undefined): TaskFrequencyValue {
  return isOneOf(frequency, TASK_FREQUENCIES) ? frequency : 'Daily';
}
