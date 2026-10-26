// Simulated transports ONLY. The production registry is empty; fixtures below
// are local test grants, not Carl's approval and not real provider evidence.
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runConversationEvaluation, sha256 } from "../../../../../scripts/conversation-eval/runner";
import { PRICE_BASIS_SHA256, type ApprovalGrant } from "../../../../../scripts/conversation-eval/approval-grants";
import { type EvalManifest } from "../../../../../scripts/conversation-eval/manifest";

const NOW = "2026-10-26T06:00:00.000Z";
const KEY = "synthetic-eval-key-never-valid";
const DRAFT = "scripts/conversation-eval/draft-manifest.v1.json";
function setup(mutator?: (m: EvalManifest) => void) {
  const dir = mkdtempSync(join(tmpdir(), "p4-runner-"));
  const manifest: EvalManifest = JSON.parse(readFileSync(DRAFT, "utf8"));
  manifest.approval = { reference: "TEST-ONLY", approvedBy: "fictional-fixture", approvedAtIso: NOW };
  manifest.expiresAtIso = "2026-10-26T07:00:00.000Z";
  manifest.accounting = { ledgerPath: join(dir, "ledger.json"), evidenceDir: join(dir, "evidence") };
  mutator?.(manifest);
  const bytes = JSON.stringify(manifest);
  const manifestPath = join(dir, "manifest.json");
  writeFileSync(manifestPath, bytes);
  const grant: ApprovalGrant = {
    grantId: "test-grant", manifestSha256: sha256(bytes), runLabel: manifest.label,
    approvedBy: manifest.approval!.approvedBy, reference: manifest.approval!.reference,
    approvedAtIso: manifest.approval!.approvedAtIso, expiresAtIso: manifest.expiresAtIso!,
    scope: {
      model: "gpt-6-luna", serviceTier: "default", policySha256: manifest.policySha256,
      sourceSnapshotSha256: manifest.sourceSnapshotSha256,
      maxDispatchAttempts: manifest.limits.maxDispatchAttempts, maxUsdMicros: manifest.limits.maxUsdMicros,
      priceBasisSha256: PRICE_BASIS_SHA256,
    },
  };
  return { dir, manifest, manifestPath, grant, options: { mode: "live" as const, manifestPath, outDir: join(dir, "out") }, clean: () => rmSync(dir, { recursive: true, force: true }) };
}
function response(n: number, over: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    id: `resp_simulated_${n}`, model: "gpt-6-luna", service_tier: "default", status: "completed",
    output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify({ text: "I hear what you are saying.", sourceIds: [] }) }] }],
    usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
    ...over,
  }));
}
const ledger = (f: ReturnType<typeof setup>) => JSON.parse(readFileSync(f.manifest.accounting.ledgerPath, "utf8"));
const summary = (f: ReturnType<typeof setup>) => JSON.parse(readFileSync(join(f.options.outDir, "run-summary.json"), "utf8"));

describe("P4 evaluator actual service lifecycle with simulated transport", () => {
  it("9 authorized simulated turns capture exact wire bytes/hashes before transport and settle unique receipts", async () => {
    const f = setup();
    try {
      let calls = 0;
      const result = await runConversationEvaluation(f.options, {
        env: { OPENAI_API_KEY: KEY }, grants: [f.grant], nowIso: () => NOW,
        fetchImpl: (async (_url, init) => {
          calls++;
          const evidenceFiles = readdirSync(f.manifest.accounting.evidenceDir).filter(p => p.endsWith("-admitted.json"));
          expect(evidenceFiles).toHaveLength(calls);
          const admitted = evidenceFiles.map(p => JSON.parse(readFileSync(join(f.manifest.accounting.evidenceDir, p), "utf8")));
          expect(admitted.some(x => x.exactRequestBody === init!.body && x.requestPayloadSha256 === sha256(String(init!.body)))).toBe(true);
          return response(calls);
        }) as typeof fetch,
      });
      expect(result).toMatchObject({ status: "completed", providerCalls: 9, dispatchAttempts: 9, simulatedTransport: true });
      expect(calls).toBe(9);
      expect(ledger(f).admissions.every((a: { state: string }) => a.state === "settled")).toBe(true);
      const finals = readdirSync(f.manifest.accounting.evidenceDir).filter(p => /^evidence-C\d+-\d+\.json$/.test(p));
      expect(finals).toHaveLength(9);
      expect(finals.every(p => JSON.parse(readFileSync(join(f.manifest.accounting.evidenceDir, p), "utf8")).requestPayloadSha256)).toBe(true);
    } finally { f.clean(); }
  });

  it("forged non-null manifest approval alone cannot read credentials", async () => {
    const f = setup();
    try {
      let reads = 0, calls = 0;
      const error = await runConversationEvaluation(f.options, {
        env: new Proxy({}, { get() { reads++; throw new Error("credential-read"); } }), nowIso: () => NOW,
        fetchImpl: (async () => { calls++; return response(calls); }) as typeof fetch,
      }).catch(e => e);
      expect(error.code).toBe("grant-absent"); expect(reads).toBe(0); expect(calls).toBe(0);
    } finally { f.clean(); }
  });

  it("injected grants cannot authorize the default real transport", async () => {
    const f = setup();
    try {
      let reads = 0;
      const error = await runConversationEvaluation(f.options, {
        env: new Proxy({}, { get() { reads++; throw new Error("credential-read"); } }), grants: [f.grant], nowIso: () => NOW,
      }).catch(e => e);
      expect(error.code).toBe("grant-absent"); expect(reads).toBe(0);
    } finally { f.clean(); }
  });

  for (const kind of ["refusal", "invalid-usage", "missing-receipt"] as const) {
    it(`first ${kind} stops further dispatch and retains uncertainty`, async () => {
      const f = setup();
      try {
        let calls = 0;
        const overrides = kind === "refusal" ? { output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "No." }] }] }
          : kind === "invalid-usage" ? { usage: { input_tokens: 100, output_tokens: 20, total_tokens: 999 } } : { id: null };
        const error = await runConversationEvaluation(f.options, {
          env: { OPENAI_API_KEY: KEY }, grants: [f.grant], nowIso: () => NOW,
          fetchImpl: (async () => { calls++; return response(calls, overrides); }) as typeof fetch,
        }).catch(e => e);
        expect(error.code).toBe("stop-condition"); expect(calls).toBe(1);
        expect(ledger(f).admissions[0].state).toBe("uncertain");
        expect(summary(f)).toMatchObject({ status: "stopped", providerCalls: 1, dispatchAttempts: 1 });
      } finally { f.clean(); }
    });
  }

  it("manifest expiry after the first completed call prevents the second call", async () => {
    const f = setup();
    try {
      let calls = 0;
      const error = await runConversationEvaluation(f.options, {
        env: { OPENAI_API_KEY: KEY }, grants: [f.grant], nowIso: () => calls ? "2026-10-26T07:00:01.000Z" : NOW,
        fetchImpl: (async () => { calls++; return response(calls); }) as typeof fetch,
      }).catch(e => e);
      expect(error.code).toBe("manifest-expired"); expect(calls).toBe(1);
      expect(readdirSync(f.manifest.accounting.evidenceDir)).toContain("evidence-C04-0.json");
    } finally { f.clean(); }
  });

  it("a one-byte input cap prevents any dispatch or reservation", async () => {
    const f = setup(m => { m.limits.maxInputBytes = 1; });
    try {
      let calls = 0;
      const error = await runConversationEvaluation(f.options, {
        env: { OPENAI_API_KEY: KEY }, grants: [f.grant], nowIso: () => NOW,
        fetchImpl: (async () => { calls++; return response(calls); }) as typeof fetch,
      }).catch(e => e);
      expect(error.code).toBe("stop-condition"); expect(calls).toBe(0); expect(ledger(f).admissions).toHaveLength(0);
      expect(summary(f).providerCalls).toBe(0);
    } finally { f.clean(); }
  });

  it("receipt reuse on the second call stops with its full hold retained", async () => {
    const f = setup();
    try {
      let calls = 0;
      await expect(runConversationEvaluation(f.options, {
        env: { OPENAI_API_KEY: KEY }, grants: [f.grant], nowIso: () => NOW,
        fetchImpl: (async () => { calls++; return response(1); }) as typeof fetch,
      })).rejects.toMatchObject({ code: "stop-condition" });
      expect(calls).toBe(2);
      expect(ledger(f).admissions.map((a: { state: string }) => a.state)).toEqual(["settled", "uncertain"]);
    } finally { f.clean(); }
  });

  it("a lock after the first call preserves its durable evidence and stops", async () => {
    const f = setup();
    try {
      let calls = 0;
      await expect(runConversationEvaluation(f.options, {
        env: { OPENAI_API_KEY: KEY }, grants: [f.grant], nowIso: () => NOW,
        fetchImpl: (async () => { calls++; writeFileSync(f.manifest.accounting.ledgerPath + ".lock", "injected-lock"); return response(calls); }) as typeof fetch,
      })).rejects.toMatchObject({ code: "stop-condition" });
      expect(calls).toBe(1);
      const files = readdirSync(f.manifest.accounting.evidenceDir);
      expect(files).toContain("evidence-C04-0-admitted.json");
      expect(files).toContain("evidence-C04-0-request-start.json");
      expect(files).toContain("evidence-C04-0.json");
      expect(files).toContain("run-stop.json");
    } finally { f.clean(); }
  });

  it("restarting with a fresh output/evidence directory cannot replay the catalog", async () => {
    const f = setup();
    try {
      let calls = 0;
      const deps = { env: { OPENAI_API_KEY: KEY }, grants: [f.grant], nowIso: () => NOW, fetchImpl: (async () => { calls++; return response(calls); }) as typeof fetch };
      await runConversationEvaluation(f.options, deps);
      renameSync(f.manifest.accounting.evidenceDir, f.manifest.accounting.evidenceDir + "-retained");
      await expect(runConversationEvaluation({ ...f.options, outDir: join(f.dir, "restart-out") }, deps)).rejects.toMatchObject({ code: "stop-condition" });
      expect(calls).toBe(9); expect(ledger(f).admissions).toHaveLength(9);
    } finally { f.clean(); }
  });

  it("future approval and manifest tampering fail before key reads", async () => {
    for (const kind of ["future", "tampered"] as const) {
      const f = setup();
      try {
        let reads = 0;
        const m = JSON.parse(readFileSync(f.manifestPath, "utf8"));
        if (kind === "future") m.approval.approvedAtIso = "2026-10-26T06:30:00.000Z";
        else m.limits.deadlineMs = 44000;
        writeFileSync(f.manifestPath, JSON.stringify(m));
        const error = await runConversationEvaluation(f.options, {
          env: new Proxy({}, { get() { reads++; throw new Error("credential-read"); } }), grants: [f.grant], nowIso: () => NOW,
          fetchImpl: (async () => { throw new Error("no transport expected"); }) as typeof fetch,
        }).catch(e => e);
        expect(error.code).toBe(kind === "future" ? "manifest-expired" : "grant-absent"); expect(reads).toBe(0);
      } finally { f.clean(); }
    }
  });
});
