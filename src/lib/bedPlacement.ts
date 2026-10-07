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
