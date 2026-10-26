/**
 * Fields written when a bed is deleted and its plants go back to the rail.
 *
 * The rail query is `plotId == null`. Removing the field (or leaving the old
 * plot id) makes that query miss the plant, and a (0, 0) coordinate with the
 * plot still set draws the plant inside whichever bed covers the origin.
 */
export function releasePlantUpdate(status?: string) {
  return {
    plotId: null,
    planterId: null,
    gridPosition: { x: 0, y: 0 },
    // 'Planted' is not in the inhabitant rules enum. Leaving it in place
    // rejects the update and the plant stays in the deleted bed.
    ...(status === 'Planted' ? { status: 'Pending' as const } : {}),
  };
}
