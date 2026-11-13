/**
 * First free non-overlapping rectangle scan, shared by the bed quiz,
 * plot creation, and "add existing bed" flows.
 */
export interface PlacedRect {
  gridPosition: { x: number; y: number };
  size: { w: number; h: number };
}

export function findFreeSpot(
  beds: PlacedRect[],
  w: number,
  h: number,
  cols: number,
  rows: number
): { x: number; y: number } | null {
  const overlaps = (x: number, y: number) =>
    beds.some(
      (b) =>
        x < b.gridPosition.x + b.size.w &&
        x + w > b.gridPosition.x &&
        y < b.gridPosition.y + b.size.h &&
        y + h > b.gridPosition.y
    );
  for (let y = 0; y <= rows - h; y++) {
    for (let x = 0; x <= cols - w; x++) {
      if (!overlaps(x, y)) return { x, y };
    }
  }
  return null;
}

export interface GridCell {
  x: number;
  y: number;
}

export interface BedFootprint {
  gridPosition: GridCell;
  size: { w: number; h: number };
}

/** True when a plant cell sits inside the bed's plot-global footprint. */
export function cellInBed(pos: GridCell | null | undefined, bed: BedFootprint): boolean {
  if (!pos || !bed?.gridPosition || !bed?.size) return false;
  return (
    pos.x >= bed.gridPosition.x &&
    pos.x < bed.gridPosition.x + bed.size.w &&
    pos.y >= bed.gridPosition.y &&
    pos.y < bed.gridPosition.y + bed.size.h
  );
}

/**
 * First unoccupied cell inside a bed, scanning from the bed's top-left.
 * Falls back to the bed origin when every cell is taken so the plant still
 * rides with the bed instead of being left on a stale plot coordinate.
 */
export function firstFreeBedCell(bed: BedFootprint, occupied: GridCell[]): GridCell {
  const taken = new Set(occupied.map((p) => `${p.x},${p.y}`));
  for (let y = 0; y < bed.size.h; y++) {
    for (let x = 0; x < bed.size.w; x++) {
      const cell = { x: bed.gridPosition.x + x, y: bed.gridPosition.y + y };
      if (!taken.has(`${cell.x},${cell.y}`)) return cell;
    }
  }
  return { x: bed.gridPosition.x, y: bed.gridPosition.y };
}
