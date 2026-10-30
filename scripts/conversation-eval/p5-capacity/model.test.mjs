import test from 'node:test';
import assert from 'node:assert/strict';
import { CapacityModel } from './model.mjs';
import { policy, claim, reserve, mark, close, observation, occupied } from './fixtures.mjs';

const run = (m, c, expected) => { const r = m.apply(c); assert.equal(r.outcome, expected); return r.snapshot; };
const started = (p = policy()) => {
  const m = new CapacityModel(p), a = claim();
  run(m, reserve(a), 'reserved'); run(m, mark(a), 'marked'); return { m, a };
};

test('missing/disabled/zero policy denies without holding any unit or slot', () => {
  for (const p of [null, policy({ enabled: false }), policy({ activeLimit: 0 }), policy({ totalUnitLimit: 0 })]) {
    const m = new CapacityModel(p);
    assert.notEqual(m.apply(reserve(claim())).outcome, 'reserved');
    assert.equal(m.snapshot().heldUnits, 0); assert.equal(occupied(m.snapshot()), 0);
  }
});
test('one pool limits different owners together, exact replay never reserves twice', () => {
  const m = new CapacityModel(policy()), a = claim(), b = claim('b'); b.binding.ownerId = 'owner-b';
  run(m, reserve(a), 'reserved'); run(m, reserve(a), 'retained');
  run(m, reserve(b), 'capacity-denied'); assert.equal(m.snapshot().heldUnits, 2);
});
test('close before reserve retires exact claim and owner/attempt across changed thread IDs', () => {
  const m = new CapacityModel(policy()), a = claim(); run(m, close(a), 'closed');
  run(m, reserve(a), 'retired'); const b = claim('b'); b.binding.attemptId = a.binding.attemptId;
  run(m, reserve(b), 'attempt-retired'); assert.equal(m.snapshot().heldUnits, 0);
});
test('losing close for same attempt cannot fence the winner or its operation', () => {
  const { m, a } = started(), loser = claim('loser'); loser.binding.attemptId = a.binding.attemptId;
  run(m, close(loser), 'closed'); assert.equal(m.snapshot().claims[a.claimId].closed, false);
  assert.equal(occupied(m.snapshot()), 1); assert.equal(m.snapshot().heldUnits, 2);
});
test('close wins before marker: slot reusable, cumulative units still held', () => {
  const m = new CapacityModel(policy()), a = claim(); run(m, reserve(a), 'reserved');
  run(m, close(a), 'closed'); run(m, mark(a), 'retired'); run(m, reserve(claim('b'), { now: 30 }), 'reserved');
  assert.equal(occupied(m.snapshot()), 1); assert.equal(m.snapshot().heldUnits, 4);
});
test('marker wins before close: absent provider ACK retains capacity and cumulative hold', () => {
  const { m, a } = started(); run(m, close(a), 'closed');
  run(m, observation(a, 'unknown'), 'uncertain'); run(m, reserve(claim('b'), { now: 30 }), 'capacity-denied');
  assert.equal(occupied(m.snapshot()), 1); assert.equal(m.snapshot().heldUnits, 2);
});
test('marked replay is observation only, changed operation cannot dispatch again', () => {
  const { m, a } = started(); run(m, mark(a), 'already-marked');
  run(m, mark(a, { operationId: 'replacement-operation' }), 'operation-conflict');
  assert.deepEqual(Object.keys(m.snapshot().operations), [`operation-${a.claimId}`]);
});
test('terminal reconciliation works with unknown creation ACK and after close', () => {
  const { m, a } = started(); run(m, close(a), 'closed');
  run(m, observation(a, 'ended'), 'terminal-recorded');
  run(m, reserve(claim('b'), { now: 30 }), 'reserved');
  assert.equal(m.snapshot().heldUnits, 4); assert.equal(occupied(m.snapshot()), 1);
});
test('final no-create evidence releases slot but never refunds cumulative units', () => {
  const { m, a } = started(); run(m, observation(a, 'not-created'), 'terminal-recorded');
  assert.equal(occupied(m.snapshot()), 0); assert.equal(m.snapshot().heldUnits, 2);
  run(m, reserve(a, { now: 30 }), 'retired');
});
test('exact terminal receipt duplicate is idempotent and late ACK does not resurrect old session', () => {
  const { m, a } = started(); const ended = observation(a, 'ended');
  run(m, ended, 'terminal-recorded'); const before = m.snapshot(); run(m, ended, 'duplicate-evidence');
  assert.deepEqual(m.snapshot(), before); run(m, observation(a, 'created'), 'late-evidence');
  assert.equal(occupied(m.snapshot()), 0); assert.equal(m.snapshot().quarantined, false);
});
test('terminal contradiction quarantines pool including already-reserved replacement', () => {
  const { m, a } = started(); run(m, observation(a, 'ended'), 'terminal-recorded');
  const b = claim('b'); run(m, reserve(b, { now: 30 }), 'reserved');
  run(m, observation(a, 'created', { sessionId: 'different-session' }), 'quarantined');
  run(m, mark(b, { now: 40 }), 'quarantined');
  assert.equal(m.snapshot().claims[b.claimId].stage, 'reserved');
  assert.equal(m.snapshot().claims[a.claimId].slot, 'released');
});
test('quarantine survives cleanup, policy increases and unrelated terminal evidence', () => {
  const { m, a } = started(); run(m, observation(a, 'created'), 'creation-observed');
  run(m, observation(a, 'not-created'), 'quarantined');
  run(m, close(a), 'closed'); run(m, observation(a, 'ended'), 'terminal-recorded');
  run(m, { type: 'policy', expectedVersion: 1, policy: policy({ version: 2, activeLimit: 10 }) }, 'policy-updated');
  run(m, reserve(claim('b'), { now: 30, policyVersion: 2 }), 'quarantined');
  assert.equal(m.snapshot().heldUnits, 2);
});
test('same evidence ID with changed outcome quarantines without overwriting original evidence', () => {
  const { m, a } = started(); const created = observation(a, 'created');
  run(m, created, 'creation-observed');
  run(m, observation(a, 'ended', { evidenceId: created.evidenceId }), 'quarantined');
  assert.deepEqual(m.snapshot().observations[created.evidenceId], created);
  assert.equal(occupied(m.snapshot()), 1);
});
test('different owner/claim/generation/revision/digest/expiry cannot clean up a winner', () => {
  const { m, a } = started();
  const changed = [ { ...a, expiresAt: 2000 }, ...['ownerId', 'threadId', 'threadIncarnation',
    'threadRevision', 'attemptId', 'approvalId', 'approvalDigest'].map((key) => ({ ...a,
    binding: { ...a.binding, [key]: key === 'threadRevision' ? 1 : key === 'approvalDigest' ? 'b'.repeat(64) : 'wrong-id' } })) ];
  for (const wrong of changed) {
    run(m, close(wrong), 'binding-conflict'); run(m, observation(wrong, 'ended'), 'binding-conflict');
  }
  assert.equal(occupied(m.snapshot()), 1); assert.equal(m.snapshot().claims[a.claimId].closed, false);
});
test('expiry or revocation before marker fences pending start; after marker retains uncertainty', () => {
  for (const invalid of [{ now: 1000 }, { now: 20, freshEligibility: false }]) {
    const a = claim(), m = new CapacityModel(policy()); run(m, reserve(a), 'reserved');
    run(m, mark(a, invalid), 'eligibility-denied'); assert.equal(occupied(m.snapshot()), 0);
    const active = started(); run(active.m, mark(active.a, invalid), 'eligibility-denied');
    assert.equal(occupied(active.m.snapshot()), 1); assert.equal(active.m.snapshot().heldUnits, 2);
  }
});
test('clock rollback fails closed while exact cleanup is still available', () => {
  const { m, a } = started(); run(m, reserve(claim('b'), { now: 19 }), 'clock-denied');
  run(m, close(a), 'closed'); run(m, observation(a, 'not-created'), 'terminal-recorded');
  assert.equal(m.snapshot().clockHighWater, 20); assert.equal(m.snapshot().heldUnits, 2);
});
test('releasing capacity repeatedly cannot bypass lifetime cumulative ceiling', () => {
  const m = new CapacityModel(policy({ totalUnitLimit: 4 }));
  for (const label of ['a', 'b']) { const c = claim(label); run(m, reserve(c), 'reserved'); run(m, close(c), 'closed'); }
  run(m, reserve(claim('c')), 'capacity-denied'); assert.equal(occupied(m.snapshot()), 0);
  assert.equal(m.snapshot().heldUnits, 4);
});
test('lowering limits preserves holds and prevents previously reserved starts above new limits', () => {
  const m = new CapacityModel(policy({ activeLimit: 2 })), a = claim(), b = claim('b');
  run(m, reserve(a), 'reserved'); run(m, reserve(b), 'reserved');
  run(m, { type: 'policy', expectedVersion: 1, policy: policy({ version: 2, activeLimit: 1 }) }, 'policy-updated');
  run(m, mark(a), 'policy-denied'); run(m, mark(a, { policyVersion: 2 }), 'capacity-denied');
  run(m, close(b), 'closed'); run(m, mark(a, { policyVersion: 2 }), 'marked');
  assert.equal(m.snapshot().heldUnits, 4);
});
test('policy cannot rotate pool or unit definition to reset lifetime holds', () => {
  const m = new CapacityModel(policy()); run(m, reserve(claim()), 'reserved');
  for (const changes of [{ poolId: 'new-pool' }, { unitsPerAttempt: 1 }])
    run(m, { type: 'policy', expectedVersion: 1, policy: policy({ version: 2, ...changes }) }, 'policy-conflict');
  assert.equal(m.snapshot().heldUnits, 2);
});
test('MAX_SAFE checked subtraction prevents a second reservation overflowing held units', () => {
  const m = new CapacityModel(policy({ activeLimit: 2, totalUnitLimit: Number.MAX_SAFE_INTEGER,
    unitsPerAttempt: Number.MAX_SAFE_INTEGER }));
  run(m, reserve(claim()), 'reserved'); run(m, reserve(claim('b')), 'capacity-denied');
  assert.equal(m.snapshot().heldUnits, Number.MAX_SAFE_INTEGER);
});
test('strict content-free fixture commands reject extra payloads and malformed fields', () => {
  const m = new CapacityModel(policy());
  for (const c of [reserve(claim(), { transcript: 'excluded' }), reserve(claim(), { now: NaN }),
    reserve(claim(), { freshEligibility: 'yes' }), reserve({ ...claim(), expiresAt: '1000' })])
    run(m, c, 'invalid-command');
  assert.equal(m.snapshot().heldUnits, 0);
});
test('caller input and returned snapshots cannot mutate retained ownership or limits', () => {
  const p = policy(), a = claim(), m = new CapacityModel(p); p.activeLimit = 500;
  run(m, reserve(a), 'reserved'); a.binding.ownerId = 'changed';
  assert.equal(m.snapshot().claims['claim-a'].claim.binding.ownerId, 'owner-a');
  assert.throws(() => { m.snapshot().policy.activeLimit = 500; }, TypeError);
  assert.equal(m.snapshot().policy.activeLimit, 1);
});

test('1,120 serial event orderings preserve one occupied slot, cumulative units and terminal fences', () => {
  const labels = ['reserve-a', 'mark-a', 'terminal-a', 'close-a', 'reserve-b', 'mark-b', 'terminal-b', 'close-b'];
  let count = 0;
  function visit(order, remaining) {
    if (remaining.length) {
      for (const next of remaining) {
        const [action, who] = next.split('-');
        if (action === 'mark' && !order.includes(`reserve-${who}`)) continue;
        if (action === 'terminal' && !order.includes(`mark-${who}`)) continue;
        visit([...order, next], remaining.filter((x) => x !== next));
      }
      return;
    }
    count++; const m = new CapacityModel(policy()), claims = { a: claim(), b: claim('b') };
    let previousHeld = 0; const terminal = new Set();
    for (const label of order) {
      const [action, who] = label.split('-'), c = claims[who];
      const command = action === 'reserve' ? reserve(c, { now: 10 }) : action === 'mark' ? mark(c, { now: 10 }) :
        action === 'close' ? close(c) : observation(c, 'ended');
      const { outcome, snapshot: s } = m.apply(command);
      assert.ok(occupied(s) <= 1, order.join(',')); assert.ok(s.heldUnits >= previousHeld);
      assert.ok(s.heldUnits <= 4); previousHeld = s.heldUnits;
      if (outcome === 'terminal-recorded') terminal.add(c.claimId);
      for (const cid of terminal) { assert.equal(s.claims[cid].slot, 'released'); assert.equal(s.claims[cid].closed, true); }
    }
  }
  visit([], labels); assert.equal(count, 1120);
});
