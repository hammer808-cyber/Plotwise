/**
 * Plants leave a deleted plot by clearing their plot link.
 *
 * Firestore `where('plotId', '==', null)` only matches an explicit null.
 * `deleteField()` removes the field, so those plants match neither the old
 * plot nor the unassigned rail and cannot be planted again. Persist null,
 * and treat a missing field the same as null when reading.
 */
export function isUnassignedPlant(plant: { plotId?: string | null }): boolean {
  return plant.plotId == null;
}

export function unassignPlantUpdate(status?: string | null): {
  plotId: null;
  planterId: null;
  gridPosition: { x: number; y: number };
  status?: 'Pending';
} {
  const patch: {
    plotId: null;
    planterId: null;
    gridPosition: { x: number; y: number };
    status?: 'Pending';
  } = {
    plotId: null,
    planterId: null,
    gridPosition: { x: 0, y: 0 },
  };
  // 'Planted' is not in the inhabitant rules enum. Leaving it in place
  // rejects this update and aborts the plot delete.
  if (status === 'Planted') patch.status = 'Pending';
  return patch;
}
