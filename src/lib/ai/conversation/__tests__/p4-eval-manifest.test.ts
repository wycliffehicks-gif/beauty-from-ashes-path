// P4 — evaluator manifest admission, OFFLINE. Proves a missing, expired,
// forged, incomplete or hash-changed manifest is refused BEFORE any credential
// read or transport call.
import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateEvalManifest,
  validateManifestForLive,
  computeCostBound,
} from "../../../../scripts/conversation-eval/manifest";
import {
  runConversationEvaluation,
  computeSourceSnapshotSha256,
  EvalAdmissionRefused,
} from "../../../../scripts/conversation-eval/runner";
import { CONVERSATION_POLICY_BLOCK_SHA256 } from "../policy";

const DRAFT_PATH = "scripts/conversation-eval/draft-manifest.v1.json";
const NOW = "2026-10-26T06:00:00.000Z";

async function liveContext() {
  return {
    nowIso: NOW,
    expectedPolicySha256: CONVERSATION_POLICY_BLOCK_SHA256,
    expectedSourceSnapshotSha256: await computeSourceSnapshotSha256(),
  };
}

function loadDraft(): Record<string, unknown> {
  return JSON.parse(readFileSync(DRAFT_PATH, "utf8"));
}

describe("P4 eval manifest — structural validation (offline)", () => {
  it("the shipped DRAFT passes structural validation with a fitting cost bound", async () => {
    const result = validateEvalManifest(loadDraft(), await liveContext());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.costBound).toMatchObject({
        worstCasePerDispatchMicros: 4350,
        maxDispatchAttempts: 9,
        worstCaseTotalMicros: 39150,
        maxUsdMicros: 100000,
        fits: true,
      });
    }
  });

  it("the DRAFT is refused for live because approval is null", async () => {
    const result = validateManifestForLive(loadDraft(), await liveContext());
    expect(result).toMatchObject({ ok: false, code: "manifest-unapproved" });
  });

  it("an expired manifest is refused even with approval present", async () => {
    const forged = loadDraft();
    forged.approval = { reference: "ref", approvedBy: "Carl", approvedAtIso: "2026-10-01T00:00:00.000Z" };
    forged.expiresAtIso = "2026-10-02T00:00:00.000Z";
    const result = validateManifestForLive(forged, await liveContext());
    expect(result).toMatchObject({ ok: false, code: "manifest-expired" });
  });

  it("changed policy or source snapshot hashes are refused", async () => {
    const badPolicy = loadDraft();
    badPolicy.policySha256 = "0".repeat(64);
    expect(validateEvalManifest(badPolicy, await liveContext())).toMatchObject({
      ok: false,
      code: "policy-hash-mismatch",
    });
    const badSource = loadDraft();
    badSource.sourceSnapshotSha256 = "1".repeat(64);
    expect(validateEvalManifest(badSource, await liveContext())).toMatchObject({
      ok: false,
      code: "source-hash-mismatch",
    });
  });

  it("changed, missing or reordered catalog turns are refused", async () => {
    const changed = loadDraft();
    (changed.cases as { turns: string[] }[])[0].turns[0] = "A different sentence.";
    expect(validateEvalManifest(changed, await liveContext())).toMatchObject({
      ok: false,
      code: "case-turns-mismatch",
    });

    const dropped = loadDraft();
    (dropped.cases as unknown[]).pop();
    expect(validateEvalManifest(dropped, await liveContext())).toMatchObject({
      ok: false,
      code: "attempt-count-mismatch",
    });

    const unknown = loadDraft();
    (unknown.cases as { caseId: string }[])[0].caseId = "C99";
    expect(validateEvalManifest(unknown, await liveContext())).toMatchObject({
      ok: false,
      code: "invalid-manifest",
    });
  });

  it("an unaffordable or mispriced manifest is refused", async () => {
    const tight = loadDraft();
    (tight.limits as { maxUsdMicros: number }).maxUsdMicros = 1000;
    expect(validateEvalManifest(tight, await liveContext())).toMatchObject({
      ok: false,
      code: "cost-bound-exceeded",
    });

    const wrongModel = loadDraft();
    (wrongModel.priceBasis as { model: string }).model = "gpt-other";
    expect(validateEvalManifest(wrongModel, await liveContext())).toMatchObject({
      ok: false,
      code: "price-basis-mismatch",
    });
  });

  it("incomplete manifests are refused", async () => {
    const incomplete = loadDraft();
    delete incomplete.stopConditions;
    expect(validateEvalManifest(incomplete, await liveContext())).toMatchObject({
      ok: false,
      code: "invalid-manifest",
    });
    expect(validateEvalManifest("{", await liveContext())).toMatchObject({
      ok: false,
      code: "invalid-manifest",
    });
  });
});

describe("P4 eval runner — live mode refuses before credential access", () => {
  it("unapproved DRAFT: no env read, no fetch, no dispatch", async () => {
    const dir = mkdtempSync(join(tmpdir(), "p4-eval-"));
    try {
      let fetchCalls = 0;
      const env = new Proxy(
        {},
        {
          get: () => {
            throw new Error("env-read-attempted");
          },
        },
      ) as NodeJS.ProcessEnv;
      const fetchImpl = (async () => {
        fetchCalls += 1;
        throw new Error("fetch-attempted");
      }) as typeof fetch;
      const err = await runConversationEvaluation(
        { mode: "live", manifestPath: DRAFT_PATH, outDir: join(dir, "out") },
        { env, fetchImpl, nowIso: () => NOW },
      ).catch((e) => e);
      expect(err).toBeInstanceOf(EvalAdmissionRefused);
      expect(err.code).toBe("manifest-unapproved");
      expect(fetchCalls).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("forged approval with a changed policy hash: refused before env/fetch", async () => {
    const dir = mkdtempSync(join(tmpdir(), "p4-eval-"));
    try {
      const forged = loadDraft();
      forged.approval = { reference: "forged", approvedBy: "nobody", approvedAtIso: NOW };
      forged.policySha256 = "2".repeat(64);
      const forgedPath = join(dir, "forged.json");
      require("node:fs").writeFileSync(forgedPath, JSON.stringify(forged));
      let fetchCalls = 0;
      const env = new Proxy(
        {},
        {
          get: () => {
            throw new Error("env-read-attempted");
          },
        },
      ) as NodeJS.ProcessEnv;
      const err = await runConversationEvaluation(
        { mode: "live", manifestPath: forgedPath, outDir: join(dir, "out") },
        {
          env,
          fetchImpl: (async () => {
            fetchCalls += 1;
            throw new Error("fetch-attempted");
          }) as typeof fetch,
          nowIso: () => NOW,
        },
      ).catch((e) => e);
      expect(err).toBeInstanceOf(EvalAdmissionRefused);
      expect(err.code).toBe("policy-hash-mismatch");
      expect(fetchCalls).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("validate mode writes a summary and never dispatches", async () => {
    const dir = mkdtempSync(join(tmpdir(), "p4-eval-"));
    try {
      const summary = await runConversationEvaluation(
        { mode: "validate", manifestPath: DRAFT_PATH, outDir: join(dir, "out") },
        { nowIso: () => NOW },
      );
      expect(summary).toMatchObject({
        mode: "validate",
        structural: "pass",
        approval: "absent",
        dispatchAttempts: 0,
        providerCalls: 0,
        actualProviderCostMicros: 0,
      });
      const written = JSON.parse(readFileSync(join(dir, "out", "run-summary.json"), "utf8"));
      expect(written.providerCalls).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("computeCostBound matches the documented hand calculation", async () => {
    const result = validateEvalManifest(loadDraft(), await liveContext());
    if (!result.ok) throw new Error("draft must validate");
    const bound = computeCostBound(result.manifest);
    // 60_000 chars at 2 chars/token = 30_000 tokens at the cache-write
    // worst rate (0.125 USD/M) = 3750 micros; 1200 output tokens at
    // 0.50 USD/M = 600 micros; 4350 per dispatch, 39_150 for 9 dispatches.
    expect(bound.worstCasePerDispatchMicros).toBe(4350);
    expect(bound.worstCaseTotalMicros).toBe(39_150);
  });
});
