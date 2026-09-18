import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNim, luna } from '../server/domain/money.ts';

test('decimal strings convert exactly to integer Luna', () => {
  assert.equal(parseNim('0.00001'), 1);
  assert.equal(parseNim('10'), 1_000_000);
  assert.equal(parseNim('1.23456'), 123456);
});
test('money rejects rounding, floats, negative, overflow and malformed values', () => {
  for (const value of ['1.000001', '-1', '1e2', ' 1', '', '01', '9007199254740992', 1]) {
    assert.throws(() => parseNim(value));
  }
  for (const value of [0.1, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1']) {
    assert.throws(() => luna(value));
  }
  assert.equal(luna(0), 0);
});
