/**
 * Who may write a plant or bed they own into a plot.
 *
 * This is the spec for `ownerPlotUpdateAllowed` / `ownerMayDeletePlacedDoc`
 * in firestore.rules. Rules cannot import this module — when the policy
 * changes, update both.
 *
 * Missing, null, and "" are "not in a plot". Inventory stores "" for Unassigned.
 */

export type PlotId = string | null | undefined;

export function isAttachedPlot(plotId: PlotId): boolean {
  return typeof plotId === 'string' && plotId.length > 0;
}

export interface OwnerPlotUpdateInput {
  isDocOwner: boolean;
  oldPlotId: PlotId;
  newPlotId: PlotId;
  /** True when the caller owns or still collaborates on that plot. */
  isMember: (plotId: string) => boolean;
}

/**
 * Document owner may:
 * - edit a personal record, and attach it only to a plot they belong to
 * - edit a record in a plot while they are still a member (including moving
 *   it to another plot they belong to, or clearing plotId)
 * - after removal, only clear plotId so the record leaves the shared garden
 */
export function ownerPlotUpdateAllowed(input: OwnerPlotUpdateInput): boolean {
  if (!input.isDocOwner) return false;
  const oldAttached = isAttachedPlot(input.oldPlotId);
  const newAttached = isAttachedPlot(input.newPlotId);
  const member = (plotId: PlotId) =>
    isAttachedPlot(plotId) && input.isMember(plotId as string);

  if (!oldAttached && (!newAttached || member(input.newPlotId))) return true;
  if (oldAttached && member(input.oldPlotId) && (!newAttached || member(input.newPlotId))) return true;
  if (oldAttached && !newAttached && !member(input.oldPlotId)) return true;
  return false;
}

export interface OwnerDeleteInput {
  isDocOwner: boolean;
  plotId: PlotId;
  isMember: (plotId: string) => boolean;
  /** False when the plot document is already gone. */
  plotExists: (plotId: string) => boolean;
}

/** Own bed can be deleted when it isn't in a plot, the caller is still a member, or the plot is gone. */
export function ownerMayDeletePlacedDoc(input: OwnerDeleteInput): boolean {
  if (!input.isDocOwner) return false;
  if (!isAttachedPlot(input.plotId)) return true;
  const id = input.plotId as string;
  if (input.isMember(id)) return true;
  if (!input.plotExists(id)) return true;
  return false;
}
