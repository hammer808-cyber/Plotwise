export interface PlotChoice {
  id: string;
  name: string;
}

/** Owned plots first, then shared plots the user does not already own. */
export function mergePlotLists(owned: PlotChoice[], shared: PlotChoice[]): PlotChoice[] {
  const seen = new Set(owned.map((p) => p.id));
  return [...owned, ...shared.filter((p) => !seen.has(p.id))];
}

/**
 * Choose the active plot id.
 *
 * Owned and shared plot listeners resolve independently. A partial list
 * (only the plots that have arrived so far) must not replace the saved id:
 * the other listener often returns first, the saved garden is missing from
 * that partial list, and the fallback writes a different plot into
 * localStorage. The next weeding or calendar entry is then filed on the
 * wrong garden.
 *
 * Pass listsReady only after both listeners have reported. A saved id that
 * is still present is kept. A missing id falls back to the first plot once
 * the full list is in. An empty full list leaves the saved id alone.
 */
export function nextActivePlotId(
  activePlotId: string | null,
  plots: { id: string }[],
  listsReady: boolean
): string | null {
  if (!listsReady) return activePlotId;
  if (plots.length === 0) return activePlotId;
  if (activePlotId && plots.some((p) => p.id === activePlotId)) return activePlotId;
  return plots[0].id;
}
