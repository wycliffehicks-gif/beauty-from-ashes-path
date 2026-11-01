// Inactive exact capacity transport. No client, credentials, route, policy
// administration, provider verifier or provider caller is installed here.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { VoiceAdmissionClaim } from "./voice-admission.server";

export type VoiceCapacityRpcName = "bfa_p5_capacity_mark" | "bfa_p5_capacity_reconcile";
export interface VoiceCapacityRpcClient {
  /** A trusted service-role transport must associate the reply with this exact
   * invocation, without transparent retry or credential refresh/replay. The
   * adapter cannot authenticate the client or inspect those internal behaviors.
   */
  rpc(name: VoiceCapacityRpcName, args: Readonly<Record<string, unknown>>): PromiseLike<unknown>;
}
export interface VoiceCapacityMarkRequest {
  readonly receiptId: string;
  readonly claim: VoiceAdmissionClaim;
  readonly operationId: string;
  readonly expectedPoolVersion: number;
}
export type VoiceCapacityObservation = Readonly<
  {
    evidenceId: string;
    operationId: string;
  } & (
    | { kind: "created" | "ended"; sessionId: string }
    | { kind: "not-created" | "unknown"; sessionId: null }
  )
>;
export interface VoiceCapacityReconcileRequest {
  readonly cleanupId: string;
  readonly claim: VoiceAdmissionClaim;
  readonly observation: VoiceCapacityObservation;
}
export type VoiceCapacityMarkState =
  | "marked"
  | "already-marked"
  | "denied"
  | "quarantined"
  | "closed";
export type VoiceCapacityReconcileState =
  | "denied"
  | "quarantined"
  | "duplicate-evidence"
  | "uncertain"
  | "late-evidence"
  | "creation-observed"
  | "terminal-recorded";
export type VoiceCapacityMarkAck = Readonly<{
  claim: VoiceAdmissionClaim;
  state: VoiceCapacityMarkState;
}>;
export type VoiceCapacityReconcileAck = Readonly<{
  claim: VoiceAdmissionClaim;
  state: VoiceCapacityReconcileState;
}>;
export interface VoiceCapacityRpcPorts {
  readonly mark: (request: VoiceCapacityMarkRequest) => Promise<VoiceCapacityMarkAck>;
  readonly reconcile: (
    request: VoiceCapacityReconcileRequest,
  ) => Promise<VoiceCapacityReconcileAck>;
}

const Id = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase());
const Count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Positive = Count.positive();
function plainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function dataField(record: Record<string, unknown>, key: string): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return !!descriptor && Object.hasOwn(descriptor, "value") && descriptor.enumerable === true;
}
function wireObject<Shape extends z.ZodRawShape>(shape: Shape) {
  const keys = Object.keys(shape);
  return z
    .unknown()
    .refine(
      (value) =>
        plainRecord(value) &&
        Reflect.ownKeys(value).length === keys.length &&
        keys.every((key) => dataField(value, key)),
    )
    .pipe(z.object(shape).strict());
}
const Binding = wireObject({
  ownerId: Id,
  threadId: Id,
  threadIncarnation: Id,
  threadRevision: Count,
  attemptId: Id,
  approvalId: Id,
  approvalDigest: z.string().regex(/^[0-9a-f]{64}$/),
  scope: z.literal("developer-voice-session"),
});
const Claim = wireObject({ claimId: Id, binding: Binding, expiresAt: Positive });
const Mark = wireObject({
  receiptId: Id,
  claim: Claim,
  operationId: Id,
  expectedPoolVersion: Positive,
});
const Observation = wireObject({
  evidenceId: Id,
  operationId: Id,
  kind: z.enum(["created", "ended", "not-created", "unknown"]),
  sessionId: z
    .string()
    .regex(/^[A-Za-z0-9:_-]{1,160}$/)
    .nullable(),
}).transform((value, context) => {
  // A transform runs only after successful parsing. An outer refinement may
  // run on a dirty original record and accidentally evaluate rejected getters.
  const valid =
    value.kind === "created" || value.kind === "ended"
      ? value.sessionId !== null
      : value.sessionId === null;
  if (!valid) context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid observation" });
  return value;
});
const Reconcile = wireObject({ cleanupId: Id, claim: Claim, observation: Observation });
const MarkAck = wireObject({
  claim: Claim,
  state: z.enum(["marked", "already-marked", "denied", "quarantined", "closed"]),
});
const ReconcileAck = wireObject({
  claim: Claim,
  state: z.enum([
    "denied",
    "quarantined",
    "duplicate-evidence",
    "uncertain",
    "late-evidence",
    "creation-observed",
    "terminal-recorded",
  ]),
});
function unavailable(): never {
  // Never attach a cause, response body, claim, provider ID or observation.
  throw new Error("voice-capacity-rpc-unavailable");
}
async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    return unavailable();
  }
}
function unwrap(raw: unknown): unknown {
  if (
    !plainRecord(raw) ||
    !dataField(raw, "data") ||
    !dataField(raw, "error") ||
    raw.error !== null
  )
    return unavailable();
  if (
    Object.hasOwn(raw, "status") &&
    (!dataField(raw, "status") ||
      typeof raw.status !== "number" ||
      !Number.isInteger(raw.status) ||
      raw.status < 200 ||
      raw.status >= 300)
  )
    return unavailable();
  return raw.data;
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
function compatible(
  kind: z.infer<typeof Observation>["kind"],
  state: VoiceCapacityReconcileState,
): boolean {
  if (state === "denied" || state === "quarantined" || state === "duplicate-evidence") return true;
  if (kind === "unknown") return state === "uncertain" || state === "late-evidence";
  if (kind === "created") return state === "creation-observed" || state === "late-evidence";
  return state === "terminal-recorded";
}

/** One exact SQL invocation per call, with independent immutable snapshots.
 * Mark needs a fresh INSPECT proof; the existing base inspect consumes its own
 * proof and cannot supply that marker permit. Even `marked` is only an offline
 * database marker, not verified Auth/approval or provider-dispatch authority.
 * `already-marked`, missing or failed replies never authorize another create.
 * No state is converted into a boolean dispatch decision by this module.
 *
 * SQL echoes only claim/state, not receipt, operation, expected pool version,
 * cleanup or evidence identity. Association of those fields with the reply is
 * a mandatory trusted transport precondition, not a claim made by this parser.
 * The returned record never invents such an echo or a new dispatch capability.
 *
 * Reconciliation requires an already authenticated, normalized observation for
 * the entire immutable operation. Shape checks cannot establish provider facts
 * or finality: HTTP ACK/404, timeout, abort or one terminated session is not
 * whole-operation finality. Retain exact cleanup/operation/evidence identities
 * and ambiguous holds after failure; never infer rollback or automatically
 * retry. This module neither calls a provider nor verifies its evidence.
 */
export function createVoiceCapacityRpcPorts(client: VoiceCapacityRpcClient): VoiceCapacityRpcPorts {
  let invoke: VoiceCapacityRpcClient["rpc"];
  try {
    if (!client) return unavailable();
    const rpc = client.rpc;
    if (typeof rpc !== "function") return unavailable();
    invoke = rpc.bind(client);
  } catch {
    return unavailable();
  }
  return Object.freeze({
    mark(rawRequest: VoiceCapacityMarkRequest) {
      return guarded(async () => {
        const parsed = Mark.parse(rawRequest);
        const request = Object.freeze({ ...parsed, claim: freezeClaim(parsed.claim) });
        const ack = MarkAck.parse(
          unwrap(
            await invoke(
              "bfa_p5_capacity_mark",
              Object.freeze({
                p_receipt_id: request.receiptId,
                p_claim: request.claim,
                p_operation_id: request.operationId,
                p_expected_version: request.expectedPoolVersion,
              }),
            ),
          ),
        );
        if (!sameClaim(ack.claim, request.claim)) return unavailable();
        return Object.freeze({ claim: request.claim, state: ack.state });
      });
    },
    reconcile(rawRequest: VoiceCapacityReconcileRequest) {
      return guarded(async () => {
        const parsed = Reconcile.parse(rawRequest);
        const request = Object.freeze({
          ...parsed,
          claim: freezeClaim(parsed.claim),
          observation: Object.freeze({ ...parsed.observation }),
        });
        const ack = ReconcileAck.parse(
          unwrap(
            await invoke(
              "bfa_p5_capacity_reconcile",
              Object.freeze({
                p_cleanup_id: request.cleanupId,
                p_claim: request.claim,
                p_observation: request.observation,
              }),
            ),
          ),
        );
        if (
          !sameClaim(ack.claim, request.claim) ||
          !compatible(request.observation.kind, ack.state)
        )
          return unavailable();
        return Object.freeze({ claim: request.claim, state: ack.state });
      });
    },
  });
}
