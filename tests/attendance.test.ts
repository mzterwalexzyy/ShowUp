import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, paidFixture } from './helpers';

test('verified deposit reserves a seat and the same hash is never credited twice', async t => {
  const f = await paidFixture(t);
  assert.equal((await f.app.receipt(f.alice.wallet, f.reservation.id)).reservation.state, 'CONFIRMED');
  await assert.rejects(f.app.confirmPayment(f.alice.wallet, f.reservation.id, f.payment.hash, f.payment.rpc), /TRANSACTION_USED/);
  assert.equal(await f.store.count('verified_transactions'), 1);
});
test('late deposit becomes a liability and direct refund, never a reclaimed seat', async t => {
  const f = await fixture(t);
  const e = await f.app.createEvent(f.operator.wallet, f.terms);
  await f.app.openEvent(f.operator.wallet, e.id);
  const r = await f.app.reserve(f.alice.wallet, e.id);
  f.time(r.holdExpires);
  const p = f.alice.payment(r.intent.recipient, 100000, r.intent.data);
  await f.app.confirmPayment(f.alice.wallet, r.id, p.hash, p.rpc);
  const receipt = await f.app.receipt(f.alice.wallet, r.id);
  assert.equal(receipt.reservation.state, 'REFUND_PENDING');
  assert.equal(receipt.refunds.length, 1);
  assert.equal(receipt.refunds[0]!.value, 100000);
});
test('overpayment preserves full verified liability and does not reserve', async t => {
  const f = await fixture(t);
  const e = await f.app.createEvent(f.operator.wallet, f.terms);
  await f.app.openEvent(f.operator.wallet, e.id);
  const r = await f.app.reserve(f.alice.wallet, e.id);
  const p = f.alice.payment(r.intent.recipient, 100001, r.intent.data);
  await f.app.confirmPayment(f.alice.wallet, r.id, p.hash, p.rpc);
  const receipt = await f.app.receipt(f.alice.wallet, r.id);
  assert.equal(receipt.reservation.state, 'REFUND_PENDING');
  assert.equal(receipt.refunds[0]!.value, 100001);
});
test('signed check-in is reservation bound, single use and creates one unconditional refund', async t => {
  const f = await paidFixture(t); f.time(f.terms.startsAt);
  const venue = await f.app.venue(f.operator.wallet, f.event.id);
  await assert.rejects(f.app.checkInChallenge(f.bob.wallet, f.reservation.id, venue.token), /FORBIDDEN/);
  const challenge = await f.app.checkInChallenge(f.alice.wallet, f.reservation.id, venue.token);
  await assert.rejects(f.app.checkIn(f.bob.wallet, challenge.id, f.bob.sign(challenge.message)), /FORBIDDEN/);
  await f.app.checkIn(f.alice.wallet, challenge.id, f.alice.sign(challenge.message));
  await assert.rejects(f.app.checkIn(f.alice.wallet, challenge.id, f.alice.sign(challenge.message)), /CHALLENGE_USED/);
  assert.equal(await f.store.count('refund_obligations'), 1);
  assert.ok((await f.app.receipt(f.alice.wallet, f.reservation.id)).reservation.attendance_at);
});
test('expired venue and expired signed challenge both reject attendance', async t => {
  const f = await paidFixture(t); f.time(f.terms.startsAt);
  const v = await f.app.venue(f.operator.wallet, f.event.id);
  const c = await f.app.checkInChallenge(f.alice.wallet, f.reservation.id, v.token);
  f.time(v.expiresAt);
  await assert.rejects(f.app.checkInChallenge(f.alice.wallet, f.reservation.id, v.token), /VENUE_EXPIRED/);
  await assert.rejects(f.app.checkIn(f.alice.wallet, c.id, f.alice.sign(c.message)), /CHALLENGE_EXPIRED/);
  assert.equal(await f.store.count('refund_obligations'), 0);
});
test('event cancellation racing check-in results in exactly one refund', async t => {
  const f = await paidFixture(t); f.time(f.terms.startsAt);
  const v = await f.app.venue(f.operator.wallet, f.event.id);
  const c = await f.app.checkInChallenge(f.alice.wallet, f.reservation.id, v.token);
  await Promise.allSettled([f.app.cancelEvent(f.operator.wallet, f.event.id), f.app.checkIn(f.alice.wallet, c.id, f.alice.sign(c.message))]);
  assert.equal(await f.store.count('refund_obligations'), 1);
});
test('unresolved attendance defaults to refund at the decision deadline', async t => {
  const f = await paidFixture(t);
  f.time(f.terms.endsAt); await f.app.advanceDeadlines();
  assert.equal((await f.app.receipt(f.alice.wallet, f.reservation.id)).reservation.state, 'NO_SHOW_PENDING');
  f.time(f.terms.decisionDeadline); await f.app.advanceDeadlines();
  assert.equal(await f.store.count('refund_obligations'), 1);
  await assert.rejects(f.app.decide(f.operator.wallet, f.reservation.id, 'forfeit', 'late'), /DECISION_CLOSED/);
});
test('participant cancellation before cutoff creates one refund and is idempotent', async t => {
  const f = await paidFixture(t);
  await f.app.cancelReservation(f.alice.wallet, f.reservation.id);
  await f.app.cancelReservation(f.alice.wallet, f.reservation.id);
  assert.equal(await f.store.count('refund_obligations'), 1);
  assert.equal((await f.app.receipt(f.alice.wallet, f.reservation.id)).reservation.state, 'REFUND_PENDING');
});
test('participant cancellation at cutoff is rejected without changing liability', async t => {
  const f = await paidFixture(t); f.time(f.terms.cancellationCutoff);
  await assert.rejects(f.app.cancelReservation(f.alice.wallet, f.reservation.id), /CANCELLATION_CLOSED/);
  assert.equal(await f.store.count('refund_obligations'), 0);
});
test('private receipts enforce ownership, public event projection contains no wallets', async t => {
  const f = await paidFixture(t);
  await assert.rejects(f.app.receipt(f.bob.wallet, f.reservation.id), /FORBIDDEN/);
  const publicData = JSON.stringify(await f.app.publicEvent(f.event.id));
  assert.ok(!publicData.includes(f.alice.wallet));
  assert.ok(!publicData.includes(f.operator.wallet));
  assert.ok(!publicData.includes(f.reservation.id));
});
