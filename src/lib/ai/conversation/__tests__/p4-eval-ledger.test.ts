// P4 — durable evaluator ledger, OFFLINE. Single-host shared-file scope with
// atomic locking; fail-closed on lock/corruption; restart-preserving; the
// P3b admission semantics (duplicate identity, one claim, uncertain holds,
// idempotent reconciliation, no double refund).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { EvalLedger, EvalLedgerError } from "../../../../../scripts/conversation-eval/ledger";

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

const binding = { runId: "synthetic-ledger-run", manifestSha256: "a".repeat(64), maxDispatchAttempts: 9 };
const open = (budget = 100_000) => EvalLedger.open(path, budget, binding, now);
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
    expect(reopened.admissions().map((a: { state: string }) => a.state)).toEqual(["uncertain", "reserved"]);
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


describe("P4 eval ledger — exact approved scope and receipts", () => {
  it("rejects a different cap, run, manifest or count without changing existing state", () => {
    const ledger = open();
    ledger.reserve(base);
    const before = readFileSync(path, "utf8");
    for (const [budget, scope] of [
      [1, binding],
      [100_000, { ...binding, runId: "another-run" }],
      [100_000, { ...binding, manifestSha256: "b".repeat(64) }],
      [100_000, { ...binding, maxDispatchAttempts: 8 }],
    ] as const) {
      expect(() => EvalLedger.open(path, budget, scope, now)).toThrow(/binding-mismatch/);
      expect(readFileSync(path, "utf8")).toBe(before);
    }
    expect(open().outstandingMicros()).toBe(4350);
  });

  it("revalidates binding on every mutation, even through a previously opened handle", () => {
    const ledger = open();
    const file = JSON.parse(readFileSync(path, "utf8"));
    file.runId = "changed-run";
    writeFileSync(path, JSON.stringify(file));
    const before = readFileSync(path, "utf8");
    expect(() => ledger.reserve(base)).toThrow(/binding-mismatch/);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("never applies one provider receipt to two requests; same-request replay stays idempotent", () => {
    const ledger = open();
    ledger.reserve({ ...base, reservedMicros: 500 });
    ledger.reserve({ ...base, requestId: "req-2", turnIndex: 1, reservedMicros: 500 });
    ledger.claim("req-1");
    ledger.claim("req-2");
    expect(ledger.reconcile("req-1", "actual-provider-receipt", 1).ok).toBe(true);
    const before = readFileSync(path, "utf8");
    expect(ledger.reconcile("req-2", "actual-provider-receipt", 1)).toEqual({ ok: false, code: "receipt-conflict" });
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(ledger.outstandingMicros()).toBe(501);
    expect(ledger.reconcile("req-1", "actual-provider-receipt", 1)).toMatchObject({ ok: true, duplicate: true });
    expect(open().outstandingMicros()).toBe(501);
  });

  it("blocks the same catalog turn under a changed request or evidence identity after restart", () => {
    const ledger = open();
    ledger.reserve(base);
    ledger.claim(base.requestId);
    ledger.reconcile(base.requestId, "provider-receipt", 1);
    expect(open().reserve({ ...base, requestId: "another-output-dir-request" }))
      .toEqual({ ok: false, code: "conflict" });
    expect(open().dispatchedAttempts()).toBe(1);
  });

  it("counts settled and uncertain dispatches across restart, independent of released budget", () => {
    const scope = { ...binding, maxDispatchAttempts: 2 };
    const ledger = EvalLedger.open(path, 100_000, scope, now);
    for (let i = 0; i < 3; i++) {
      expect(ledger.reserve({ ...base, requestId: `req-${i}`, turnIndex: i }).ok).toBe(true);
    }
    expect(ledger.claim("req-0").ok).toBe(true);
    expect(ledger.reconcile("req-0", "provider-zero", 0).ok).toBe(true);
    expect(ledger.claim("req-1").ok).toBe(true);
    expect(ledger.stop("req-1").ok).toBe(true);
    const reopened = EvalLedger.open(path, 100_000, scope, now);
    expect(reopened.dispatchedAttempts()).toBe(2);
    expect(reopened.claim("req-2")).toEqual({ ok: false, code: "limit" });
    expect(reopened.reserve({ ...base, requestId: "req-4", turnIndex: 4 })).toEqual({ ok: false, code: "limit" });
    expect(reopened.admissions()[2].state).toBe("reserved");
    expect(reopened.outstandingMicros()).toBe(8700);
  });

  it("rejects duplicate receipts and duplicate catalog turns loaded from corrupt state", () => {
    const ledger = open();
    ledger.reserve(base);
    ledger.claim(base.requestId);
    ledger.reconcile(base.requestId, "provider-one", 1);
    const valid = JSON.parse(readFileSync(path, "utf8"));
    for (const duplicate of [
      { ...valid.admissions[0], requestId: "req-2", turnIndex: 1 },
      { ...valid.admissions[0], requestId: "req-2", receipt: { receiptId: "provider-two", chargedMicros: 1 } },
    ]) {
      writeFileSync(path, JSON.stringify({ ...valid, admissions: [...valid.admissions, duplicate] }));
      expect(() => open()).toThrow(/ledger-corrupt/);
    }
  });
});

// Execute the actual TypeScript ledger in independent OS processes. No model,
// credentials, network, database or Auth operations are involved.
const workerSource = `
import { EvalLedger } from ${JSON.stringify(new URL("../../../../../scripts/conversation-eval/ledger.ts", import.meta.url).href)};
const [path, operation, inputJson, bindingJson] = process.argv.slice(2);
try {
  const ledger = EvalLedger.open(path, 100_000, JSON.parse(bindingJson), () => "${NOW}");
  const result = operation === "reserve" ? ledger.reserve(JSON.parse(inputJson)) : ledger.claim(JSON.parse(inputJson));
  process.stdout.write(JSON.stringify(result));
} catch (error) { process.stdout.write(JSON.stringify({ok:false, code:error.code ?? "error"})); }
`;
const runWorker = (worker: string, operation: string, input: unknown, scope = binding) =>
  new Promise<{ ok: boolean; duplicate?: boolean; code?: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [worker, path, operation, JSON.stringify(input), JSON.stringify(scope)], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ledger worker exited ${code}: ${errors}`));
      try { resolve(JSON.parse(output)); } catch { reject(new Error(`invalid worker output: ${output}`)); }
    });
  });

describe("P4 eval ledger — independent OS-process races", () => {
  it("16 competing reservations of one identity create exactly one admission", async () => {
    open();
    const worker = join(dir, "ledger-worker.mjs");
    writeFileSync(worker, workerSource);
    const results = await Promise.all(Array.from({ length: 16 }, () => runWorker(worker, "reserve", base)));
    expect(results.filter((r) => r.ok && !r.duplicate)).toHaveLength(1);
    expect(results.every((r) => r.ok || r.code === "locked")).toBe(true);
    expect(open().admissions()).toHaveLength(1);
    expect(open().outstandingMicros()).toBe(4350);
  }, 20_000);

  it("16 competing claims dispatch exactly once", async () => {
    open().reserve(base);
    const worker = join(dir, "ledger-worker.mjs");
    writeFileSync(worker, workerSource);
    const results = await Promise.all(Array.from({ length: 16 }, () => runWorker(worker, "claim", base.requestId)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.every((r) => r.ok || r.code === "locked" || r.code === "consumed")).toBe(true);
    expect(open().dispatchedAttempts()).toBe(1);
  }, 20_000);

  it("different pending requests racing the final dispatch slot have one winner", async () => {
    const scope = { ...binding, maxDispatchAttempts: 1 };
    const ledger = EvalLedger.open(path, 100_000, scope, now);
    for (let i = 0; i < 8; i++) ledger.reserve({ ...base, requestId: `req-${i}`, turnIndex: i });
    const worker = join(dir, "ledger-worker.mjs");
    writeFileSync(worker, workerSource);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => runWorker(worker, "claim", `req-${i}`, scope)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.every((r) => r.ok || r.code === "locked" || r.code === "limit")).toBe(true);
    expect(EvalLedger.open(path, 100_000, scope, now).dispatchedAttempts()).toBe(1);
  }, 20_000);
});
