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
import { EvalLedger, EvalLedgerError, type EvalAdmission, type EvalLedgerRefusal } from "./ledger";
import { computeConservativeChargeMicros } from "./pricing";
import type { ConversationExchangeMeta } from "../../src/lib/ai/conversation/service/openai-provider.server";

export const EVAL_RUNNER_VERSION = "bfa-conversation-eval-runner-v4";
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
export interface EvalAccountingFailure {
  readonly stage: "reserve" | "claim" | "reconcile" | "stop" | "accounting";
  readonly kind: "refusal" | "exception" | "invariant";
  readonly code: EvalLedgerRefusal | "binding-mismatch" | "duplicate" | "observed-claim-missing" | "unexpected-error";
}
const ledgerRefusalCode = (code: EvalLedgerRefusal): EvalAccountingFailure["code"] =>
  ["invalid", "locked", "corrupt", "conflict", "limit", "consumed", "receipt-conflict"].includes(code)
    ? code : "unexpected-error";
function ledgerExceptionCode(error: unknown): EvalAccountingFailure["code"] {
  // Only our fixed error class and enumerated code are evidence. Never copy
  // an arbitrary exception message, stack, code or provider response field.
  if (error instanceof EvalLedgerError && ["locked", "corrupt", "binding-mismatch"].includes(error.code)) return error.code;
  return "unexpected-error";
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
  /** Computed from validated usage even if ledger reconciliation is refused;
   * not a reconciled charge, invoice or permission to release a hold. */
  readonly computedChargeMicros: number | null;
  readonly accountingFailures: readonly EvalAccountingFailure[];
  readonly transportInvoked: boolean;
}
export interface EvalRunSummary {
  readonly runnerVersion: string;
  readonly mode: "validate" | "live";
  readonly manifestLabel: string | null;
  readonly structural: "pass" | ManifestValidationCode;
  readonly approval: "absent" | "present";
  readonly costBound: unknown | null;
  /** Conservative high-water: never below a claim or transport this run observed. */
  readonly dispatchAttempts: number;
  readonly ledgerDispatchAttempts: number | null;
  readonly accountingStatus: "consistent" | "conflict" | "unavailable";
  readonly providerCalls: number;
  /** Reconciled estimates only; partial on accounting failure, never an invoice. */
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
      dispatchAttempts: 0, ledgerDispatchAttempts: 0, accountingStatus: "consistent",
      providerCalls: 0, estimatedProviderCostMicros: 0,
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
  let lastAccountingFailures: readonly EvalAccountingFailure[] = [];
  let observedClaims = ledger.dispatchedAttempts();
  let dispatchHighWater = observedClaims;
  let accountingStatus: EvalRunSummary["accountingStatus"] = "consistent";
  const summary = (): EvalRunSummary => {
    let ledgerDispatchAttempts: number | null = null;
    try {
      ledgerDispatchAttempts = ledger.dispatchedAttempts();
      if (ledgerDispatchAttempts !== observedClaims) accountingStatus = "conflict";
      dispatchHighWater = Math.max(dispatchHighWater, ledgerDispatchAttempts);
    } catch { accountingStatus = "unavailable"; }
    dispatchHighWater = Math.max(dispatchHighWater, observedClaims, calls);
    return {
      runnerVersion: EVAL_RUNNER_VERSION, mode: "live", manifestLabel: manifest.label,
      structural: "pass", approval: "present", costBound,
      dispatchAttempts: dispatchHighWater, ledgerDispatchAttempts, accountingStatus, providerCalls: calls,
      estimatedProviderCostMicros: chargedTotal, status,
      simulatedTransport: !!deps.fetchImpl, evidence: evidenceDir,
    };
  };
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
        claim: EvalAdmission | null;
        accountingFailures: EvalAccountingFailure[];
      } | null = null;
      const accountingOperation = <T>(failures: EvalAccountingFailure[], stage: EvalAccountingFailure["stage"], operation: () => T): T => {
        try { return operation(); }
        catch (error) {
          failures.push({ stage, kind: "exception", code: ledgerExceptionCode(error) });
          throw error;
        }
      };
      const provider = createDirectOpenAIConversationProvider({
        apiKey, model: manifest.provider.model,
        maxOutputTokens: manifest.limits.maxOutputTokens,
        maxInputBytes: manifest.limits.maxInputBytes,
        deadlineMs: manifest.limits.deadlineMs,
        onExchange: (m) => { if (current) current.meta = m; },
        fetchImpl: (async (url, init) => {
          if (!current || current.invoked || typeof init?.body !== "string") throw new Error("invalid-evaluation-dispatch");
          const attempt = current;
          const body = init.body;
          // Defense in depth: enforce the same exact full-wire UTF-8 bound
          // used by reservation, before credential-bearing transport.
          if (Buffer.byteLength(body, "utf8") > manifest.limits.maxInputBytes || body.includes(apiKey)) {
            throw new Error("invalid-evaluation-payload");
          }
          recheck();
          if (accountingStatus !== "consistent" || observedClaims >= manifest.limits.maxDispatchAttempts) {
            throw new EvalAdmissionRefused("ledger-refused", "known dispatch scope exhausted or conflicting");
          }
          const reserved = accountingOperation(attempt.accountingFailures, "reserve", () => ledger.reserve({
            requestId: attempt.requestId, caseId: evalCase.caseId, turnIndex: attempt.turnIndex,
            model: manifest.provider.model, reservedMicros: costBound.worstCasePerDispatchMicros,
          }));
          if (!reserved.ok || reserved.duplicate) {
            attempt.accountingFailures.push({ stage: "reserve", kind: "refusal", code: reserved.ok ? "duplicate" : ledgerRefusalCode(reserved.code) });
            throw new EvalAdmissionRefused("ledger-refused", "reserve refused");
          }
          attempt.admitted = true;
          attempt.hash = sha256(body);
          const prefix = `${evidenceDir}/evidence-${evalCase.caseId}-${attempt.turnIndex}`;
          writeFresh(`${prefix}-admitted.json`, {
            requestId: attempt.requestId, caseId: evalCase.caseId, turnIndex: attempt.turnIndex,
            manifestSha256, model: manifest.provider, admittedAtIso: nowIso(),
            requestPayloadSha256: attempt.hash, inputBytes: Buffer.byteLength(body, "utf8"),
            exactRequestBody: body, reservedMicros: costBound.worstCasePerDispatchMicros,
            simulatedTransport: !!deps.fetchImpl,
          });
          recheck();
          const claimed = accountingOperation(attempt.accountingFailures, "claim", () => ledger.claim(attempt.requestId));
          if (!claimed.ok || claimed.duplicate) {
            attempt.accountingFailures.push({ stage: "claim", kind: "refusal", code: claimed.ok ? "duplicate" : ledgerRefusalCode(claimed.code) });
            throw new EvalAdmissionRefused("ledger-refused", "claim refused");
          }
          attempt.claim = Object.freeze({ ...claimed.admission });
          observedClaims += 1;
          writeFresh(`${prefix}-request-start.json`, {
            requestId: attempt.requestId, requestPayloadSha256: attempt.hash,
            startedAtIso: nowIso(), state: "dispatch-claimed; outcome uncertain until response evidence",
          });
          recheck();
          attempt.invoked = true;
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
        current = { requestId: randomUUID(), turnIndex, hash: null, invoked: false, admitted: false, meta: null, claim: null, accountingFailures: [] };
        const turnId = service.admitUserMessage(storeId, `eval-msg-${evalCase.caseId}-${turnIndex}`, text);
        let outcome: TurnOutcome | null = null;
        let committed: string;
        try {
          committed = await service.runTurn(storeId, turnId, { accept: () => true, apply: (o) => { outcome = o; } });
        } catch { committed = "error"; }
        const attempt = current;
        const meta = attempt.meta as ConversationExchangeMeta | null;
        const okTurn = committed === "committed" && outcome !== null && (outcome as TurnOutcome).ok;
        const replyText = okTurn ? (outcome as unknown as { text: string }).text : null;
        let charge: number | null = null;
        let computedCharge: number | null = null;
        let ledgerState = attempt.admitted ? "uncertain" : "not-admitted";
        let failed = !okTurn || !attempt.invoked || meta?.outcome !== "complete";
        let accountingError = false;
        const failuresBeforeAccounting = attempt.accountingFailures.length;
        try {
          if (attempt.invoked && !attempt.claim) {
            attempt.accountingFailures.push({ stage: "accounting", kind: "invariant", code: "observed-claim-missing" });
            throw new Error("observed-dispatch-claim-unavailable");
          }
          const responseId = meta?.responseId;
          if (!failed && responseId && meta?.usageConsistent) {
            computedCharge = computeConservativeChargeMicros(meta.usage, manifest.priceBasis);
            charge = computedCharge;
            if (charge !== null) {
              const reconciliationCharge = charge;
              const observedClaim = attempt.claim ?? undefined;
              const settled = accountingOperation(attempt.accountingFailures, "reconcile", () => ledger.reconcile(attempt.requestId, responseId, reconciliationCharge, observedClaim));
              if (!settled.ok) {
                attempt.accountingFailures.push({ stage: "reconcile", kind: "refusal", code: ledgerRefusalCode(settled.code) });
                charge = null; failed = true; accountingError = true; accountingStatus = "conflict";
              }
              else { ledgerState = settled.admission.state; chargedTotal += charge; }
            } else failed = true;
          } else failed = true;
          if (failed && attempt.admitted) {
            const observedClaim = attempt.invoked ? attempt.claim ?? undefined : undefined;
            const stopped = accountingOperation(attempt.accountingFailures, "stop", () => ledger.stop(attempt.requestId, observedClaim));
            ledgerState = stopped.ok ? stopped.admission.state : "accounting-conflict; reservation not confirmed";
            if (!stopped.ok) {
              attempt.accountingFailures.push({ stage: "stop", kind: "refusal", code: ledgerRefusalCode(stopped.code) });
              accountingError = true; accountingStatus = "conflict";
            }
          }
        } catch (error) {
          if (attempt.accountingFailures.length === failuresBeforeAccounting) {
            attempt.accountingFailures.push({ stage: "accounting", kind: "exception", code: ledgerExceptionCode(error) });
          }
          failed = true; accountingError = true; accountingStatus = "unavailable";
          charge = null; ledgerState = "accounting-unavailable; reservation not confirmed";
        }
        lastAccountingFailures = attempt.accountingFailures.map((failure) => ({ ...failure }));
        const record: EvalTurnEvidence = {
          caseId: evalCase.caseId, turnIndex, requestId: attempt.requestId,
          requestPayloadSha256: attempt.hash,
          responseText: replyText, responseSha256: replyText ? sha256(replyText) : null,
          outcome: accountingError ? "ledger-refused" : meta?.outcome ?? committed,
          exchange: meta, ledgerState, estimatedChargeMicros: charge,
          computedChargeMicros: computedCharge, accountingFailures: lastAccountingFailures,
          transportInvoked: attempt.invoked,
        };
        writeFresh(`${evidenceDir}/evidence-${evalCase.caseId}-${turnIndex}.json`, record);
        writeSummary(`${outDir}/run-summary.json`, summary());
        if (failed || accountingStatus !== "consistent") throw new EvalAdmissionRefused("stop-condition", "evaluation stopped after failed or uncertain exchange");
      }
    }
    // One terminal snapshot: a newly discovered storage conflict must not be
    // labelled completed, nor hidden by a second independently mutable read.
    const finalSummary = summary();
    if (finalSummary.accountingStatus !== "consistent") {
      throw new EvalAdmissionRefused("stop-condition", "final accounting snapshot refused");
    }
    status = "completed";
    const completedSummary: EvalRunSummary = { ...finalSummary, status };
    writeSummary(`${outDir}/run-summary.json`, completedSummary);
    return completedSummary;
  } catch (error) {
    status = "stopped";
    // Never persist an arbitrary exception string: it may contain credentials
    // or provider content. Prior per-attempt records remain independently usable.
    writeFresh(`${evidenceDir}/run-stop.json`, {
      stoppedAtIso: nowIso(), code: error instanceof EvalAdmissionRefused ? error.code : "evaluation-error",
      providerCalls: calls, estimatedProviderCostMicros: chargedTotal,
      accountingFailures: lastAccountingFailures,
      note: "No retries. Unresolved dispatches require review; conflicting or unavailable storage cannot confirm a retained reservation.",
    });
    writeSummary(`${outDir}/run-summary.json`, summary());
    throw error instanceof EvalAdmissionRefused ? error : new EvalAdmissionRefused("stop-condition", "evaluation failed closed");
  }
}
export type { EvalManifest };
