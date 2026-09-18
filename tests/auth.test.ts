import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyPair, PublicKey, PrivateKey, Signature } from '@nimiq/core';
import { signedMessageBytes, verifyWalletSignature, canonicalChallenge } from '../server/auth/signatures';

const keys = KeyPair.generate();
const wallet = keys.publicKey.toAddress().toUserFriendlyAddress();
function sign(message: string) {
  return { publicKey: keys.publicKey.toHex(), signature: Signature.create(keys.privateKey, keys.publicKey, signedMessageBytes(message)).toHex() };
}
test('real Core signature authenticates exact UTF-8 challenge and wallet', () => {
  const message = 'ShowUp café ✓';
  assert.equal(verifyWalletSignature(wallet, message, sign(message)), true);
});
test('mutated payload, wallet, malformed key and signature fail closed', () => {
  const sig = sign('ShowUp');
  assert.equal(verifyWalletSignature(wallet, 'ShowUp!', sig), false);
  assert.equal(verifyWalletSignature(KeyPair.generate().publicKey.toAddress().toUserFriendlyAddress(), 'ShowUp', sig), false);
  assert.equal(verifyWalletSignature(wallet, 'ShowUp', { ...sig, signature: 'bad' }), false);
});
test('canonical challenge binds all scope fields without ambiguous separators', () => {
  const scope = { domain: 'http://localhost:3000', action: 'login', wallet, eventId: null, reservationId: null, nonce: 'a'.repeat(64), issuedAt: 100, expiresAt: 200, payloadDigest: 'b'.repeat(64), network: 5 };
  const message = canonicalChallenge(scope);
  assert.ok(message.startsWith('ShowUp authorization v1\n'));
  for (const [key, value] of Object.entries(scope)) {
    assert.notEqual(canonicalChallenge({ ...scope, [key]: typeof value === 'number' ? value + 1 : 'changed' }), message);
  }
});
