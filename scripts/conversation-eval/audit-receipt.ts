// Historical v2/v3 evidence only. No runner, grant, ledger instance, credential
// access or transport is used. A matching bundle is not authenticated provider
// evidence and cannot prove what the ledger contained at reconciliation time.
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { EvalManifestSchema } from "./manifest";
import { computeConservativeChargeMicros, PROTOCOL_OVERHEAD_TOKENS } from "./pricing";

const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
const Micros = z.number().int().nonnegative().max(1_000_000_000_000);
const Count = z.number().int().nonnegative().max(10_000_000);
const Iso = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const State = z.enum([
  "reserved",
  "dispatched",
  "uncertain",
  "settled",
  "cancelled-before-dispatch",
]);
const Usage = z
  .object({
    inputTokens: Count.nullable(),
    outputTokens: Count.nullable(),
    reasoningTokens: Count.nullable(),
    cachedInputTokens: Count.nullable(),
    cacheWriteTokens: Count.nullable(),
    totalTokens: Count.nullable(),
  })
  .strict();
const Admission = z
  .object({
    requestId: Id,
    caseId: Id,
    turnIndex: Count,
    model: Id,
    reservedMicros: Micros.positive(),
    state: State,
    receipt: z.object({ receiptId: Id, chargedMicros: Micros }).strict().nullable(),
    createdAtIso: Iso,
    updatedAtIso: Iso,
  })
  .strict()
  .refine((a) =>
    a.state === "settled"
      ? a.receipt !== null && a.receipt.chargedMicros <= a.reservedMicros
      : a.receipt === null,
  );
const Ledger = z
  .object({
    version: z.literal(2),
    budgetMicros: Micros.positive(),
    runId: Id,
    manifestSha256: Hash,
    maxDispatchAttempts: z.number().int().min(1).max(9),
    admissions: z.array(Admission).max(10_000),
  })
  .strict();
const RunStart = z
  .object({
    manifestSha256: Hash,
    manifest: EvalManifestSchema,
    runnerVersion: z.enum(["bfa-conversation-eval-runner-v2", "bfa-conversation-eval-runner-v3"]),
    simulatedTransport: z.boolean(),
    startedAtIso: Iso,
  })
  .strict();
const Admitted = z
  .object({
    requestId: Id,
    caseId: z.enum(["C04", "C05", "C07", "C08"]),
    turnIndex: Count,
    manifestSha256: Hash,
    model: EvalManifestSchema.shape.provider,
    admittedAtIso: Iso,
    requestPayloadSha256: Hash,
    inputBytes: Count,
    exactRequestBody: z.string().max(64_000),
    reservedMicros: Micros.positive(),
    simulatedTransport: z.boolean(),
  })
  .strict();
const RequestStart = z
  .object({
    requestId: Id,
    requestPayloadSha256: Hash,
    startedAtIso: Iso,
    state: z.literal("dispatch-claimed; outcome uncertain until response evidence"),
  })
  .strict();
const Exchange = z
  .object({
    requestId: z.string().min(1).max(200),
    requestedModel: z.string().max(200),
    requestPayloadSha256: Hash.nullable(),
    didDispatch: z.boolean(),
    reportedModel: z.string().max(200).nullable(),
    serviceTier: z.string().max(200).nullable(),
    responseId: z.string().max(200).nullable(),
    providerRequestId: z.string().max(200).nullable(),
    usage: Usage,
    usageConsistent: z.boolean(),
    latencyMs: z.number().finite().nonnegative(),
    outcome: z.string().min(1).max(100),
  })
  .strict();
const Turn = z
  .object({
    caseId: z.enum(["C04", "C05", "C07", "C08"]),
    turnIndex: Count,
    requestId: Id,
    requestPayloadSha256: Hash.nullable(),
    responseText: z.string().max(12_000).nullable(),
    responseSha256: Hash.nullable(),
    outcome: z.string().min(1).max(100),
    exchange: Exchange.nullable(),
    ledgerState: z.string().min(1).max(100),
    estimatedChargeMicros: Micros.nullable(),
    transportInvoked: z.boolean(),
  })
  .strict();

export const RECEIPT_AUDIT_KEYS = [
  "manifest",
  "runStart",
  "ledger",
  "admitted",
  "requestStart",
  "turn",
] as const;
type ArtifactKey = (typeof RECEIPT_AUDIT_KEYS)[number];
export type ReceiptAuditBytes = Readonly<Record<ArtifactKey, string>>;
export type ReceiptAuditPaths = Readonly<Record<ArtifactKey, string>>;
type Refusal =
  | "unreadable-or-oversized"
  | "invalid-artifact"
  | "manifest-run-mismatch"
  | "request-join-mismatch";
const limits = {
  manifest: 65_536,
  runStart: 131_072,
  ledger: 8_388_608,
  admitted: 262_144,
  requestStart: 4_096,
  turn: 262_144,
};
const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const countState = (state: string) => ["dispatched", "uncertain", "settled"].includes(state);
const scope = {
  auditVersion: 1 as const,
  historicalCluesOnly: true as const,
  causalProof: false as const,
  providerFinalityVerified: false as const,
  budgetReleaseAuthorized: false as const,
};
const refused = (refusalCode: Refusal) => ({
  ...scope,
  status: "refused" as const,
  refusalCode,
  checks: null,
});

/** Parse supplied bytes only. Expired historical manifests are allowed: this
 * checks association, never approval validity or permission to resume a run. */
export function auditHistoricalReceipt(bytes: ReceiptAuditBytes) {
  try {
    if (
      Object.keys(bytes).sort().join() !== [...RECEIPT_AUDIT_KEYS].sort().join() ||
      RECEIPT_AUDIT_KEYS.some(
        (key) => typeof bytes[key] !== "string" || Buffer.byteLength(bytes[key]) > limits[key],
      )
    ) {
      return refused("invalid-artifact");
    }
    const manifest = EvalManifestSchema.parse(JSON.parse(bytes.manifest));
    const run = RunStart.parse(JSON.parse(bytes.runStart));
    const ledger = Ledger.parse(JSON.parse(bytes.ledger));
    const admitted = Admitted.parse(JSON.parse(bytes.admitted));
    const start = RequestStart.parse(JSON.parse(bytes.requestStart));
    const turn = Turn.parse(JSON.parse(bytes.turn));
    const digest = hash(bytes.manifest);
    if (
      run.manifestSha256 !== digest ||
      ledger.manifestSha256 !== digest ||
      admitted.manifestSha256 !== digest ||
      ledger.runId !== `eval-${digest}` ||
      !isDeepStrictEqual(run.manifest, manifest) ||
      ledger.budgetMicros !== manifest.limits.maxUsdMicros ||
      ledger.maxDispatchAttempts !== manifest.limits.maxDispatchAttempts ||
      manifest.priceBasis.model !== manifest.provider.model ||
      manifest.priceBasis.tier !== manifest.provider.serviceTier ||
      !isDeepStrictEqual(admitted.model, manifest.provider) ||
      admitted.simulatedTransport !== run.simulatedTransport
    ) {
      return refused("manifest-run-mismatch");
    }
    const admissions = ledger.admissions;
    const receiptIds = admissions.flatMap((a) => (a.receipt ? [a.receipt.receiptId] : []));
    const held = admissions.reduce(
      (sum, a) =>
        sum +
        (a.state === "cancelled-before-dispatch"
          ? 0
          : (a.receipt?.chargedMicros ?? a.reservedMicros)),
      0,
    );
    if (
      new Set(admissions.map((a) => a.requestId)).size !== admissions.length ||
      new Set(admissions.map((a) => `${a.caseId}:${a.turnIndex}:${a.model}`)).size !==
        admissions.length ||
      new Set(receiptIds).size !== receiptIds.length ||
      held > ledger.budgetMicros ||
      admissions.filter((a) => countState(a.state)).length > ledger.maxDispatchAttempts
    )
      return refused("invalid-artifact");
    const admission = admissions.find((a) => a.requestId === admitted.requestId);
    const selectedCase = manifest.cases.filter((c) => c.caseId === admitted.caseId);
    const payloadHash = hash(admitted.exactRequestBody);
    const meta = turn.exchange;
    if (
      !admission ||
      selectedCase.length !== 1 ||
      admitted.turnIndex >= selectedCase[0].turns.length ||
      admission.caseId !== admitted.caseId ||
      admission.turnIndex !== admitted.turnIndex ||
      admission.model !== manifest.provider.model ||
      admission.reservedMicros !== admitted.reservedMicros ||
      start.requestId !== admitted.requestId ||
      turn.requestId !== admitted.requestId ||
      turn.caseId !== admitted.caseId ||
      turn.turnIndex !== admitted.turnIndex ||
      admitted.inputBytes !== Buffer.byteLength(admitted.exactRequestBody) ||
      admitted.inputBytes > manifest.limits.maxInputBytes ||
      admitted.requestPayloadSha256 !== payloadHash ||
      start.requestPayloadSha256 !== payloadHash ||
      turn.requestPayloadSha256 !== payloadHash ||
      (meta &&
        (meta.requestPayloadSha256 !== payloadHash ||
          meta.requestedModel !== manifest.provider.model)) ||
      (turn.responseText === null
        ? turn.responseSha256 !== null
        : turn.responseSha256 !== hash(turn.responseText))
    ) {
      return refused("request-join-mismatch");
    }
    // The service exchange requestId is a distinct identity; deliberately do
    // not equate it with the outer evaluator/ledger requestId.
    const responseId = meta?.responseId ?? null;
    const charge = meta ? computeConservativeChargeMicros(meta.usage, manifest.priceBasis) : null;
    const safeCharge = charge !== null && Number.isSafeInteger(charge) && charge >= 0;
    const usageWithinLimits =
      meta !== null &&
      meta.usage.inputTokens !== null &&
      meta.usage.outputTokens !== null &&
      meta.usage.inputTokens <= admitted.inputBytes + PROTOCOL_OVERHEAD_TOKENS &&
      meta.usage.outputTokens <= manifest.limits.maxOutputTokens;
    return {
      ...scope,
      status: "reviewed" as const,
      refusalCode: null,
      checks: {
        runnerV2: run.runnerVersion === "bfa-conversation-eval-runner-v2",
        runnerV3: run.runnerVersion === "bfa-conversation-eval-runner-v3",
        simulatedTransport: run.simulatedTransport,
        transportInvokedRecorded: turn.transportInvoked,
        completeResponseRecorded: meta?.outcome === "complete",
        providerModelAndTierMatch:
          meta?.reportedModel === manifest.provider.model &&
          meta?.serviceTier === manifest.provider.serviceTier,
        responseIdPresent: responseId !== null && responseId.length > 0,
        responseIdLedgerCompatible: responseId !== null && Id.safeParse(responseId).success,
        responseIdUsedByOtherRequest:
          responseId !== null &&
          admissions.some(
            (a) => a.requestId !== admitted.requestId && a.receipt?.receiptId === responseId,
          ),
        usageConsistentRecorded: meta?.usageConsistent === true,
        usageConsistentAndWithinLimits:
          meta?.usageConsistent === true && safeCharge && usageWithinLimits,
        chargeKnown: safeCharge,
        chargeWithinReservation: safeCharge ? charge <= admission.reservedMicros : null,
        savedChargeMatchesRecomputed:
          turn.estimatedChargeMicros !== null && safeCharge
            ? turn.estimatedChargeMicros === charge
            : null,
        finalLedgerReserved: admission.state === "reserved",
        finalLedgerDispatched: admission.state === "dispatched",
        finalLedgerUncertain: admission.state === "uncertain",
        finalLedgerSettled: admission.state === "settled",
        finalLedgerCancelled: admission.state === "cancelled-before-dispatch",
        savedLedgerStateMatchesFinal: turn.ledgerState === admission.state,
        knownTransportConflictsWithFinalNonDispatchState:
          turn.transportInvoked && !countState(admission.state),
        settledReceiptMatchesResponse: admission.receipt
          ? admission.receipt.receiptId === responseId
          : null,
        settledChargeMatchesRecomputed:
          admission.receipt && safeCharge ? admission.receipt.chargedMicros === charge : null,
        ledgerAdmissions: admissions.length,
        ledgerCountedDispatches: admissions.filter((a) => countState(a.state)).length,
      },
    };
  } catch {
    return refused("invalid-artifact");
  }
}

/** Explicit existing files only; bounded O_RDONLY reads, no mkdir/lock/write,
 * path inference, environment access, credential loading or network call. */
export function auditHistoricalReceiptFiles(paths: ReceiptAuditPaths) {
  try {
    if (Object.keys(paths).sort().join() !== [...RECEIPT_AUDIT_KEYS].sort().join())
      return refused("invalid-artifact");
    const bytes = {} as Record<ArtifactKey, string>;
    for (const key of RECEIPT_AUDIT_KEYS) {
      if (typeof paths[key] !== "string" || !paths[key]) return refused("invalid-artifact");
      // Linux private-host utility: reject symlinks and avoid blocking on a
      // FIFO before fstat can reject every non-regular file.
      const fd = openSync(
        paths[key],
        constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
      );
      try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.size > limits[key]) return refused("unreadable-or-oversized");
        const buffer = Buffer.alloc(stat.size + 1);
        let total = 0;
        while (total < buffer.length) {
          const got = readSync(fd, buffer, total, buffer.length - total, null);
          if (!got) break;
          total += got;
        }
        if (total !== stat.size) return refused("unreadable-or-oversized");
        bytes[key] = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, total));
      } finally {
        closeSync(fd);
      }
    }
    return auditHistoricalReceipt(bytes);
  } catch {
    return refused("unreadable-or-oversized");
  }
}
