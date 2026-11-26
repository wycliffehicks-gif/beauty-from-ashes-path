// OFFLINE fault injection only. Fake transports deliberately replace their
// own temporary ledger bytes after a claim; this does not diagnose the cause
// of any historical run and never accesses or repairs actual accounting.
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runConversationEvaluation, sha256 } from "../../../../../scripts/conversation-eval/runner";
import {
  PRICE_BASIS_SHA256,
  type ApprovalGrant,
} from "../../../../../scripts/conversation-eval/approval-grants";
import { type EvalManifest } from "../../../../../scripts/conversation-eval/manifest";
import { EvalLedger, type EvalAdmission } from "../../../../../scripts/conversation-eval/ledger";

afterEach(() => vi.restoreAllMocks());

const NOW = "2026-10-26T06:00:00.000Z";
const KEY = "synthetic-eval-key-never-valid";
const DRAFT = "scripts/conversation-eval/draft-manifest.v1.json";
function setup(mutator?: (m: EvalManifest) => void) {
  const dir = mkdtempSync(join(tmpdir(), "p4-runner-"));
  const manifest: EvalManifest = JSON.parse(readFileSync(DRAFT, "utf8"));
  manifest.approval = {
    reference: "TEST-ONLY",
    approvedBy: "fictional-fixture",
    approvedAtIso: NOW,
  };
  manifest.expiresAtIso = "2026-10-26T07:00:00.000Z";
  manifest.accounting = {
    ledgerPath: join(dir, "ledger.json"),
    evidenceDir: join(dir, "evidence"),
  };
  mutator?.(manifest);
  const bytes = JSON.stringify(manifest);
  const manifestPath = join(dir, "manifest.json");
  writeFileSync(manifestPath, bytes);
  const grant: ApprovalGrant = {
    grantId: "test-grant",
    manifestSha256: sha256(bytes),
    runLabel: manifest.label,
    approvedBy: manifest.approval!.approvedBy,
    reference: manifest.approval!.reference,
    approvedAtIso: manifest.approval!.approvedAtIso,
    expiresAtIso: manifest.expiresAtIso!,
    scope: {
      model: "gpt-6-luna",
      serviceTier: "default",
      policySha256: manifest.policySha256,
      sourceSnapshotSha256: manifest.sourceSnapshotSha256,
      maxDispatchAttempts: manifest.limits.maxDispatchAttempts,
      maxUsdMicros: manifest.limits.maxUsdMicros,
      priceBasisSha256: PRICE_BASIS_SHA256,
    },
  };
  return {
    dir,
    manifest,
    manifestPath,
    grant,
    options: { mode: "live" as const, manifestPath, outDir: join(dir, "out") },
    clean: () => rmSync(dir, { recursive: true, force: true }),
  };
}
function response(n: number, over: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      id: `resp_simulated_${n}`,
      model: "gpt-6-luna",
      service_tier: "default",
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({ text: "I hear what you are saying.", sourceIds: [] }),
            },
          ],
        },
      ],
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
      ...over,
    }),
  );
}
const ledger = (f: ReturnType<typeof setup>) =>
  JSON.parse(readFileSync(f.manifest.accounting.ledgerPath, "utf8"));
const summary = (f: ReturnType<typeof setup>) =>
  JSON.parse(readFileSync(join(f.options.outDir, "run-summary.json"), "utf8"));

describe("P4 runner observed dispatch versus injected conflicting storage", () => {
  for (const zeroCharge of [false, true]) {
    it(`retains the second known send after injected reserved rollback (first charge ${zeroCharge ? "zero" : "positive"})`, async () => {
      const f = setup();
      let calls = 0;
      let firstAdmission: unknown;
      try {
        await expect(
          runConversationEvaluation(f.options, {
            env: { OPENAI_API_KEY: KEY },
            grants: [f.grant],
            nowIso: () => NOW,
            fetchImpl: (async () => {
              calls++;
              if (calls === 2) {
                const file = ledger(f);
                expect(file.admissions.map((a: EvalAdmission) => a.state)).toEqual([
                  "settled",
                  "dispatched",
                ]);
                firstAdmission = file.admissions[0];
                file.admissions[1].state = "reserved";
                writeFileSync(f.manifest.accounting.ledgerPath, JSON.stringify(file));
              }
              return response(
                calls,
                zeroCharge ? { usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } } : {},
              );
            }) as typeof fetch,
          }),
        ).rejects.toMatchObject({ code: "stop-condition" });
        expect(calls).toBe(2);
        const file = ledger(f);
        expect(file.admissions[0]).toEqual(firstAdmission);
        expect(file.admissions[1]).toMatchObject({
          state: "uncertain",
          receipt: null,
          reservedMicros: 9112,
        });
        const reopened = EvalLedger.open(
          f.manifest.accounting.ledgerPath,
          file.budgetMicros,
          file,
          () => NOW,
        );
        expect(reopened.outstandingMicros()).toBe(9112 + (zeroCharge ? 0 : 23));
        expect(reopened.claim(file.admissions[1].requestId)).toEqual({
          ok: false,
          code: "consumed",
        });
        expect(reopened.reserve({ ...file.admissions[1], requestId: "no-retry" })).toEqual({
          ok: false,
          code: "conflict",
        });
        expect(summary(f)).toMatchObject({
          status: "stopped",
          providerCalls: 2,
          dispatchAttempts: 2,
          ledgerDispatchAttempts: 2,
          accountingStatus: "conflict",
          estimatedProviderCostMicros: zeroCharge ? 0 : 23,
        });
        const record = JSON.parse(
          readFileSync(join(f.manifest.accounting.evidenceDir, "evidence-C04-1.json"), "utf8"),
        );
        expect(record).toMatchObject({
          transportInvoked: true,
          outcome: "ledger-refused",
          ledgerState: "uncertain",
          estimatedChargeMicros: null,
        });
        expect(record.exchange.outcome).toBe("complete");
        expect(
          readdirSync(f.manifest.accounting.evidenceDir).filter((p) =>
            p.endsWith("-request-start.json"),
          ),
        ).toHaveLength(2);
      } finally {
        f.clean();
      }
    });
  }

  for (const fault of [
    "cancelled",
    "missing",
    "changed-identity",
    "corrupt",
    "changed-binding",
  ] as const) {
    it(`reports both known sends and preserves injected ${fault} bytes without an invented hold`, async () => {
      const f = setup();
      let calls = 0;
      let injected = "";
      try {
        await expect(
          runConversationEvaluation(f.options, {
            env: { OPENAI_API_KEY: KEY },
            grants: [f.grant],
            nowIso: () => NOW,
            fetchImpl: (async () => {
              calls++;
              if (calls === 2) {
                const file = ledger(f);
                if (fault === "cancelled") file.admissions[1].state = "cancelled-before-dispatch";
                if (fault === "missing") file.admissions.pop();
                if (fault === "changed-identity") file.admissions[1].model = "different-model";
                if (fault === "changed-binding") file.runId = "another-run";
                injected = fault === "corrupt" ? "{synthetic corrupt ledger" : JSON.stringify(file);
                writeFileSync(f.manifest.accounting.ledgerPath, injected);
              }
              return response(calls);
            }) as typeof fetch,
          }),
        ).rejects.toMatchObject({ code: "stop-condition" });
        expect(calls).toBe(2);
        expect(readFileSync(f.manifest.accounting.ledgerPath, "utf8")).toBe(injected);
        expect(summary(f)).toMatchObject({
          status: "stopped",
          providerCalls: 2,
          dispatchAttempts: 2,
          estimatedProviderCostMicros: 23,
        });
        expect(summary(f).accountingStatus).not.toBe("consistent");
        const record = JSON.parse(
          readFileSync(join(f.manifest.accounting.evidenceDir, "evidence-C04-1.json"), "utf8"),
        );
        expect(record.transportInvoked).toBe(true);
        expect(record.ledgerState).not.toContain("cancelled-before-dispatch");
        expect(record.ledgerState).not.toContain("hold retained");
        expect(record.ledgerState).toContain("not confirmed");
        expect(record.outcome).toBe("ledger-refused");
        expect(readdirSync(f.manifest.accounting.evidenceDir)).toContain("run-stop.json");
        expect(
          readdirSync(f.manifest.accounting.evidenceDir).filter((p) =>
            p.endsWith("-request-start.json"),
          ),
        ).toHaveLength(2);
      } finally {
        f.clean();
      }
    });
  }
});

// The original claim is an in-process fact captured before transport. These
// recovery tests are synthetic; they are not authority to repair a real file.
describe("P4 exact observed claim retains uncertainty without relaxing caps", () => {
  const binding = {
    runId: "synthetic-claim-guard",
    manifestSha256: "a".repeat(64),
    maxDispatchAttempts: 2,
  };
  const admission = {
    requestId: "observed-first",
    caseId: "C04",
    turnIndex: 0,
    model: "gpt-6-luna",
    reservedMicros: 9112,
  };
  const prepared = (limit = 2) => {
    const f = setup();
    const book = EvalLedger.open(
      f.manifest.accounting.ledgerPath,
      100_000,
      { ...binding, maxDispatchAttempts: limit },
      () => NOW,
    );
    book.reserve(admission);
    const result = book.claim(admission.requestId);
    if (!result.ok) throw new Error("fixture claim missing");
    const claim = result.admission;
    const file = ledger(f);
    file.admissions[0].state = "reserved";
    writeFileSync(f.manifest.accounting.ledgerPath, JSON.stringify(file));
    return { f, book, claim };
  };

  for (const charge of [0, 9112]) {
    it(`a provable original hold survives and can later reconcile ${charge} micros once`, () => {
      const { f, book, claim } = prepared();
      try {
        expect(book.stop(admission.requestId, claim)).toMatchObject({
          ok: true,
          duplicate: false,
          admission: { state: "uncertain", reservedMicros: 9112 },
        });
        expect(book.dispatchedAttempts()).toBe(1);
        expect(book.outstandingMicros()).toBe(9112);
        expect(book.claim(admission.requestId)).toEqual({ ok: false, code: "consumed" });
        expect(
          book.reconcile(admission.requestId, "synthetic-receipt", charge, claim),
        ).toMatchObject({ ok: true, duplicate: false, admission: { state: "settled" } });
        expect(
          book.reconcile(admission.requestId, "synthetic-receipt", charge, claim),
        ).toMatchObject({ ok: true, duplicate: true });
        expect(book.outstandingMicros()).toBe(charge);
        expect(book.dispatchedAttempts()).toBe(1);
        expect(book.reconcile(admission.requestId, "changed-receipt", charge, claim)).toEqual({
          ok: false,
          code: "receipt-conflict",
        });
      } finally {
        f.clean();
      }
    });
  }

  for (const field of ["caseId", "turnIndex", "model", "reservedMicros", "createdAtIso"] as const) {
    it(`refuses a superseded ${field} without mutating or settling that identity`, () => {
      const { f, book, claim } = prepared();
      try {
        const file = ledger(f);
        file.admissions[0].state = "dispatched";
        file.admissions[0][field] =
          field === "turnIndex"
            ? 1
            : field === "reservedMicros"
              ? 9111
              : field === "createdAtIso"
                ? "2026-10-26T06:00:01.000Z"
                : "different-value";
        const bytes = JSON.stringify(file);
        writeFileSync(f.manifest.accounting.ledgerPath, bytes);
        expect(book.reconcile(admission.requestId, "synthetic-receipt", 0, claim)).toEqual({
          ok: false,
          code: "conflict",
        });
        expect(book.stop(admission.requestId, claim)).toEqual({ ok: false, code: "conflict" });
        expect(readFileSync(f.manifest.accounting.ledgerPath, "utf8")).toBe(bytes);
      } finally {
        f.clean();
      }
    });
  }

  it("refuses recovery when an injected conflicting dispatch already exhausts the count cap", () => {
    const { f, book, claim } = prepared(1);
    try {
      const file = ledger(f);
      file.admissions.push({ ...claim, requestId: "unrelated-dispatch", turnIndex: 1 });
      const bytes = JSON.stringify(file);
      writeFileSync(f.manifest.accounting.ledgerPath, bytes);
      expect(book.stop(admission.requestId, claim)).toEqual({ ok: false, code: "limit" });
      expect(book.dispatchedAttempts()).toBe(1);
      expect(book.outstandingMicros()).toBe(18224);
      expect(book.claim(admission.requestId)).toEqual({ ok: false, code: "limit" });
      expect(readFileSync(f.manifest.accounting.ledgerPath, "utf8")).toBe(bytes);
    } finally {
      f.clean();
    }
  });
});

it("a higher conflicting ledger count is retained separately from two observed sends and stops the run", async () => {
  const f = setup();
  let calls = 0;
  let unrelated: EvalAdmission | null = null;
  try {
    await expect(
      runConversationEvaluation(f.options, {
        env: { OPENAI_API_KEY: KEY },
        grants: [f.grant],
        nowIso: () => NOW,
        fetchImpl: (async () => {
          calls++;
          if (calls === 2) {
            const file = ledger(f);
            unrelated = {
              ...file.admissions[1],
              requestId: "injected-other-claim",
              caseId: "C08",
              turnIndex: 99,
            };
            file.admissions.push(unrelated);
            writeFileSync(f.manifest.accounting.ledgerPath, JSON.stringify(file));
          }
          return response(calls);
        }) as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "stop-condition" });
    expect(calls).toBe(2);
    expect(summary(f)).toMatchObject({
      status: "stopped",
      providerCalls: 2,
      dispatchAttempts: 3,
      ledgerDispatchAttempts: 3,
      accountingStatus: "conflict",
      estimatedProviderCostMicros: 46,
    });
    expect(ledger(f).admissions[2]).toEqual(unrelated);
    expect(
      ledger(f)
        .admissions.slice(0, 2)
        .map((a: EvalAdmission) => a.state),
    ).toEqual(["settled", "settled"]);
  } finally {
    f.clean();
  }
});

it("a new conflict at the final accounting read cannot be reported as completed", async () => {
  const f = setup();
  let calls = 0;
  let finalReads = 0;
  let injected = "";
  const original = EvalLedger.prototype.dispatchedAttempts;
  vi.spyOn(EvalLedger.prototype, "dispatchedAttempts").mockImplementation(function (
    this: EvalLedger,
  ) {
    // Deliberately inject only after the ninth successful per-turn summary,
    // at the terminal read. This is a synthetic storage fault, not a network.
    if (calls === 9 && ++finalReads === 2) {
      const file = ledger(f);
      file.admissions[8].state = "reserved";
      file.admissions[8].receipt = null;
      injected = JSON.stringify(file);
      writeFileSync(f.manifest.accounting.ledgerPath, injected);
    }
    return original.call(this);
  });
  try {
    await expect(
      runConversationEvaluation(f.options, {
        env: { OPENAI_API_KEY: KEY },
        grants: [f.grant],
        nowIso: () => NOW,
        fetchImpl: (async () => {
          calls++;
          return response(calls);
        }) as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "stop-condition" });
    expect(calls).toBe(9);
    expect(summary(f)).toMatchObject({
      status: "stopped",
      providerCalls: 9,
      dispatchAttempts: 9,
      ledgerDispatchAttempts: 8,
      accountingStatus: "conflict",
      estimatedProviderCostMicros: 207,
    });
    expect(readFileSync(f.manifest.accounting.ledgerPath, "utf8")).toBe(injected);
    expect(
      readdirSync(f.manifest.accounting.evidenceDir).filter((p) =>
        p.endsWith("-request-start.json"),
      ),
    ).toHaveLength(9);
  } finally {
    f.clean();
  }
});
