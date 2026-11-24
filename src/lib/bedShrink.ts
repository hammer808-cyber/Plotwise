/**
 * What to do with one plant when its bed is resized.
 * Plants that still sit inside the new footprint are left alone.
 * Plants that belong to the bed but fall outside go back to the planting
 * rail. Clamping them onto the new edge stacks every dropped plant on one cell.
 */
export interface ShrinkPlant {
  id?: string;
  planterId?: string | null;
  plotId?: string | null;
  status?: string | null;
  gridPosition?: { x: number; y: number } | null;
}

export interface ShrinkBed {
  id: string;
  gridPosition: { x: number; y: number };
}

export type ShrinkPlantWrite =
  | { id: string; action: 'keep' }
  | {
      id: string;
      action: 'release';
      plotId: null;
      planterId: null;
      gridPosition: { x: 0; y: 0 };
      status?: 'Pending';
    };

export function placementAfterShrink(
  plant: ShrinkPlant,
  bed: ShrinkBed,
  newW: number,
  newH: number
): ShrinkPlantWrite {
  const id = plant.id || '';
  if (plant.planterId !== bed.id) return { id, action: 'keep' };
  const bx = bed.gridPosition.x;
  const by = bed.gridPosition.y;
  const gx = plant.gridPosition?.x;
  const gy = plant.gridPosition?.y;
  const inside =
    gx != null &&
    gy != null &&
    gx >= bx &&
    gy >= by &&
    gx < bx + newW &&
    gy < by + newH;
  if (inside) return { id, action: 'keep' };
  const release: ShrinkPlantWrite = {
    id,
    action: 'release',
    plotId: null,
    planterId: null,
    gridPosition: { x: 0, y: 0 },
  };
  // Legacy status the inhabitant rules reject. Leaving it on the doc makes
  // this update fail and the plant stays outside the resized bed.
  if (plant.status === 'Planted') release.status = 'Pending';
  return release;
}
