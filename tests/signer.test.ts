import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyPair, Transaction } from '@nimiq/core';
import { TestnetSigner } from '../server/nimiq/signer';

test('narrow signer produces exact verifiable testnet transaction', () => {
  const signer = new TestnetSigner(KeyPair.generate().privateKey.toHex());
  const beneficiary = KeyPair.generate().toAddress().toUserFriendlyAddress();
  const result = signer.prepare({ beneficiary, value: 100000, fee: 0, network: 5, validityStartHeight: 42 });
  const tx = Transaction.fromAny(result.bytes);
  assert.equal(tx.hash(), result.hash);
  assert.equal(tx.recipient.toUserFriendlyAddress(), beneficiary);
  assert.equal(tx.value, 100000n);
  tx.verify(5);
});
test('narrow signer rejects wrong network, fee, amount and malformed destination', () => {
  const signer = new TestnetSigner(KeyPair.generate().privateKey.toHex());
  const beneficiary = KeyPair.generate().toAddress().toUserFriendlyAddress();
  for (const policy of [{ beneficiary, value: 100000, fee: 0, network: 24, validityStartHeight: 1 }, { beneficiary, value: 100000, fee: 100, network: 5, validityStartHeight: 1 }, { beneficiary, value: 1000001, fee: 0, network: 5, validityStartHeight: 1 }, { beneficiary: 'bad', value: 1, fee: 0, network: 5, validityStartHeight: 1 }]) assert.throws(() => signer.prepare(policy as any));
});
