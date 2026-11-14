/**
 * Whether the plot owner may write a plant or bed that already sits in
 * their plot.
 *
 * Spec for `plotOwnerKeepsOrReleases` in firestore.rules. Rules cannot
 * import this module — when the policy changes, update both.
 *
 * The owner can keep gardening in place, or clear plotId to release the
 * record (plot delete). Pointing it at a different plot would publish
 * another gardener's plant, including its photo log, into a garden that
 * person never joined. "" is not a release: the planting rail only
 * matches plotId == null.
 */

export type PlotId = string | null | undefined;

export function plotOwnerKeepsOrReleases(input: {
  /** True when the caller owns the plot currently on the document. */
  isPlotOwner: boolean;
  oldPlotId: PlotId;
  newPlotId: PlotId;
}): boolean {
  if (!input.isPlotOwner) return false;
  if (typeof input.oldPlotId !== 'string' || input.oldPlotId.length === 0) return false;
  return input.newPlotId === input.oldPlotId || input.newPlotId == null;
}
