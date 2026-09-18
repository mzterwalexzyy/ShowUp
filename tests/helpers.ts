import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KeyPair, Signature, SignatureProof, Address, Transaction } from '@nimiq/core';
import { signedMessageBytes } from '../server/auth/signatures';
import { Store } from '../server/db/index';
import { ShowUp } from '../server/domain/service';

export function identity() {
  const key = KeyPair.generate();
  const wallet = key.publicKey.toAddress().toUserFriendlyAddress();
  return { wallet, sign: (message: string) => ({ publicKey: key.publicKey.toHex(), signature: Signature.create(key.privateKey, key.publicKey, signedMessageBytes(message)).toHex() }), payment(recipient: string, value: number, memo: string, height = 1) {
    const tx = new Transaction(Address.fromAny(wallet), 0, new Uint8Array(), Address.fromAny(recipient), 0, Buffer.from(memo), BigInt(value), 0n, 0, height, 5);
    tx.proof = SignatureProof.singleSig(key.publicKey, Signature.create(key.privateKey, key.publicKey, tx.serializeContent())).serialize();
    const plain = { hash: tx.hash(), from: wallet, fromType: 0, senderData: '', to: recipient, toType: 0, recipientData: Buffer.from(memo).toString('hex'), value, fee: 0, flags: 0, validityStartHeight: height, networkId: 5, proof: Buffer.from(tx.proof).toString('hex'), executionResult: true, blockNumber: 1 };
    return { hash: tx.hash(), rpc: { transaction: async () => plain, head: async () => ({ number: 2, network: 'TestAlbatross' }), block: async (n: number) => n === 1 ? { number: 1, hash: 'a'.repeat(64), network: 'TestAlbatross', type: 'micro', transactions: [plain] } : { number: 2, hash: 'b'.repeat(64), parentHash: 'a'.repeat(64), network: 'TestAlbatross', type: 'macro', justification: { sig: 'synthetic' } } } };
  } };
}
export async function paidFixture(t: { after: (fn: () => Promise<void>) => void }) {
  const f = await fixture(t);
  const event = await f.app.createEvent(f.operator.wallet, f.terms);
  await f.app.openEvent(f.operator.wallet, event.id);
  const reservation = await f.app.reserve(f.alice.wallet, event.id);
  const payment = f.alice.payment(reservation.intent.recipient, Number(reservation.intent.value), reservation.intent.data);
  await f.app.confirmPayment(f.alice.wallet, reservation.id, payment.hash, payment.rpc);
  return { ...f, event, reservation, payment };
}
export async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(join(tmpdir(), 'showup-test-'));
  const store = await Store.open(join(dir, 'pilot.db'));
  t.after(async () => {
    store.close();
    // libSQL native prepared statements release Windows handles during GC.
    global.gc?.();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const operator = identity(), alice = identity(), bob = identity();
  let now = 1_000_000;
  const app = new ShowUp(store, { domain: 'http://localhost:3000', operator: operator.wallet, organizer: operator.wallet, treasury: identity().wallet, now: () => now });
  const terms = { title: 'Pilot', deposit: 100000, capacity: 1, startsAt: now + 600000, endsAt: now + 1200000, cancellationCutoff: now + 300000, decisionDeadline: now + 1800000 };
  return { app, store, operator, alice, bob, terms, time: (n: number) => { now = n; } };
}
