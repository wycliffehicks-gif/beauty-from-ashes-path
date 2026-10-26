// P4 — evaluator manifest admission, OFFLINE. Proves a missing, expired,
// forged, incomplete or hash-changed manifest is refused BEFORE any credential
// read or transport call.
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateEvalManifest,
  validateManifestForLive,
  computeCostBound,
} from "../../../../../scripts/conversation-eval/manifest";
import {
  runConversationEvaluation,
  computeSourceSnapshotSha256,
  EvalAdmissionRefused,
} from "../../../../../scripts/conversation-eval/runner";
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
        worstCasePerDispatchMicros: 9112,
        maxDispatchAttempts: 9,
        worstCaseTotalMicros: 82008,
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

  it("invented zero rates and stale prices are refused, while draft dates remain unset", async () => {
    const draft = loadDraft();
    expect(draft.approval).toBeNull(); expect(draft.expiresAtIso).toBeNull();
    const zero = loadDraft();
    (zero.priceBasis as { inputPerMillionUsdMicros: number }).inputPerMillionUsdMicros = 0;
    expect(validateEvalManifest(zero, await liveContext())).toMatchObject({ ok: false, code: "price-basis-untrusted" });
    const stale = loadDraft();
    stale.approval = { reference: "test-only", approvedBy: "fixture", approvedAtIso: NOW };
    stale.expiresAtIso = "2026-11-20T00:00:00.000Z";
    expect(validateManifestForLive(stale, { ...await liveContext(), nowIso: "2026-11-15T00:00:00.000Z" })).toMatchObject({ ok: false, code: "price-basis-stale" });
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
      ).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(EvalAdmissionRefused);
      expect((err as { code?: string }).code).toBe("manifest-unapproved");
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
      writeFileSync(forgedPath, JSON.stringify(forged));
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
      ).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(EvalAdmissionRefused);
      expect((err as { code?: string }).code).toBe("policy-hash-mismatch");
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
        estimatedProviderCostMicros: 0,
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
    // Full request UTF-8 cap64,000 +4,096 protocol margin =68,096
    // inputtokens at worst0.125 USD/M, plus1,200output at0.50 USD/M.
    expect(bound.worstCasePerDispatchMicros).toBe(9112);
    expect(bound.worstCaseTotalMicros).toBe(82_008);
  });
});
