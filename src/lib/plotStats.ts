import type { Inhabitant } from '../types';

/**
 * Single source of truth for "is this plant actually in the ground?"
 *
 * A plant counts as planted when it sits in a bed (planterId set), when
 * its status is 'Planted' (legacy), or when it sits at a non-origin grid
 * position (covers inventory plants with other health statuses).
 * Everything else is waiting in the rail.
 */
export function isPlanted(p: Inhabitant): boolean {
  if (p.status === 'Planted') return true;
  if (p.planterId) return true;
  const x = p.gridPosition?.x ?? 0;
  const y = p.gridPosition?.y ?? 0;
  return x !== 0 || y !== 0;
}

export function countPlanted(list: Inhabitant[]): number {
  return list.filter(isPlanted).length;
}

export function countWaiting(list: Inhabitant[]): number {
  return list.filter(p => !isPlanted(p)).length;
}

export interface BedFootprint {
  id: string;
  gridPosition: { x: number; y: number };
  size: { w: number; h: number };
}

/**
 * Whether this plant is actually in the bed.
 *
 * Waiting plants are stored at grid (0, 0) with no planterId — the same cell
 * as the top-left of a bed that starts at the plot origin. A pure geometry
 * test treats every rail plant as sitting in that corner. Claiming them on
 * save stacks the whole rail into one cell and empties the planting rail.
 * Only plants assigned to this bed, or legacy placements that isPlanted()
 * already counts, occupy it.
 */
export function plantOccupiesBed(p: Inhabitant, bed: BedFootprint): boolean {
  if (p.planterId === bed.id) return true;
  if (p.planterId || !isPlanted(p) || !p.gridPosition || !bed.gridPosition || !bed.size) return false;
  const { x, y } = bed.gridPosition;
  const { w, h } = bed.size;
  return (
    p.gridPosition.x >= x &&
    p.gridPosition.x < x + w &&
    p.gridPosition.y >= y &&
    p.gridPosition.y < y + h
  );
}
