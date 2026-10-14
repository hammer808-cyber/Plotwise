/**
 * Plants leave a deleted plot by clearing their plot link.
 *
 * The plot page used to touch only the deleter's documents, so a
 * collaborator's beds and plants stayed pointed at a plot that no longer
 * existed. It also used deleteField(), which removes plotId. The planting
 * rail queries `plotId == null` and will not return a missing field.
 *
 * Legacy status `Planted` is not in the inhabitant rules enum, so leaving
 * it in place rejects this update and aborts the delete.
 */
export function releasePlantPatch(status?: string | null): {
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
  if (status === 'Planted') patch.status = 'Pending';
  return patch;
}
