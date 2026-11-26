// Inactive, trusted server-side accounting for one approved fictional typed send.
// The caller supplies a service-only RPC with retries disabled. No route, credential,
// provider client, live grant, raw transcript store or fallback is installed here.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import {
  computeConservativeChargeMicros,
  worstCaseDispatchCostMicros,
  worstCaseInputTokens,
} from "../../../../../scripts/conversation-eval/pricing";
import {
  OPENAI_CONVERSATION_MAX_DEADLINE_MS,
  OPENAI_CONVERSATION_MAX_INPUT_BYTES,
  OPENAI_CONVERSATION_MAX_OUTPUT_TOKENS,
  type ConversationExchangeMeta,
  type PrivateTypedUsageReceipt,
} from "./openai-provider.server";
import { sha256HexSync } from "./sha256-sync";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z
  .string()
  .uuid()
  .refine((s) => s === s.toLowerCase() && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(s));
const safeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = safeInteger.positive().max(8_640_000_000_000_000);
const model = z.literal("gpt-6-luna");
const tier = z.literal("default");

const approvalSchema = z
  .object({
    approvalId: uuid,
    ownerId: uuid,
    authSessionId: uuid,
    threadId: uuid,
    revision: safeInteger,
    requestId: uuid,
    manifestSha256: digest,
    payloadSha256: digest,
    maxMicros: safeInteger.positive(),
  })
  .strict();

const manifestSchema = z
  .object({
    version: z.literal("bfa-private-typed-send-v1"),
    // The browser's request UUID and the service's internal req-N identify different things.
    serviceRequestId: z
      .string()
      .max(32)
      .regex(/^req-[1-9]\d*$/),
    model,
    tier,
    priceSnapshotSha256: digest,
    wireBytes: z.number().int().positive().max(OPENAI_CONVERSATION_MAX_INPUT_BYTES),
    maxInputBytes: z.number().int().positive().max(OPENAI_CONVERSATION_MAX_INPUT_BYTES),
    maxOutputTokens: z.number().int().positive().max(OPENAI_CONVERSATION_MAX_OUTPUT_TOKENS),
    deadlineMs: z.number().int().positive().max(OPENAI_CONVERSATION_MAX_DEADLINE_MS),
    expiresAt: timestamp,
  })
  .strict();

// This cap keeps all multiplication in the shared integer-micro-USD calculator exact.
const rate = z.number().int().nonnegative().max(1_000_000_000);
const priceSchema = z
  .object({
    snapshotVersion: z.literal("bfa-price-snapshot-v1"),
    source: z.literal("https://developers.openai.com/api/docs/models/gpt-6-luna"),
    retrievedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    model,
    tier,
    inputPerMillionUsdMicros: rate.positive(),
    cachedInputPerMillionUsdMicros: rate,
    cacheWritePerMillionUsdMicros: rate.positive(),
    outputPerMillionUsdMicros: rate.positive(),
  })
  .strict();

export type PrivateTypedRpcName =
  | "bfa_private_text_spend_claim"
  | "bfa_private_text_spend_claim_dispatch"
  | "bfa_private_text_spend_settle"
  | "bfa_private_text_spend_read"
  | "bfa_private_text_spend_dispatch"
  | "bfa_private_text_spend_settle_dispatched"
  | "bfa_private_text_spend_finish";
export interface PrivateTypedSpendRpc {
  rpc(name: PrivateTypedRpcName, args: Readonly<Record<string, unknown>>): PromiseLike<unknown>;
}
export interface PrivateTypedSpendMaterial {
  readonly approval: z.infer<typeof approvalSchema>;
  /** Exact reviewed, server-controlled UTF-8 file contents including whitespace. */
  readonly manifestBytes: string;
  readonly priceSnapshotBytes: string;
}
export interface PrivateTypedAuthObservation {
  readonly ownerId: string;
  readonly authSessionId: string;
  readonly verifiedAt: number;
  readonly expiresAt: number;
}

function readBoundFile<T>(raw: string, sha256: string, schema: z.ZodType<T>): T {
  if (typeof raw !== "string" || raw.length > 16_384 || sha256HexSync(raw) !== sha256)
    throw new Error();
  return schema.parse(JSON.parse(raw));
}

function receiptIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 200 &&
    /^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/.test(value) &&
    !/\s/.test(value)
  );
}

function acknowledged(value: unknown): boolean {
  const response = value as { data?: unknown; error?: unknown; status?: unknown } | null;
  return (
    !!response &&
    response.data === true &&
    response.error === null &&
    (response.status === undefined || response.status === 200)
  );
}

const count = z.number().int().nonnegative().max(10_000_000);
const usageSchema = z
  .object({
    inputTokens: count.positive(),
    outputTokens: count.positive(),
    totalTokens: count,
    reasoningTokens: count.nullable(),
    cachedInputTokens: count.nullable(),
    cacheWriteTokens: count.nullable(),
  })
  .strict();

export interface PrivateTypedProviderCall {
  readonly serviceRequestId: string;
  readonly maxInputBytes: number;
  readonly deadlineMs: number;
}

export interface PrivateTypedSpend {
  readonly binding: Readonly<Record<string, string | number>>;
  readonly eligibilityExpiresAt: number;
  /** The returned digest acknowledges this dispatch-specific billing receipt only. */
  settleReceipt(dispatchId: string, receipt: PrivateTypedUsageReceipt): Promise<string | null>;
  /** One claim invocation. An unknown outcome can be a committed monetary hold.
   * Acknowledgment is historical; the future sender must independently recheck
   * current Auth, allowlist/thread, approval and deadlines before transmitting. */
  claim(
    auth: PrivateTypedAuthObservation,
    call: PrivateTypedProviderCall,
    wireBody: string,
  ): Promise<"claimed" | "unconfirmed">;
  /** Can reconcile an earlier dispatch after expiry/deletion without message bytes. */
  settle(exchange: ConversationExchangeMeta): Promise<"settled" | "unconfirmed">;
}

export function preparePrivateTypedSpend(
  client: PrivateTypedSpendRpc,
  material: PrivateTypedSpendMaterial,
  now: () => number,
): PrivateTypedSpend | null {
  try {
    const approval = approvalSchema.parse(material.approval);
    const manifest = readBoundFile(material.manifestBytes, approval.manifestSha256, manifestSchema);
    const price = readBoundFile(
      material.priceSnapshotBytes,
      manifest.priceSnapshotSha256,
      priceSchema,
    );
    // The shared estimator rounds cached and uncached usage separately. At
    // the exact wire bound those two upward roundings can cost one extra
    // micro even when cached input is cheaper than uncached input.
    const mixedRounding = price.cachedInputPerMillionUsdMicros > 0 ? 1 : 0;
    const requiredMicros = Math.max(
      worstCaseDispatchCostMicros(manifest.maxInputBytes, manifest.maxOutputTokens, price),
      worstCaseDispatchCostMicros(manifest.wireBytes, manifest.maxOutputTokens, price) +
        mixedRounding,
    );
    const priceDate = Date.parse(price.retrievedOn + "T00:00:00Z");
    if (
      !Number.isFinite(priceDate) ||
      new Date(priceDate).toISOString().slice(0, 10) !== price.retrievedOn ||
      manifest.wireBytes > manifest.maxInputBytes ||
      price.cachedInputPerMillionUsdMicros >
        Math.max(price.inputPerMillionUsdMicros, price.cacheWritePerMillionUsdMicros) ||
      requiredMicros > approval.maxMicros
    )
      return null;
    const invoke = client.rpc.bind(client);
    const args = Object.freeze({
      p_approval: approval.approvalId,
      p_owner: approval.ownerId,
      p_session: approval.authSessionId,
      p_thread: approval.threadId,
      p_revision: approval.revision,
      p_request: approval.requestId,
      p_manifest: approval.manifestSha256,
      p_payload: approval.payloadSha256,
      p_provider: "openai",
      p_model: manifest.model,
      p_tier: manifest.tier,
      p_max_micros: approval.maxMicros,
      p_approval_expires_at: new Date(manifest.expiresAt).toISOString(),
    });
    async function recordReceipt(
      exchange: ConversationExchangeMeta | PrivateTypedUsageReceipt,
      dispatchId?: string,
    ): Promise<string | null> {
      try {
        const id = exchange.responseId;
        if (
          exchange.didDispatch !== true ||
          exchange.requestId !== manifest.serviceRequestId ||
          exchange.requestPayloadSha256 !== approval.payloadSha256 ||
          exchange.requestedModel !== manifest.model ||
          exchange.reportedModel !== manifest.model ||
          exchange.serviceTier !== manifest.tier ||
          !receiptIdentifier(id) ||
          (exchange.providerRequestId !== null && !receiptIdentifier(exchange.providerRequestId))
        )
          return null;
        const usage = usageSchema.parse(exchange.usage);
        if (
          usage.inputTokens > worstCaseInputTokens(manifest.wireBytes) ||
          usage.outputTokens > manifest.maxOutputTokens
        )
          return null;
        const charged = computeConservativeChargeMicros(usage, price);
        if (charged === null || !Number.isSafeInteger(charged) || charged > approval.maxMicros)
          return null;
        const evidence = sha256HexSync(
          JSON.stringify([
            ...(dispatchId
              ? ["bfa-private-typed-dispatched-receipt-v1", dispatchId]
              : ["bfa-private-typed-receipt-v1"]),
            approval.requestId,
            manifest.serviceRequestId,
            approval.manifestSha256,
            approval.payloadSha256,
            manifest.model,
            manifest.tier,
            id,
            exchange.providerRequestId,
            usage.inputTokens,
            usage.outputTokens,
            usage.totalTokens,
            usage.reasoningTokens,
            usage.cachedInputTokens,
            usage.cacheWriteTokens,
            charged,
          ]),
        );
        const result = await invoke(
          dispatchId ? "bfa_private_text_spend_settle_dispatched" : "bfa_private_text_spend_settle",
          Object.freeze({
            ...args,
            ...(dispatchId ? { p_dispatch_id: dispatchId } : {}),
            p_response_id: id,
            p_evidence_sha256: evidence,
            p_charged_micros: charged,
          }),
        );
        return acknowledged(result) ? evidence : null;
      } catch {
        return null;
      }
    }
    let requested = false;
    return {
      binding: args,
      eligibilityExpiresAt: Math.min(manifest.expiresAt, priceDate + 14 * 86_400_000 + 1),
      async claim(auth, call, wireBody) {
        if (requested) return "unconfirmed";
        requested = true;
        try {
          const { ownerId, authSessionId, verifiedAt, expiresAt } = auth;
          if (
            call.serviceRequestId !== manifest.serviceRequestId ||
            call.maxInputBytes !== manifest.maxInputBytes ||
            call.deadlineMs !== manifest.deadlineMs ||
            ownerId !== approval.ownerId ||
            authSessionId !== approval.authSessionId ||
            !timestamp.safeParse(verifiedAt).success ||
            !timestamp.safeParse(expiresAt).success ||
            typeof wireBody !== "string" ||
            wireBody.length > manifest.wireBytes ||
            new TextEncoder().encode(wireBody).byteLength !== manifest.wireBytes ||
            sha256HexSync(wireBody) !== approval.payloadSha256
          )
            return "unconfirmed";
          const wire = JSON.parse(wireBody);
          if (
            wire.model !== manifest.model ||
            wire.service_tier !== manifest.tier ||
            wire.max_output_tokens !== manifest.maxOutputTokens ||
            wire.reasoning?.effort !== "none" ||
            wire.store !== false ||
            wire.stream !== false ||
            wire.background !== false ||
            wire.truncation !== "disabled" ||
            !Array.isArray(wire.input) ||
            wire.input.length !== 1 ||
            wire.input[0]?.role !== "user" ||
            typeof wire.input[0]?.content !== "string" ||
            JSON.parse(wire.input[0].content).threadId !== `bfa-thread-${approval.threadId}`
          )
            return "unconfirmed";
          const current = (at: number) =>
            timestamp.safeParse(at).success &&
            at >= verifiedAt &&
            at - verifiedAt < 30_000 &&
            at < expiresAt &&
            at < manifest.expiresAt &&
            at >= priceDate &&
            at - priceDate <= 14 * 86_400_000;
          const start = now();
          if (!current(start)) return "unconfirmed";
          const result = await invoke(
            "bfa_private_text_spend_claim",
            Object.freeze({
              ...args,
              p_auth_verified_at: new Date(verifiedAt).toISOString(),
              p_auth_expires_at: new Date(expiresAt).toISOString(),
            }),
          );
          const finish = now();
          return acknowledged(result) && finish >= start && current(finish)
            ? "claimed"
            : "unconfirmed";
        } catch {
          return "unconfirmed";
        }
      },
      async settle(exchange) {
        if (exchange?.outcome !== "complete" || exchange.usageConsistent !== true)
          return "unconfirmed";
        return (await recordReceipt(exchange)) ? "settled" : "unconfirmed";
      },
      async settleReceipt(dispatchId, receipt) {
        if (
          !uuid.safeParse(dispatchId).success ||
          receipt?.kind !== "private-typed-usage-v1" ||
          receipt.providerStatus !== "completed"
        )
          return null;
        return recordReceipt(receipt, dispatchId);
      },
    };
  } catch {
    return null;
  }
}
