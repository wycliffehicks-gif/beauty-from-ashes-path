// P4 isolated evaluator. Offline by default; real dispatch requires both the
// exact approved manifest and a separate server-controlled grant. Every
// attempt is durably recorded before transport, and any failure ends the run.
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync,
  renameSync, statSync, writeSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { ConversationService, type TurnOutcome } from "../../src/lib/ai/conversation/service/service";
import { CONVERSATION_POLICY_BLOCK_SHA256 } from "../../src/lib/ai/conversation/policy";
import { buildTeachingSourceRecords } from "../../src/lib/ai/conversation/content/index";
import { createSourceRegistry } from "../../src/lib/ai/conversation/sources";
import { validateEvalManifest, validateManifestForLive, type EvalManifest, type ManifestValidationCode } from "./manifest";
import { admitLiveGrant, loadApprovalGrants, type ApprovalGrant, type GrantRefusal } from "./approval-grants";
import { EvalLedger } from "./ledger";
import { computeConservativeChargeMicros } from "./pricing";
import type { ConversationExchangeMeta } from "../../src/lib/ai/conversation/service/openai-provider.server";

export const EVAL_RUNNER_VERSION = "bfa-conversation-eval-runner-v2";
export const EVAL_MAX_MANIFEST_BYTES = 64 * 1024;
export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
export async function computeSourceSnapshotSha256(): Promise<string> {
  const built = await createSourceRegistry(await buildTeachingSourceRecords());
  if (!built.ok) throw new Error("source-registry-unavailable");
  return sha256(JSON.stringify(built.registry.records));
}

type RefusalCode = ManifestValidationCode | GrantRefusal | "ledger-refused" | "stop-condition";
export class EvalAdmissionRefused extends Error {
  constructor(readonly code: RefusalCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "EvalAdmissionRefused";
  }
}
export interface EvalRunDeps {
  env?: NodeJS.ProcessEnv;
  /** Test transport only. Tests must not delegate to actual network fetch. */
  fetchImpl?: typeof fetch;
  /** Test grants only; rejected unless a test transport is also injected. */
  grants?: readonly ApprovalGrant[];
  nowIso?: () => string;
}
export interface EvalTurnEvidence {
  readonly caseId: string;
  readonly turnIndex: number;
  readonly requestId: string;
  readonly requestPayloadSha256: string | null;
  readonly responseText: string | null;
  readonly responseSha256: string | null;
  readonly outcome: string;
  readonly exchange: ConversationExchangeMeta | null;
  readonly ledgerState: string;
  readonly estimatedChargeMicros: number | null;
  readonly transportInvoked: boolean;
}
export interface EvalRunSummary {
  readonly runnerVersion: string;
  readonly mode: "validate" | "live";
  readonly manifestLabel: string | null;
  readonly structural: "pass" | ManifestValidationCode;
  readonly approval: "absent" | "present";
  readonly costBound: unknown | null;
  readonly dispatchAttempts: number;
  readonly providerCalls: number;
  /** Conservative accounting estimate, not an invoice or measured charge. */
  readonly estimatedProviderCostMicros: number;
  readonly status: "validated" | "running" | "completed" | "stopped";
  readonly simulatedTransport: boolean;
  readonly evidence: string;
}

function readManifest(path: string): { bytes: string; raw: unknown } {
  try {
    if (statSync(path).size > EVAL_MAX_MANIFEST_BYTES) throw new Error();
    const bytes = readFileSync(path, "utf8");
    return { bytes, raw: JSON.parse(bytes) };
  } catch {
    throw new EvalAdmissionRefused("invalid-manifest", "manifest unreadable, oversized or invalid JSON");
  }
}
function syncDirectory(path: string): void {
  const fd = openSync(path, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
/** Exclusive, fsynced writes: a failed write prevents the next transport. */
function writeFresh(path: string, value: unknown): void {
  const fd = openSync(path, "wx", 0o600);
  try { writeSync(fd, JSON.stringify(value, null, 2) + "\n"); fsyncSync(fd); }
  finally { closeSync(fd); }
  syncDirectory(dirname(path));
}
function writeSummary(path: string, value: unknown): void {
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFresh(tmp, value);
  renameSync(tmp, path);
  syncDirectory(dirname(path));
}
function freshDirectory(path: string): void {
  if (existsSync(path)) throw new Error("output directory already exists");
  mkdirSync(dirname(path), { recursive: true });
  mkdirSync(path, { mode: 0o700 });
  syncDirectory(dirname(path));
}

export async function runConversationEvaluation(
  options: { mode: "validate" | "live"; manifestPath: string; outDir: string },
  deps: EvalRunDeps = {},
): Promise<EvalRunSummary> {
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const { bytes: manifestBytes, raw } = readManifest(options.manifestPath);
  const manifestSha256 = sha256(manifestBytes);
  const context = {
    nowIso: nowIso(),
    expectedPolicySha256: CONVERSATION_POLICY_BLOCK_SHA256,
    expectedSourceSnapshotSha256: await computeSourceSnapshotSha256(),
  };
  const outDir = resolve(options.outDir);
  if (options.mode === "validate") {
    const result = validateEvalManifest(raw, context);
    const approval = raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>).approval : null;
    const summary: EvalRunSummary = {
      runnerVersion: EVAL_RUNNER_VERSION, mode: "validate",
      manifestLabel: result.ok ? result.manifest.label : null,
      structural: result.ok ? "pass" : result.code,
      approval: approval ? "present" : "absent",
      costBound: result.ok ? result.costBound : null,
      dispatchAttempts: 0, providerCalls: 0, estimatedProviderCostMicros: 0,
      status: "validated", simulatedTransport: false,
      evidence: "offline validation only; no model output; no quality evidence",
    };
    freshDirectory(outDir);
    writeFresh(`${outDir}/run-summary.json`, { ...summary, validatedAtIso: nowIso(), manifestSha256 });
    return summary;
  }

  // A caller-supplied manifest cannot authorize itself. The production
  // registry path is fixed in source, never taken from the manifest/CLI.
  if (deps.grants && !deps.fetchImpl) throw new EvalAdmissionRefused("grant-absent", "test grants require a simulated transport");
  const recheck = () => {
    const live = validateManifestForLive(raw, { ...context, nowIso: nowIso() });
    if (!live.ok) throw new EvalAdmissionRefused(live.code, "live manifest refused");
    const grants = deps.grants ?? loadApprovalGrants();
    const grant = admitLiveGrant(manifestBytes, live.manifest, grants, nowIso());
    if (!grant.ok) throw new EvalAdmissionRefused(grant.code, "separate live grant refused");
    return live;
  };
  const { manifest, costBound } = recheck();
  const evidenceDir = resolve(manifest.accounting.evidenceDir);
  freshDirectory(outDir);
  freshDirectory(evidenceDir);
  mkdirSync(dirname(resolve(manifest.accounting.ledgerPath)), { recursive: true });
  const ledger = EvalLedger.open(resolve(manifest.accounting.ledgerPath), manifest.limits.maxUsdMicros, {
    runId: `eval-${manifestSha256}`, manifestSha256,
    maxDispatchAttempts: manifest.limits.maxDispatchAttempts,
  }, nowIso);
  let calls = 0;
  let chargedTotal = 0;
  let status: EvalRunSummary["status"] = "running";
  const summary = (): EvalRunSummary => ({
    runnerVersion: EVAL_RUNNER_VERSION, mode: "live", manifestLabel: manifest.label,
    structural: "pass", approval: "present", costBound,
    dispatchAttempts: ledger.dispatchedAttempts(), providerCalls: calls,
    estimatedProviderCostMicros: chargedTotal, status,
    simulatedTransport: !!deps.fetchImpl, evidence: evidenceDir,
  });
  writeFresh(`${evidenceDir}/run-start.json`, {
    manifestSha256, manifest, runnerVersion: EVAL_RUNNER_VERSION,
    simulatedTransport: !!deps.fetchImpl, startedAtIso: nowIso(),
  });
  writeSummary(`${outDir}/run-summary.json`, summary());
  try {
  // The manifest AND grant are checked before this single credential read.
  recheck();
  const apiKey = deps.env?.["OPENAI_API_KEY"];
  if (!apiKey) throw new EvalAdmissionRefused("invalid-manifest", "OPENAI_API_KEY absent");
  const transport = deps.fetchImpl ?? globalThis.fetch;
  const { createDirectOpenAIConversationProvider } = await import(
    "../../src/lib/ai/conversation/service/openai-provider.server"
  );

    for (const evalCase of manifest.cases) {
      let current: {
        requestId: string; turnIndex: number; hash: string | null;
        invoked: boolean; admitted: boolean; meta: ConversationExchangeMeta | null;
      } | null = null;
      const provider = createDirectOpenAIConversationProvider({
        apiKey, model: manifest.provider.model,
        maxOutputTokens: manifest.limits.maxOutputTokens,
        maxInputBytes: manifest.limits.maxInputBytes,
        deadlineMs: manifest.limits.deadlineMs,
        onExchange: (m) => { if (current) current.meta = m; },
        fetchImpl: (async (url, init) => {
          if (!current || current.invoked || typeof init?.body !== "string") throw new Error("invalid-evaluation-dispatch");
          const body = init.body;
          // Defense in depth: enforce the same exact full-wire UTF-8 bound
          // used by reservation, before credential-bearing transport.
          if (Buffer.byteLength(body, "utf8") > manifest.limits.maxInputBytes || body.includes(apiKey)) {
            throw new Error("invalid-evaluation-payload");
          }
          recheck();
          const reserved = ledger.reserve({
            requestId: current.requestId, caseId: evalCase.caseId, turnIndex: current.turnIndex,
            model: manifest.provider.model, reservedMicros: costBound.worstCasePerDispatchMicros,
          });
          if (!reserved.ok || reserved.duplicate) throw new EvalAdmissionRefused("ledger-refused", "reserve refused");
          current.admitted = true;
          current.hash = sha256(body);
          const prefix = `${evidenceDir}/evidence-${evalCase.caseId}-${current.turnIndex}`;
          writeFresh(`${prefix}-admitted.json`, {
            requestId: current.requestId, caseId: evalCase.caseId, turnIndex: current.turnIndex,
            manifestSha256, model: manifest.provider, admittedAtIso: nowIso(),
            requestPayloadSha256: current.hash, inputBytes: Buffer.byteLength(body, "utf8"),
            exactRequestBody: body, reservedMicros: costBound.worstCasePerDispatchMicros,
            simulatedTransport: !!deps.fetchImpl,
          });
          recheck();
          const claimed = ledger.claim(current.requestId);
          if (!claimed.ok || claimed.duplicate) throw new EvalAdmissionRefused("ledger-refused", "claim refused");
          writeFresh(`${prefix}-request-start.json`, {
            requestId: current.requestId, requestPayloadSha256: current.hash,
            startedAtIso: nowIso(), state: "dispatch-claimed; outcome uncertain until response evidence",
          });
          recheck();
          current.invoked = true;
          calls += 1;
          return transport(url, init);
        }) as typeof fetch,
      });
      const service = new ConversationService({ verifiedOwnerId: "conversation-eval-fixture-owner", provider });
      await service.ready();
      const storeId = `eval-${evalCase.caseId.toLowerCase()}`;
      service.ensureThread(storeId, false);
      for (const [turnIndex, text] of evalCase.turns.entries()) {
        recheck();
        current = { requestId: randomUUID(), turnIndex, hash: null, invoked: false, admitted: false, meta: null };
        const turnId = service.admitUserMessage(storeId, `eval-msg-${evalCase.caseId}-${turnIndex}`, text);
        let outcome: TurnOutcome | null = null;
        let committed: string;
        try {
          committed = await service.runTurn(storeId, turnId, { accept: () => true, apply: (o) => { outcome = o; } });
        } catch { committed = "error"; }
        const meta = current.meta as ConversationExchangeMeta | null;
        const okTurn = committed === "committed" && outcome !== null && (outcome as TurnOutcome).ok;
        const replyText = okTurn ? (outcome as unknown as { text: string }).text : null;
        let charge: number | null = null;
        let ledgerState = current.admitted ? "uncertain" : "not-admitted";
        let failed = !okTurn || !current.invoked || meta?.outcome !== "complete";
        let accountingError = false;
        try {
          if (!failed && meta?.responseId && meta.usageConsistent) {
            charge = computeConservativeChargeMicros(meta.usage, manifest.priceBasis);
            if (charge !== null) {
              const settled = ledger.reconcile(current.requestId, meta.responseId, charge);
              if (!settled.ok) { charge = null; failed = true; accountingError = true; }
              else { ledgerState = settled.admission.state; chargedTotal += charge; }
            } else failed = true;
          } else failed = true;
          if (failed && current.admitted) {
            const stopped = ledger.stop(current.requestId);
            ledgerState = stopped.ok ? stopped.admission.state : "stop-refused; hold retained";
          }
        } catch { failed = true; accountingError = true; ledgerState = "accounting-unavailable; hold retained"; }
        const record: EvalTurnEvidence = {
          caseId: evalCase.caseId, turnIndex, requestId: current.requestId,
          requestPayloadSha256: current.hash,
          responseText: replyText, responseSha256: replyText ? sha256(replyText) : null,
          outcome: accountingError ? "ledger-refused" : meta?.outcome ?? committed,
          exchange: meta, ledgerState, estimatedChargeMicros: charge,
          transportInvoked: current.invoked,
        };
        writeFresh(`${evidenceDir}/evidence-${evalCase.caseId}-${turnIndex}.json`, record);
        writeSummary(`${outDir}/run-summary.json`, summary());
        if (failed) throw new EvalAdmissionRefused("stop-condition", "evaluation stopped after failed or uncertain exchange");
      }
    }
    status = "completed";
    writeSummary(`${outDir}/run-summary.json`, summary());
    return summary();
  } catch (error) {
    status = "stopped";
    // Never persist an arbitrary exception string: it may contain credentials
    // or provider content. Prior per-attempt records remain independently usable.
    writeFresh(`${evidenceDir}/run-stop.json`, {
      stoppedAtIso: nowIso(), code: error instanceof EvalAdmissionRefused ? error.code : "evaluation-error",
      providerCalls: calls, estimatedProviderCostMicros: chargedTotal,
      note: "No retries. Any unresolved admitted request keeps its ledger hold.",
    });
    writeSummary(`${outDir}/run-summary.json`, summary());
    throw error instanceof EvalAdmissionRefused ? error : new EvalAdmissionRefused("stop-condition", "evaluation failed closed");
  }
}
export type { EvalManifest };
