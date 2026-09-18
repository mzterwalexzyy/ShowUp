import test from 'node:test';
import assert from 'node:assert/strict';
import * as ticks from '../server/worker/tick';

test('scheduled work advances deadlines before refunds and prevents overlapping ticks', async () => {
  const calls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tick = ticks.createWorkerTick({ advanceDeadlines: async () => { calls.push('deadlines'); await gate; } }, {
    recover: async () => { calls.push('recover'); }, runOne: async () => { calls.push('refund'); }
  });
  const first = tick();
  await tick();
  assert.deepEqual(calls, ['deadlines']);
  release(); await first;
  assert.deepEqual(calls, ['deadlines', 'recover', 'refund']);
});

test('a failed tick releases its guard for the next scheduled retry', async () => {
  let attempts = 0;
  const tick = ticks.createWorkerTick({ advanceDeadlines: async () => { if (++attempts === 1) throw new Error('busy'); } });
  await assert.rejects(tick(), /busy/);
  await tick();
  assert.equal(attempts, 2);
});
