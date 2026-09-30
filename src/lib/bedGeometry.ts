/**
 * Plot-grid geometry for beds. Coordinates are integer cells, y grows downward.
 * Kept pure so placement and rotation can be tested without Firestore.
 */

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlantCell {
  id: string;
  x: number;
  y: number;
}

export function rectsOverlap(a: CellRect, b: CellRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * First free top-left cell where a bed of `size` fits without covering
 * another bed. Null when the plot has no such spot — callers must not
 * fall back to (0, 0), which stacks the new bed on whatever is already there.
 */
export function findFreeBedSpot(
  size: { w: number; h: number },
  plotCols: number,
  plotRows: number,
  existing: CellRect[]
): { x: number; y: number } | null {
  const w = size.w;
  const h = size.h;
  if (w < 1 || h < 1 || w > plotCols || h > plotRows) return null;
  for (let y = 0; y <= plotRows - h; y++) {
    for (let x = 0; x <= plotCols - w; x++) {
      const candidate: CellRect = { x, y, w, h };
      if (!existing.some((b) => rectsOverlap(candidate, b))) return { x, y };
    }
  }
  return null;
}

export type RotateResult =
  | {
      ok: true;
      origin: { x: number; y: number };
      size: { w: number; h: number };
      plants: PlantCell[];
    }
  | { ok: false; reason: 'out-of-bounds' | 'overlap' };

/**
 * 90° clockwise (y-down). Each in-bed cell maps to exactly one cell of the
 * swapped footprint, so plants that started on different cells stay apart.
 * The origin is kept when the rotated bed still fits, otherwise shifted just
 * enough to stay inside the plot. Refuses rather than writing a bed that
 * would cover a neighbor or hang off the plot.
 */
export function rotateBedClockwise(opts: {
  bed: CellRect;
  plants: PlantCell[];
  cols: number;
  rows: number;
  otherBeds: CellRect[];
}): RotateResult {
  const { bed, plants, cols, rows, otherBeds } = opts;
  const newW = bed.h;
  const newH = bed.w;
  if (newW < 1 || newH < 1 || newW > cols || newH > rows) {
    return { ok: false, reason: 'out-of-bounds' };
  }
  const newX = Math.max(0, Math.min(cols - newW, bed.x));
  const newY = Math.max(0, Math.min(rows - newH, bed.y));
  const next: CellRect = { x: newX, y: newY, w: newW, h: newH };
  if (otherBeds.some((b) => rectsOverlap(next, b))) {
    return { ok: false, reason: 'overlap' };
  }

  const rotated = plants.map((p) => {
    const rx = Math.max(0, Math.min(bed.w - 1, p.x - bed.x));
    const ry = Math.max(0, Math.min(bed.h - 1, p.y - bed.y));
    // Clockwise, y-down: (rx, ry) -> (h - 1 - ry, rx)
    const newRx = bed.h - 1 - ry;
    const newRy = rx;
    return { id: p.id, x: newX + newRx, y: newY + newRy };
  });

  return { ok: true, origin: { x: newX, y: newY }, size: { w: newW, h: newH }, plants: rotated };
}
