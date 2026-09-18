import { Address, KeyPair, PrivateKey, TransactionBuilder } from '@nimiq/core';
import type { PreparedRefund } from '../worker/refunds';

export class TestnetSigner {
  readonly keys: KeyPair;
  readonly address: string;
  constructor(privateHex: string) {
    if (!/^[a-f0-9]{64}$/i.test(privateHex)) throw new Error('INVALID_SIGNER_KEY');
    this.keys = KeyPair.derive(PrivateKey.fromHex(privateHex));
    this.address = this.keys.toAddress().toUserFriendlyAddress();
  }
  prepare(policy: { beneficiary: string; value: number; fee: number; network: 5; validityStartHeight: number }): PreparedRefund {
    if (policy.network !== 5 || !Number.isSafeInteger(policy.value) || policy.value <= 0 || policy.value > 1_000_000 || policy.fee !== 0 || !Number.isSafeInteger(policy.validityStartHeight) || policy.validityStartHeight < 0) throw new Error('SIGNER_POLICY_REJECTED');
    const beneficiary = Address.fromAny(policy.beneficiary).toUserFriendlyAddress();
    const tx = TransactionBuilder.newBasic(this.keys.toAddress(), Address.fromAny(beneficiary), BigInt(policy.value), BigInt(policy.fee), policy.validityStartHeight, 5);
    this.keys.signTransaction(tx);
    tx.verify(5);
    return { ...policy, beneficiary, bytes: Buffer.from(tx.serialize()).toString('hex'), hash: tx.hash() };
  }
}
