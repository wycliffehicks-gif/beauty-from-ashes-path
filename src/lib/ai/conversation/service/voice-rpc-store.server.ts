// Inactive RPC mapping only. No client/credentials, route, Auth implementation,
// migration, provider operation or automatic retry is created by this module.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { VoiceAdmissionAck, VoiceAdmissionClaim } from "./voice-admission.server";
import type {
  VoiceCleanupRegistration,
  VoiceOperationProof,
  VoiceStoreAdapterPorts,
} from "./voice-store-adapter.server";

export type VoiceRpcName =
  | "bfa_p5_voice_register_cleanup"
  | "bfa_p5_voice_register_proof"
  | "bfa_p5_capacity_claim"
  | "bfa_p5_voice_inspect"
  | "bfa_p5_capacity_close";

/** Supply only a protected service-role transport from a verified server host.
 * It must make one request without transparent retries, fallback or credential
 * refresh/replay. The adapter cannot inspect a transport's internal behavior.
 * The result uses the RPC client's data/error envelope; optional HTTP status
 * metadata must agree with success. No browser may supply this client or args.
 */
export interface VoiceRpcClient {
  rpc(name: VoiceRpcName, args: Readonly<Record<string, unknown>>): PromiseLike<unknown>;
}

export type VoiceRpcStorePorts = Readonly<
  Pick<VoiceStoreAdapterPorts, "registerCleanup" | "registerProof" | "claim" | "inspect" | "close">
>;

const Id = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase());
const Count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Expiry = Count.positive();
const Digest = z.string().regex(/^[0-9a-f]{64}$/);
// JSON wire records have only their declared own fields. Zod's value checks
// alone may read inherited properties; those cannot supply admission identity.
function wireObject<Shape extends z.ZodRawShape>(shape: Shape) {
  const keys = Object.keys(shape);
  return z
    .unknown()
    .refine((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const prototype = Object.getPrototypeOf(value);
      return (
        (prototype === Object.prototype || prototype === null) &&
        Reflect.ownKeys(value).length === keys.length &&
        keys.every((key) => Object.hasOwn(value, key))
      );
    })
    .pipe(z.object(shape).strict());
}
const Binding = wireObject({
  ownerId: Id,
  threadId: Id,
  threadIncarnation: Id,
  threadRevision: Count,
  attemptId: Id,
  approvalId: Id,
  approvalDigest: Digest,
  scope: z.literal("developer-voice-session"),
});
const Claim = wireObject({ claimId: Id, binding: Binding, expiresAt: Expiry });
const Cleanup = wireObject({ cleanupId: Id, claim: Claim });
const Proof = wireObject({
  receiptId: Id,
  operation: z.enum(["claim", "inspect"]),
  claim: Claim,
  cleanupId: Id,
  ownerSessionId: Id,
  sessionVersion: Count,
  authorityFingerprint: Digest,
  identityExpiresAt: Expiry,
  verifiedAt: Count,
  expiresAt: Expiry,
  effectiveExpiresAt: Expiry,
}).refine(
  (p) =>
    p.effectiveExpiresAt <= p.claim.expiresAt &&
    p.effectiveExpiresAt <= p.identityExpiresAt &&
    p.expiresAt <= p.effectiveExpiresAt &&
    p.expiresAt > p.verifiedAt &&
    p.expiresAt - p.verifiedAt <= 30_000,
);
const ProofAck = wireObject({
  receiptId: Id,
  operation: z.enum(["claim", "inspect"]),
  claim: Claim,
  expiresAt: Expiry,
  effectiveExpiresAt: Expiry,
});
// These are the SQL wire states, not every local admission-lease state.
const Ack = wireObject({
  claim: Claim,
  state: z.enum(["claimed", "denied", "replayed", "closed"]),
});

function unavailable(): never {
  // Never attach a cause, SQL error, response body, proof or cleanup identity.
  throw new Error("voice-rpc-unavailable");
}
async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    return unavailable();
  }
}
function freezeClaim(claim: z.infer<typeof Claim>): VoiceAdmissionClaim {
  return Object.freeze({ ...claim, binding: Object.freeze({ ...claim.binding }) });
}
function sameClaim(a: VoiceAdmissionClaim, b: VoiceAdmissionClaim): boolean {
  return (
    a.claimId === b.claimId &&
    a.expiresAt === b.expiresAt &&
    a.binding.ownerId === b.binding.ownerId &&
    a.binding.threadId === b.binding.threadId &&
    a.binding.threadIncarnation === b.binding.threadIncarnation &&
    a.binding.threadRevision === b.binding.threadRevision &&
    a.binding.attemptId === b.binding.attemptId &&
    a.binding.approvalId === b.binding.approvalId &&
    a.binding.approvalDigest === b.binding.approvalDigest &&
    a.binding.scope === b.binding.scope
  );
}
function unwrap(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return unavailable();
  const result = raw as Record<string, unknown>;
  if (!Object.hasOwn(result, "data") || !Object.hasOwn(result, "error") || result.error !== null)
    return unavailable();
  if (
    Object.hasOwn(result, "status") &&
    (typeof result.status !== "number" ||
      !Number.isInteger(result.status) ||
      result.status < 200 ||
      result.status >= 300)
  )
    return unavailable();
  return result.data;
}

/** Compose these five ports into createVoiceStoreAdmission only in a trusted
 * server host. authenticate/readSessionFence/readCurrent, trusted issuance,
 * clocks and proof lifetime remain mandatory independent ports. This performs
 * shape/identity checks; it does not authenticate callers or confer authority.
 *
 * Claim ALWAYS uses atomic combined admission+capacity. There is no fallback to
 * base-only admission, lazy capacity attachment or additional quota debit.
 * Inspect observes base admission eligibility only; it is NOT a capacity check
 * or permission to start a provider. A future dispatch boundary still requires
 * the separate current capacity marker/approval/provider checks.
 *
 * Each method owns an immutable call snapshot, with one transport invocation.
 * Throws/malformed or missing replies do not prove rollback. The existing bridge
 * retains its exact cleanup handle; only deliberate cleanup may be retried.
 * Cleanup requires that retained ownership, never fresh Auth or a new clock.
 */
export function createVoiceRpcStore(client: VoiceRpcClient): VoiceRpcStorePorts {
  let invoke: VoiceRpcClient["rpc"];
  try {
    if (!client) return unavailable();
    const rpc = client.rpc;
    if (typeof rpc !== "function") return unavailable();
    invoke = rpc.bind(client);
  } catch {
    return unavailable();
  }
  async function call(name: VoiceRpcName, args: Record<string, unknown>) {
    return unwrap(await invoke(name, Object.freeze(args)));
  }
  async function admission(
    name: "bfa_p5_capacity_claim" | "bfa_p5_voice_inspect" | "bfa_p5_capacity_close",
    handle: string,
    rawClaim: VoiceAdmissionClaim,
  ): Promise<VoiceAdmissionAck> {
    return guarded(async () => {
      const id = Id.parse(handle);
      const claim = freezeClaim(Claim.parse(rawClaim));
      const args =
        name === "bfa_p5_capacity_close"
          ? { p_cleanup_id: id, p_claim: claim }
          : { p_receipt_id: id, p_claim: claim };
      const ack = Ack.parse(await call(name, args));
      if (!sameClaim(ack.claim, claim)) return unavailable();
      if (name === "bfa_p5_capacity_close" && ack.state !== "closed") return unavailable();
      return Object.freeze({ claim, state: ack.state });
    });
  }
  return Object.freeze({
    registerCleanup(registration: VoiceCleanupRegistration) {
      return guarded(async () => {
        const parsed = Cleanup.parse(registration);
        const owned = Object.freeze({
          cleanupId: parsed.cleanupId,
          claim: freezeClaim(parsed.claim),
        });
        const ack = Cleanup.parse(
          await call("bfa_p5_voice_register_cleanup", {
            p_cleanup_id: owned.cleanupId,
            p_claim: owned.claim,
          }),
        );
        if (ack.cleanupId !== owned.cleanupId || !sameClaim(ack.claim, owned.claim))
          return unavailable();
        return owned;
      });
    },
    registerProof(rawProof: VoiceOperationProof) {
      return guarded(async () => {
        const parsed = Proof.parse(rawProof);
        const proof = Object.freeze({ ...parsed, claim: freezeClaim(parsed.claim) });
        const rawAck = await call("bfa_p5_voice_register_proof", { p_proof: proof });
        // SQL null is a semantic denial whose conservative fence may have
        // committed. Do not reinterpret it as transport failure or retry it.
        if (rawAck === null) return null;
        const ack = ProofAck.parse(rawAck);
        if (
          ack.receiptId !== proof.receiptId ||
          ack.operation !== proof.operation ||
          !sameClaim(ack.claim, proof.claim) ||
          ack.expiresAt !== proof.expiresAt ||
          ack.effectiveExpiresAt !== proof.effectiveExpiresAt
        )
          return unavailable();
        return Object.freeze({ ...ack, claim: proof.claim });
      });
    },
    claim: (receiptId: string, claim: VoiceAdmissionClaim) =>
      admission("bfa_p5_capacity_claim", receiptId, claim),
    inspect: (receiptId: string, claim: VoiceAdmissionClaim) =>
      admission("bfa_p5_voice_inspect", receiptId, claim),
    close: (cleanupId: string, claim: VoiceAdmissionClaim) =>
      admission("bfa_p5_capacity_close", cleanupId, claim),
  });
}
