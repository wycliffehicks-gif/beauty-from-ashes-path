// One private request, with a durable dispatch mark before external transport.
// Only trusted server code supplies original Auth, sealed lifetime, RPC and funding.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import { preparePrivateTypedSender, OPENAI_RESPONSES_URL } from "./openai-provider.server";
import {
  preparePrivateTypedSpend,
  type PrivateTypedAuthObservation,
  type PrivateTypedSpendMaterial,
  type PrivateTypedSpendRpc,
} from "./private-typed-spend.server";
import type { ConversationProvider } from "./provider";

export interface PrivateTypedDispatchOptions {
  readonly enabled: () => boolean;
  readonly material: PrivateTypedSpendMaterial;
  readonly limits: {
    readonly model: string;
    readonly maxInputBytes: number;
    readonly maxOutputTokens: number;
    readonly deadlineMs: number;
  };
  readonly dispatchId: string;
  readonly envelopeExpiresAt: number;
  /** Earlier route reads remain a separate conservative ceiling. Standalone
   * callers without prior REST observations rely on the protected SQL reader. */
  readonly readAllowlistExpiresAt?: () => number;
  readonly initialAuth: PrivateTypedAuthObservation;
  readonly rpc: PrivateTypedSpendRpc;
  readonly readAuth: () => Promise<PrivateTypedAuthObservation | null>;
  readonly readKey: () => Promise<string | undefined> | string | undefined;
  readonly transport: typeof fetch;
  readonly now: () => number;
}

export interface PrivateTypedDispatchProvider extends ConversationProvider {
  /** Only the owning route calls this after the same P1 turn actually committed. */
  finish(): Promise<number | null>;
  /** Revalidate the finished revision after sealing, before releasing the response. */
  mayReturn(): Promise<boolean>;
}

const id = z
  .string()
  .uuid()
  .refine((s) => s === s.toLowerCase() && s !== "00000000-0000-0000-0000-000000000000");
const hex = z.string().regex(/^[0-9a-f]{64}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const time = integer.positive().max(8_640_000_000_000_000);
const ackSchema = z
  .object({
    protocol: z.literal(1),
    binding: z
      .object({
        approvalId: id,
        ownerId: id,
        authSessionId: id,
        threadId: id,
        threadRevision: integer,
        requestId: id,
        manifestSha256: hex,
        payloadSha256: hex,
        provider: z.literal("openai"),
        model: z.literal("gpt-6-luna"),
        tier: z.literal("default"),
        maxMicros: integer.positive(),
        approvalExpiresAt: time,
      })
      .strict(),
    dispatchId: id.nullable(),
    state: z.enum(["held", "dispatched", "settled", "finished"]),
    currentRevision: integer,
    checkedAt: time,
    verifiedAt: time,
    verificationExpiresAt: time,
    identityExpiresAt: time,
    allowlistExpiresAt: time,
    effectiveExpiresAt: time,
    dispatchMarkedAt: time.nullable(),
    settlementEvidenceSha256: hex.nullable(),
    finishedRevision: integer.nullable(),
  })
  .strict();

function unavailable(): never {
  throw new Error("Private typed send unavailable");
}
type AckState = z.infer<typeof ackSchema>["state"];
type Observation =
  | "bfa_private_text_spend_read"
  | "bfa_private_text_spend_dispatch"
  | "bfa_private_text_spend_finish";

export function createPrivateTypedDispatchProvider(
  options: PrivateTypedDispatchOptions,
): PrivateTypedDispatchProvider | null {
  try {
    const { enabled, readAuth, readKey, transport, now, dispatchId } = options;
    if (
      enabled() !== true ||
      typeof readAuth !== "function" ||
      typeof readKey !== "function" ||
      typeof now !== "function" ||
      typeof transport !== "function" ||
      !id.safeParse(dispatchId).success ||
      !time.safeParse(options.envelopeExpiresAt).success
    )
      return null;
    const limits = Object.freeze({ ...options.limits });
    const original = { ...options.initialAuth };
    const rpc = options.rpc.rpc.bind(options.rpc);
    let localHigh = 0;
    function clock() {
      const point = now();
      if (!time.safeParse(point).success || point < localHigh) return unavailable();
      localHigh = point;
      return point;
    }
    const spend = preparePrivateTypedSpend(
      {
        rpc: (name, args) =>
          rpc(
            name === "bfa_private_text_spend_claim"
              ? "bfa_private_text_spend_claim_dispatch"
              : name,
            args,
          ),
      },
      options.material,
      clock,
    );
    if (!spend) return null;
    const base = spend.binding;
    if (
      original.ownerId !== base.p_owner ||
      original.authSessionId !== base.p_session ||
      !time.safeParse(original.verifiedAt).success ||
      !time.safeParse(original.expiresAt).success
    )
      return null;
    const approvalExpiresAt = Date.parse(String(base.p_approval_expires_at));
    const binding: z.infer<typeof ackSchema>["binding"] = {
      approvalId: String(base.p_approval),
      ownerId: original.ownerId,
      authSessionId: original.authSessionId,
      threadId: String(base.p_thread),
      threadRevision: Number(base.p_revision),
      requestId: String(base.p_request),
      manifestSha256: String(base.p_manifest),
      payloadSha256: String(base.p_payload),
      provider: "openai",
      model: "gpt-6-luna",
      tier: "default",
      maxMicros: Number(base.p_max_micros),
      approvalExpiresAt,
    };
    if (!Number.isSafeInteger(binding.threadRevision + 1)) return null;
    let verifiedAt = original.verifiedAt;
    let authExpiresAt = original.expiresAt;
    let eligibleUntil = Math.min(
      original.expiresAt,
      options.envelopeExpiresAt,
      spend.eligibilityExpiresAt,
    );
    let databaseHigh = 0;
    let markedAt: number | null = null;
    let evidence: string | null = null;
    let forwarded = false;
    let phase: "unused" | "working" | "reply" | "finishing" | "finished" | "closed" = "unused";
    let signal: AbortSignal | undefined;
    function current() {
      const at = clock();
      if (options.readAllowlistExpiresAt) {
        const observed = options.readAllowlistExpiresAt();
        if (!time.safeParse(observed).success) return unavailable();
        eligibleUntil = Math.min(eligibleUntil, observed);
      }
      if (
        phase === "closed" ||
        enabled() !== true ||
        signal?.aborted ||
        at < verifiedAt ||
        at - verifiedAt >= 30_000 ||
        at >= eligibleUntil
      )
        return unavailable();
      return at;
    }

    async function freshAuth(): Promise<PrivateTypedAuthObservation> {
      const start = current();
      const observed = await readAuth();
      const finish = current();
      if (
        !observed ||
        observed.ownerId !== binding.ownerId ||
        observed.authSessionId !== binding.authSessionId ||
        !time.safeParse(observed.verifiedAt).success ||
        !time.safeParse(observed.expiresAt).success ||
        observed.verifiedAt > finish ||
        finish - observed.verifiedAt >= 30_000
      )
        return unavailable();
      verifiedAt = Math.min(verifiedAt, start, observed.verifiedAt);
      authExpiresAt = Math.min(authExpiresAt, observed.expiresAt);
      eligibleUntil = Math.min(eligibleUntil, authExpiresAt);
      current();
      return {
        ownerId: binding.ownerId,
        authSessionId: binding.authSessionId,
        verifiedAt,
        expiresAt: authExpiresAt,
      };
    }

    async function observe(name: Observation, state: AckState) {
      const auth = await freshAuth();
      current();
      const held = state === "held",
        settled = state === "settled" || state === "finished";
      const args = Object.freeze({
        ...base,
        p_dispatch_id: held ? null : dispatchId,
        p_auth_verified_at: new Date(auth.verifiedAt).toISOString(),
        p_auth_expires_at: new Date(auth.expiresAt).toISOString(),
        p_eligibility_expires_at: new Date(eligibleUntil).toISOString(),
        ...(name === "bfa_private_text_spend_finish" && { p_evidence_sha256: evidence }),
      });
      const raw = (await rpc(name, args)) as {
        data?: unknown;
        error?: unknown;
        status?: unknown;
      } | null;
      const finished = current();
      if (!raw || raw.error !== null || (raw.status !== undefined && raw.status !== 200))
        return unavailable();
      const ack = ackSchema.parse(raw.data);
      const revision = binding.threadRevision + (state === "finished" ? 1 : 0);
      const associationMatches = (Object.keys(binding) as (keyof typeof binding)[]).every(
        (k) => binding[k] === ack.binding[k],
      );
      if (
        !associationMatches ||
        ack.state !== state ||
        ack.dispatchId !== (held ? null : dispatchId) ||
        ack.currentRevision !== revision ||
        ack.finishedRevision !== (state === "finished" ? revision : null) ||
        ack.verifiedAt !== verifiedAt ||
        ack.verificationExpiresAt !== verifiedAt + 30_000 ||
        ack.checkedAt < databaseHigh ||
        ack.checkedAt < verifiedAt ||
        ack.checkedAt >= ack.verificationExpiresAt ||
        ack.effectiveExpiresAt <= Math.max(finished, ack.checkedAt) ||
        ack.effectiveExpiresAt > eligibleUntil ||
        ack.identityExpiresAt > authExpiresAt ||
        ack.effectiveExpiresAt > ack.identityExpiresAt ||
        ack.effectiveExpiresAt > ack.allowlistExpiresAt ||
        ack.effectiveExpiresAt > approvalExpiresAt ||
        (held
          ? ack.dispatchMarkedAt !== null
          : ack.dispatchMarkedAt === null ||
            ack.dispatchMarkedAt < verifiedAt ||
            ack.dispatchMarkedAt > ack.checkedAt) ||
        (name === "bfa_private_text_spend_dispatch" && ack.dispatchMarkedAt !== ack.checkedAt) ||
        (markedAt !== null && ack.dispatchMarkedAt !== markedAt) ||
        (settled && !evidence) ||
        ack.settlementEvidenceSha256 !== (settled ? evidence : null)
      )
        return unavailable();
      databaseHigh = ack.checkedAt;
      markedAt = ack.dispatchMarkedAt;
      eligibleUntil = Math.min(eligibleUntil, ack.effectiveExpiresAt);
      current();
      return revision;
    }

    return {
      async generate(request, outerSignal) {
        if (phase !== "unused") return unavailable();
        phase = "working";
        signal = outerSignal;
        try {
          current();
          const sender = preparePrivateTypedSender(request, limits);
          if (!sender) return unavailable();
          const auth = await freshAuth();
          if ((await spend.claim(auth, sender.description, sender.wireBody)) !== "claimed")
            return unavailable();
          await observe("bfa_private_text_spend_read", "held");
          current();
          const apiKey = await readKey();
          current();
          if (!apiKey) return unavailable();
          const reply = await sender.send(
            {
              apiKey,
              beforeDispatch: async () => {
                // A lost mark acknowledgment never becomes a transport permission.
                await observe("bfa_private_text_spend_dispatch", "dispatched");
                await observe("bfa_private_text_spend_read", "dispatched");
                return true;
              },
              mayDispatchNow: () => {
                current();
                return markedAt !== null && !forwarded;
              },
              fetchImpl: (url, init) => {
                current();
                if (
                  forwarded ||
                  markedAt === null ||
                  url !== OPENAI_RESPONSES_URL ||
                  init?.method !== "POST" ||
                  init.body !== sender.wireBody ||
                  init.signal?.aborted
                )
                  return unavailable();
                forwarded = true;
                return transport(url, init);
              },
              onReceipt: async (receipt) => {
                // Accounting deliberately survives suspension, sign-out and expiry.
                // A refused/lost acknowledgment leaves the original hold intact.
                if (forwarded) evidence = await spend.settleReceipt(dispatchId, receipt);
              },
            },
            outerSignal,
          );
          if (!forwarded || !evidence) return unavailable();
          await observe("bfa_private_text_spend_read", "settled");
          phase = "reply";
          return reply;
        } catch {
          phase = "closed";
          return unavailable();
        }
      },
      async finish() {
        if (phase !== "reply") return null;
        phase = "finishing";
        try {
          const revision = await observe("bfa_private_text_spend_finish", "finished");
          phase = "finished";
          return revision;
        } catch {
          phase = "closed";
          return null;
        }
      },
      async mayReturn() {
        if (phase !== "finished") return false;
        try {
          await observe("bfa_private_text_spend_read", "finished");
          return true;
        } catch {
          phase = "closed";
          return false;
        }
      },
    };
  } catch {
    return null;
  }
}
