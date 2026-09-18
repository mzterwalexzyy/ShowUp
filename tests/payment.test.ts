import test from 'node:test';
import assert from 'node:assert/strict';
import { Address, KeyPair, Transaction, Signature, SignatureProof } from '@nimiq/core';
import { verifyFunding } from '../server/nimiq/verify';

function evidence() {
  const key = KeyPair.generate();
  const wallet = key.publicKey.toAddress().toUserFriendlyAddress();
  const recipient = KeyPair.generate().publicKey.toAddress().toUserFriendlyAddress();
  const memo = 'showup:v1:synthetic-reservation';
  const tx = new Transaction(Address.fromAny(wallet), 0, new Uint8Array(), Address.fromAny(recipient), 0, new TextEncoder().encode(memo), 100000n, 0n, 0, 1, 5);
  tx.proof = SignatureProof.singleSig(key.publicKey, Signature.create(key.privateKey, key.publicKey, tx.serializeContent())).serialize();
  const plain = { hash: tx.hash(), from: wallet, fromType: 0, senderData: '', to: recipient, toType: 0, recipientData: Buffer.from(memo).toString('hex'), value: 100000, fee: 0, flags: 0, validityStartHeight: 1, networkId: 5, proof: Buffer.from(tx.proof).toString('hex'), executionResult: true, blockNumber: 1 };
  const expected = { hash: plain.hash, wallet, recipient, value: 100000, memo };
  return { plain, expected, rpc: { transaction: async () => plain, head: async () => ({ number: 2, network: 'TestAlbatross' }), block: async (height: number) => height === 1 ? { number: 1, hash: 'a'.repeat(64), network: 'TestAlbatross', type: 'micro', transactions: [plain] } : { number: 2, hash: 'b'.repeat(64), parentHash: 'a'.repeat(64), network: 'TestAlbatross', type: 'macro', justification: { sig: 'synthetic' } } } };
}
test('synthetic RPC with a real signed transaction verifies all predicates', async () => {
  const f = evidence();
  const result = await verifyFunding(f.rpc, f.expected);
  assert.equal(result.wallet, f.expected.wallet);
  assert.equal(result.value, 100000);
  assert.equal(result.hash, f.expected.hash);
});
for (const [name, field, value] of [
  ['fake hash', 'hash', '0'.repeat(64)], ['wrong network', 'networkId', 24], ['failed execution', 'executionResult', false], ['missing execution', 'executionResult', undefined], ['pending', 'blockNumber', 0], ['tampered signature', 'proof', '00'], ['wrong amount', 'value', 99999], ['wrong memo', 'recipientData', '00'],
] as const) {
  test('rejects ' + name, async () => {
    const f = evidence();
    (f.plain as any)[field] = value;
    await assert.rejects(verifyFunding(f.rpc, f.expected));
  });
}
test('wrong beneficiary or treasury cannot claim signed deposit', async () => {
  const f = evidence();
  const other = KeyPair.generate().publicKey.toAddress().toUserFriendlyAddress();
  await assert.rejects(verifyFunding(f.rpc, { ...f.expected, wallet: other }));
  await assert.rejects(verifyFunding(f.rpc, { ...f.expected, recipient: other }));
});
test('missing macro, broken ancestry and missing inclusion never become final', async () => {
  const f = evidence();
  await assert.rejects(verifyFunding({ ...f.rpc, head: async () => ({ number: 1, network: 'TestAlbatross' }) }, f.expected));
  const block = f.rpc.block;
  await assert.rejects(verifyFunding({ ...f.rpc, block: async n => ({ ...await block(n), parentHash: 'wrong' }) }, f.expected));
  await assert.rejects(verifyFunding({ ...f.rpc, block: async n => ({ ...await block(n), transactions: [] }) }, f.expected));
});
