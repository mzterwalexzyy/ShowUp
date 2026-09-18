import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers';

test('competing participants cannot both claim last seat', async t => {
  const f = await fixture(t);
  const event = await f.app.createEvent(f.operator.wallet, f.terms);
  await f.app.openEvent(f.operator.wallet, event.id);
  const results = await Promise.allSettled([f.app.reserve(f.alice.wallet, event.id), f.app.reserve(f.bob.wallet, event.id)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await f.store.count('reservations'), 1);
});
test('two uses of the same signed nonce create exactly one session', async t => {
  const f = await fixture(t);
  const c = await f.app.loginChallenge(f.alice.wallet);
  const proof = f.alice.sign(c.message);
  const results = await Promise.allSettled([f.app.login(c.id, proof), f.app.login(c.id, proof)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await f.store.count('sessions'), 1);
});
