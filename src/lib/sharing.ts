import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

/**
 * Plot sharing via invite codes.
 *
 * - The plot owner generates a short code (stored in `plot_invites/{code}`).
 * - Anyone with the code joins by adding their own uid to the plot's
 *   `collaboratorUids` / `collaboratorNames` (rules only ever let a user
 *   add *themselves*, never anyone else).
 * - Collaborators can read and garden in the plot (beds, plants, photos)
 *   but can't delete beds/the plot or manage sharing — that's the owner's job.
 */

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no lookalikes

export function makeInviteCode(length = 8): string {
  let code = '';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

export interface PlotInvite {
  plotId: string;
  createdBy: string;
  createdAt: unknown;
}

/** Create (or recreate) an invite code for a plot. Owner only. */
export async function createInvite(plotId: string, uid: string): Promise<string> {
  const code = makeInviteCode();
  try {
    await setDoc(doc(db, 'plot_invites', code), {
      plotId,
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
    // Remember the active code on the plot so the owner can reshow it.
    // (Owner-only field: collaborators can't change it per the rules.)
    await updateDoc(doc(db, 'spatial_plots', plotId), { activeInviteCode: code });
    return code;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'plot_invites');
    throw error;
  }
}

/** Revoke an invite code so it can't be used again. Owner only. */
export async function revokeInvite(plotId: string, code: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'plot_invites', code));
    await updateDoc(doc(db, 'spatial_plots', plotId), { activeInviteCode: null });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `plot_invites/${code}`);
    throw error;
  }
}

/**
 * Join a shared plot with an invite code. Adds ONLY the joining user —
 * the rules reject anything else. No plot read needed first: arrayUnion
 * plus a dot-notation name write, both validated by the isSelfJoin rule.
 */
export async function joinPlotWithCode(
  rawCode: string,
  user: { uid: string; displayName: string | null }
): Promise<{ plotId: string; plotName: string }> {
  const code = rawCode.trim().toUpperCase();
  if (!code) throw new Error('Enter the invite code.');
  let inviteSnap;
  try {
    inviteSnap = await getDoc(doc(db, 'plot_invites', code));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'plot_invites');
    throw error;
  }
  if (!inviteSnap.exists()) throw new Error('That code did not match any shared plot.');
  const invite = inviteSnap.data() as PlotInvite;
  if (invite.createdBy === user.uid) throw new Error('That is your own plot — no need to join it.');

  const plotRef = doc(db, 'spatial_plots', invite.plotId);
  try {
    await updateDoc(plotRef, {
      collaboratorUids: arrayUnion(user.uid),
      [`collaboratorNames.${user.uid}`]: user.displayName || 'Gardener',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `spatial_plots/${invite.plotId}`);
    throw error;
  }
  // Now a collaborator, so this read is allowed.
  const plotSnap = await getDoc(plotRef);
  const plotName = ((plotSnap.data() as { name?: string } | undefined)?.name) || 'Shared plot';
  return { plotId: invite.plotId, plotName };
}

/** Leave a shared plot (removes only yourself). */
export async function leaveSharedPlot(plotId: string, uid: string): Promise<void> {
  const plotRef = doc(db, 'spatial_plots', plotId);
  const snap = await getDoc(plotRef);
  if (!snap.exists()) return;
  const plot = snap.data() as { collaboratorUids?: string[]; collaboratorNames?: Record<string, string> };
  const names = { ...(plot.collaboratorNames || {}) };
  delete names[uid];
  try {
    await updateDoc(plotRef, {
      collaboratorUids: (plot.collaboratorUids || []).filter((id) => id !== uid),
      collaboratorNames: names,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `spatial_plots/${plotId}`);
    throw error;
  }
}

/** Remove a collaborator. Owner only (rules enforce). */
export async function removeCollaborator(plotId: string, uid: string): Promise<void> {
  return leaveSharedPlot(plotId, uid);
}
