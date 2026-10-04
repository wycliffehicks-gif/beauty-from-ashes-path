import { describe, expect, it, vi } from "vitest";
import {
  USAGE_LEDGER_VERSION,
  decideUsageReservation,
  reserveJourneyUsage,
  type AtomicUsageStore,
  type UsageLedger,
  type UsagePolicy,
  type UsageReservation,
} from "../journey-usage-reservation";

const policy: UsagePolicy = {
  budgetId: "fictional_budget_01",
  currency: "CAD",
  participantDay: { requests: 10, spendMicros: 1_000 },
  participantTotal: { requests: 20, spendMicros: 2_000 },
  globalDay: { requests: 30, spendMicros: 3_000 },
  globalTotal: { requests: 40, spendMicros: 4_000 },
};
const emptyLedger = (): UsageLedger => ({
  version: USAGE_LEDGER_VERSION,
  budgetId: policy.budgetId,
  currency: "CAD",
  reservations: [],
});
const reservation = (attempt: number, extra: Partial<UsageReservation> = {}): UsageReservation => ({
  attemptId: `fictional_attempt_${attempt}`,
  participantKey: "fictional_person_01",
  requestFingerprint: "fictional_request_hmac_01",
  utcDay: "2026-10-04",
  pricingVersion: "fictional_price_version_01",
  reservedSpendMicros: 100,
  ...extra,
});

/** TEST ONLY. Serialized memory simulates transaction ordering, not durability. */
function memoryFixture(initial: unknown = emptyLedger()) {
  let ledger = initial;
  let tail: Promise<unknown> = Promise.resolve();
  const store: AtomicUsageStore = {
    transact: (_budgetId, decide) => {
      const next = tail.then(() => {
        const decision = decide(ledger);
        if (decision.nextLedger) ledger = decision.nextLedger;
        return decision.result;
      });
      tail = next.catch(() => {});
      return next;
    },
  };
  return { store, read: () => ledger };
}

describe("dormant cumulative usage reservation preparation (offline only)", () => {
  it.each([
    ["participantDay", "usage-participant-day-limit"],
    ["participantTotal", "usage-participant-total-limit"],
    ["globalDay", "usage-global-day-limit"],
    ["globalTotal", "usage-global-total-limit"],
  ] as const)(
    "enforces %s request and spending ceilings without changing a refused ledger",
    (scope, code) => {
      for (const cap of [
        { requests: 1, spendMicros: 999_999 },
        { requests: 100, spendMicros: 150 },
      ]) {
        const localPolicy = { ...policy, [scope]: cap };
        const ledger = { ...emptyLedger(), reservations: [reservation(1)] };
        const before = JSON.stringify(ledger);
        expect(decideUsageReservation(ledger, reservation(2), localPolicy)).toEqual({
          result: { ok: false, code },
        });
        expect(JSON.stringify(ledger)).toBe(before);
      }
    },
  );

  it("allows the exact spend boundary, rejects one micro-unit beyond, without floating point rounding", () => {
    const cap = { requests: 10, spendMicros: 200 };
    const localPolicy = { ...policy, globalTotal: cap };
    const first = decideUsageReservation(emptyLedger(), reservation(1), localPolicy);
    const second = decideUsageReservation(first.nextLedger, reservation(2), localPolicy);
    expect(second.result.ok).toBe(true);
    expect(
      decideUsageReservation(
        second.nextLedger,
        reservation(3, { reservedSpendMicros: 1 }),
        localPolicy,
      ).result,
    ).toEqual({ ok: false, code: "usage-global-total-limit" });
  });

  it("separates participants and UTC days while retaining all-time pilot totals", () => {
    const localPolicy = {
      ...policy,
      participantDay: { requests: 1, spendMicros: 100 },
      participantTotal: { requests: 2, spendMicros: 200 },
      globalDay: { requests: 2, spendMicros: 200 },
      globalTotal: { requests: 3, spendMicros: 300 },
    };
    const first = decideUsageReservation(emptyLedger(), reservation(1), localPolicy);
    const other = decideUsageReservation(
      first.nextLedger,
      reservation(2, { participantKey: "fictional_person_02" }),
      localPolicy,
    );
    expect(other.result.ok).toBe(true);
    const tomorrow = decideUsageReservation(
      other.nextLedger,
      reservation(3, { utcDay: "2026-10-05" }),
      localPolicy,
    );
    expect(tomorrow.result.ok).toBe(true);
    expect(
      decideUsageReservation(
        tomorrow.nextLedger,
        reservation(4, { utcDay: "2026-10-06" }),
        localPolicy,
      ).result,
    ).toEqual({ ok: false, code: "usage-participant-total-limit" });
    expect(
      decideUsageReservation(
        tomorrow.nextLedger,
        reservation(5, { participantKey: "fictional_person_03", utcDay: "2026-10-06" }),
        localPolicy,
      ).result,
    ).toEqual({ ok: false, code: "usage-global-total-limit" });
  });

  it("serializes concurrent participants against the same global budget in the mock transaction", async () => {
    const { store, read } = memoryFixture();
    const localPolicy = { ...policy, globalTotal: { requests: 1, spendMicros: 100 } };
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        reserveJourneyUsage(
          store,
          reservation(index, { participantKey: `fictional_person_${index}` }),
          localPolicy,
        ),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect((read() as UsageLedger).reservations).toHaveLength(1);
  });

  it("concurrent retry IDs grant one dispatch; changed payloads conflict; next-day retries do not reset", async () => {
    const { store } = memoryFixture();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => reserveJourneyUsage(store, reservation(1), policy)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.filter((result) => !result.ok && result.code === "usage-attempt-already-reserved"),
    ).toHaveLength(11);
    expect(
      await reserveJourneyUsage(
        store,
        reservation(1, { requestFingerprint: "fictional_other_hmac_02" }),
        policy,
      ),
    ).toEqual({ ok: false, code: "usage-attempt-conflict" });
    expect(
      await reserveJourneyUsage(store, reservation(1, { utcDay: "2026-10-05" }), policy),
    ).toEqual({ ok: false, code: "usage-attempt-already-reserved" });
  });

  it("keeps reservations after ambiguous dispatch failure; automatic refunds or retries cannot appear", async () => {
    const { store, read } = memoryFixture();
    const provider = vi.fn().mockRejectedValue(new Error("FICTIONAL_SECRET_REQUEST_CONTENT"));
    const simulatedFutureBoundary = async () => {
      const allowance = await reserveJourneyUsage(store, reservation(1), policy);
      if (!allowance.ok) return allowance;
      try {
        await provider();
      } catch {
        /* A timeout/failure does not erase its reservation. */
      }
    };
    await simulatedFutureBoundary();
    expect(await simulatedFutureBoundary()).toEqual({
      ok: false,
      code: "usage-attempt-already-reserved",
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect((read() as UsageLedger).reservations[0].reservedSpendMicros).toBe(100);
  });

  it("fails closed after a commit with a lost acknowledgement and retains the reservation on retry", async () => {
    const fixture = memoryFixture();
    const failingAck: AtomicUsageStore = {
      async transact(budgetId, decide) {
        await fixture.store.transact(budgetId, decide);
        throw new Error("FICTIONAL_SECRET_DATABASE_CONNECTION");
      },
    };
    expect(await reserveJourneyUsage(failingAck, reservation(1), policy)).toEqual({
      ok: false,
      code: "usage-control-unavailable",
    });
    expect(await reserveJourneyUsage(fixture.store, reservation(1), policy)).toEqual({
      ok: false,
      code: "usage-attempt-already-reserved",
    });
  });

  it("rejects absent, corrupt, wrong-currency and duplicate ledgers rather than reinitializing a budget", async () => {
    for (const bad of [
      undefined,
      null,
      {},
      { ...emptyLedger(), currency: "USD" },
      { ...emptyLedger(), reservations: [reservation(1), reservation(1)] },
      { ...emptyLedger(), reservations: [reservation(1, { reservedSpendMicros: -1 })] },
    ]) {
      // Use direct decision for undefined; default fixture intentionally supplies a valid empty ledger.
      expect(decideUsageReservation(bad, reservation(2), policy).result).toEqual({
        ok: false,
        code: "usage-ledger-invalid",
      });
    }
    expect(await reserveJourneyUsage(undefined, reservation(1), policy)).toEqual({
      ok: false,
      code: "usage-control-unavailable",
    });
  });

  it("returns only bounded codes for unavailable or malformed stores without leaking exceptions", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const reply of [
        { ok: true },
        { ok: true, code: "usage-reserved", raw: "FICTIONAL_SECRET" },
        { ok: false, code: "FICTIONAL_SECRET" },
        undefined,
      ]) {
        const store = { transact: vi.fn().mockResolvedValue(reply) };
        expect(await reserveJourneyUsage(store, reservation(1), policy)).toEqual({
          ok: false,
          code: "usage-control-unavailable",
        });
      }
      expect(
        await reserveJourneyUsage(
          { transact: vi.fn().mockRejectedValue(new Error("FICTIONAL_SECRET")) },
          reservation(1),
          policy,
        ),
      ).toEqual({ ok: false, code: "usage-control-unavailable" });
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("rejects unknown fields, invalid days, unsafe arithmetic and unbounded pricing before touching storage", async () => {
    const store = { transact: vi.fn() };
    for (const bad of [
      { ...reservation(1), notes: "FICTIONAL_PRIVATE_WRITING" },
      reservation(1, { utcDay: "2026-02-30" }),
      reservation(1, { reservedSpendMicros: Number.MAX_SAFE_INTEGER + 1 }),
      reservation(1, { reservedSpendMicros: 0.01 }),
      reservation(1, { reservedSpendMicros: Infinity }),
    ]) {
      expect(await reserveJourneyUsage(store, bad, policy)).toEqual({
        ok: false,
        code: "usage-configuration-invalid",
      });
    }
    expect(store.transact).not.toHaveBeenCalled();
  });

  it("uses a pure transaction callback that can be retried without side effects", () => {
    const ledger = Object.freeze({ ...emptyLedger(), reservations: Object.freeze([]) });
    const attempt = Object.freeze(reservation(1));
    expect(decideUsageReservation(ledger, attempt, policy)).toEqual(
      decideUsageReservation(ledger, attempt, policy),
    );
    expect(ledger.reservations).toHaveLength(0);
  });
});
