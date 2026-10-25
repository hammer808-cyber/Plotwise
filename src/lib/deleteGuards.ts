/**
 * Who may delete a shared plot or a bed inside it.
 *
 * Firestore allows a plot delete only for the plot owner, and a bed delete
 * only for the bed owner or the plot owner. The plot page used to unassign
 * plants (and, for a plot delete, remove the caller's own beds) before that
 * delete, so a collaborator who confirmed the dialog destroyed the layout
 * and then the delete itself was rejected.
 */

export function canDeletePlot(opts: {
  userId: string | undefined;
  plotOwnerUid: string | undefined;
}): boolean {
  return !!opts.userId && !!opts.plotOwnerUid && opts.userId === opts.plotOwnerUid;
}

export function canDeleteBed(opts: {
  userId: string | undefined;
  bedOwnerUid: string | undefined;
  plotOwnerUid: string | undefined;
}): boolean {
  if (!opts.userId) return false;
  if (opts.plotOwnerUid && opts.userId === opts.plotOwnerUid) return true;
  return !!opts.bedOwnerUid && opts.userId === opts.bedOwnerUid;
}
