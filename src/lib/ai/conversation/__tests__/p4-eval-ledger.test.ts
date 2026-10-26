// P4 — durable evaluator ledger, OFFLINE. Single-host shared-file scope with
// atomic locking; fail-closed on lock/corruption; restart-preserving; the
// P3b admission semantics (duplicate identity, one claim, uncertain holds,
// idempotent reconciliation, no double refund).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvalLedger, EvalLedgerError } from "../../../../scripts/conversation-eval/ledger";

let dir: string;
let path: string;
const NOW = "2026-10-26T06:00:00.000Z";
const now = () => NOW;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "p4-ledger-"));
  path = join(dir, "ledger.json");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const open = (budget = 100_000) => EvalLedger.open(path, budget, now);
const base = { requestId: "req-1", caseId: "C04", turnIndex: 0, model: "gpt-6-luna", reservedMicros: 4350 };

describe("P4 eval ledger — admission and idempotency", () => {
  it("reserve persists; a duplicate identity acknowledges without a second reservation", () => {
    const ledger = open();
    const first = ledger.reserve(base);
    expect(first).toMatchObject({ ok: true, duplicate: false, admission: { state: "reserved" } });
    const again = ledger.reserve(base);
    expect(again).toMatchObject({ ok: true, duplicate: true });
    expect(ledger.admissions()).toHaveLength(1);
    expect(ledger.outstandingMicros()).toBe(4350);
  });

  it("same request identity with changed fields conflicts", () => {
    const ledger = open();
    ledger.reserve(base);
    expect(ledger.reserve({ ...base, reservedMicros: 4000 })).toEqual({ ok: false, code: "conflict" });
    expect(ledger.reserve({ ...base, caseId: "C05" })).toEqual({ ok: false, code: "conflict" });
  });

  it("budget is enforced across outstanding reservations and settled charges", () => {
    const ledger = open(5_000);
    expect(ledger.reserve(base).ok).toBe(true);
    expect(ledger.reserve({ ...base, requestId: "req-2", turnIndex: 1 })).toEqual({ ok: false, code: "limit" });
    // Settle the first cheaply: the released difference funds the second.
    ledger.claim("req-1");
    expect(ledger.reconcile("req-1", "receipt-1", 600)).toMatchObject({ ok: true });
    expect(ledger.reserve({ ...base, requestId: "req-2", turnIndex: 1 }).ok).toBe(true);
    expect(ledger.outstandingMicros()).toBe(600 + 4350);
  });

  it("claim is once-only; a consumed ticket cannot dispatch again", () => {
    const ledger = open();
    ledger.reserve(base);
    expect(ledger.claim("req-1")).toMatchObject({ ok: true, admission: { state: "dispatched" } });
    expect(ledger.claim("req-1")).toEqual({ ok: false, code: "consumed" });
  });

  it("pre-dispatch stop releases once; post-dispatch stop keeps an uncertain hold", () => {
    const ledger = open();
    ledger.reserve(base);
    expect(ledger.stop("req-1")).toMatchObject({ ok: true, admission: { state: "cancelled-before-dispatch" } });
    expect(ledger.outstandingMicros()).toBe(0);
    expect(ledger.reconcile("req-1", "receipt-1", 0)).toEqual({ ok: false, code: "consumed" });

    ledger.reserve({ ...base, requestId: "req-2", turnIndex: 1 });
    ledger.claim("req-2");
    expect(ledger.stop("req-2")).toMatchObject({ ok: true, admission: { state: "uncertain" } });
    expect(ledger.outstandingMicros()).toBe(4350); // retained, not refunded
  });

  it("reconciliation is idempotent; conflicting receipts never reopen or double-refund", () => {
    const ledger = open();
    ledger.reserve(base);
    ledger.claim("req-1");
    expect(ledger.reconcile("req-1", "receipt-1", 600)).toMatchObject({
      ok: true,
      admission: { state: "settled", receipt: { receiptId: "receipt-1", chargedMicros: 600 } },
    });
    expect(ledger.reconcile("req-1", "receipt-1", 600)).toMatchObject({ ok: true, duplicate: true });
    expect(ledger.reconcile("req-1", "receipt-1", 601)).toEqual({ ok: false, code: "receipt-conflict" });
    expect(ledger.reconcile("req-1", "receipt-2", 600)).toEqual({ ok: false, code: "receipt-conflict" });
    expect(ledger.reconcile("req-1", "receipt-9", 99999)).toEqual({ ok: false, code: "invalid" });
    expect(ledger.outstandingMicros()).toBe(600);
  });

  it("reservations and uncertain holds survive a restart (reload from disk)", () => {
    const ledger = open();
    ledger.reserve(base);
    ledger.claim("req-1");
    ledger.stop("req-1"); // uncertain
    ledger.reserve({ ...base, requestId: "req-2", turnIndex: 1 });

    const reopened = open();
    expect(reopened.admissions().map((a) => a.state)).toEqual(["uncertain", "reserved"]);
    expect(reopened.outstandingMicros()).toBe(8700);
    // The uncertain hold can still be reconciled after restart.
    expect(reopened.reconcile("req-1", "receipt-1", 4350)).toMatchObject({ ok: true });
  });
});

describe("P4 eval ledger — fail-closed durability", () => {
  it("a held lock refuses every operation and is never broken automatically", () => {
    const ledger = open();
    ledger.reserve(base);
    const lockFd = openSync(`${path}.lock`, "wx");
    try {
      expect(() => ledger.reserve({ ...base, requestId: "req-2", turnIndex: 1 })).toThrow(EvalLedgerError);
      expect(() => ledger.claim("req-1")).toThrow(/ledger-locked/);
      expect(() => ledger.admissions()).not.toThrow(); // reads stay available
    } finally {
      closeSync(lockFd);
      rmSync(`${path}.lock`, { force: true });
    }
    expect(ledger.claim("req-1").ok).toBe(true);
  });

  it("corruption fails closed and the file is never overwritten", () => {
    const ledger = open();
    ledger.reserve(base);
    writeFileSync(path, "{corrupt");
    expect(() => ledger.admissions()).toThrow(/ledger-corrupt/);
    expect(() => ledger.reserve({ ...base, requestId: "req-2", turnIndex: 1 })).toThrow(/ledger-corrupt/);
    expect(readFileSync(path, "utf8")).toBe("{corrupt");
  });

  it("ambiguous state (unknown fields, bad states, duplicate ids) fails closed", () => {
    open();
    const file = JSON.parse(readFileSync(path, "utf8"));
    file.admissions.push({ ...base, state: "invented", receipt: null, createdAtIso: NOW, updatedAtIso: NOW });
    writeFileSync(path, JSON.stringify(file));
    expect(() => open().admissions()).toThrow(/ledger-corrupt/);
  });

  it("invalid inputs are rejected before any mutation", () => {
    const ledger = open();
    expect(ledger.reserve({ ...base, reservedMicros: 0 })).toEqual({ ok: false, code: "invalid" });
    expect(ledger.reserve({ ...base, reservedMicros: 1.5 })).toEqual({ ok: false, code: "invalid" });
    expect(ledger.reconcile("req-1", "receipt-1", -1)).toEqual({ ok: false, code: "invalid" });
    expect(ledger.admissions()).toHaveLength(0);
  });
});
