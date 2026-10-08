/**
 * Invite-code alphabet and join helpers shared with firestore.rules.
 * Rules reject any code outside this alphabet, and a join is only valid
 * when the plot write carries a fresh nonce that was just claimed on the
 * invite document (see isSelfJoin).
 */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;
export const JOIN_NONCE_LENGTH = 20;

/** Same character class as the isSelfJoin code check in firestore.rules. */
export const INVITE_CODE_RULES_PATTERN = '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$';

export function randomInviteToken(length: number): string {
  let code = '';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) code += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  return code;
}

export function makeInviteCode(): string {
  return randomInviteToken(INVITE_CODE_LENGTH);
}

export function makeJoinNonce(): string {
  return randomInviteToken(JOIN_NONCE_LENGTH);
}

/** Rules require the display name to be a non-empty string under 100 chars. */
export function joinDisplayName(displayName: string | null | undefined): string {
  const name = (displayName || '').trim();
  return (name || 'Gardener').slice(0, 99);
}

export function isInviteCode(code: string): boolean {
  if (code.length !== INVITE_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!INVITE_ALPHABET.includes(ch)) return false;
  }
  return true;
}
