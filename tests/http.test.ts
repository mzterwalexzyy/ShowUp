import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionCookieOptions } from '../server/api/_helpers';

test('local testnet bootstrap cookie works over the explicit LAN HTTP origin', () => {
  assert.equal(sessionCookieOptions(true, true, 1000).secure, false);
});
test('normal production session cookie is HTTPS only', () => {
  assert.equal(sessionCookieOptions(false, true, 1000).secure, true);
});
