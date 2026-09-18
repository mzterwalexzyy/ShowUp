import { createHash } from 'node:crypto';
import { Address, PublicKey, Signature, SignatureProof } from '@nimiq/core';

// Nimiq signed-message convention, adapted from Trove's verifier.
export function signedMessageBytes(message: string): Uint8Array {
  return createHash('sha256').update('\x16Nimiq Signed Message:\n' + Buffer.byteLength(message, 'utf8') + message, 'utf8').digest();
}
export function walletAddress(value: string): string {
  return Address.fromAny(value).toUserFriendlyAddress();
}
export function verifyWalletSignature(wallet: string, message: string, proof: unknown): boolean {
  try {
    const p = proof as { publicKey: string; signature: string };
    if (!/^[a-f0-9]{64}$/i.test(p.publicKey) || !/^[a-f0-9]{128}$/i.test(p.signature)) return false;
    const key = PublicKey.fromHex(p.publicKey), signature = Signature.fromHex(p.signature);
    return key.verify(signature, signedMessageBytes(message)) && SignatureProof.singleSig(key, signature).isSignedBy(Address.fromAny(wallet));
  } catch { return false; }
}
export function canonicalChallenge(scope: Record<string, unknown>): string {
  return 'ShowUp authorization v1\n' + JSON.stringify(Object.fromEntries(Object.keys(scope).sort().map(key => [key, scope[key]])));
}
