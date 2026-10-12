import type { Inhabitant } from '../types';

/**
 * "Add plants" opens the plot grid, which is the only place a plant can be
 * dropped onto a bed. A standalone bed has no plot id; building
 * `/plots/${plotId}` from that navigates to `/plots/undefined`, and the plot
 * page treats the missing document as "not found" and sends the gardener home.
 * Returns null so the caller can offer "add this bed to a plot" instead.
 */
export function bedAddPlantsPath(plotId: string | undefined | null): string | null {
  if (!plotId) return null;
  return `/plots/${plotId}`;
}

/**
 * Rows for the bed page.
 * Plot beds are loaded with `plotId == plot`, which the rules allow for members.
 * Standalone beds cannot use `planterId == bed` alone: inhabitant reads are
 * owner-or-plot-member, so that query is denied and the bed looks empty.
 * The allowed substitute is the owner's full list. Keep only plants actually
 * assigned to this bed — unplaced rail plants sit at (0, 0), the same cell a
 * new bed uses, and the geometry fallback would plant them into the corner.
 */
export function rowsForBedPage<T extends Pick<Inhabitant, 'planterId'>>(
  rows: T[],
  bedId: string,
  plotScoped: boolean
): T[] {
  if (plotScoped) return rows;
  return rows.filter((p) => p.planterId === bedId);
}
