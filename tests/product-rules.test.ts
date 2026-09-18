import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, paidFixture } from './helpers';

test('wallet send intent is durable and cannot be started twice', async t => {
  const f = await fixture(t);
  const event = await f.app.createEvent(f.operator.wallet, f.terms);
  await f.app.openEvent(f.operator.wallet, event.id);
  const reservation = await f.app.reserve(f.alice.wallet, event.id);
  await f.app.beginPayment(f.alice.wallet, reservation.id);
  const receipt = await f.app.receipt(f.alice.wallet, reservation.id);
  assert.equal(receipt.evidence.payments[0]!.state, 'UNKNOWN');
  await assert.rejects(f.app.beginPayment(f.alice.wallet, reservation.id), /PAYMENT_RECONCILIATION_REQUIRED/);
  await assert.rejects(f.app.beginPayment(f.bob.wallet, reservation.id), /FORBIDDEN/);
  const payment = f.alice.payment(reservation.intent.recipient, Number(reservation.intent.value), reservation.intent.data);
  await f.app.confirmPayment(f.alice.wallet, reservation.id, payment.hash, payment.rpc);
  assert.equal((await f.app.receipt(f.alice.wallet, reservation.id)).reservation.state, 'CONFIRMED');
});

test('host availability includes live holds and releases expired holds', async t => {
  const f = await fixture(t);
  const event = await f.app.createEvent(f.operator.wallet, f.terms);
  await f.app.openEvent(f.operator.wallet, event.id);
  const reservation = await f.app.reserve(f.alice.wallet, event.id);
  assert.equal((await f.app.organizerEvent(f.operator.wallet, event.id)).event.available_seats, 0);
  f.time(reservation.holdExpires);
  assert.equal((await f.app.organizerEvent(f.operator.wallet, event.id)).event.available_seats, 1);
});

test('private pass includes the frozen cancellation cutoff', async t => {
  const f = await paidFixture(t);
  const receipt = await f.app.receipt(f.alice.wallet, f.reservation.id);
  assert.equal(receipt.reservation.cutoff, f.terms.cancellationCutoff);
});

test('capacity must be an integer from one through twenty', async t => {
  const f = await fixture(t);
  await assert.rejects(f.app.createEvent(f.operator.wallet, { ...f.terms, capacity: 0 }), /INVALID_TERMS/);
  await assert.rejects(f.app.createEvent(f.operator.wallet, { ...f.terms, capacity: 21 }), /INVALID_TERMS/);
});

test('an expired unpaid hold releases exactly one seat and sold out rejects another hold', async t => {
  const f = await fixture(t);
  const terms = { ...f.terms, startsAt: f.terms.startsAt + 600_000, endsAt: f.terms.endsAt + 600_000, decisionDeadline: f.terms.decisionDeadline + 600_000 };
  const event = await f.app.createEvent(f.operator.wallet, terms);
  await f.app.openEvent(f.operator.wallet, event.id);
  const first = await f.app.reserve(f.alice.wallet, event.id);
  await assert.rejects(f.app.reserve(f.bob.wallet, event.id), /SOLD_OUT/);
  f.time(first.holdExpires);
  const second = await f.app.reserve(f.bob.wallet, event.id);
  assert.equal(second.state, 'HOLD_CREATED');
  const expired = await f.store.client.execute({ sql: 'SELECT state FROM reservations WHERE id=?', args: [first.id] });
  assert.equal(expired.rows[0]!.state, 'HOLD_EXPIRED');
  assert.equal((await f.app.publicEvent(event.id)).available_seats, 0);
});

test('opened payment mode, capacity and policy are immutable', async t => {
  const f = await fixture(t);
  const event = await f.app.createEvent(f.operator.wallet, f.terms);
  await f.app.openEvent(f.operator.wallet, event.id);
  await assert.rejects(f.app.editEvent(f.operator.wallet, event.id, { ...f.terms, capacity: 0, paymentMode: 'PAID_ADMISSION' }), /TERMS_LOCKED/);
});

test('refundable check-in creates one refund while paid admission consumes the ticket', async t => {
  const refundable = await paidFixture(t);
  refundable.time(refundable.terms.startsAt);
  const venue = await refundable.app.venue(refundable.operator.wallet, refundable.event.id);
  const challenge = await refundable.app.checkInChallenge(refundable.alice.wallet, refundable.reservation.id, venue.token);
  await refundable.app.checkIn(refundable.alice.wallet, challenge.id, refundable.alice.sign(challenge.message));
  assert.equal(await refundable.store.count('refund_obligations'), 1);

  const paid = await fixture(t);
  const paidTerms = { ...paid.terms, paymentMode: 'PAID_ADMISSION' as const, participantCancellationPolicy: 'REFUND_BEFORE_CUTOFF' as const };
  const event = await paid.app.createEvent(paid.operator.wallet, paidTerms);
  await paid.app.openEvent(paid.operator.wallet, event.id);
  const reservation = await paid.app.reserve(paid.alice.wallet, event.id);
  const payment = paid.alice.payment(reservation.intent.recipient, Number(reservation.intent.value), reservation.intent.data);
  await paid.app.confirmPayment(paid.alice.wallet, reservation.id, payment.hash, payment.rpc);
  paid.time(paidTerms.startsAt);
  const paidVenue = await paid.app.venue(paid.operator.wallet, event.id);
  const paidChallenge = await paid.app.checkInChallenge(paid.alice.wallet, reservation.id, paidVenue.token);
  await paid.app.checkIn(paid.alice.wallet, paidChallenge.id, paid.alice.sign(paidChallenge.message));
  assert.equal(await paid.store.count('refund_obligations'), 0);
  const receipt = await paid.app.receipt(paid.alice.wallet, reservation.id);
  assert.equal(receipt.reservation.settlement_state, 'TICKET_CONSUMED');
});

test('event cancellation refunds paid admission and refundable deposits', async t => {
  for (const paymentMode of ['REFUNDABLE_DEPOSIT', 'PAID_ADMISSION'] as const) {
    const f = await fixture(t);
    const terms = { ...f.terms, paymentMode, participantCancellationPolicy: 'NON_REFUNDABLE' as const };
    const event = await f.app.createEvent(f.operator.wallet, terms);
    await f.app.openEvent(f.operator.wallet, event.id);
    const reservation = await f.app.reserve(f.alice.wallet, event.id);
    const payment = f.alice.payment(reservation.intent.recipient, Number(reservation.intent.value), reservation.intent.data);
    await f.app.confirmPayment(f.alice.wallet, reservation.id, payment.hash, payment.rpc);
    await f.app.cancelEvent(f.operator.wallet, event.id);
    assert.equal((await f.app.receipt(f.alice.wallet, reservation.id)).refunds.length, 1);
  }
});

test('paid admission participant cancellation follows the frozen policy', async t => {
  const f = await fixture(t);
  const terms = { ...f.terms, paymentMode: 'PAID_ADMISSION' as const, participantCancellationPolicy: 'NON_REFUNDABLE' as const };
  const event = await f.app.createEvent(f.operator.wallet, terms);
  await f.app.openEvent(f.operator.wallet, event.id);
  const reservation = await f.app.reserve(f.alice.wallet, event.id);
  const payment = f.alice.payment(reservation.intent.recipient, Number(reservation.intent.value), reservation.intent.data);
  await f.app.confirmPayment(f.alice.wallet, reservation.id, payment.hash, payment.rpc);
  await assert.rejects(f.app.cancelReservation(f.alice.wallet, reservation.id), /CANCELLATION_NON_REFUNDABLE/);
  assert.equal(await f.store.count('refund_obligations'), 0);
});

test('rotating or closing a venue challenge revokes it and its participant challenge', async t => {
  const f = await paidFixture(t); f.time(f.terms.startsAt);
  const first = await f.app.venue(f.operator.wallet, f.event.id);
  const challenge = await f.app.checkInChallenge(f.alice.wallet, f.reservation.id, first.token);
  await f.app.venue(f.operator.wallet, f.event.id);
  await assert.rejects(f.app.checkIn(f.alice.wallet, challenge.id, f.alice.sign(challenge.message)), /VENUE_REVOKED/);
  const active = await f.app.venue(f.operator.wallet, f.event.id);
  await f.app.closeVenue(f.operator.wallet, f.event.id);
  await assert.rejects(f.app.checkInChallenge(f.alice.wallet, f.reservation.id, active.token), /VENUE_REVOKED/);
});

test('attendance rewards are disabled and cannot consume participant principal', async t => {
  const f = await fixture(t);
  await assert.rejects(f.app.createEvent(f.operator.wallet, { ...f.terms, rewardPolicy: 'EQUAL_ATTENDANCE_POOL', rewardPoolLuna: 100000 }), /REWARD_POLICY_DEFERRED/);
  const event = await f.app.createEvent(f.operator.wallet, { ...f.terms, rewardPolicy: 'NONE', rewardPoolLuna: 0 });
  const row = await f.store.client.execute({ sql: 'SELECT reward_policy,reward_pool_luna FROM events WHERE id=?', args: [event.id] });
  assert.deepEqual([row.rows[0]!.reward_policy, Number(row.rows[0]!.reward_pool_luna)], ['NONE', 0]);
});
