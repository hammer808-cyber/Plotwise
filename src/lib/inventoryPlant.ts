/**
 * Placement for a plant that is on the gardener's list but not in a plot or bed.
 *
 * These must be real nulls. `deleteField()` is rejected by `addDoc` (it is only
 * valid on update or set-with-merge), so the create never reaches Firestore.
 * Omitting `plotId` instead would also hide the plant: the planting rail queries
 * `plotId == null`, which does not match a missing field.
 */
export function unassignedPlantPlacement(): {
  plotId: null;
  planterId: null;
  gridPosition: { x: 0; y: 0 };
} {
  return {
    plotId: null,
    planterId: null,
    gridPosition: { x: 0, y: 0 },
  };
}
