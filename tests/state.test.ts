import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers';

test('login nonce is expiring and consumed once, with rejection audit', async t => {
  const f = await fixture(t);
  const challenge = await f.app.loginChallenge(f.alice.wallet);
  const session = await f.app.login(challenge.id, f.alice.sign(challenge.message));
  assert.equal(await f.app.sessionWallet(session.token), f.alice.wallet);
  await assert.rejects(f.app.login(challenge.id, f.alice.sign(challenge.message)), /CHALLENGE_USED/);
  assert.equal(await f.store.count('sessions'), 1);
  assert.ok(await f.store.count('lifecycle_events') >= 3);
});
test('wrong signature does not consume challenge and expired proof fails', async t => {
  const f = await fixture(t);
  const challenge = await f.app.loginChallenge(f.alice.wallet);
  await assert.rejects(f.app.login(challenge.id, f.bob.sign(challenge.message)), /INVALID_SIGNATURE/);
  f.time(challenge.expiresAt);
  await assert.rejects(f.app.login(challenge.id, f.alice.sign(challenge.message)), /CHALLENGE_EXPIRED/);
});
test('allowlisted organizer opens immutable capped terms', async t => {
  const f = await fixture(t);
  await assert.rejects(f.app.createEvent(f.alice.wallet, f.terms), /FORBIDDEN/);
  await assert.rejects(f.app.createEvent(f.operator.wallet, { ...f.terms, deposit: 1000001 }), /INVALID_TERMS/);
  const event = await f.app.createEvent(f.operator.wallet, f.terms);
  await f.app.openEvent(f.operator.wallet, event.id);
  await assert.rejects(f.app.editEvent(f.operator.wallet, event.id, { ...f.terms, capacity: 2 }), /TERMS_LOCKED/);
});
test('reservation has exact payment intent and duplicate does not occupy another seat', async t => {
  const f = await fixture(t);
  const event = await f.app.createEvent(f.operator.wallet, f.terms);
  await f.app.openEvent(f.operator.wallet, event.id);
  const reservation = await f.app.reserve(f.alice.wallet, event.id);
  assert.equal(reservation.state, 'HOLD_CREATED');
  assert.equal(reservation.intent.value, '100000');
  assert.equal(reservation.intent.network, 5);
  assert.match(reservation.intent.data, /^showup:v1:/);
  await assert.rejects(f.app.reserve(f.alice.wallet, event.id), /ALREADY_RESERVED/);
  assert.equal(await f.store.count('reservations'), 1);
});
test('session expires and logout revokes it', async t => {
  const f = await fixture(t);
  const c = await f.app.loginChallenge(f.alice.wallet);
  const session = await f.app.login(c.id, f.alice.sign(c.message));
  await f.app.logout(session.token);
  assert.equal(await f.app.sessionWallet(session.token), null);
});

test('organizer campaign list includes seat availability and excludes other wallets', async t => {
  const f = await fixture(t);
  const event = await f.app.createEvent(f.operator.wallet, { ...f.terms, capacity: 2 });
  await f.app.openEvent(f.operator.wallet, event.id);
  await f.app.reserve(f.alice.wallet, event.id);
  const campaigns = await f.app.organizerEvents(f.operator.wallet);
  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0]!.available_seats, 1);
  await assert.rejects(f.app.organizerEvents(f.alice.wallet), /FORBIDDEN/);
});
