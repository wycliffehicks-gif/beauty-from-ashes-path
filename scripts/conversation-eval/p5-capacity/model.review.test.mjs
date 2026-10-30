// Independent adversarial checks of the OFFLINE executable contract only.
// These fixtures authenticate nobody and prove no database or provider behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CapacityModel } from './model.mjs';

const policy = (overrides = {}) => ({ poolId: 'review-pool', version: 1,
  activeLimit: 2, totalUnitLimit: 30, unitsPerAttempt: 3, enabled: true, ...overrides });
const claim = (name, binding = {}, expiresAt = 100) => ({ claimId: name,
  binding: { ownerId: 'owner-a', threadId: 'thread-a', threadIncarnation: 'incarnation-a',
    threadRevision: 1, attemptId: `attempt-${name}`, approvalId: `approval-${name}`,
    approvalDigest: 'a'.repeat(64), scope: 'developer-voice-session', ...binding }, expiresAt });
const reserve = (m, c, overrides = {}) => m.apply({ type: 'reserve', claim: c,
  policyVersion: 1, now: 10, freshEligibility: true, ...overrides }).outcome;
const mark = (m, c, op = `operation-${c.claimId}`, overrides = {}) => m.apply({
  type: 'mark-create', claim: c, operationId: op,
  policyVersion: 1, now: 11, freshEligibility: true, ...overrides }).outcome;
const close = (m, c) => m.apply({ type: 'close', claim: c }).outcome;
const observe = (m, c, op, evidenceId, kind, sessionId = null) => m.apply({
  type: 'observe', claim: c, operationId: op, evidenceId, kind, sessionId }).outcome;
const totals = (m) => ({ heldUnits: m.snapshot().heldUnits,
  occupied: Object.values(m.snapshot().claims).filter((r) => r.slot === 'held').length });

test('review: owner/attempt uniqueness spans threads and incarnations; owners stay separate', () => {
  const m = new CapacityModel(policy());
  const first = claim('first', { attemptId: 'shared-attempt' });
  assert.equal(reserve(m, first), 'reserved');
  const reused = claim('reused', { attemptId: 'shared-attempt', threadId: 'thread-b',
    threadIncarnation: 'incarnation-b', threadRevision: 55 });
  assert.equal(reserve(m, reused), 'attempt-retired');
  const otherOwner = claim('other', { ownerId: 'owner-b', attemptId: 'shared-attempt' });
  assert.equal(reserve(m, otherOwner), 'reserved');
  assert.deepEqual(totals(m), { heldUnits: 6, occupied: 2 });
});

test('review: changed cleanup binding cannot close or reconcile another incarnation', () => {
  const m = new CapacityModel(policy());
  const c = claim('exact');
  reserve(m, c); mark(m, c);
  const before = m.snapshot();
  const forged = { ...c, binding: { ...c.binding, threadIncarnation: 'replacement' } };
  assert.equal(close(m, forged), 'binding-conflict');
  assert.equal(observe(m, forged, 'operation-exact', 'bad', 'ended', 'session-a'), 'binding-conflict');
  assert.deepEqual(m.snapshot(), before);
});

test('review: close before reservation permanently retires the owner attempt without a debit', () => {
  const m = new CapacityModel(policy());
  const c = claim('early');
  assert.equal(close(m, c), 'closed');
  assert.equal(reserve(m, c), 'retired');
  assert.equal(reserve(m, claim('replacement', { attemptId: c.binding.attemptId })), 'attempt-retired');
  assert.deepEqual(totals(m), { heldUnits: 0, occupied: 0 });
});

test('review: losing cleanup preserves the committed winner and its uncertain slot', () => {
  const m = new CapacityModel(policy());
  const winner = claim('winner', { attemptId: 'same-attempt' });
  const loser = claim('loser', { attemptId: 'same-attempt' });
  reserve(m, winner); mark(m, winner);
  const before = m.snapshot().claims.winner;
  assert.equal(close(m, loser), 'closed');
  assert.equal(reserve(m, loser, { now: 12 }), 'retired');
  assert.deepEqual(m.snapshot().claims.winner, before);
  assert.deepEqual(totals(m), { heldUnits: 3, occupied: 1 });
});

test('review: lost creation acknowledgement plus repeated close preserves possible work', () => {
  const m = new CapacityModel(policy({ activeLimit: 1 }));
  const c = claim('lost');
  reserve(m, c); mark(m, c);
  assert.equal(close(m, c), 'closed');
  assert.equal(close(m, c), 'closed');
  assert.equal(observe(m, c, 'operation-lost', 'unknown-1', 'unknown'), 'uncertain');
  assert.equal(reserve(m, claim('next'), { now: 200 }), 'eligibility-denied');
  assert.equal(reserve(m, claim('future', {}, 500), { now: 200 }), 'capacity-denied');
  assert.deepEqual(totals(m), { heldUnits: 3, occupied: 1 });
});

test('review: final operation evidence may reconcile a missing creation ack after expiry', () => {
  const m = new CapacityModel(policy({ activeLimit: 1 }));
  const c = claim('lost-final');
  reserve(m, c); mark(m, c);
  assert.equal(mark(m, c, 'operation-lost-final', { now: 100 }), 'eligibility-denied');
  assert.equal(observe(m, c, 'operation-lost-final', 'final', 'ended', 'session-final'), 'terminal-recorded');
  const replacement = claim('new', {}, 500);
  assert.equal(reserve(m, replacement, { now: 101 }), 'reserved');
  assert.equal(observe(m, c, 'operation-lost-final', 'late-created', 'created', 'session-final'), 'late-evidence');
  assert.equal(mark(m, replacement, 'operation-new', { now: 102 }), 'marked');
  assert.deepEqual(totals(m), { heldUnits: 6, occupied: 1 });
  assert.equal(m.snapshot().quarantined, false);
});

test('review: contradictory late session evidence fences pending replacement and future starts', () => {
  const m = new CapacityModel(policy({ activeLimit: 1 }));
  const old = claim('old');
  reserve(m, old); mark(m, old);
  observe(m, old, 'operation-old', 'old-ended', 'ended', 'session-old');
  const next = claim('replacement');
  reserve(m, next, { now: 12 });
  const replacementBefore = m.snapshot().claims.replacement;
  assert.equal(observe(m, old, 'operation-old', 'contradiction', 'created', 'session-other'), 'quarantined');
  assert.equal(mark(m, next, 'operation-replacement', { now: 13 }), 'quarantined');
  assert.equal(reserve(m, claim('third'), { now: 13 }), 'quarantined');
  assert.deepEqual(m.snapshot().claims.replacement, replacementBefore);
  assert.deepEqual(totals(m), { heldUnits: 6, occupied: 1 });
});

test('review: evidence replay is exact and conflicting trusted reuse cannot release holdings', () => {
  const m = new CapacityModel(policy());
  const c = claim('evidence');
  reserve(m, c); mark(m, c);
  assert.equal(observe(m, c, 'operation-evidence', 'event', 'created', 'session-a'), 'creation-observed');
  assert.equal(observe(m, c, 'operation-evidence', 'event', 'created', 'session-a'), 'duplicate-evidence');
  assert.equal(observe(m, c, 'operation-evidence', 'event', 'ended', 'session-a'), 'quarantined');
  assert.deepEqual(totals(m), { heldUnits: 3, occupied: 1 });
  assert.equal(observe(m, c, 'operation-evidence', 'proper-final', 'ended', 'session-a'), 'terminal-recorded');
  assert.equal(m.apply({ type: 'policy', expectedVersion: 1,
    policy: policy({ version: 2, activeLimit: 10, totalUnitLimit: 100 }) }).outcome, 'policy-updated');
  assert.equal(reserve(m, claim('later'), { now: 12, policyVersion: 2 }), 'quarantined');
  assert.deepEqual(totals(m), { heldUnits: 3, occupied: 0 });
});

test('review: decreasing active capacity blocks pending starts without evicting either owner', () => {
  const m = new CapacityModel(policy());
  const a = claim('a'); const b = claim('b', { ownerId: 'owner-b' });
  reserve(m, a); reserve(m, b); mark(m, a);
  assert.equal(m.apply({ type: 'policy', expectedVersion: 1,
    policy: policy({ version: 2, activeLimit: 1 }) }).outcome, 'policy-updated');
  assert.equal(mark(m, b, 'operation-b', { policyVersion: 2, now: 12 }), 'capacity-denied');
  assert.deepEqual(totals(m), { heldUnits: 6, occupied: 2 });
  close(m, a);
  assert.equal(mark(m, b, 'operation-b', { policyVersion: 2, now: 12 }), 'capacity-denied');
  observe(m, a, 'operation-a', 'ended-a', 'ended', 'session-a');
  assert.equal(mark(m, b, 'operation-b', { policyVersion: 2, now: 12 }), 'marked');
  assert.deepEqual(totals(m), { heldUnits: 6, occupied: 1 });
});

test('review: lowering cumulative ceiling and restoring it preserves all historical debits', () => {
  const m = new CapacityModel(policy());
  const a = claim('a'); reserve(m, a);
  m.apply({ type: 'policy', expectedVersion: 1, policy: policy({ version: 2, totalUnitLimit: 2 }) });
  assert.equal(mark(m, a, 'operation-a', { policyVersion: 2 }), 'capacity-denied');
  close(m, a);
  m.apply({ type: 'policy', expectedVersion: 2, policy: policy({ version: 3, totalUnitLimit: 5 }) });
  assert.equal(reserve(m, claim('b'), { now: 12, policyVersion: 3 }), 'capacity-denied');
  m.apply({ type: 'policy', expectedVersion: 3, policy: policy({ version: 4, totalUnitLimit: 6 }) });
  assert.equal(reserve(m, claim('b'), { now: 12, policyVersion: 4 }), 'reserved');
  assert.deepEqual(totals(m), { heldUnits: 6, occupied: 1 });
});

test('review: safe integer ceiling cannot overflow through another attempt or policy replacement', () => {
  const max = Number.MAX_SAFE_INTEGER;
  const p = policy({ unitsPerAttempt: max, totalUnitLimit: max });
  const m = new CapacityModel(p); const a = claim('a');
  reserve(m, a); close(m, a);
  assert.equal(reserve(m, claim('b')), 'capacity-denied');
  assert.equal(m.apply({ type: 'policy', expectedVersion: 1,
    policy: { ...p, version: 2, totalUnitLimit: max + 1 } }).outcome, 'invalid-command');
  assert.deepEqual(totals(m), { heldUnits: max, occupied: 0 });
});

test('review: immutable input copies and snapshots protect identities, debit and quarantine state', () => {
  const p = policy(); const c = claim('immutable'); const m = new CapacityModel(p);
  reserve(m, c);
  p.totalUnitLimit = 999; c.binding.ownerId = 'owner-rebound';
  const s = m.snapshot();
  assert.equal(s.policy.totalUnitLimit, 30);
  assert.equal(s.claims.immutable.claim.binding.ownerId, 'owner-a');
  assert.throws(() => { s.claims.immutable.units = 0; }, TypeError);
  assert.throws(() => { s.policy.activeLimit = 999; }, TypeError);
  assert.throws(() => { s.quarantined = false; }, TypeError);
  assert.deepEqual(totals(m), { heldUnits: 3, occupied: 1 });
});

test('review: malformed amounts, caller extra fields and bad session evidence are inert', () => {
  const m = new CapacityModel(policy()); const c = claim('strict');
  for (const overrides of [{ now: NaN }, { now: 10.5 }, { policyVersion: '1' },
    { freshEligibility: 1 }, { units: 0 }, { transcript: 'fictional-content' }]) {
    assert.equal(reserve(m, c, overrides), 'invalid-command');
  }
  assert.deepEqual(totals(m), { heldUnits: 0, occupied: 0 });
  reserve(m, c); mark(m, c);
  const before = m.snapshot();
  assert.equal(observe(m, c, 'operation-strict', 'bad', 'not-created', 'session-a'), 'invalid-command');
  assert.equal(observe(m, c, 'operation-strict', 'bad', 'ended', null), 'invalid-command');
  assert.deepEqual(m.snapshot(), before);
});

test('review: exact expiry fences an unstarted reservation; clock rollback cannot renew it', () => {
  const m = new CapacityModel(policy()); const c = claim('expires');
  reserve(m, c);
  assert.equal(mark(m, c, 'operation-expires', { now: 9 }), 'clock-denied');
  assert.equal(mark(m, c, 'operation-expires', { now: 100 }), 'eligibility-denied');
  assert.deepEqual(totals(m), { heldUnits: 3, occupied: 0 });
  assert.equal(mark(m, c, 'operation-expires', { now: 99 }), 'clock-denied');
  assert.equal(mark(m, c, 'operation-expires', { now: 101 }), 'retired');
});

test('review: missing/disabled policy denies allocation and disabled policy blocks a pending start', () => {
  const missing = new CapacityModel();
  assert.equal(reserve(missing, claim('missing')), 'policy-denied');
  const m = new CapacityModel(policy()); const c = claim('disabled'); reserve(m, c);
  m.apply({ type: 'policy', expectedVersion: 1, policy: policy({ version: 2, enabled: false }) });
  assert.equal(mark(m, c, 'operation-disabled', { policyVersion: 2 }), 'policy-denied');
  assert.equal(m.snapshot().claims.disabled.operationId, null);
  close(m, c);
  assert.deepEqual(totals(m), { heldUnits: 3, occupied: 0 });
});

test('review: completed operation IDs cannot be rebound to a replacement reservation', () => {
  const m = new CapacityModel(policy()); const a = claim('old-op'); const b = claim('new-op');
  reserve(m, a); mark(m, a, 'permanent-operation');
  observe(m, a, 'permanent-operation', 'final-op', 'not-created');
  reserve(m, b, { now: 12 });
  assert.equal(mark(m, b, 'permanent-operation', { now: 13 }), 'operation-conflict');
  assert.equal(m.snapshot().claims['new-op'].operationId, null);
  assert.deepEqual(totals(m), { heldUnits: 6, occupied: 1 });
});

test('review: one provider session identity cannot be attributed to two create operations', () => {
  const m = new CapacityModel(policy()); const a = claim('session-a'); const b = claim('session-b');
  reserve(m, a); reserve(m, b); mark(m, a); mark(m, b);
  observe(m, a, 'operation-session-a', 'created-a', 'created', 'provider-session');
  assert.equal(observe(m, b, 'operation-session-b', 'ended-b', 'ended', 'provider-session'), 'quarantined');
  assert.deepEqual(totals(m), { heldUnits: 6, occupied: 2 });
});

test('review: incompatible no-create and creation evidence quarantines without fabricating termination', () => {
  const m = new CapacityModel(policy()); const c = claim('conflicting-no-create');
  reserve(m, c); mark(m, c);
  observe(m, c, 'operation-conflicting-no-create', 'created', 'created', 'session-created');
  assert.equal(observe(m, c, 'operation-conflicting-no-create', 'no-create', 'not-created'), 'quarantined');
  assert.equal(m.snapshot().claims['conflicting-no-create'].terminal, null);
  assert.deepEqual(totals(m), { heldUnits: 3, occupied: 1 });
});

test('review: trusted eligibility loss during clock rollback remains terminal after clock recovery', () => {
  for (const alreadyMarked of [false, true]) {
    const m = new CapacityModel(policy()); const c = claim('revoked-clock');
    reserve(m, c, { now: 20 });
    if (alreadyMarked) mark(m, c, 'operation-revoked-clock', { now: 21 });
    mark(m, c, 'operation-revoked-clock', { now: 19, freshEligibility: false });
    assert.equal(m.snapshot().claims['revoked-clock'].closed, true,
      'An observed terminal eligibility loss must survive a simultaneous bad clock');
    assert.equal(mark(m, c, 'operation-revoked-clock', { now: 22, freshEligibility: true }), 'retired');
    assert.deepEqual(totals(m), { heldUnits: 3, occupied: alreadyMarked ? 1 : 0 });
  }
});

test('review: evidence identity rebound across existing owners quarantines both new-start paths', () => {
  const m = new CapacityModel(policy());
  const a = claim('owner-one'); const b = claim('owner-two', { ownerId: 'owner-b' });
  reserve(m, a); reserve(m, b); mark(m, a); mark(m, b);
  observe(m, a, 'operation-owner-one', 'global-evidence-id', 'created', 'session-one');
  assert.equal(observe(m, b, 'operation-owner-two', 'global-evidence-id', 'ended', 'session-two'), 'quarantined');
  assert.equal(m.snapshot().claims['owner-two'].terminal, null);
  assert.deepEqual(totals(m), { heldUnits: 6, occupied: 2 });
});

test('review: a late inconclusive observation cannot downgrade an already final operation', () => {
  for (const kind of ['ended', 'not-created']) {
    const m = new CapacityModel(policy()); const c = claim('final-then-unknown');
    reserve(m, c); mark(m, c);
    observe(m, c, 'operation-final-then-unknown', 'final-proof', kind,
      kind === 'ended' ? 'session-final' : null);
    const before = m.snapshot().claims['final-then-unknown'];
    assert.equal(observe(m, c, 'operation-final-then-unknown', 'late-unknown', 'unknown'), 'late-evidence');
    assert.deepEqual(m.snapshot().claims['final-then-unknown'], before);
    assert.deepEqual(totals(m), { heldUnits: 3, occupied: 0 });
  }
});
