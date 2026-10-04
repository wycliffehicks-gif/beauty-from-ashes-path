/**
 * TEST-ONLY reusable adapter scenarios. Run these with an isolated, disposable
 * harness for the eventual database adapter. Passing a simulated harness proves
 * only the scenarios/contract, not persistence, host isolation or recovery.
 * No route imports this module; no provider, authentication or network is used.
 */
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import {
  PILOT_CONTROL_VERSION, approvePilotParticipant, decidePilotAttempt, decideApprovedUsage,
  type AtomicPilotControlStore, type PilotControlState, type PilotAttemptRecord,
} from "../journey-participant-attempt";
import {
  USAGE_LEDGER_VERSION, decideUsageReservation,
  type UsagePolicy, type UsageLedger,
} from "../journey-usage-reservation";

export interface PilotStoreTestConnection {
  store: AtomicPilotControlStore;
  close(): Promise<void>;
}
export interface PilotStoreCommitGate {
  /** Resolves after evaluation, before any nextState is committed. */
  reached: Promise<void>;
  release(): void;
}
export interface PilotStoreAcceptanceHarness {
  /** Independent adapter instances, same authoritative test namespace. */
  connect(): Promise<PilotStoreTestConnection>;
  /** Administrative test setup only; request handling must never call these. */
  seed(pilotId: string, state: unknown): Promise<void>;
  remove(pilotId: string): Promise<void>;
  /** Read authoritative storage independently of a connection cache; missing is undefined. */
  readCommitted(pilotId: string): Promise<unknown>;
  setTime(timeMs: number): void;
  holdNextCommit(): PilotStoreCommitGate;
  failNextCommit(mode: "before-commit" | "after-commit-before-ack"): void;
  /** Discard the first evaluation; retry with fresh time/state as on a conflict. */
  retryNextEvaluation(change: { timeMs: number; state?: unknown }): void;
  /** Must release gates and close all resources, including on a failed check. */
  dispose(): Promise<void>;
}
export type PilotStoreHarnessFactory = () => Promise<PilotStoreAcceptanceHarness>;

const NOW = Date.parse("2026-10-04T15:00:00.000Z");
const PILOT = "fictional_pilot_store_01";
const OTHER_PILOT = "fictional_pilot_store_02";
const config = (pilotId = PILOT) => ({
  pilotId, hmacKeyId: "fictional_hmac_key_01", keyCheck: "fictional_key_check_01",
});
const policy: UsagePolicy = {
  budgetId: "fictional_budget_01", currency: "CAD",
  participantDay: { requests: 2, spendMicros: 200 },
  participantTotal: { requests: 2, spendMicros: 200 },
  globalDay: { requests: 2, spendMicros: 200 },
  globalTotal: { requests: 1, spendMicros: 100 },
};
const identity = (n = 1) => `fictional_identity_0${n}`;
const participant = (n = 1) => `fictional_participant_0${n}`;
function initialState(pilotId = PILOT): PilotControlState {
  return {
    version: PILOT_CONTROL_VERSION, ...config(pilotId),
    roster: [1, 2].map((n) => ({
      identityKey: identity(n), participantKey: participant(n),
      status: "approved", expiresAtMs: NOW + 60_000,
    })),
    attempts: [],
    usage: { version: USAGE_LEDGER_VERSION, budgetId: policy.budgetId, currency: "CAD", reservations: [] },
  };
}
function proposal(n = 1): PilotAttemptRecord {
  return {
    attemptId: `fictional_attempt_0${n}`, identityKey: identity(n), participantKey: participant(n),
    logicalRequestKey: `fictional_logical_0${n}`, requestFingerprint: `fictional_fingerprint_0${n}`,
    budgetId: policy.budgetId, currency: "CAD", pricingVersion: "fictional_pricing_01",
    reservedSpendMicros: 100, reservedUtcDay: null,
  };
}
async function resolveAttempt(store: AtomicPilotControlStore, n = 1, pilotId = PILOT) {
  const result = await store.transact(pilotId, (state, now) =>
    decidePilotAttempt(state, config(pilotId), proposal(n), now));
  assert.equal(result.ok, true, "fixture attempt should resolve");
  if (!result.ok) throw new Error("unreachable fixture refusal");
  return result;
}
async function reserve(store: AtomicPilotControlStore, n = 1, pilotId = PILOT) {
  const resolved = await resolveAttempt(store, n, pilotId);
  return store.transact(pilotId, (state, now) => decideApprovedUsage(
    state, config(pilotId), resolved.attempt, resolved.utcDay, now,
    (usage) => decideUsageReservation(usage, {
      attemptId: resolved.attempt.attemptId, participantKey: resolved.attempt.participantKey,
      requestFingerprint: resolved.attempt.requestFingerprint, utcDay: resolved.utcDay,
      pricingVersion: resolved.attempt.pricingVersion, reservedSpendMicros: 100,
    }, policy),
  ));
}
const reservations = (state: unknown) => ((state as PilotControlState).usage as UsageLedger).reservations;
type Scenario = { name: string; run(harness: PilotStoreAcceptanceHarness): Promise<void> };

/** Named cases let a real adapter reuse the same assertions without a fake store. */
export const pilotStoreAcceptanceScenarios: readonly Scenario[] = [
  {
    name: "independent handles contend for one final shared allowance",
    async run(h) {
      const a = await h.connect(), b = await h.connect();
      assert.notEqual(a.store, b.store, "connect must create independent adapter instances");
      const results = await Promise.all([reserve(a.store, 1), reserve(b.store, 2)]);
      assert.equal(results.filter((r) => r.ok).length, 1, "exactly one reservation may commit");
      assert.deepEqual(results.find((r) => !r.ok), { ok: false, code: "usage-global-total-limit" });
      const committed = await h.readCommitted(PILOT) as PilotControlState;
      assert.deepEqual(committed.attempts.map((row) => row.attemptId).sort(), [proposal(1).attemptId, proposal(2).attemptId]);
      const rows = reservations(committed), reserved = committed.attempts.filter((row) => row.reservedUtcDay !== null);
      assert.equal(rows.length, 1);
      assert.equal(reserved.length, 1);
      assert.deepEqual(rows[0], {
        attemptId: reserved[0].attemptId, participantKey: reserved[0].participantKey,
        requestFingerprint: reserved[0].requestFingerprint, utcDay: reserved[0].reservedUtcDay,
        pricingVersion: reserved[0].pricingVersion, reservedSpendMicros: reserved[0].reservedSpendMicros,
      });
    },
  },
  {
    name: "transaction success waits for committed state",
    async run(h) {
      const connection = await h.connect();
      await resolveAttempt(connection.store);
      const before = await h.readCommitted(PILOT), gate = h.holdNextCommit();
      let settled = false;
      const pending = reserve(connection.store).finally(() => { settled = true; });
      try {
        await Promise.race([
          gate.reached,
          pending.then(() => { throw new Error("success must not precede commit"); }),
        ]);
        // Drain result continuations; the reached/release barrier controls commit.
        await setImmediate();
        assert.equal(settled, false, "success must not precede commit");
        assert.deepEqual(await h.readCommitted(PILOT), before);
      } finally {
        gate.release();
        assert.deepEqual(await pending, { ok: true, code: "usage-reserved" });
      }
      const prior = before as PilotControlState, attempt = prior.attempts[0];
      assert.deepEqual(await h.readCommitted(PILOT), {
        ...prior,
        attempts: [{ ...attempt, reservedUtcDay: "2026-10-04" }],
        usage: { ...(prior.usage as UsageLedger), reservations: [{
          attemptId: attempt.attemptId, participantKey: attempt.participantKey,
          requestFingerprint: attempt.requestFingerprint, utcDay: "2026-10-04",
          pricingVersion: attempt.pricingVersion, reservedSpendMicros: attempt.reservedSpendMicros,
        }] },
      });
    },
  },
  {
    name: "close and reopen retains spend and the original attempt",
    async run(h) {
      const first = await h.connect();
      assert.equal((await reserve(first.store)).ok, true);
      const committed = await h.readCommitted(PILOT);
      await first.close();
      const reopened = await h.connect();
      assert.deepEqual(await reserve(reopened.store), { ok: false, code: "usage-attempt-already-reserved" });
      assert.deepEqual(await h.readCommitted(PILOT), committed);
    },
  },
  {
    name: "missing state remains missing rather than becoming fresh allowance",
    async run(h) {
      await h.remove(PILOT);
      const { store } = await h.connect();
      const observed: unknown[] = [];
      const [outcome] = await Promise.allSettled([store.transact(PILOT, (state, now) => {
        observed.push(state);
        return decidePilotAttempt(state, config(), proposal(), now);
      })]);
      // Both throwing on missing records and passing absence to the decision fail closed.
      for (const state of observed) assert.ok(state == null, "missing state must not become an initialized record");
      if (outcome.status === "fulfilled") assert.equal(outcome.value.ok, false);
      assert.equal(await h.readCommitted(PILOT), undefined);
    },
  },
  {
    name: "callback mutation followed by an exception cannot change committed state",
    async run(h) {
      const { store } = await h.connect(), before = await h.readCommitted(PILOT);
      await assert.rejects(store.transact(PILOT, (raw) => {
        (raw as { roster: Array<{ status: string }> }).roster[0].status = "revoked";
        throw new Error("FICTIONAL_CALLBACK_FAILURE");
      }));
      assert.deepEqual(await h.readCommitted(PILOT), before, "callback mutation must not alter committed state");
    },
  },
  {
    name: "read-only callback mutation and returned aliases cannot write state",
    async run(h) {
      const { store } = await h.connect(), before = await h.readCommitted(PILOT);
      const returned = await store.transact(PILOT, (raw) => {
        try {
          (raw as { roster: Array<{ status: string }> }).roster[0].status = "revoked";
        } catch (error) {
          // Detached frozen snapshots are also valid adapter protection.
          if (!(error instanceof TypeError)) throw error;
        }
        return { result: raw as PilotControlState };
      });
      try {
        (returned as unknown as { attempts: unknown[] }).attempts.push({ fictional: true });
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
      assert.deepEqual(await h.readCommitted(PILOT), before);

      // A write can share its nextState with its result. The caller must not gain
      // a mutable alias to the authoritative committed record through that result.
      const written = await store.transact(PILOT, (raw) => {
        const state = raw as PilotControlState;
        const nextState: PilotControlState = {
          ...state, roster: state.roster.map((row) => ({ ...row, status: "revoked" })),
        };
        return { result: nextState, nextState };
      });
      const committed = await h.readCommitted(PILOT);
      assert.deepEqual(committed, {
        ...before as PilotControlState,
        roster: (before as PilotControlState).roster.map((row) => ({ ...row, status: "revoked" })),
      });
      try {
        (written as unknown as { attempts: unknown[] }).attempts.push({ fictional: true });
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
      assert.deepEqual(await h.readCommitted(PILOT), committed, "returned result must not alias committed state");
    },
  },
  {
    name: "pre-commit failure leaves prior state intact and permits a later attempt",
    async run(h) {
      const { store } = await h.connect(), before = await h.readCommitted(PILOT);
      h.failNextCommit("before-commit");
      await assert.rejects(resolveAttempt(store));
      assert.deepEqual(await h.readCommitted(PILOT), before);
      assert.equal((await reserve(store)).ok, true);
    },
  },
  {
    name: "lost reservation acknowledgement retains spend after reopening",
    async run(h) {
      const first = await h.connect();
      await resolveAttempt(first.store);
      // The next write is the reservation; resolving the existing attempt is read-only.
      h.failNextCommit("after-commit-before-ack");
      await assert.rejects(reserve(first.store));
      const committed = await h.readCommitted(PILOT);
      assert.equal(reservations(committed).length, 1);
      await first.close();
      assert.deepEqual(await reserve((await h.connect()).store), { ok: false, code: "usage-attempt-already-reserved" });
      assert.deepEqual(await h.readCommitted(PILOT), committed);
    },
  },
  {
    name: "conflict retry obtains fresh transaction time and respects expiry",
    async run(h) {
      const { store } = await h.connect(), observed: unknown[] = [];
      h.retryNextEvaluation({ timeMs: NOW + 60_000 });
      const result = await store.transact(PILOT, (state, now) => {
        observed.push(now);
        return { result: approvePilotParticipant(state, config(), identity(), now) };
      });
      assert.ok(observed.length >= 2, "the injected conflict must cause a fresh evaluation");
      assert.equal(observed[0], NOW);
      assert.ok(observed.slice(1).every((time) => time === NOW + 60_000));
      assert.deepEqual(result, { ok: false, code: "participant-expired" });
    },
  },
  {
    name: "conflict retry reads intervening revocation and discards its first write",
    async run(h) {
      const { store } = await h.connect(), changed = initialState();
      const revoked = { ...changed, roster: changed.roster.map((row) => ({ ...row, status: "revoked" as const })) };
      h.retryNextEvaluation({ timeMs: NOW + 1, state: revoked });
      const result = await store.transact(PILOT, (state, now) =>
        decidePilotAttempt(state, config(), proposal(), now));
      assert.deepEqual(result, { ok: false, code: "participant-not-approved" });
      assert.deepEqual(await h.readCommitted(PILOT), revoked);
    },
  },
  {
    name: "one pilot cannot read or consume another pilot allowance",
    async run(h) {
      await h.seed(OTHER_PILOT, initialState(OTHER_PILOT));
      const { store } = await h.connect(), untouched = await h.readCommitted(OTHER_PILOT);
      assert.equal((await reserve(store)).ok, true);
      assert.deepEqual(await h.readCommitted(OTHER_PILOT), untouched);
      assert.equal((await reserve(store, 1, OTHER_PILOT)).ok, true);
      assert.equal(reservations(await h.readCommitted(PILOT)).length, 1);
      assert.equal(reservations(await h.readCommitted(OTHER_PILOT)).length, 1);
    },
  },
];

/** One fresh harness per scenario; test runners should also impose a deadline. */
export async function runPilotStoreAcceptanceScenario(factory: PilotStoreHarnessFactory, name: string) {
  const scenario = pilotStoreAcceptanceScenarios.find((candidate) => candidate.name === name);
  assert.ok(scenario, "unknown adapter acceptance scenario");
  const h = await factory();
  try {
    h.setTime(NOW);
    await h.seed(PILOT, initialState());
    await scenario.run(h);
  } finally {
    await h.dispose();
  }
}
