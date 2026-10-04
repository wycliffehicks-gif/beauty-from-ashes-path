// Offline orchestration simulation only. Memory serialization is NOT durability;
// fake identities/HMACs/prices are NOT admission, cryptography or billing proof.
// The handwritten provider uses the live-model protocol marker solely to exercise
// the existing boundary contract. No output here came from a model or is saved.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentJourneyAiConsent } from "../journey-consent";
import { runJourneyBoundary, type PilotAdmission } from "../journey-boundary";
import {
  runReservedJourneyBoundary,
  type JourneyDispatchBinding,
  type ReservedJourneyDeps,
  type TrustedJourneyUsageContext,
} from "../journey-reserved-flow";
import {
  JOURNEY_MODEL_ID,
  JOURNEY_MAX_PREPARED_CHARS,
  type JourneyProviderRequest,
  type JourneyProviderResponse,
} from "../journey-generation";
import * as policyModule from "../journey-policy";
import {
  USAGE_LEDGER_VERSION,
  type AtomicUsageStore,
  type UsageLedger,
  type UsagePolicy,
  type UsageReservation,
} from "../journey-usage-reservation";

const ENV_ON = { JOURNEY_AI_ENABLED: "true", JOURNEY_AI_RELEASE_READY: "true" };
const SENTINEL = "FICTIONAL_PRIVATE_ERROR_DETAIL_DO_NOT_RETURN";
const TEXT =
  "You chose only a little today, and that is enough to work with. What you named may have been carrying more weight than it looked like from outside. If it helps, you might notice one place where that weight eases, even slightly.";
const input = () => ({
  request: { day: 1, answerMeaningVersion: "v1", answers: ["q.state:heavy"], spiritual: false },
  consent: currentJourneyAiConsent(),
});
const policy = (): UsagePolicy => ({
  budgetId: "fictional_budget_01",
  currency: "CAD",
  participantDay: { requests: 10, spendMicros: 1_000 },
  participantTotal: { requests: 20, spendMicros: 2_000 },
  globalDay: { requests: 30, spendMicros: 3_000 },
  globalTotal: { requests: 40, spendMicros: 4_000 },
});
const reservation = (extra: Partial<UsageReservation> = {}): UsageReservation => ({
  attemptId: "fictional_attempt_01",
  participantKey: "fictional_person_01",
  requestFingerprint: "fictional_keyed_fingerprint_01",
  utcDay: "2026-10-04",
  pricingVersion: "fictional_pricing_01",
  reservedSpendMicros: 100,
  ...extra,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** TEST ONLY: a shared serialized memory ledger, never a production adapter. */
function memoryFixture(events: string[] = []) {
  let ledger: UsageLedger = {
    version: USAGE_LEDGER_VERSION,
    budgetId: policy().budgetId,
    currency: "CAD",
    reservations: [],
  };
  let tail: Promise<unknown> = Promise.resolve();
  const store: AtomicUsageStore = {
    transact: vi.fn((budgetId, decide) => {
      const next = tail.then(() => {
        expect(budgetId).toBe(ledger.budgetId);
        events.push("transaction");
        const decision = decide(ledger);
        if (decision.nextLedger) {
          ledger = decision.nextLedger;
          events.push("commit");
        }
        return decision.result;
      });
      tail = next.catch(() => {});
      return next;
    }),
  };
  return { store, read: () => ledger };
}
function harness(
  options: {
    events?: string[];
    store?: AtomicUsageStore;
    reservation?: UsageReservation;
    policy?: UsagePolicy;
  } = {},
) {
  const events = options.events ?? [];
  const fixture = memoryFixture(events);
  const store = options.store ?? fixture.store;
  const generate = vi.fn(
    async (_request: JourneyProviderRequest): Promise<JourneyProviderResponse> => {
      events.push("dispatch");
      return { ok: true as const, text: TEXT, model: JOURNEY_MODEL_ID, finishReason: "stop" };
    },
  );
  const createProvider = vi.fn(() => {
    events.push("factory");
    return { provenance: "live-model" as const, generate };
  });
  const verifyPilotAdmission = vi.fn(async (): Promise<PilotAdmission> => {
    events.push("admission");
    return { ok: true };
  });
  const resolveUsageContext = vi.fn(
    async (binding: JourneyDispatchBinding): Promise<TrustedJourneyUsageContext> => {
      events.push("context");
      return {
        binding,
        reservation: options.reservation ?? reservation(),
        policy: options.policy ?? policy(),
        store,
      };
    },
  );
  const deps: ReservedJourneyDeps = {
    env: ENV_ON,
    verifyPilotAdmission,
    resolveUsageContext,
    createProvider,
  };
  return {
    deps,
    fixture,
    store,
    generate,
    createProvider,
    verifyPilotAdmission,
    resolveUsageContext,
    events,
  };
}

let network: ReturnType<typeof vi.fn>;
beforeEach(() => {
  network = vi.fn(() => {
    throw new Error("Network forbidden in offline reservation simulation");
  });
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("dormant reserved orchestration, simulated dependencies only", () => {
  it("orders existing checks, exact binding, committed reservation, lazy factory and one dispatch", async () => {
    const h = harness();
    const result = await runReservedJourneyBoundary(input(), h.deps);
    expect(result.ok).toBe(true); // Handwritten protocol response, NOT a model result.
    expect(h.events).toEqual([
      "admission",
      "context",
      "transaction",
      "commit",
      "factory",
      "dispatch",
    ]);
    const binding = h.resolveUsageContext.mock.calls[0][0];
    const dispatched = h.generate.mock.calls[0][0];
    expect(dispatched).toEqual({
      systemPolicy: binding.systemPolicy,
      groundedPayload: binding.groundedPayload,
      model: binding.model,
      maxOutputTokens: binding.maxOutputTokens,
      deadlineMs: binding.deadlineMs,
    });
    expect(binding).toMatchObject({
      generationVersion: "journey-gen2",
      model: JOURNEY_MODEL_ID,
      maxOutputTokens: 4096,
      deadlineMs: 45_000,
    });
    expect(binding.outputVersion).toBeTruthy();
    expect(binding.validatorVersion).toBeTruthy();
    expect(Object.isFrozen(binding.request.answers)).toBe(true);
    expect(Object.isFrozen(binding.preparationIdentity)).toBe(true);
    expect(h.fixture.read().reservations).toEqual([reservation()]);
    expect(JSON.stringify(h.fixture.read())).not.toContain("q.state");
    expect(JSON.stringify(h.fixture.read())).not.toContain(binding.systemPolicy);
    expect(h.createProvider).toHaveBeenCalledTimes(1);
    expect(h.generate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["activation", "ai-not-activated"],
    ["release", "ai-not-released"],
    ["envelope", "invalid-request"],
    ["consent", "consent-not-accepted"],
    ["stale-consent", "consent-version-stale"],
    ["request", "invalid-request"],
    ["admission", "pilot-not-verified"],
    ["admission-error", "pilot-check-unavailable"],
  ])(
    "preserves %s refusal without requesting context or touching storage",
    async (scenario, code) => {
      const h = harness();
      const data = input();
      let candidate: unknown = data;
      if (scenario === "activation") h.deps.env = {};
      if (scenario === "release") h.deps.env = { JOURNEY_AI_ENABLED: "true" };
      if (scenario === "envelope") candidate = { ...data, attemptId: "caller_cannot_supply_this" };
      if (scenario === "consent")
        candidate = { ...data, consent: { ...data.consent, accepted: false } };
      if (scenario === "stale-consent")
        candidate = { ...data, consent: { ...data.consent, disclosureVersion: "old" } };
      if (scenario === "request")
        candidate = {
          ...data,
          request: { ...data.request, participantKey: "caller_cannot_supply_this" },
        };
      if (scenario === "admission")
        h.verifyPilotAdmission.mockResolvedValue({ ok: false, reason: "not-verified" });
      if (scenario === "admission-error")
        h.verifyPilotAdmission.mockRejectedValue(new Error(SENTINEL));
      expect(await runReservedJourneyBoundary(candidate, h.deps)).toEqual({ ok: false, code });
      expect(h.resolveUsageContext).not.toHaveBeenCalled();
      expect(h.store.transact).not.toHaveBeenCalled();
      expect(h.createProvider).not.toHaveBeenCalled();
      if (!["admission", "admission-error"].includes(scenario))
        expect(h.verifyPilotAdmission).not.toHaveBeenCalled();
    },
  );

  it("rejects oversized preparation before context, spending or provider construction", async () => {
    const realPrepare = policyModule.prepareJourneyGeneration;
    vi.spyOn(policyModule, "prepareJourneyGeneration").mockImplementation((request) => ({
      ...realPrepare(request),
      policy: "x".repeat(JOURNEY_MAX_PREPARED_CHARS + 1),
    }));
    const h = harness();
    expect(await runReservedJourneyBoundary(input(), h.deps)).toEqual({
      ok: false,
      code: "preparation-too-large",
    });
    expect(h.resolveUsageContext).not.toHaveBeenCalled();
    expect(h.store.transact).not.toHaveBeenCalled();
    expect(h.createProvider).not.toHaveBeenCalled();
  });

  it("bounds a preparation exception without spending or exposing source detail", async () => {
    vi.spyOn(policyModule, "prepareJourneyGeneration").mockImplementation(() => {
      throw new Error(SENTINEL);
    });
    const h = harness();
    expect(await runReservedJourneyBoundary(input(), h.deps)).toEqual({
      ok: false,
      code: "provider-unavailable",
    });
    expect(h.resolveUsageContext).not.toHaveBeenCalled();
    expect(h.store.transact).not.toHaveBeenCalled();
    expect(h.createProvider).not.toHaveBeenCalled();
  });

  it("detaches caller answers before admission awaits, including for the unchanged public boundary", async () => {
    for (const run of [runReservedJourneyBoundary, runJourneyBoundary]) {
      const h = harness();
      const gate = deferred<PilotAdmission>();
      const data = input();
      h.verifyPilotAdmission.mockReturnValue(gate.promise);
      const pending = run(data, h.deps);
      data.request.answers.splice(0, 1, "q.state:steady");
      data.request.day = 2;
      data.request.spiritual = true;
      gate.resolve({ ok: true });
      expect((await pending).ok).toBe(true);
      const payload = JSON.parse(h.generate.mock.calls[0][0].groundedPayload);
      expect(payload.day).toBe(1);
      expect(h.generate.mock.calls[0][0].groundedPayload).toContain(
        "Emotionally weighed down or worn out",
      );
      expect(h.generate.mock.calls[0][0].groundedPayload).not.toContain("Steadier than usual");
      if (run === runReservedJourneyBoundary)
        expect(h.resolveUsageContext.mock.calls[0][0].request).toEqual(input().request);
    }
  });

  it("holds factory until commit and detaches policy/reservation across transaction suspension", async () => {
    const fixture = memoryFixture();
    const entered = deferred<void>();
    const release = deferred<void>();
    const originalReservation = { ...reservation() };
    const originalPolicy = policy();
    const heldStore: AtomicUsageStore = {
      transact: async (budgetId, decide) => {
        entered.resolve();
        await release.promise;
        return fixture.store.transact(budgetId, decide);
      },
    };
    const h = harness({
      store: heldStore,
      reservation: originalReservation,
      policy: originalPolicy,
    });
    const pending = runReservedJourneyBoundary(input(), h.deps);
    await entered.promise;
    expect(h.createProvider).not.toHaveBeenCalled();
    originalReservation.attemptId = "fictional_mutated_attempt";
    originalReservation.reservedSpendMicros = 1_000_000;
    Object.assign(originalPolicy.globalTotal, { requests: 1, spendMicros: 1 });
    h.deps.createProvider = vi.fn(() => {
      throw new Error("late factory must not replace captured factory");
    });
    release.resolve();
    expect((await pending).ok).toBe(true);
    expect(fixture.read().reservations).toEqual([reservation()]);
    expect(h.createProvider).toHaveBeenCalledTimes(1);
    expect(h.deps.createProvider).not.toHaveBeenCalled();
  });

  it("keeps the exact prepared payload across context suspension without freezing the source", async () => {
    const realPrepare = policyModule.prepareJourneyGeneration;
    let source: ReturnType<typeof realPrepare> | undefined;
    vi.spyOn(policyModule, "prepareJourneyGeneration").mockImplementation((request) => {
      source = realPrepare(request);
      return source;
    });
    const h = harness();
    const entered = deferred<JourneyDispatchBinding>();
    const release = deferred<void>();
    h.resolveUsageContext.mockImplementation(async (binding) => {
      entered.resolve(binding);
      await release.promise;
      return { binding, reservation: reservation(), policy: policy(), store: h.store };
    });
    const pending = runReservedJourneyBoundary(input(), h.deps);
    const binding = await entered.promise;
    expect(Object.isFrozen(source)).toBe(false);
    source!.policy = SENTINEL;
    source!.groundedPayload = SENTINEL;
    source!.identity.canonicalIdentity = SENTINEL;
    source!.grounding.selections[0].labels[0] = SENTINEL;
    release.resolve();
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(h.generate.mock.calls[0][0].groundedPayload).toBe(binding.groundedPayload);
    expect(JSON.stringify(result)).not.toContain(SENTINEL);
  });

  it.each([
    "model",
    "maxOutputTokens",
    "generationVersion",
    "groundedPayload",
    "request",
    "preparationIdentity",
  ])("rejects mismatched trusted %s binding before storage", async (field) => {
    const h = harness();
    h.resolveUsageContext.mockImplementation(async (binding) => ({
      binding: { ...binding, [field]: SENTINEL } as unknown as JourneyDispatchBinding,
      reservation: reservation(),
      policy: policy(),
      store: h.store,
    }));
    expect(await runReservedJourneyBoundary(input(), h.deps)).toEqual({
      ok: false,
      code: "usage-attempt-conflict",
    });
    expect(h.store.transact).not.toHaveBeenCalled();
    expect(h.createProvider).not.toHaveBeenCalled();
  });

  it("refuses missing context/store and malformed pricing without dispatch or error disclosure", async () => {
    for (const mode of ["throws", "malformed", "no-store", "invalid-price"] as const) {
      const h = harness();
      h.resolveUsageContext.mockImplementation(async (binding) => {
        if (mode === "throws") throw new Error(SENTINEL);
        if (mode === "malformed") return {} as TrustedJourneyUsageContext;
        return {
          binding,
          reservation: reservation(mode === "invalid-price" ? { reservedSpendMicros: 0 } : {}),
          policy: policy(),
          store: mode === "no-store" ? undefined : h.store,
        };
      });
      expect(await runReservedJourneyBoundary(input(), h.deps)).toEqual({
        ok: false,
        code:
          mode === "invalid-price" ? "usage-configuration-invalid" : "usage-control-unavailable",
      });
      expect(h.store.transact).not.toHaveBeenCalled();
      expect(h.createProvider).not.toHaveBeenCalled();
    }
  });

  it("serializes same-attempt concurrent retries and fresh-instance/next-day retries through one shared ledger", async () => {
    const fixture = memoryFixture();
    const workers = Array.from({ length: 8 }, () => harness({ store: fixture.store }));
    const results = await Promise.all(
      workers.map((h) => runReservedJourneyBoundary(input(), h.deps)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.filter((result) => !result.ok && result.code === "usage-attempt-already-reserved"),
    ).toHaveLength(7);
    expect(workers.reduce((n, h) => n + h.generate.mock.calls.length, 0)).toBe(1);
    // New orchestration dependencies model a reload; shared memory is NOT a restart-proof store.
    const nextVisit = harness({
      store: fixture.store,
      reservation: reservation({ utcDay: "2026-10-05" }),
    });
    expect(await runReservedJourneyBoundary(input(), nextVisit.deps)).toEqual({
      ok: false,
      code: "usage-attempt-already-reserved",
    });
    expect(nextVisit.createProvider).not.toHaveBeenCalled();
    expect(fixture.read().reservations).toHaveLength(1);
  });

  it.each([
    { participantKey: "fictional_other_person" },
    { requestFingerprint: "fictional_other_fingerprint" },
    { pricingVersion: "fictional_other_pricing" },
    { reservedSpendMicros: 101 },
  ])("rejects reuse with conflicting trusted reservation binding %j", async (changed) => {
    const first = harness();
    await runReservedJourneyBoundary(input(), first.deps);
    const retry = harness({ store: first.store, reservation: reservation(changed) });
    expect(await runReservedJourneyBoundary(input(), retry.deps)).toEqual({
      ok: false,
      code: "usage-attempt-conflict",
    });
    expect(retry.createProvider).not.toHaveBeenCalled();
  });

  it("enforces a shared global ceiling across simulated participants before any excess factory", async () => {
    const fixture = memoryFixture();
    const cappedPolicy = { ...policy(), globalTotal: { requests: 2, spendMicros: 200 } };
    const workers = Array.from({ length: 8 }, (_, index) =>
      harness({
        store: fixture.store,
        policy: cappedPolicy,
        reservation: reservation({
          attemptId: `fictional_attempt_${index}`,
          participantKey: `fictional_person_${index}`,
        }),
      }),
    );
    const results = await Promise.all(
      workers.map((h) => runReservedJourneyBoundary(input(), h.deps)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(2);
    expect(
      results.filter((result) => !result.ok && result.code === "usage-global-total-limit"),
    ).toHaveLength(6);
    expect(workers.reduce((n, h) => n + h.createProvider.mock.calls.length, 0)).toBe(2);
    expect(fixture.read().reservations).toHaveLength(2);
  });

  it("supplies a changed request to the trusted binding port, whose conflicting fingerprint cannot reuse an attempt", async () => {
    const h = harness();
    h.resolveUsageContext.mockImplementation(async (binding) => ({
      binding,
      policy: policy(),
      store: h.store,
      // TEST-ONLY stand-ins for the future keyed fingerprint, not cryptography.
      reservation: reservation({
        requestFingerprint: binding.request.answers.includes("q.state:heavy")
          ? "fictional_heavy_fingerprint"
          : "fictional_steady_fingerprint",
      }),
    }));
    expect((await runReservedJourneyBoundary(input(), h.deps)).ok).toBe(true);
    const changed = input();
    changed.request.answers = ["q.state:steady"];
    expect(await runReservedJourneyBoundary(changed, h.deps)).toEqual({
      ok: false,
      code: "usage-attempt-conflict",
    });
    expect(h.resolveUsageContext.mock.calls[1][0].groundedPayload).not.toBe(
      h.resolveUsageContext.mock.calls[0][0].groundedPayload,
    );
    expect(h.generate).toHaveBeenCalledTimes(1);
  });

  it("blocks another dispatch while the first outcome remains unresolved", async () => {
    const h = harness();
    const started = deferred<void>();
    const settle = deferred<JourneyProviderResponse>();
    h.generate.mockImplementation(() => {
      started.resolve();
      return settle.promise;
    });
    const first = runReservedJourneyBoundary(input(), h.deps);
    await started.promise;
    const retry = harness({ store: h.store });
    expect(await runReservedJourneyBoundary(input(), retry.deps)).toEqual({
      ok: false,
      code: "usage-attempt-already-reserved",
    });
    expect(retry.createProvider).not.toHaveBeenCalled();
    settle.resolve({ ok: false, error: "provider-timeout" });
    expect(await first).toEqual({ ok: false, code: "provider-timeout" });
    expect(h.fixture.read().reservations).toEqual([reservation()]);
  });

  it.each(["factory", "throw", "timeout", "rejected-output"])(
    "retains allowance after %s failure and never automatically retries/refunds",
    async (mode) => {
      const h = harness();
      if (mode === "factory")
        h.createProvider.mockImplementation(() => {
          throw new Error(SENTINEL);
        });
      if (mode === "throw") h.generate.mockRejectedValue(new Error(SENTINEL));
      if (mode === "timeout")
        h.generate.mockImplementation(async () => ({ ok: false, error: "provider-timeout" }));
      if (mode === "rejected-output")
        h.generate.mockImplementation(async () => ({
          ok: true,
          text: "",
          model: JOURNEY_MODEL_ID,
          finishReason: "stop",
        }));
      const result = await runReservedJourneyBoundary(input(), h.deps);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain(SENTINEL);
      const retry = harness({ store: h.store });
      expect(await runReservedJourneyBoundary(input(), retry.deps)).toEqual({
        ok: false,
        code: "usage-attempt-already-reserved",
      });
      expect(retry.createProvider).not.toHaveBeenCalled();
      expect(h.generate).toHaveBeenCalledTimes(mode === "factory" ? 0 : 1);
      expect(h.fixture.read().reservations).toEqual([reservation()]);
    },
  );

  it("does not redispatch after commit acknowledgement is lost", async () => {
    const fixture = memoryFixture();
    const ackLost: AtomicUsageStore = {
      transact: async (budgetId, decide) => {
        await fixture.store.transact(budgetId, decide);
        throw new Error(SENTINEL);
      },
    };
    const first = harness({ store: ackLost });
    expect(await runReservedJourneyBoundary(input(), first.deps)).toEqual({
      ok: false,
      code: "usage-control-unavailable",
    });
    expect(first.createProvider).not.toHaveBeenCalled();
    const retry = harness({ store: fixture.store });
    expect(await runReservedJourneyBoundary(input(), retry.deps)).toEqual({
      ok: false,
      code: "usage-attempt-already-reserved",
    });
    expect(retry.createProvider).not.toHaveBeenCalled();
    expect(fixture.read().reservations).toHaveLength(1);
  });

  it("keeps transaction callback replay pure and creates the provider only once after commit", async () => {
    const fixture = memoryFixture();
    let h: ReturnType<typeof harness>;
    const retryingStore: AtomicUsageStore = {
      transact: async (budgetId, decide) => {
        const first = decide(fixture.read());
        const second = decide(fixture.read());
        expect(second).toEqual(first);
        expect(h.createProvider).not.toHaveBeenCalled();
        expect(h.generate).not.toHaveBeenCalled();
        return fixture.store.transact(budgetId, decide);
      },
    };
    h = harness({ store: retryingStore });
    expect((await runReservedJourneyBoundary(input(), h.deps)).ok).toBe(true);
    expect(h.createProvider).toHaveBeenCalledTimes(1);
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(fixture.read().reservations).toHaveLength(1);
  });
});
