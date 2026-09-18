import test from 'node:test';
import assert from 'node:assert/strict';
import { checkInAvailability, refundProgress } from '../app/utils/flow';

test('check-in stays locked before event start even after deposit verification', () => {
  assert.deepEqual(checkInAvailability('RESERVED', 2_000, 3_000, 1_999), { open: false, waitMs: 1 });
});
test('check-in opens only during the event for a verified reservation', () => {
  assert.equal(checkInAvailability('RESERVED', 2_000, 3_000, 2_000).open, true);
  assert.equal(checkInAvailability('CONFIRMED', 2_000, 3_000, 2_000).open, true);
  assert.equal(checkInAvailability('HELD', 2_000, 3_000, 2_000).open, false);
  assert.equal(checkInAvailability('RESERVED', 2_000, 3_000, 3_000).open, false);
});

test('refund progress becomes complete only when every refund is settled', () => {
  assert.deepEqual(refundProgress(undefined), { exists: false, settled: false });
  assert.deepEqual(refundProgress({ refunds: [] }), { exists: false, settled: false });
  assert.deepEqual(refundProgress({ refunds: [{ state: 'BROADCAST' }] }), { exists: true, settled: false });
  assert.deepEqual(refundProgress({ refunds: [{ state: 'SETTLED' }] }), { exists: true, settled: true });
  assert.deepEqual(refundProgress({ refunds: [{ state: 'SETTLED' }, { state: 'PENDING' }] }), { exists: true, settled: false });
});
