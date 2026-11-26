// Offline exact C05 two-turn path. Every response is synthetic; no real
// credential, network or model. No test rewrites ledger data. The explicit
// lock/exception/cleanup doubles below are distinct diagnostic controls,
// not a claim about the cause of a historical real-provider refusal.
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runConversationEvaluation, sha256 } from "../../../../../scripts/conversation-eval/runner";
import {
  PRICE_BASIS_SHA256,
  type ApprovalGrant,
} from "../../../../../scripts/conversation-eval/approval-grants";
import { type EvalManifest } from "../../../../../scripts/conversation-eval/manifest";
import { EvalLedger } from "../../../../../scripts/conversation-eval/ledger";

afterEach(() => vi.restoreAllMocks());

const NOW = "2026-10-26T06:00:00.000Z";
const KEY = "synthetic-eval-key-never-valid";
const DRAFT = "scripts/conversation-eval/draft-manifest.v1.json";
function setup(mutator?: (m: EvalManifest) => void) {
  const dir = mkdtempSync(join(tmpdir(), "p4-runner-"));
  const manifest: EvalManifest = JSON.parse(readFileSync(DRAFT, "utf8"));
  manifest.cases = manifest.cases.filter((item) => item.caseId === "C05");
  manifest.limits.maxDispatchAttempts = 2;
  manifest.limits.maxUsdMicros = 18224;
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

const final = (f: ReturnType<typeof setup>) =>
  JSON.parse(readFileSync(join(f.manifest.accounting.evidenceDir, "evidence-C05-1.json"), "utf8"));
const stopped = (f: ReturnType<typeof setup>) =>
  JSON.parse(readFileSync(join(f.manifest.accounting.evidenceDir, "run-stop.json"), "utf8"));

describe("P4 exact C05 sequence and content-free refusal diagnostics", () => {
  for (const secondId of ["resp_c05_second", "r".repeat(128)]) {
    it(`settles both ordinary turns with distinct ${secondId.length}-character receipt`, async () => {
      const f = setup();
      let calls = 0;
      const wireBodies: string[] = [];
      try {
        const result = await runConversationEvaluation(f.options, {
          env: { OPENAI_API_KEY: KEY },
          grants: [f.grant],
          nowIso: () => NOW,
          fetchImpl: (async (_url, init) => {
            calls++;
            wireBodies.push(String(init?.body));
            return response(calls, { id: calls === 2 ? secondId : "resp_c05_first" });
          }) as typeof fetch,
        });
        expect(calls).toBe(2);
        expect(wireBodies[0]).toContain(f.manifest.cases[0].turns[0]);
        expect(wireBodies[1]).toContain(f.manifest.cases[0].turns[1]);
        expect(result).toMatchObject({
          status: "completed",
          providerCalls: 2,
          dispatchAttempts: 2,
          ledgerDispatchAttempts: 2,
          accountingStatus: "consistent",
          estimatedProviderCostMicros: 46,
        });
        expect(ledger(f).admissions.map((a: { state: string }) => a.state)).toEqual([
          "settled",
          "settled",
        ]);
      } finally {
        f.clean();
      }
    });
  }

  for (const [kind, secondId, code] of [
    ["129-character receipt", "r".repeat(129), "invalid"],
    ["slash-containing receipt", "resp/second", "invalid"],
    ["reused receipt", "resp_c05_first", "receipt-conflict"],
  ] as const) {
    it(`distinguishes ${kind} without changing ledger bytes outside normal APIs`, async () => {
      const f = setup();
      let calls = 0;
      const actualResults: unknown[] = [];
      const reconcile = EvalLedger.prototype.reconcile;
      vi.spyOn(EvalLedger.prototype, "reconcile").mockImplementation(function (
        this: EvalLedger,
        ...args
      ) {
        const result = reconcile.apply(this, args);
        actualResults.push(result.ok ? "settled" : result.code);
        return result;
      });
      try {
        await expect(
          runConversationEvaluation(f.options, {
            env: { OPENAI_API_KEY: KEY },
            grants: [f.grant],
            nowIso: () => NOW,
            fetchImpl: (async () => {
              calls++;
              return response(calls, { id: calls === 2 ? secondId : "resp_c05_first" });
            }) as typeof fetch,
          }),
        ).rejects.toMatchObject({ code: "stop-condition" });
        expect(calls).toBe(2);
        expect(actualResults).toEqual(["settled", code]);
        expect(ledger(f).admissions.map((a: { state: string }) => a.state)).toEqual([
          "settled",
          "uncertain",
        ]);
        expect(final(f)).toMatchObject({
          outcome: "ledger-refused",
          transportInvoked: true,
          ledgerState: "uncertain",
          estimatedChargeMicros: null,
          exchange: { outcome: "complete", usageConsistent: true, responseId: secondId },
        });
        expect(summary(f)).toMatchObject({
          status: "stopped",
          providerCalls: 2,
          dispatchAttempts: 2,
          ledgerDispatchAttempts: 2,
          accountingStatus: "conflict",
          estimatedProviderCostMicros: 23,
        });
        expect(final(f).accountingFailures).toEqual([
          { stage: "reconcile", kind: "refusal", code },
        ]);
        expect(final(f).computedChargeMicros).toBe(23);
        expect(stopped(f).accountingFailures).toEqual(final(f).accountingFailures);
      } finally {
        f.clean();
      }
    });
  }

  it("records a real held-lock exception as reconcile/locked without copying error strings", async () => {
    const f = setup();
    let calls = 0;
    try {
      await expect(
        runConversationEvaluation(f.options, {
          env: { OPENAI_API_KEY: KEY },
          grants: [f.grant],
          nowIso: () => NOW,
          fetchImpl: (async () => {
            calls++;
            if (calls === 2)
              writeFileSync(f.manifest.accounting.ledgerPath + ".lock", "synthetic lock only", {
                flag: "wx",
              });
            return response(calls);
          }) as typeof fetch,
        }),
      ).rejects.toMatchObject({ code: "stop-condition" });
      expect(calls).toBe(2);
      expect(final(f).accountingFailures).toEqual([
        { stage: "reconcile", kind: "exception", code: "locked" },
      ]);
      expect(final(f).computedChargeMicros).toBe(23);
      expect(ledger(f).admissions.map((a: { state: string }) => a.state)).toEqual([
        "settled",
        "dispatched",
      ]);
      expect(stopped(f).accountingFailures).toEqual(final(f).accountingFailures);
    } finally {
      f.clean();
    }
  });

  it("allows only a fixed fallback code for an unexpected exception carrying secret-like data", async () => {
    const f = setup();
    let calls = 0;
    const privateError = "SYNTHETIC_SECRET_AND_CONTENT_MUST_NOT_BE_LOGGED";
    const reconcile = EvalLedger.prototype.reconcile;
    vi.spyOn(EvalLedger.prototype, "reconcile").mockImplementation(function (
      this: EvalLedger,
      ...args
    ) {
      if (calls === 2)
        throw Object.assign(new Error(privateError), { code: privateError, stage: privateError });
      return reconcile.apply(this, args);
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
      expect(calls).toBe(2);
      expect(final(f).accountingFailures).toEqual([
        { stage: "reconcile", kind: "exception", code: "unexpected-error" },
      ]);
      expect(JSON.stringify(final(f))).not.toContain(privateError);
      expect(JSON.stringify(stopped(f))).not.toContain(privateError);
      expect(final(f).computedChargeMicros).toBe(23);
    } finally {
      f.clean();
    }
  });

  it("keeps the original refusal when cleanup separately refuses", async () => {
    const f = setup();
    let calls = 0;
    vi.spyOn(EvalLedger.prototype, "stop").mockReturnValue({ ok: false, code: "invalid" });
    try {
      await expect(
        runConversationEvaluation(f.options, {
          env: { OPENAI_API_KEY: KEY },
          grants: [f.grant],
          nowIso: () => NOW,
          fetchImpl: (async () => {
            calls++;
            return response(calls, { id: "resp_c05_reused" });
          }) as typeof fetch,
        }),
      ).rejects.toMatchObject({ code: "stop-condition" });
      expect(calls).toBe(2);
      expect(final(f).accountingFailures).toEqual([
        { stage: "reconcile", kind: "refusal", code: "receipt-conflict" },
        { stage: "stop", kind: "refusal", code: "invalid" },
      ]);
      expect(final(f).ledgerState).toBe("accounting-conflict; reservation not confirmed");
      expect(stopped(f).accountingFailures).toEqual(final(f).accountingFailures);
    } finally {
      f.clean();
    }
  });
});

it("records a normal duplicate-case reserve refusal before any transport", async () => {
  const f = setup();
  let calls = 0;
  try {
    const manifestSha256 = sha256(readFileSync(f.manifestPath, "utf8"));
    const book = EvalLedger.open(
      f.manifest.accounting.ledgerPath,
      f.manifest.limits.maxUsdMicros,
      {
        runId: `eval-${manifestSha256}`,
        manifestSha256,
        maxDispatchAttempts: 2,
      },
      () => NOW,
    );
    expect(
      book.reserve({
        requestId: "existing-c05",
        caseId: "C05",
        turnIndex: 0,
        model: "gpt-6-luna",
        reservedMicros: 9112,
      }).ok,
    ).toBe(true);
    const before = readFileSync(f.manifest.accounting.ledgerPath, "utf8");
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
    expect(calls).toBe(0);
    const record = JSON.parse(
      readFileSync(join(f.manifest.accounting.evidenceDir, "evidence-C05-0.json"), "utf8"),
    );
    expect(record.accountingFailures).toEqual([
      { stage: "reserve", kind: "refusal", code: "conflict" },
    ]);
    expect(record.transportInvoked).toBe(false);
    expect(record.computedChargeMicros).toBeNull();
    expect(stopped(f).accountingFailures).toEqual(record.accountingFailures);
    expect(readFileSync(f.manifest.accounting.ledgerPath, "utf8")).toBe(before);
  } finally {
    f.clean();
  }
});

it("distinguishes an injected claim refusal and legitimate pre-transport cancellation", async () => {
  const f = setup();
  let calls = 0;
  vi.spyOn(EvalLedger.prototype, "claim").mockReturnValue({ ok: false, code: "limit" });
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
    expect(calls).toBe(0);
    const record = JSON.parse(
      readFileSync(join(f.manifest.accounting.evidenceDir, "evidence-C05-0.json"), "utf8"),
    );
    expect(record.accountingFailures).toEqual([{ stage: "claim", kind: "refusal", code: "limit" }]);
    expect(record.transportInvoked).toBe(false);
    expect(record.ledgerState).toBe("cancelled-before-dispatch");
    expect(stopped(f).accountingFailures).toEqual(record.accountingFailures);
  } finally {
    f.clean();
  }
});
