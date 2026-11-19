export interface GridCell {
  x: number;
  y: number;
}

export interface BedFootprint {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where a plant lands after its bed is translated by (dx, dy).
 * Coordinates are plot-global and stay plot-global.
 */
export function plantCellAfterBedMove(
  plant: GridCell,
  dx: number,
  dy: number,
  plotCols: number,
  plotRows: number
): GridCell {
  return {
    x: Math.max(0, Math.min(plotCols - 1, plant.x + dx)),
    y: Math.max(0, Math.min(plotRows - 1, plant.y + dy)),
  };
}

/**
 * Persisted "repair" for coordinates that look bed-local.
 *
 * Returns null on purpose. A bed move saves the bed before each plant, so a
 * listener can see the new footprint while the plant still holds its previous
 * plot-global cell. Those stale cells often still fit inside the bed's width
 * and height. Adding the new origin on top of them stores the wrong cell,
 * and a one-shot guard would never correct it.
 *
 * True bed-local leftovers are displayed in place; they are not rewritten.
 */
export function persistedBedLocalRepair(
  _plant: GridCell,
  _bed: BedFootprint
): GridCell | null {
  return null;
}
