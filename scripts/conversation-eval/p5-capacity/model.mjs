/**
 * OFFLINE EXECUTABLE CONTRACT, NOT AN AUTHENTICATOR, STORE OR DISPATCH GATE.
 * Commands are fictional, normalized trusted-boundary observations. No route
 * may import this model. Sequential JS transitions do not prove DB locking.
 * No network, timers, credentials, provider SDK or application imports.
 */

const CLAIM_KEYS = ['claimId', 'binding', 'expiresAt'];
const BINDING_KEYS = ['ownerId', 'threadId', 'threadIncarnation', 'threadRevision',
  'attemptId', 'approvalId', 'approvalDigest', 'scope'];
const POLICY_KEYS = ['poolId', 'version', 'activeLimit', 'totalUnitLimit',
  'unitsPerAttempt', 'enabled'];
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const safe = (v) => Number.isSafeInteger(v) && v >= 0;
const positive = (v) => safe(v) && v > 0;
const id = (v) => typeof v === 'string' && ID.test(v);
const exact = (v, keys) => v !== null && typeof v === 'object' &&
  !Array.isArray(v) && Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const claimOK = (v) => exact(v, CLAIM_KEYS) && id(v.claimId) && positive(v.expiresAt) &&
  exact(v.binding, BINDING_KEYS) && BINDING_KEYS.filter((k) =>
    !['threadRevision', 'approvalDigest', 'scope'].includes(k)).every((k) => id(v.binding[k])) &&
  safe(v.binding.threadRevision) && typeof v.binding.approvalDigest === 'string' &&
  /^[0-9a-f]{64}$/.test(v.binding.approvalDigest) && v.binding.scope === 'developer-voice-session';
const policyOK = (v) => exact(v, POLICY_KEYS) && id(v.poolId) && positive(v.version) &&
  safe(v.activeLimit) && safe(v.totalUnitLimit) && positive(v.unitsPerAttempt) &&
  typeof v.enabled === 'boolean';
const canonical = (v) => JSON.stringify(v, (_, x) => x && typeof x === 'object' &&
  !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x);
const same = (a, b) => canonical(a) === canonical(b);
const copy = (v) => structuredClone(v);
function freeze(v) {
  if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}
const attemptKey = (claim) => JSON.stringify([claim.binding.ownerId, claim.binding.attemptId]);

export class CapacityModel {
  #state;
  constructor(policy = null) {
    if (policy !== null && !policyOK(policy)) throw new TypeError('Invalid fictional policy');
    this.#state = {
      policy: copy(policy), clockHighWater: 0, heldUnits: 0, quarantined: false,
      claims: {}, attempts: {}, operations: {}, sessions: {}, observations: {}, conflicts: [],
    };
  }

  snapshot() { return freeze(copy(this.#state)); }

  /** A command is one proposed serialized transaction, not a real transaction.
   * freshEligibility is a fixture assertion; booleans cannot authenticate users.
   * Only reserve/mark-create use time; exact cleanup works after expiry.
   */
  apply(command) {
    const s = copy(this.#state);
    const outcome = this.#transition(s, copy(command));
    this.#check(s);
    this.#state = s;
    return freeze({ outcome, snapshot: this.snapshot() });
  }

  #transition(s, c) {
    if (!c || typeof c !== 'object') return 'invalid-command';
    if (c.type === 'policy') {
      if (!exact(c, ['type', 'expectedVersion', 'policy']) || !safe(c.expectedVersion) ||
          !policyOK(c.policy)) return 'invalid-command';
      if (c.expectedVersion !== (s.policy?.version ?? 0) ||
          c.policy.version !== c.expectedVersion + 1) return 'policy-conflict';
      if (s.policy && (c.policy.poolId !== s.policy.poolId ||
          c.policy.unitsPerAttempt !== s.policy.unitsPerAttempt)) return 'policy-conflict';
      s.policy = c.policy; // Never resets holdings, identities or quarantine.
      return 'policy-updated';
    }
    const shapes = {
      reserve: ['type', 'claim', 'policyVersion', 'now', 'freshEligibility'],
      'mark-create': ['type', 'claim', 'operationId', 'policyVersion', 'now', 'freshEligibility'],
      close: ['type', 'claim'],
      observe: ['type', 'claim', 'operationId', 'evidenceId', 'kind', 'sessionId'],
    };
    if (!Object.hasOwn(shapes, c.type) || !exact(c, shapes[c.type]) || !claimOK(c.claim))
      return 'invalid-command';
    const key = c.claim.claimId;
    const akey = attemptKey(c.claim);
    // Own-property lookup: labels such as 'constructor' are ordinary fixture IDs.
    const entry = Object.hasOwn(s.claims, key) ? s.claims[key] : null;
    if (entry && !same(entry.claim, c.claim)) return 'binding-conflict';
    if (c.type === 'close') {
      if (!entry) {
        s.claims[key] = { claim: c.claim, units: 0, policyVersion: null,
          closed: true, slot: 'released', stage: 'never-started', operationId: null,
          sessionId: null, terminal: null };
        if (!Object.hasOwn(s.attempts, akey)) s.attempts[akey] = key;
      } else {
        entry.closed = true;
        if (!entry.operationId) { entry.slot = 'released'; entry.stage = 'never-started'; }
      }
      return 'closed'; // Does not assert termination or change cumulative units.
    }
    if (c.type === 'observe') return this.#observe(s, entry, c);
    if (!safe(c.now) || !positive(c.policyVersion) || typeof c.freshEligibility !== 'boolean' ||
        (c.type === 'mark-create' && !id(c.operationId))) return 'invalid-command';
    // A trusted loss of eligibility is terminal even if the clock is behind.
    // Do not discard that fence and allow a later 'true' observation to revive it.
    if (!c.freshEligibility) {
      if (entry) {
        entry.closed = true;
        if (!entry.operationId) { entry.slot = 'released'; entry.stage = 'never-started'; }
      }
      return 'eligibility-denied';
    }
    if (c.now < s.clockHighWater) return 'clock-denied';
    s.clockHighWater = c.now;
    if (entry?.closed) return 'retired';
    // Expiry/revocation never releases a possibly-started operation. An exact
    // closed fence can safely retire an unstarted reservation in this model.
    if (c.now >= c.claim.expiresAt) {
      if (entry) {
        entry.closed = true;
        if (!entry.operationId) { entry.slot = 'released'; entry.stage = 'never-started'; }
      }
      return 'eligibility-denied';
    }
    if (s.quarantined) return 'quarantined';
    const p = s.policy;
    if (!p || !p.enabled || p.version !== c.policyVersion) return 'policy-denied';
    const occupied = Object.values(s.claims).filter((r) => r.slot === 'held').length;
    if (c.type === 'reserve') {
      if (entry) return 'retained'; // Observation only; never a dispatch permit.
      if (Object.hasOwn(s.attempts, akey)) return 'attempt-retired';
      if (occupied >= p.activeLimit || p.unitsPerAttempt > p.totalUnitLimit - s.heldUnits)
        return 'capacity-denied';
      s.heldUnits += p.unitsPerAttempt;
      s.attempts[akey] = key;
      s.claims[key] = { claim: c.claim, units: p.unitsPerAttempt, policyVersion: p.version,
        closed: false, slot: 'held', stage: 'reserved', operationId: null,
        sessionId: null, terminal: null };
      return 'reserved';
    }
    if (!entry || entry.slot !== 'held') return 'missing-reservation';
    if (entry.operationId) return entry.operationId === c.operationId ? 'already-marked' : 'operation-conflict';
    // A limit reduction never evicts uncertain work or clears historical units.
    // It does prevent pending reservations from starting above the new ceiling.
    if (occupied > p.activeLimit || s.heldUnits > p.totalUnitLimit) return 'capacity-denied';
    if (Object.hasOwn(s.operations, c.operationId)) return 'operation-conflict';
    s.operations[c.operationId] = key;
    entry.operationId = c.operationId;
    entry.stage = 'possibly-started';
    return 'marked'; // A fixture transition. Never call a provider from this file.
  }

  #observe(s, entry, c) {
    if (!id(c.operationId) || !id(c.evidenceId) ||
        !['created', 'ended', 'not-created', 'unknown'].includes(c.kind) ||
        (['created', 'ended'].includes(c.kind) ? !id(c.sessionId) : c.sessionId !== null))
      return 'invalid-command';
    if (!entry || entry.operationId !== c.operationId) return 'operation-conflict';
    const old = Object.hasOwn(s.observations, c.evidenceId) ? s.observations[c.evidenceId] : null;
    if (old) {
      if (same(old, c)) return 'duplicate-evidence';
      return this.#conflict(s, c, 'evidence-rebound');
    }
    s.observations[c.evidenceId] = c;
    if (c.kind === 'unknown') return entry.terminal !== null ? 'late-evidence' : 'uncertain';
    // Session IDs are normalized within this immutable pool/provider namespace.
    // A late callback cannot give a replacement ownership of an old session.
    if (c.sessionId !== null) {
      if (Object.hasOwn(s.sessions, c.sessionId) && s.sessions[c.sessionId] !== c.operationId)
        return this.#conflict(s, c, 'session-rebound');
      s.sessions[c.sessionId] = c.operationId;
    }
    if (c.kind === 'created') {
      if (entry.terminal === 'not-created' ||
          (entry.sessionId !== null && entry.sessionId !== c.sessionId))
        return this.#conflict(s, c, 'session-contradiction');
      entry.sessionId = c.sessionId;
      // The same session's delayed creation ACK cannot revive a released slot.
      return entry.terminal === 'ended' ? 'late-evidence' : 'creation-observed';
    }
    if ((entry.terminal !== null && entry.terminal !== c.kind) ||
        (c.kind === 'not-created' && entry.sessionId !== null) ||
        (c.kind === 'ended' && entry.sessionId !== null && entry.sessionId !== c.sessionId))
      return this.#conflict(s, c, 'terminal-contradiction');
    entry.terminal = c.kind;
    entry.sessionId = c.sessionId;
    entry.closed = true;
    entry.stage = 'terminal';
    entry.slot = 'released';
    return 'terminal-recorded';
  }

  #conflict(s, c, reason) {
    s.quarantined = true;
    // Keep the conflicting normalized identity too, not just the first receipt.
    // No provider payload, transcript, token or monetary amount is admitted.
    const conflict = { observation: c, reason };
    if (!s.conflicts.some((v) => same(v, conflict))) s.conflicts.push(conflict);
    return 'quarantined';
  }

  #check(s) {
    const entries = Object.values(s.claims);
    if (!safe(s.heldUnits) || entries.reduce((n, r) => n + r.units, 0) !== s.heldUnits)
      throw new Error('Invariant: cumulative units');
    for (const r of entries) {
      if (r.slot === 'released' && r.operationId !== null && r.terminal === null)
        throw new Error('Invariant: ambiguous operation released');
      if (r.slot === 'held' && r.units <= 0) throw new Error('Invariant: unreserved slot');
      if (r.operationId !== null && s.operations[r.operationId] !== r.claim.claimId)
        throw new Error('Invariant: operation ownership');
    }
  }
}
