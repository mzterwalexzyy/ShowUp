import test from 'node:test';
import assert from 'node:assert/strict';
import * as flow from '../app/utils/flow';

test('submitted and unknown payments use recovery instead of another wallet send', () => {
  const receipt = { reservation: { state: 'HOLD_CREATED', hold_expires: 2000 }, evidence: { payments: [{ state: 'UNVERIFIED', transaction_hash: 'a'.repeat(64) }] } };
  assert.equal(flow.paymentAction(receipt, false, 1000), 'recover');
  assert.equal(flow.paymentAction({ ...receipt, evidence: { payments: [] } }, true, 1000), 'recover');
  assert.equal(flow.paymentAction({ ...receipt, evidence: { payments: [] } }, false, 1000), 'pay');
  assert.equal(flow.paymentAction({ ...receipt, evidence: { payments: [] } }, false, 2000), 'expired');
});

test('closed, started, draft and full events never offer registration', () => {
  for (const state of ['DRAFT', 'CANCELLED', 'COMPLETED']) assert.equal(flow.registrationOpen({ state, starts_at: 2000, available_seats: 1 }, 1000), false);
  assert.equal(flow.registrationOpen({ state: 'OPEN', starts_at: 1000, available_seats: 1 }, 1000), false);
  assert.equal(flow.registrationOpen({ state: 'OPEN', starts_at: 2000, available_seats: 0 }, 1000), false);
  assert.equal(flow.registrationOpen({ state: 'OPEN', starts_at: 2000, available_seats: 1 }, 1000), true);
});

test('host groups include drafts and put cancelled events in exactly one group', () => {
  assert.equal(flow.eventGroup({ state: 'DRAFT', ends_at: 10 }, 100), 'draft');
  assert.equal(flow.eventGroup({ state: 'CANCELLED', ends_at: 10 }, 100), 'cancelled');
  assert.equal(flow.eventGroup({ state: 'OPEN', check_in_opens_at: 50, check_in_closes_at: 90, ends_at: 200 }, 100), 'closed');
});
