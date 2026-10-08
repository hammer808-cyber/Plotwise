import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INVITE_ALPHABET,
  INVITE_CODE_RULES_PATTERN,
  isInviteCode,
  joinDisplayName,
  makeInviteCode,
  makeJoinNonce,
} from './inviteCode';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');

const codePattern = new RegExp(INVITE_CODE_RULES_PATTERN);
for (let i = 0; i < 30; i++) {
  const code = makeInviteCode();
  assert.match(code, codePattern);
  assert.equal(isInviteCode(code), true);
}
assert.equal(isInviteCode(''), false);
assert.equal(isInviteCode('abc'), false);
assert.equal(isInviteCode('IIIIIIII'), false);

const nonce = makeJoinNonce();
assert.equal(nonce.length, 20);
for (const ch of nonce) assert.equal(INVITE_ALPHABET.includes(ch), true);

assert.equal(joinDisplayName(null), 'Gardener');
assert.equal(joinDisplayName('   '), 'Gardener');
assert.equal(joinDisplayName('Ada'), 'Ada');
assert.equal(joinDisplayName('A'.repeat(200)).length, 99);

const inviteBlock = rules.slice(rules.indexOf('match /plot_invites/'), rules.indexOf('match /event_logs/'));
assert.equal(inviteBlock.includes('allow read:'), false);
assert.match(inviteBlock, /allow get: if isAuthenticated\(\)/);
assert.match(inviteBlock, /affectedKeys\(\)\.hasOnly\(\['claimedBy', 'claimNonce'\]\)/);
assert.match(inviteBlock, /claimNonce != resource\.data\.get\('claimNonce', ''\)/);

assert.match(rules, /function isSelfJoin\(plotId\)/);
assert.match(rules, /nonce != resource\.data\.get\('joinNonce', ''\)/);
assert.match(rules, /get\(invitePath\)\.data\.get\('claimedBy', ''\) == request\.auth\.uid/);
assert.match(rules, /isSelfJoin\(id\)/);

const planter = rules.slice(rules.indexOf('function isValidPlanter'), rules.indexOf('function isValidFertilizingEvent'));
assert.equal(planter.includes('data.ownerUid == request.auth.uid'), false);
assert.match(planter, /data\.ownerUid is string/);

console.log('invite rules checks ok');
