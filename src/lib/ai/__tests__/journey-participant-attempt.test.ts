// Fictional-only protocol tests. A serialized memory store is NOT a durable DB;
// the principal port is a stub, NOT authentication. The handwritten provider's
// live-model marker exercises the existing response contract, not model output.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentJourneyAiConsent } from "../journey-consent";
import {
  runApprovedJourneyBoundary,
  type ApprovedJourneyDeps,
} from "../journey-approved-flow.server";
import {
  canonicalJourneyRequest,
  createJourneyBindingTools,
  type JourneyHmacConfiguration,
} from "../journey-request-binding.server";
import {
  PILOT_CONTROL_VERSION,
  approvePilotParticipant,
  decidePilotAttempt,
  type AtomicPilotControlStore,
  type PilotControlDecision,
  type PilotControlState,
  type PilotAttemptRecord,
} from "../journey-participant-attempt";
import {
  USAGE_LEDGER_VERSION,
  type UsageLedger,
  type UsagePolicy,
} from "../journey-usage-reservation";
import {
  JOURNEY_MODEL_ID,
  type JourneyProviderRequest,
  type JourneyProviderResponse,
} from "../journey-generation";
import { parseJourneyRequest } from "../journey-contract";
import * as policyModule from "../journey-policy";

const NOW = Date.parse("2026-10-04T15:00:00.000Z");
const EXPIRY = NOW + 3_600_000;
const ISSUER = "https://fictional-auth.invalid";
const PRIVATE = "FICTIONAL_PRIVATE_DETAIL_NEVER_LOG";
const TEXT =
  "You chose only a little today, and that is enough to work with. What you named may have been carrying more weight than it looked like from outside. If it helps, you might notice one place where that weight eases, even slightly.";
const hmac = (): JourneyHmacConfiguration => ({
  pilotId: "fictional_pilot_01",
  hmacKeyId: "fictional_hmac_key_01",
  // PUBLIC TEST FIXTURE ONLY. Never suitable as a production secret.
  secret: Uint8Array.from({ length: 32 }, (_, i) => i + 1),
});
const principal = (n = 1) => ({ issuer: ISSUER, subject: `fictional_subject_${n}` });
const participant = (n = 1) => `fictional_participant_${n}`;
const policy = (): UsagePolicy => ({
  budgetId: "fictional_budget_01",
  currency: "CAD",
  participantDay: { requests: 10, spendMicros: 1_000 },
  participantTotal: { requests: 20, spendMicros: 2_000 },
  globalDay: { requests: 30, spendMicros: 3_000 },
  globalTotal: { requests: 40, spendMicros: 4_000 },
});
const pricing = () => ({ pricingVersion: "fictional_pricing_01", reservedSpendMicros: 100 });
const input = () => ({
  request: {
    day: 1,
    answerMeaningVersion: "v1",
    answers: ["q.state:heavy", "q.brought:tired", "q.brought:hope"],
    spiritual: false,
  },
  consent: currentJourneyAiConsent(),
});
const tools = () => createJourneyBindingTools(hmac());
function initialState(): PilotControlState {
  const binding = tools();
  return {
    version: PILOT_CONTROL_VERSION,
    ...binding.config,
    roster: [1, 2, 3, 4].map((n) => ({
      identityKey: binding.identityKey(principal(n)),
      participantKey: participant(n),
      status: "approved",
      expiresAtMs: EXPIRY,
    })),
    attempts: [],
    usage: {
      version: USAGE_LEDGER_VERSION,
      budgetId: policy().budgetId,
      currency: "CAD",
      reservations: [],
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** TEST ONLY. Hooks simulate committed admin changes before a lock is acquired. */
function memoryFixture(initial: unknown = initialState()) {
  let state = structuredClone(initial);
  let tail: Promise<unknown> = Promise.resolve();
  let evaluations = 0;
  const controls = {
    now: NOW,
    beforeEvaluation: undefined as undefined | ((ordinal: number) => Promise<void> | void),
    loseAcknowledgementAt: new Set<number>(),
    replayCallbacks: false,
  };
  const store: AtomicPilotControlStore = {
    transact<T>(
      pilotId: string,
      decide: (raw: unknown, now: unknown) => PilotControlDecision<T>,
    ): Promise<T> {
      const ordinal = ++evaluations;
      const next = tail.then(async () => {
        expect(pilotId).toBe(hmac().pilotId);
        await controls.beforeEvaluation?.(ordinal);
        const result = decide(state, controls.now);
        if (controls.replayCallbacks) expect(decide(state, controls.now)).toEqual(result);
        if (result.nextState) state = structuredClone(result.nextState);
        if (controls.loseAcknowledgementAt.has(ordinal)) throw new Error(PRIVATE);
        return structuredClone(result.result);
      });
      tail = next.catch(() => {});
      return next;
    },
  };
  return {
    store,
    controls,
    count: () => evaluations,
    read: () => structuredClone(state) as PilotControlState,
    replace: (next: unknown) => {
      state = structuredClone(next);
    },
    revoke: (n = 1) => {
      const current = structuredClone(state) as PilotControlState;
      state = {
        ...current,
        roster: current.roster.map((row) =>
          row.participantKey === participant(n) ? { ...row, status: "revoked" } : row,
        ),
      };
    },
  };
}
function harness(fixture = memoryFixture(), n = 1) {
  const verifyPrincipal = vi.fn(async (): Promise<unknown> => principal(n));
  const generate = vi.fn(
    async (_request: JourneyProviderRequest): Promise<JourneyProviderResponse> => ({
      ok: true,
      text: TEXT,
      model: JOURNEY_MODEL_ID,
      finishReason: "stop",
    }),
  );
  const createProvider = vi.fn(() => ({ provenance: "live-model" as const, generate }));
  const deps: ApprovedJourneyDeps = {
    env: { JOURNEY_AI_ENABLED: "true", JOURNEY_AI_RELEASE_READY: "true" },
    verifyPrincipal,
    expectedIssuer: ISSUER,
    hmac: hmac(),
    policy: policy(),
    pricing: pricing(),
    controlStore: fixture.store,
    createProvider,
  };
  return { fixture, deps, verifyPrincipal, generate, createProvider };
}
const reservations = (fixture: ReturnType<typeof memoryFixture>) =>
  (fixture.read().usage as UsageLedger).reservations;

let network: ReturnType<typeof vi.fn>;
let logs: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  network = vi.fn(() => {
    throw new Error("Network forbidden in fictional participant tests");
  });
  vi.stubGlobal("fetch", network);
  logs = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  expect(logs).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("server keyed binding and normalization", () => {
  it("uses deterministic opaque domain-separated HMACs and a private key copy", () => {
    const configuration = hmac();
    const first = createJourneyBindingTools(configuration);
    const identity = first.identityKey(principal());
    const logical = first.logicalRequestKey(
      participant(),
      canonicalJourneyRequest(input().request)!,
    );
    expect(identity).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set([identity, logical, first.config.keyCheck]).size).toBe(3);
    configuration.secret.fill(0);
    expect(first.identityKey(principal())).toBe(identity);
    expect(tools().identityKey(principal())).toBe(identity);
    expect(createJourneyBindingTools(configuration).config.keyCheck).not.toBe(
      first.config.keyCheck,
    );
    expect(first.identityKey(principal(2))).not.toBe(identity);
    expect(JSON.stringify([identity, logical, first.config])).not.toContain(principal().subject);
    expect(() => createJourneyBindingTools({ ...hmac(), secret: new Uint8Array(16) })).toThrow(
      "JOURNEY_BINDING_CONFIGURATION_INVALID",
    );
  });

  it("preserves prepared meaning for all 22 existing fictional fixtures across ten days", () => {
    const fixtures = JSON.parse(
      readFileSync(
        new URL("../../../../docs/pilot/fictional-ai-fixtures.v1.json", import.meta.url),
        "utf8",
      ),
    );
    expect(fixtures.validCases).toHaveLength(22);
    const days = new Set<number>();
    for (const item of fixtures.validCases) {
      const before = parseJourneyRequest(item.request);
      const canonical = canonicalJourneyRequest(item.request);
      const after = parseJourneyRequest(canonical);
      expect(before.ok && after.ok, item.id).toBe(true);
      if (!before.ok || !after.ok) throw new Error("Invalid fictional fixture");
      const preparedBefore = policyModule.prepareJourneyGeneration(before.request);
      const preparedAfter = policyModule.prepareJourneyGeneration(after.request);
      expect(preparedAfter.identity.canonicalIdentity, item.id).toBe(
        preparedBefore.identity.canonicalIdentity,
      );
      expect(preparedAfter.grounding.practiceRoutedBy, item.id).toBe(
        preparedBefore.grounding.practiceRoutedBy,
      );
      expect(preparedAfter.grounding.practice, item.id).toEqual(preparedBefore.grounding.practice);
      days.add(canonical!.day);
    }
    expect(days.size).toBe(10);
  });

  it("normalizes aliases/order and dormant faith-off choices only after strict validation", () => {
    const canonical = canonicalJourneyRequest(input().request);
    expect(
      canonicalJourneyRequest({
        ...input().request,
        answers: ["q.brought.6", "q.state.0", "q.brought.3"],
      }),
    ).toEqual(canonical);
    const off = { day: 8, answerMeaningVersion: "v2", answers: ["q.route:god"], spiritual: false };
    expect(canonicalJourneyRequest(off)).toEqual({ ...off, answers: [] });
    expect(off.answers).toEqual(["q.route:god"]);
    expect(canonicalJourneyRequest({ ...off, answers: ["q.route:god", "q.route:god"] })).toBeNull();
    expect(
      canonicalJourneyRequest({ ...off, answers: ["q.route:god", "q.route:self"] }),
    ).toBeNull();
    expect(canonicalJourneyRequest({ ...off, participantKey: participant() })).toBeNull();
    expect(canonicalJourneyRequest({ ...off, answers: ["q.route:invented"] })).toBeNull();
  });
});

describe("approved stable-attempt flow, fictional dependencies only", () => {
  it("approves, commits one random server attempt, reserves, then dispatches one stub", async () => {
    const h = harness();
    h.fixture.controls.beforeEvaluation = () => {
      expect(h.createProvider).not.toHaveBeenCalled();
    };
    const result = await runApprovedJourneyBoundary(input(), h.deps);
    expect(result.ok).toBe(true); // Software fixture only, no real generation.
    expect(h.fixture.count()).toBe(3);
    expect(h.fixture.read().attempts).toHaveLength(1);
    expect(h.fixture.read().attempts[0].attemptId).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(reservations(h.fixture)[0].attemptId).toBe(h.fixture.read().attempts[0].attemptId);
    expect(h.generate).toHaveBeenCalledTimes(1);
    const stored = JSON.stringify(h.fixture.read());
    for (const text of [
      principal().subject,
      ISSUER,
      "q.state",
      TEXT,
      "groundedPayload",
      "systemPolicy",
      PRIVATE,
    ])
      expect(stored).not.toContain(text);
  });

  it.each(["off", "unreleased", "consent", "extra-field", "caller-identity"])(
    "preserves %s refusal before authentication or storage",
    async (mode) => {
      const h = harness();
      let data: unknown = input();
      if (mode === "off") h.deps.env = {};
      if (mode === "unreleased") h.deps.env = { JOURNEY_AI_ENABLED: "true" };
      if (mode === "consent") data = { ...input(), consent: { accepted: true } };
      if (mode === "extra-field") data = { ...input(), attemptId: "caller_attempt_01" };
      if (mode === "caller-identity")
        data = {
          ...input(),
          request: { ...input().request, issuer: ISSUER, subject: principal().subject },
        };
      const result = await runApprovedJourneyBoundary(data, h.deps);
      expect(result).toEqual({
        ok: false,
        code:
          mode === "off"
            ? "ai-not-activated"
            : mode === "unreleased"
              ? "ai-not-released"
              : mode === "consent"
                ? "consent-invalid"
                : "invalid-request",
      });
      expect(h.verifyPrincipal).not.toHaveBeenCalled();
      expect(h.fixture.count()).toBe(0);
      expect(h.createProvider).not.toHaveBeenCalled();
    },
  );

  it.each(["missing", "wrong-issuer", "unapproved", "revoked", "expired", "throws", "malformed"])(
    "fails closed for %s identity/admission",
    async (mode) => {
      const h = harness();
      if (mode === "missing") h.verifyPrincipal.mockResolvedValue(null);
      if (mode === "wrong-issuer")
        h.verifyPrincipal.mockResolvedValue({ ...principal(), issuer: "https://other.invalid" });
      if (mode === "unapproved") h.verifyPrincipal.mockResolvedValue(principal(99));
      if (mode === "revoked") h.fixture.revoke();
      if (mode === "expired") h.fixture.controls.now = EXPIRY;
      if (mode === "throws") h.verifyPrincipal.mockRejectedValue(new Error(PRIVATE));
      if (mode === "malformed")
        h.verifyPrincipal.mockResolvedValue({ ...principal(), email: PRIVATE });
      expect(await runApprovedJourneyBoundary(input(), h.deps)).toEqual({
        ok: false,
        code: mode === "throws" ? "pilot-check-unavailable" : "pilot-not-verified",
      });
      expect(h.fixture.read().attempts).toHaveLength(0);
      expect(reservations(h.fixture)).toHaveLength(0);
      expect(h.createProvider).not.toHaveBeenCalled();
    },
  );

  it.each([
    "missing",
    "duplicate-roster",
    "remapped-participant",
    "wrong-key-id",
    "wrong-key-bytes",
    "invalid-time",
  ])("refuses %s control state without initializing/resetting lineage", async (mode) => {
    const h = harness();
    if (mode === "missing") h.fixture.replace(null);
    if (mode === "duplicate-roster") {
      const state = h.fixture.read();
      h.fixture.replace({ ...state, roster: [...state.roster, state.roster[0]] });
    }
    if (mode === "wrong-key-id")
      Object.assign(h.deps, { hmac: { ...hmac(), hmacKeyId: "fictional_new_key_02" } });
    if (mode === "wrong-key-bytes")
      Object.assign(h.deps, { hmac: { ...hmac(), secret: new Uint8Array(32).fill(42) } });
    if (mode === "invalid-time") h.fixture.controls.now = NaN;
    if (mode === "remapped-participant") {
      await runApprovedJourneyBoundary(input(), h.deps);
      const state = h.fixture.read();
      h.fixture.replace({
        ...state,
        roster: state.roster.map((row, i) =>
          i === 0 ? { ...row, participantKey: "fictional_reassigned_person" } : row,
        ),
      });
      h.createProvider.mockClear();
    }
    expect(await runApprovedJourneyBoundary(input(), h.deps)).toEqual({
      ok: false,
      code: "pilot-check-unavailable",
    });
    expect(h.createProvider).not.toHaveBeenCalled();
  });

  it("reuses one attempt across concurrent calls, fresh handlers and normalized aliases/order", async () => {
    const fixture = memoryFixture();
    const workers = Array.from({ length: 8 }, () => harness(fixture));
    const results = await Promise.all(
      workers.map((h) => runApprovedJourneyBoundary(input(), h.deps)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.filter((result) => !result.ok && result.code === "usage-attempt-already-reserved"),
    ).toHaveLength(7);
    expect(fixture.read().attempts).toHaveLength(1);
    expect(reservations(fixture)).toHaveLength(1);
    const original = fixture.read().attempts[0];
    const reload = harness(fixture);
    const aliases = {
      ...input(),
      request: { ...input().request, answers: ["q.brought.6", "q.state.0", "q.brought.3"] },
    };
    expect(await runApprovedJourneyBoundary(aliases, reload.deps)).toEqual({
      ok: false,
      code: "usage-attempt-already-reserved",
    });
    expect(fixture.read().attempts[0]).toEqual(original);
    expect(reload.createProvider).not.toHaveBeenCalled();
  });

  it("does not mint another attempt for faith-off hidden tokens that contribute no outgoing material", async () => {
    const h = harness();
    const data = {
      ...input(),
      request: { day: 8, answerMeaningVersion: "v2", answers: ["q.route:god"], spiritual: false },
    };
    await runApprovedJourneyBoundary(data, h.deps);
    expect(
      await runApprovedJourneyBoundary(
        { ...data, request: { ...data.request, answers: [] } },
        h.deps,
      ),
    ).toEqual({ ok: false, code: "usage-attempt-already-reserved" });
    expect(h.fixture.read().attempts).toHaveLength(1);
    expect(h.generate).toHaveBeenCalledTimes(1);
  });

  it.each([
    "price-version",
    "amount",
    "budget",
    "currency",
    "cap",
    "policy",
    "preparation-identity",
  ])("conflicts on %s drift instead of minting a new attempt", async (mode) => {
    const h = harness();
    await runApprovedJourneyBoundary(input(), h.deps);
    h.createProvider.mockClear();
    const before = h.fixture.read();
    if (mode === "price-version")
      Object.assign(h.deps, {
        pricing: { ...pricing(), pricingVersion: "fictional_new_price_02" },
      });
    if (mode === "amount")
      Object.assign(h.deps, { pricing: { ...pricing(), reservedSpendMicros: 101 } });
    if (mode === "budget")
      Object.assign(h.deps, { policy: { ...policy(), budgetId: "fictional_other_budget" } });
    if (mode === "currency") Object.assign(h.deps, { policy: { ...policy(), currency: "USD" } });
    if (mode === "cap")
      Object.assign(h.deps, {
        policy: { ...policy(), globalTotal: { requests: 99, spendMicros: 9999 } },
      });
    if (mode === "policy") {
      const original = policyModule.prepareJourneyGeneration;
      vi.spyOn(policyModule, "prepareJourneyGeneration").mockImplementation((request) => ({
        ...original(request),
        policy: "changed synthetic policy",
      }));
    }
    if (mode === "preparation-identity") {
      // The direct fingerprint test below checks the model field independently.
      const original = policyModule.prepareJourneyGeneration;
      vi.spyOn(policyModule, "prepareJourneyGeneration").mockImplementation((request) => {
        const prepared = original(request);
        return {
          ...prepared,
          identity: {
            ...prepared.identity,
            canonicalIdentity:
              prepared.identity.canonicalIdentity + "|fictional-preparation-change",
          },
        };
      });
    }
    expect(await runApprovedJourneyBoundary(input(), h.deps)).toEqual({
      ok: false,
      code: "usage-control-unavailable",
    });
    expect(h.fixture.read()).toEqual(before);
    expect(h.createProvider).not.toHaveBeenCalled();
  });

  it("binds model/output/validator/limits to the fingerprint independently of the logical request", async () => {
    const h = harness();
    await runApprovedJourneyBoundary(input(), h.deps);
    const request = canonicalJourneyRequest(input().request)!;
    const parsed = parseJourneyRequest(request);
    if (!parsed.ok) throw new Error("Invalid fixture");
    const prepared = policyModule.prepareJourneyGeneration(parsed.request);
    const binding = {
      request,
      preparationIdentity: prepared.identity,
      ...h.generate.mock.calls[0][0],
      generationVersion: "journey-gen2",
      outputVersion: "fixture-output-1",
      validatorVersion: "fixture-validator-1",
    };
    const t = tools();
    const fingerprint = t.dispatchFingerprint(binding, pricing(), policy());
    for (const changed of [
      { model: "fictional/other" },
      { maxOutputTokens: 123 },
      { deadlineMs: 123 },
      { outputVersion: "fixture-output-2" },
      { validatorVersion: "fixture-validator-2" },
    ]) {
      expect(t.dispatchFingerprint({ ...binding, ...changed }, pricing(), policy())).not.toBe(
        fingerprint,
      );
    }
  });

  it.each(["revoke", "expire", "remove-attempt", "utc-rollover"])(
    "rechecks %s in the usage commit after earlier approval",
    async (mode) => {
      const h = harness();
      const waiting = deferred<void>();
      const release = deferred<void>();
      h.fixture.controls.beforeEvaluation = async (ordinal) => {
        if (ordinal === 3) {
          waiting.resolve();
          await release.promise;
        }
      };
      const pending = runApprovedJourneyBoundary(input(), h.deps);
      await waiting.promise;
      expect(h.createProvider).not.toHaveBeenCalled();
      if (mode === "revoke") h.fixture.revoke();
      if (mode === "expire") h.fixture.controls.now = EXPIRY;
      if (mode === "remove-attempt") h.fixture.replace({ ...h.fixture.read(), attempts: [] });
      if (mode === "utc-rollover") {
        h.fixture.controls.now = Date.parse("2026-10-05T00:00:00.000Z");
        h.fixture.replace({
          ...h.fixture.read(),
          roster: h.fixture
            .read()
            .roster.map((row) => ({ ...row, expiresAtMs: NOW + 172_800_000 })),
        });
      }
      release.resolve();
      expect(await pending).toEqual({ ok: false, code: "usage-control-unavailable" });
      expect(reservations(h.fixture)).toHaveLength(0);
      expect(h.createProvider).not.toHaveBeenCalled();
      if (mode === "utc-rollover") {
        const attempt = h.fixture.read().attempts[0].attemptId;
        expect((await runApprovedJourneyBoundary(input(), h.deps)).ok).toBe(true);
        expect(reservations(h.fixture)[0]).toMatchObject({
          attemptId: attempt,
          utcDay: "2026-10-05",
        });
      }
    },
  );

  it.each([2, 3])(
    "handles lost acknowledgement at transaction %i without rotating the committed attempt",
    async (ordinal) => {
      const h = harness();
      h.fixture.controls.loseAcknowledgementAt.add(ordinal);
      expect(await runApprovedJourneyBoundary(input(), h.deps)).toEqual({
        ok: false,
        code: "usage-control-unavailable",
      });
      expect(h.createProvider).not.toHaveBeenCalled();
      const attempt = h.fixture.read().attempts[0].attemptId;
      const retry = harness(h.fixture);
      const result = await runApprovedJourneyBoundary(input(), retry.deps);
      expect(result.ok).toBe(ordinal === 2);
      if (ordinal === 3)
        expect(result).toEqual({ ok: false, code: "usage-attempt-already-reserved" });
      expect(h.fixture.read().attempts).toHaveLength(1);
      expect(h.fixture.read().attempts[0].attemptId).toBe(attempt);
      expect(retry.createProvider).toHaveBeenCalledTimes(ordinal === 2 ? 1 : 0);
    },
  );

  it("retains attempt and allowance during unknown dispatch outcome and after failure", async () => {
    const h = harness();
    const started = deferred<void>();
    const outcome = deferred<JourneyProviderResponse>();
    h.generate.mockImplementation(() => {
      started.resolve();
      return outcome.promise;
    });
    const pending = runApprovedJourneyBoundary(input(), h.deps);
    await started.promise;
    const retry = harness(h.fixture);
    expect(await runApprovedJourneyBoundary(input(), retry.deps)).toEqual({
      ok: false,
      code: "usage-attempt-already-reserved",
    });
    outcome.resolve({ ok: false, error: "provider-timeout" });
    expect(await pending).toEqual({ ok: false, code: "provider-timeout" });
    expect(await runApprovedJourneyBoundary(input(), retry.deps)).toEqual({
      ok: false,
      code: "usage-attempt-already-reserved",
    });
    expect(h.fixture.read().attempts).toHaveLength(1);
    expect(reservations(h.fixture)).toHaveLength(1);
    expect(retry.createProvider).not.toHaveBeenCalled();
  });

  it.each(["attempt", "usage", "marker"])(
    "refuses one-sided %s loss after dispatch instead of issuing another attempt",
    async (mode) => {
      const h = harness();
      await runApprovedJourneyBoundary(input(), h.deps);
      const before = h.fixture.read();
      expect(before.attempts[0].reservedUtcDay).toBe("2026-10-04");
      const damaged =
        mode === "attempt"
          ? { ...before, attempts: [] }
          : mode === "usage"
            ? { ...before, usage: { ...(before.usage as UsageLedger), reservations: [] } }
            : {
                ...before,
                attempts: before.attempts.map((row) => ({ ...row, reservedUtcDay: null })),
              };
      h.fixture.replace(damaged);
      const retry = harness(h.fixture);
      expect(await runApprovedJourneyBoundary(input(), retry.deps)).toEqual({
        ok: false,
        code: "pilot-check-unavailable",
      });
      expect(retry.createProvider).not.toHaveBeenCalled();
      expect(h.fixture.read()).toEqual(damaged);
    },
  );

  it("allows intentional different choices/participants only within the same shared allowance", async () => {
    const fixture = memoryFixture();
    const first = harness(fixture);
    const second = harness(fixture, 2);
    const third = harness(fixture, 3);
    for (const h of [first, second, third])
      Object.assign(h.deps, {
        policy: { ...policy(), globalTotal: { requests: 2, spendMicros: 200 } },
      });
    const changed = { ...input(), request: { ...input().request, answers: ["q.state:steady"] } };
    expect((await runApprovedJourneyBoundary(input(), first.deps)).ok).toBe(true);
    expect((await runApprovedJourneyBoundary(changed, first.deps)).ok).toBe(true);
    expect(await runApprovedJourneyBoundary(input(), second.deps)).toEqual({
      ok: false,
      code: "usage-global-total-limit",
    });
    expect(await runApprovedJourneyBoundary(input(), third.deps)).toEqual({
      ok: false,
      code: "usage-global-total-limit",
    });
    expect(fixture.read().attempts).toHaveLength(4);
    expect(reservations(fixture)).toHaveLength(2);
    expect(second.createProvider).not.toHaveBeenCalled();
    expect(third.createProvider).not.toHaveBeenCalled();
  });

  it("snapshots principal/config/request across asynchronous checks and keeps callback replay pure", async () => {
    const h = harness();
    h.fixture.controls.replayCallbacks = true;
    const verified = deferred<unknown>();
    h.verifyPrincipal.mockReturnValue(verified.promise);
    const data = input();
    const pending = runApprovedJourneyBoundary(data, h.deps);
    data.request.answers = ["q.state:steady"];
    data.request.spiritual = true;
    h.deps.hmac.secret.fill(0);
    Object.assign(h.deps.policy.globalTotal, { requests: 1, spendMicros: 1 });
    const rawPrincipal = principal();
    verified.resolve(rawPrincipal);
    const entered = deferred<void>();
    const release = deferred<void>();
    h.fixture.controls.beforeEvaluation = async (ordinal) => {
      if (ordinal === 1) {
        entered.resolve();
        await release.promise;
      }
    };
    await entered.promise;
    rawPrincipal.subject = "mutated_subject";
    release.resolve();
    expect((await pending).ok).toBe(true);
    expect(h.generate.mock.calls[0][0].groundedPayload).toContain(
      "Emotionally weighed down or worn out",
    );
    expect(h.generate.mock.calls[0][0].groundedPayload).not.toContain("Steadier than usual");
    expect(reservations(h.fixture)).toHaveLength(1);
    expect(h.generate).toHaveBeenCalledTimes(1);
  });
});

describe("pure roster and stable-attempt decisions", () => {
  it("does not initialize missing state or accept duplicate mapping/colliding attempt IDs", () => {
    const t = tools();
    const state = initialState();
    const identityKey = t.identityKey(principal());
    expect(approvePilotParticipant(undefined, t.config, identityKey, NOW)).toEqual({
      ok: false,
      code: "pilot-control-invalid",
    });
    const proposal: PilotAttemptRecord = {
      attemptId: "fictional_attempt_01",
      identityKey,
      participantKey: participant(),
      logicalRequestKey: "fictional_logical_01",
      requestFingerprint: "fictional_dispatch_01",
      ...pricing(),
      budgetId: policy().budgetId,
      currency: "CAD",
      reservedUtcDay: null,
    };
    const first = decidePilotAttempt(state, t.config, proposal, NOW);
    expect(first.result.ok).toBe(true);
    expect(state.attempts).toHaveLength(0);
    expect(
      decidePilotAttempt(
        first.nextState,
        t.config,
        { ...proposal, logicalRequestKey: "fictional_logical_02" },
        NOW,
      ).result,
    ).toEqual({ ok: false, code: "attempt-id-collision" });
    expect(
      decidePilotAttempt(
        first.nextState,
        t.config,
        { ...proposal, attemptId: "fictional_candidate_02", reservedSpendMicros: 101 },
        NOW,
      ).result,
    ).toEqual({ ok: false, code: "attempt-binding-conflict" });
    const reused = decidePilotAttempt(
      first.nextState,
      t.config,
      { ...proposal, attemptId: "fictional_candidate_03" },
      NOW,
    );
    expect(reused.result).toMatchObject({ ok: true, attempt: { attemptId: proposal.attemptId } });
    expect(reused.nextState).toBeUndefined();
  });
});
