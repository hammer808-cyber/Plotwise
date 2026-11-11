/**
 * Who may create a document in inhabitants/{plantId}/photos.
 * Mirrors the photos create rule: the caller files the photo as themselves,
 * and either owns the plant or is a member of the plot it currently sits in.
 * A plant with no plot is not writable by every signed-in account.
 */
export function canCreatePlantPhoto(input: {
  signedIn: boolean;
  authUid: string;
  photoOwnerUid: string;
  plantOwnerUid: string;
  plotId: string | null;
  isPlotMember: boolean;
}): boolean {
  if (!input.signedIn) return false;
  if (input.photoOwnerUid !== input.authUid) return false;
  if (input.plantOwnerUid === input.authUid) return true;
  return input.plotId !== null && input.plotId.length > 0 && input.isPlotMember;
}
