// Conversation P4 evaluator — runner. Default mode is VALIDATE (offline):
// it never reads credentials and never calls fetch. Live mode revalidates the
// manifest (including explicit approval and expiry) BEFORE any key is read
// or any dispatch is attempted, then runs the exact catalog turns through
// the real conversation service with the direct provider, with every
// dispatch admitted by the durable single-host ledger above the adapter.
//
// No retries, no fallback, no model substitution. Aborting a dispatch never
// refunds: the reservation stays uncertain until trusted reconciliation.

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConversationService } from "../../src/lib/ai/conversation/service/service";
import type { TurnOutcome } from "../../src/lib/ai/conversation/service/service";
import { CONVERSATION_POLICY_BLOCK_SHA256 } from "../../src/lib/ai/conversation/policy";
import { buildTeachingSourceRecords } from "../../src/lib/ai/conversation/content/index";
import { createSourceRegistry } from "../../src/lib/ai/conversation/sources";
import {
  validateEvalManifest,
  validateManifestForLive,
  type EvalManifest,
  type ManifestValidationCode,
} from "./manifest";
import { EvalLedger } from "./ledger";
import { computeConservativeChargeMicros } from "./pricing";
import type { ConversationExchangeMeta } from "../../src/lib/ai/conversation/service/openai-provider.server";

export const EVAL_RUNNER_VERSION = "bfa-conversation-eval-runner-v1";
export const EVAL_MAX_MANIFEST_BYTES = 64 * 1024;

export const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

/** Snapshot hash binding the manifest to the exact current source registry. */
export async function computeSourceSnapshotSha256(): Promise<string> {
  const built = await createSourceRegistry(await buildTeachingSourceRecords());
  if (!built.ok) throw new Error("source-registry-unavailable");
  return sha256(JSON.stringify(built.registry.records));
}

export class EvalAdmissionRefused extends Error {
  readonly code: ManifestValidationCode | "ledger-refused" | "stop-condition";
  constructor(code: ManifestValidationCode | "ledger-refused" | "stop-condition", detail: string) {
    super(`${code}: ${detail}`);
    this.name = "EvalAdmissionRefused";
    this.code = code;
  }
}

export interface EvalRunDeps {
  /** Live mode only: the key is read from here AFTER manifest admission. */
  env?: NodeJS.ProcessEnv;
  /** Live mode only: tests inject a simulated fetch; never a default override. */
  fetchImpl?: typeof fetch;
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
  readonly usage: ConversationExchangeMeta["usage"] | null;
  readonly usageConsistent: boolean | null;
  readonly latencyMs: number | null;
  readonly ledgerState: string;
  readonly chargedMicros: number | null;
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
  readonly actualProviderCostMicros: number;
  readonly evidence: string;
}

function readManifest(path: string): unknown {
  if (statSync(path).size > EVAL_MAX_MANIFEST_BYTES) {
    throw new EvalAdmissionRefused("invalid-manifest", "manifest too large");
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new EvalAdmissionRefused("invalid-manifest", "manifest is not valid JSON");
  }
}

function writeFresh(path: string, content: string): void {
  writeFileSync(path, content, { flag: "wx", mode: 0o600 });
}

export async function runConversationEvaluation(
  options: { mode: "validate" | "live"; manifestPath: string; outDir: string },
  deps: EvalRunDeps = {},
): Promise<EvalRunSummary> {
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const raw = readManifest(options.manifestPath);
  const context = {
    nowIso: nowIso(),
    expectedPolicySha256: CONVERSATION_POLICY_BLOCK_SHA256,
    expectedSourceSnapshotSha256: await computeSourceSnapshotSha256(),
  };

  const outDir = resolve(options.outDir);
  if (existsSync(outDir)) throw new Error("output directory already exists");
  mkdirSync(outDir, { recursive: false });

  if (options.mode === "validate") {
    // VALIDATE MODE: structural checks only. No env read, no key read, no
    // fetch, no ledger write, no dispatch — by construction below.
    const result = validateEvalManifest(raw, context);
    const approvalField =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>).approval
        : null;
    const summary: EvalRunSummary = {
      runnerVersion: EVAL_RUNNER_VERSION,
      mode: "validate",
      manifestLabel: result.ok ? result.manifest.label : null,
      structural: result.ok ? "pass" : result.code,
      approval: approvalField ? "present" : "absent",
      costBound: result.ok ? result.costBound : null,
      dispatchAttempts: 0,
      providerCalls: 0,
      actualProviderCostMicros: 0,
      evidence: "offline validation only; no model output; no quality evidence",
    };
    writeFresh(
      `${outDir}/run-summary.json`,
      JSON.stringify({ ...summary, validatedAtIso: nowIso() }, null, 2) + "\n",
    );
    return summary;
  }

  // LIVE MODE: full admission BEFORE any credential access or dispatch.
  const live = validateManifestForLive(raw, context);
  if (!live.ok) throw new EvalAdmissionRefused(live.code, "live manifest refused");
  const { manifest, costBound } = live;
  const apiKey = deps.env?.["OPENAI_API_KEY"];
  if (!apiKey) throw new EvalAdmissionRefused("invalid-manifest", "OPENAI_API_KEY absent");

  const ledger = EvalLedger.open(
    resolve(manifest.accounting.ledgerPath),
    manifest.limits.maxUsdMicros,
    nowIso,
  );
  const evidenceDir = resolve(manifest.accounting.evidenceDir);
  if (existsSync(evidenceDir)) throw new Error("evidence directory already exists");
  mkdirSync(evidenceDir, { recursive: true });

  const { createDirectOpenAIConversationProvider } = await import(
    "../../src/lib/ai/conversation/service/openai-provider.server"
  );

  let attempts = 0;
  let chargedTotal = 0;
  const evidence: EvalTurnEvidence[] = [];

  for (const evalCase of manifest.cases) {
    const metas: ConversationExchangeMeta[] = [];
    const provider = createDirectOpenAIConversationProvider({
      apiKey,
      model: manifest.provider.model,
      fetchImpl: deps.fetchImpl,
      maxOutputTokens: manifest.limits.maxOutputTokens,
      deadlineMs: manifest.limits.deadlineMs,
      onExchange: (m) => metas.push(m),
    });
    // Fresh thread per case; spiritual preference OFF per manifest rules.
    const service = new ConversationService({
      verifiedOwnerId: "conversation-eval-fixture-owner",
      provider,
    });
    await service.ready();
    const storeId = `eval-${evalCase.caseId.toLowerCase()}`;
    service.ensureThread(storeId, false);

    for (const [turnIndex, text] of evalCase.turns.entries()) {
      if (attempts >= manifest.limits.maxDispatchAttempts) {
        throw new EvalAdmissionRefused("stop-condition", "dispatch attempt cap reached");
      }
      const requestId = randomUUID();
      const reserved = ledger.reserve({
        requestId,
        caseId: evalCase.caseId,
        turnIndex,
        model: manifest.provider.model,
        reservedMicros: costBound.worstCasePerDispatchMicros,
      });
      if (!reserved.ok) {
        throw new EvalAdmissionRefused("ledger-refused", `reserve: ${reserved.code}`);
      }
      if (!reserved.duplicate) {
        const claimed = ledger.claim(requestId);
        if (!claimed.ok) {
          throw new EvalAdmissionRefused("ledger-refused", `claim: ${claimed.code}`);
        }
      }
      attempts += 1;

      const turnId = service.admitUserMessage(
        storeId,
        `eval-msg-${evalCase.caseId}-${turnIndex}`,
        text,
      );
      let outcome: TurnOutcome | null = null;
      let committed: string;
      try {
        committed = await service.runTurn(storeId, turnId, {
          accept: () => true,
          apply: (o) => {
            outcome = o;
          },
        });
      } catch {
        committed = "error";
      }
      const meta = metas.length ? metas[metas.length - 1] : null;
      const okTurn = committed === "committed" && outcome !== null && (outcome as TurnOutcome).ok;

      let ledgerState: string;
      let chargedMicros: number | null = null;
      if (okTurn && meta?.outcome === "complete") {
        const charge = computeConservativeChargeMicros(meta.usage, manifest.priceBasis);
        if (charge === null || !meta.usageConsistent) {
          // Unknown/invalid/mismatched usage: retain the reservation.
          const stopped = ledger.stop(requestId);
          ledgerState = stopped.ok ? stopped.admission.state : "stop-refused";
        } else {
          const settled = ledger.reconcile(
            requestId,
            meta.responseId ?? requestId,
            charge,
          );
          if (!settled.ok) {
            throw new EvalAdmissionRefused("ledger-refused", `reconcile: ${settled.code}`);
          }
          ledgerState = settled.admission.state;
          chargedMicros = charge;
          chargedTotal += charge;
        }
      } else {
        // Any failure after claim keeps an uncertain hold; a pre-dispatch
        // refusal cancels once. Never an automatic refund of a real dispatch.
        const stopped = ledger.stop(requestId);
        ledgerState = stopped.ok ? stopped.admission.state : "stop-refused";
      }

      const replyText =
        okTurn && outcome && (outcome as { ok: true; text: string }).text
          ? (outcome as { ok: true; text: string }).text
          : null;
      evidence.push({
        caseId: evalCase.caseId,
        turnIndex,
        requestId,
        requestPayloadSha256: null, // request bytes are hashed by the adapter tests; live capture below
        responseText: replyText,
        responseSha256: replyText ? sha256(replyText) : null,
        outcome: meta?.outcome ?? committed,
        usage: meta?.usage ?? null,
        usageConsistent: meta?.usageConsistent ?? null,
        latencyMs: meta?.latencyMs ?? null,
        ledgerState,
        chargedMicros,
      });
    }
  }

  for (const record of evidence) {
    writeFresh(
      `${evidenceDir}/evidence-${record.caseId}-${record.turnIndex}.json`,
      JSON.stringify(record, null, 2) + "\n",
    );
  }
  const summary: EvalRunSummary = {
    runnerVersion: EVAL_RUNNER_VERSION,
    mode: "live",
    manifestLabel: manifest.label,
    structural: "pass",
    approval: "present",
    costBound,
    dispatchAttempts: attempts,
    providerCalls: attempts,
    actualProviderCostMicros: chargedTotal,
    evidence: evidenceDir,
  };
  writeFresh(`${outDir}/run-summary.json`, JSON.stringify(summary, null, 2) + "\n");
  return summary;
}

export type { EvalManifest };
