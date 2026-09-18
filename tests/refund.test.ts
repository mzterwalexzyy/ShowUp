import test from 'node:test';
import assert from 'node:assert/strict';
import { paidFixture, identity } from './helpers';
import { RefundWorker } from '../server/worker/refunds';
import { one } from '../server/db/index';

async function refundable(t: Parameters<typeof paidFixture>[0]) {
  const f = await paidFixture(t);
  await f.app.cancelEvent(f.operator.wallet, f.event.id);
  let prepares = 0, sends = 0;
  const signer = identity();
  // Worker byte-policy validation is tested with the actual signer separately.
  const boundary = {
    cash: async () => ({ balance: 200000, height: 100, network: 5 }),
    prepare: async (policy: any) => { prepares++; return { bytes: 'signed-synthetic', hash: 'c'.repeat(64), ...policy }; },
    broadcast: async (_bytes: string) => { sends++; return 'c'.repeat(64); },
    final: async (_hash: string, _policy: any) => false,
  };
  return { ...f, boundary, counts: () => ({ prepares, sends }) };
}
test('two invocations prepare and send one refund only, with durable bytes before send', async t => {
  const f = await refundable(t);
  f.boundary.broadcast = async () => {
    const stored = await one(f.store.client, 'SELECT * FROM transfer_attempts');
    assert.equal(stored?.signed_bytes, 'signed-synthetic');
    assert.equal(stored?.transaction_hash, 'c'.repeat(64));
    return 'c'.repeat(64);
  };
  await Promise.all([new RefundWorker(f.app, f.boundary).runOne(), new RefundWorker(f.app, f.boundary).runOne()]);
  assert.equal(f.counts().prepares, 1);
  assert.equal(await f.store.count('transfer_attempts'), 1);
});
test('timeout after network acceptance enters manual review and restart reconciles without resend', async t => {
  const f = await refundable(t);
  let accepted = false;
  f.boundary.broadcast = async () => { accepted = true; throw new Error('timeout after acceptance'); };
  await new RefundWorker(f.app, f.boundary).runOne();
  assert.equal((await one(f.store.client, 'SELECT state FROM transfer_attempts'))?.state, 'MANUAL_REVIEW');
  f.boundary.final = async () => accepted;
  const restart = new RefundWorker(f.app, f.boundary);
  await restart.recover(); await restart.runOne();
  assert.equal(f.counts().prepares, 1);
  assert.equal((await one(f.store.client, 'SELECT state FROM refund_obligations'))?.state, 'SETTLED');
});
test('prepared restart sends stored bytes without a second preparation', async t => {
  const f = await refundable(t);
  const worker = new RefundWorker(f.app, f.boundary);
  await worker.runOne({ stopAfterPrepare: true });
  assert.equal(f.counts().sends, 0);
  await new RefundWorker(f.app, f.boundary).recover();
  await new RefundWorker(f.app, f.boundary).runOne();
  assert.deepEqual(f.counts(), { prepares: 1, sends: 1 });
});
test('unknown result never permits second preparation or blind resend', async t => {
  const f = await refundable(t);
  f.boundary.broadcast = async () => { throw new Error('offline'); };
  const worker = new RefundWorker(f.app, f.boundary);
  await worker.runOne(); await worker.recover(); await worker.runOne(); await worker.runOne();
  assert.equal(f.counts().prepares, 1);
  assert.equal((await one(f.store.client, 'SELECT state FROM refund_obligations'))?.state, 'MANUAL_REVIEW');
});
test('insufficient balance or fee reserve prevents signing and broadcasting', async t => {
  const f = await refundable(t);
  f.boundary.cash = async () => ({ balance: 99999, height: 100, network: 5 });
  await new RefundWorker(f.app, f.boundary).runOne();
  assert.deepEqual(f.counts(), { prepares: 0, sends: 0 });
});
