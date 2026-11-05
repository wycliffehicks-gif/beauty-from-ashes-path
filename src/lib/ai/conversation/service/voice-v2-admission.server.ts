// Inactive request-owned protocol-2 admission preparation. No route, client,
// credential, provider operation or compatibility cutover. Optional capacity
// marking below remains inside the same inactive owned admission boundary.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import {
  parseVoiceAdmissionRequest,
  type VoiceAdmissionRequest,
  type VoiceAdmissionClaim,
  type VoiceAdmissionAck,
  type VoiceAdmissionBinding,
} from "./voice-admission.server";
import {
  createVoiceV2AuthorityVerifier,
  type VoiceV2AuthorityVerificationPorts,
  type VoiceV2AuthorityVerificationEvidence,
} from "./voice-v2-authority-verifier.server";
import type {
  VoiceV2CleanupReadQuery,
  VoiceV2CleanupRegistration,
  VoiceV2CleanupRegisteredReceipt,
} from "./voice-v2-cleanup-rpc.server";
import type { VoiceV2ProofRegistration, VoiceV2ProofReceipt } from "./voice-v2-proof-rpc.server";
import type { VoiceV2CapacityAck } from "./voice-v2-capacity-rpc.server";
import type { VoiceV2MarkRequest, VoiceV2MarkAck } from "./voice-v2-mark-rpc.server";

const Id = z
  .string()
  .uuid()
  .refine(
    (value) => value === value.toLowerCase() && value !== "00000000-0000-0000-0000-000000000000",
  );
const Count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Expiry = Count.positive();
const Digest = z.string().regex(/^[0-9a-f]{64}$/);
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
        keys.every((key) => {
          const field = Object.getOwnPropertyDescriptor(value, key);
          return !!field && field.enumerable === true && Object.hasOwn(field, "value");
        })
      );
    })
    .pipe(z.object(shape).strict());
}
const Request = wireObject({
  threadId: Id,
  threadIncarnation: Id,
  threadRevision: Count,
  attemptId: Id,
  activeAuthority: z.string().min(1).max(350_000),
});
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
const AssociationShape = {
  cleanupId: Id,
  claim: Claim,
  authSessionId: Id,
  parentVersion: Count,
  authorityFingerprint: Digest,
};
const CleanupAck = wireObject({
  protocol: z.literal(2),
  ...AssociationShape,
  effectiveExpiresAt: Expiry,
  closedAt: z.null(),
  expiredAt: z.null(),
  invalidatedAt: z.null(),
});
const Proof = wireObject({
  protocol: z.literal(2),
  receiptId: Id,
  operation: z.enum(["claim", "inspect"]),
  ...AssociationShape,
  identityExpiresAt: Expiry,
  verifiedAt: Count,
  expiresAt: Expiry,
  effectiveExpiresAt: Expiry,
});
const CapacityAck = wireObject({
  protocol: z.literal(2),
  proof: Proof,
  status: z.enum(["claimed", "denied", "closed"]),
});
const CloseAck = wireObject({ claim: Claim, state: z.literal("closed") });
const MarkRequest = wireObject({
  protocol: z.literal(2),
  proof: Proof,
  operationId: Id,
  expectedPoolVersion: Expiry,
});
const MarkAck = wireObject({
  protocol: z.literal(2),
  request: MarkRequest,
  status: z.enum(["marked", "already-marked", "denied", "quarantined", "closed"]),
});

export interface VoiceV2AdmissionPorts extends VoiceV2AuthorityVerificationPorts {
  /** Explicit trusted configuration, integer 1..30000. Not a lifecycle cap. */
  readonly maxProofAgeMs: number;
  registerCleanup(request: VoiceV2CleanupRegistration): Promise<unknown>;
  registerProof(request: VoiceV2ProofRegistration): Promise<unknown>;
  /** Existing combined capacity claim, never base-only or lazy attachment. */
  claim(proof: VoiceV2ProofReceipt): Promise<unknown>;
  /** Existing-claim-only inspection, with its own separate fresh receipt. */
  inspect(proof: VoiceV2ProofReceipt): Promise<unknown>;
  /** Existing exact cleanup path, independently authorized by retained service
   * ownership. Does not require current Auth/time and never accepts browser
   * ownership. Preserve accounting and any marked uncertain allocation. */
  close(cleanupId: string, claim: VoiceAdmissionClaim): Promise<unknown>;
}
export interface VoiceV2AdmissionOperationSnapshot {
  readonly request: VoiceV2ProofRegistration;
  readonly registrationAttempted: boolean;
  readonly registrationAcknowledgment: VoiceV2ProofReceipt | null;
  readonly consumptionAttempted: boolean;
  readonly acknowledgment: VoiceV2CapacityAck | null;
  readonly state: "pending" | "observed" | "unconfirmed";
}
export interface VoiceV2AdmissionSnapshot {
  readonly protocol: 2;
  readonly state:
    | "idle"
    | "pending"
    | "active"
    | "invalid"
    | "closing"
    | "close-unconfirmed"
    | "closed";
  readonly ownership: VoiceV2CleanupReadQuery | null;
  /** Lifecycle only; neither the 30-second verifier age nor a receipt TTL. */
  readonly effectiveExpiresAt: number | null;
  readonly cleanupRequest: VoiceV2CleanupRegistration | null;
  readonly cleanupAcknowledgment: VoiceV2CleanupRegisteredReceipt | null;
  readonly cleanupWriteAttempted: boolean;
  readonly operations: readonly VoiceV2AdmissionOperationSnapshot[];
  readonly closeAcknowledgment: VoiceAdmissionAck | null;
}
export interface VoiceV2Admission {
  /** One attempt per handle. False preserves any uncertain owned work. */
  admit(raw: unknown): Promise<boolean>;
  /** One deliberate inspect; overlapping calls return false without new work. */
  revalidate(): Promise<boolean>;
  /** Synchronous local fence before any await. Only an explicit call can retry
   * uncertain cleanup, always using the same retained claim/cleanup identity. */
  close(): Promise<boolean>;
  /** Content-free server-only evidence, never serialize proofs to a browser.
   * State is the last local observation; active can age without revalidation
   * and never establishes fresh eligibility or provider permission. */
  snapshot(): VoiceV2AdmissionSnapshot;
}
export interface VoiceV2CapacityAdmissionPorts extends VoiceV2AdmissionPorts {
  /** Trusted explicit policy version, a positive safe integer; never browser input. */
  readonly expectedPoolVersion: number;
  /** Protected complete protocol-2 marker transport, with no transparent retry. */
  mark(request: VoiceV2MarkRequest): Promise<unknown>;
}
export interface VoiceV2AdmissionMarkerSnapshot {
  readonly protocol: 2;
  readonly ownership: VoiceV2CleanupReadQuery;
  readonly operationId: string;
  readonly expectedPoolVersion: number;
  readonly state: "pending" | "observed" | "unconfirmed";
  readonly request: VoiceV2MarkRequest | null;
  readonly registrationAttempted: boolean;
  readonly registrationAcknowledgment: VoiceV2ProofReceipt | null;
  readonly markAttempted: boolean;
  readonly acknowledgment: VoiceV2MarkAck | null;
}
export interface VoiceV2AdmissionMarkerObservation {
  readonly protocol: 2;
  readonly status: "marked";
  readonly operationId: string;
  readonly claim: VoiceAdmissionClaim;
}
export interface VoiceV2CapacityAdmission extends VoiceV2Admission {
  /** At most one admitted local attempt. A result is an offline observation,
   * never permission to create/repeat a provider operation. Busy/inactive calls
   * do not start an attempt; a started attempt is never retried or replaced. */
  markCapacity(): Promise<VoiceV2AdmissionMarkerObservation | null>;
  /** Last immutable server-only evidence, which may already be stale. Never
   * accept this snapshot back as ownership or serialize proof data to a browser. */
  markerSnapshot(): VoiceV2AdmissionMarkerSnapshot | null;
}
type MarkerConfiguration = Readonly<{
  expectedPoolVersion: number;
  mark: VoiceV2CapacityAdmissionPorts["mark"];
}>;
function unavailable(): never {
  throw new Error("voice-v2-admission-unavailable");
}
function sameBinding(a: VoiceAdmissionBinding, b: VoiceAdmissionBinding): boolean {
  return (
    a.ownerId === b.ownerId &&
    a.threadId === b.threadId &&
    a.threadIncarnation === b.threadIncarnation &&
    a.threadRevision === b.threadRevision &&
    a.attemptId === b.attemptId &&
    a.approvalId === b.approvalId &&
    a.approvalDigest === b.approvalDigest &&
    a.scope === b.scope
  );
}
function sameClaim(a: VoiceAdmissionClaim, b: VoiceAdmissionClaim): boolean {
  return (
    a.claimId === b.claimId && a.expiresAt === b.expiresAt && sameBinding(a.binding, b.binding)
  );
}
function sameAssociation(a: VoiceV2CleanupReadQuery, b: VoiceV2CleanupReadQuery): boolean {
  return (
    a.cleanupId === b.cleanupId &&
    sameClaim(a.claim, b.claim) &&
    a.authSessionId === b.authSessionId &&
    a.parentVersion === b.parentVersion &&
    a.authorityFingerprint === b.authorityFingerprint
  );
}
function sameProof(a: VoiceV2ProofRegistration, b: VoiceV2ProofRegistration): boolean {
  return (
    sameAssociation(a, b) &&
    a.protocol === b.protocol &&
    a.receiptId === b.receiptId &&
    a.operation === b.operation &&
    a.identityExpiresAt === b.identityExpiresAt &&
    a.verifiedAt === b.verifiedAt &&
    a.expiresAt === b.expiresAt &&
    a.effectiveExpiresAt === b.effectiveExpiresAt
  );
}
function freezeClaim(value: VoiceAdmissionClaim): VoiceAdmissionClaim {
  Object.freeze(value.binding);
  return Object.freeze(value);
}
function freezeProof(value: VoiceV2ProofRegistration): VoiceV2ProofRegistration {
  freezeClaim(value.claim);
  return Object.freeze(value);
}

/** One independently trusted server request owns this handle and every exact
 * attempted write. The host supplies genuine request-bound Auth and protected
 * nonretrying transports; shapes/service-role possession prove neither. New
 * calls never attach to another claim, adopt a legacy receipt or peel v2 facts
 * into the unchanged bridge. Admission is offline eligibility evidence only.
 *
 * The opaque envelope is retained only in this bounded handle for deliberate
 * checks. Terminal invalidation/close clears its reference synchronously; no
 * content/token/credential enters snapshots or error output. Failed or late work
 * retains exact content-free ownership/ACKs, never refunds, retries or renews.
 * Explicit close remains usable after Auth loss, clock failure and cancellation.
 *
 * Lifecycle ceilings only shrink across verifications. Each proof has a fresh
 * conservative original start and an immutable <=30000-ms deadline. Subsequent
 * post-wait verification cannot refresh that proof or renew the original claim.
 * The verifier's 30-second freshness ceiling is NOT a lifetime cap for claims.
 *
 * Initial admission uses combined capacity claim then a distinct existing-claim
 * inspect. Each registration and consumption wait is followed by fresh current
 * verification within that same proof's original deadline. Finite Auth/SQL reads
 * are not an atomic provider gate. Real Auth/provider acceptance, runtime wiring
 * and quiesced cutover remain deferred. The opt-in marker shares this closure.
 */
export function createVoiceV2Admission(ports: VoiceV2AdmissionPorts): VoiceV2Admission {
  return createAdmission(ports, null);
}

/** Opt-in extension of this same admission-owned closure. No raw claim, lease
 * snapshot or caller-supplied operation may be attached later. One fresh inspect
 * proof goes exclusively to mark, not through the consuming ordinary inspect.
 * The operation ID and configured pool version are retained before any await.
 * A full late ACK survives only as evidence. Already-marked never authorizes a
 * second provider create; no status refunds held units or proves finality. */
export function createVoiceV2CapacityAdmission(
  ports: VoiceV2CapacityAdmissionPorts,
): VoiceV2CapacityAdmission {
  let capacity: MarkerConfiguration;
  try {
    const expectedPoolVersion = Expiry.parse(ports.expectedPoolVersion);
    const mark = ports.mark;
    if (typeof mark !== "function") return unavailable();
    capacity = Object.freeze({ expectedPoolVersion, mark: mark.bind(ports) });
  } catch {
    return unavailable();
  }
  return createAdmission(ports, capacity);
}
function createAdmission(ports: VoiceV2AdmissionPorts, capacity: null): VoiceV2Admission;
function createAdmission(
  ports: VoiceV2AdmissionPorts,
  capacity: MarkerConfiguration,
): VoiceV2CapacityAdmission;
function createAdmission(
  ports: VoiceV2AdmissionPorts,
  capacity: MarkerConfiguration | null,
): VoiceV2Admission | VoiceV2CapacityAdmission {
  let bound: Omit<VoiceV2AdmissionPorts, "maxProofAgeMs">;
  let proofAge: number;
  try {
    proofAge = z.number().int().min(1).max(30_000).parse(ports.maxProofAgeMs);
    const names = [
      "now",
      "authenticate",
      "readParent",
      "readCurrent",
      "registerCleanup",
      "registerProof",
      "claim",
      "inspect",
      "close",
    ] as const;
    bound = Object.fromEntries(
      names.map((name) => {
        const fn = ports[name];
        if (typeof fn !== "function") return unavailable();
        return [name, fn.bind(ports)];
      }),
    ) as unknown as typeof bound;
  } catch {
    return unavailable();
  }
  let state: VoiceV2AdmissionSnapshot["state"] = "idle";
  let attempted = false;
  let busy = false;
  let terminal = false;
  let request: VoiceAdmissionRequest | null = null;
  let pinned: VoiceV2AuthorityVerificationEvidence | null = null;
  let ownership: VoiceV2CleanupReadQuery | null = null;
  let ceiling = Number.MAX_SAFE_INTEGER;
  let authCeiling = Number.MAX_SAFE_INTEGER;
  let lastNow = -1;
  let badClock = false;
  let cleanupRequest: VoiceV2CleanupRegistration | null = null;
  let cleanupAcknowledgment: VoiceV2CleanupRegisteredReceipt | null = null;
  let cleanupWriteAttempted = false;
  const operations: VoiceV2AdmissionOperationSnapshot[] = [];
  let closeAcknowledgment: VoiceAdmissionAck | null = null;
  let closing: Promise<boolean> | null = null;
  function sample(): number {
    try {
      const now = Count.parse(bound.now());
      if (badClock || now < lastNow) return unavailable();
      lastNow = now;
      return now;
    } catch {
      badClock = true;
      return unavailable();
    }
  }
  function requireCurrent(proof?: VoiceV2ProofRegistration): number {
    if (terminal) return unavailable();
    const now = sample();
    if (
      now >= ceiling ||
      (proof &&
        (now < proof.verifiedAt || now >= proof.expiresAt || now - proof.verifiedAt >= 30_000))
    )
      return unavailable();
    return now;
  }
  function invalidate(): false {
    terminal = true;
    request = null;
    if (state !== "closing" && state !== "closed" && state !== "close-unconfirmed")
      state = "invalid";
    return false;
  }
  async function verify(
    proof?: VoiceV2ProofRegistration,
  ): Promise<VoiceV2AuthorityVerificationEvidence> {
    requireCurrent(proof);
    if (!request) return unavailable();
    const current = () => requireCurrent(proof);
    const verifier = createVoiceV2AuthorityVerifier({
      now: current,
      async authenticate() {
        current();
        const result = await bound.authenticate();
        current();
        return result;
      },
      async readParent(query) {
        current();
        const result = await bound.readParent(query);
        current();
        return result;
      },
      async readCurrent(query) {
        current();
        const result = await bound.readCurrent(query);
        current();
        return result;
      },
    });
    const evidence = await verifier.verifyCurrent(request);
    requireCurrent(proof);
    if (!evidence) return unavailable();
    if (
      pinned &&
      (!sameBinding(pinned.binding, evidence.binding) ||
        pinned.authSessionId !== evidence.authSessionId ||
        pinned.parentVersion !== evidence.parentVersion ||
        pinned.authorityFingerprint !== evidence.authorityFingerprint ||
        pinned.issuedAt !== evidence.issuedAt ||
        pinned.issuanceExpiresAt !== evidence.issuanceExpiresAt ||
        pinned.envelopeExpiresAt !== evidence.envelopeExpiresAt)
    )
      return unavailable();
    pinned ??= evidence;
    authCeiling = Math.min(authCeiling, evidence.identityExpiresAt);
    // Deliberately exclude evidence.effectiveExpiresAt/verificationExpiresAt:
    // those include the short verification freshness window, not lifecycle TTL.
    ceiling = Math.min(
      ceiling,
      authCeiling,
      evidence.allowlistExpiresAt,
      evidence.authorityExpiresAt,
      evidence.approvalExpiresAt,
      evidence.envelopeExpiresAt,
      evidence.issuanceExpiresAt,
    );
    requireCurrent(proof);
    return evidence;
  }
  function updateOperation(index: number, patch: Partial<VoiceV2AdmissionOperationSnapshot>) {
    operations[index] = Object.freeze({ ...operations[index], ...patch });
  }
  async function operation(kind: "claim" | "inspect"): Promise<void> {
    const owned = ownership;
    if (!owned) return unavailable();
    const evidence = await verify();
    const deadline = evidence.verifiedAt + proofAge;
    if (!Number.isSafeInteger(deadline)) return unavailable();
    const proof = freezeProof(
      Proof.parse({
        protocol: 2,
        ...owned,
        receiptId: Id.parse(crypto.randomUUID()),
        operation: kind,
        identityExpiresAt: authCeiling,
        verifiedAt: evidence.verifiedAt,
        expiresAt: Math.min(deadline, ceiling),
        effectiveExpiresAt: ceiling,
      }),
    );
    requireCurrent(proof);
    const index = operations.length;
    operations.push(
      Object.freeze({
        request: proof,
        registrationAttempted: false,
        registrationAcknowledgment: null,
        consumptionAttempted: false,
        acknowledgment: null,
        state: "pending",
      }),
    );
    try {
      updateOperation(index, { registrationAttempted: true });
      const registered = freezeProof(Proof.parse(await bound.registerProof(proof)));
      if (!sameProof(proof, registered)) return unavailable();
      updateOperation(index, { registrationAcknowledgment: registered });
      requireCurrent(proof);
      await verify(proof);
      if (ceiling < proof.effectiveExpiresAt) return unavailable();
      requireCurrent(proof);
      updateOperation(index, { consumptionAttempted: true });
      const ack = CapacityAck.parse(
        await (kind === "claim" ? bound.claim(proof) : bound.inspect(proof)),
      );
      if (!sameProof(ack.proof, proof)) return unavailable();
      const acknowledgment: VoiceV2CapacityAck = Object.freeze({
        protocol: 2,
        proof: freezeProof(ack.proof),
        status: ack.status,
      });
      // A matching late ACK remains evidence, never eligibility or rollback.
      updateOperation(index, { acknowledgment });
      requireCurrent(proof);
      if (ack.status !== "claimed") return unavailable();
      await verify(proof);
      if (ceiling < proof.effectiveExpiresAt) return unavailable();
      requireCurrent(proof);
      updateOperation(index, { state: "observed" });
    } catch {
      updateOperation(index, { state: "unconfirmed" });
      return unavailable();
    }
  }
  const admission: VoiceV2Admission = Object.freeze({
    snapshot: () =>
      Object.freeze({
        protocol: 2 as const,
        state,
        ownership,
        effectiveExpiresAt: pinned ? ceiling : null,
        cleanupRequest,
        cleanupAcknowledgment,
        cleanupWriteAttempted,
        operations: Object.freeze([...operations]),
        closeAcknowledgment,
      }),
    async admit(...args: unknown[]): Promise<boolean> {
      if (attempted || terminal || busy) return false;
      attempted = true;
      busy = true;
      state = "pending";
      try {
        if (args.length !== 1) return invalidate();
        request = parseVoiceAdmissionRequest(Request.parse(args[0]));
        if (!request) return invalidate();
        const initial = await verify();
        requireCurrent();
        // Retain both immutable identities before any possible write. Claim TTL
        // is the minimum lifecycle ceiling, not a proof freshness deadline.
        const claim = freezeClaim(
          Claim.parse({
            claimId: Id.parse(crypto.randomUUID()),
            binding: initial.binding,
            expiresAt: ceiling,
          }),
        );
        ownership = Object.freeze({
          cleanupId: Id.parse(crypto.randomUUID()),
          claim,
          authSessionId: initial.authSessionId,
          parentVersion: initial.parentVersion,
          authorityFingerprint: initial.authorityFingerprint,
        });
        cleanupRequest = Object.freeze({
          ...ownership,
          verifiedAt: initial.verifiedAt,
          authExpiresAt: authCeiling,
        });
        requireCurrent();
        if (sample() >= initial.verificationExpiresAt) return unavailable();
        cleanupWriteAttempted = true;
        const registered = CleanupAck.parse(await bound.registerCleanup(cleanupRequest));
        if (
          !sameAssociation(registered, ownership) ||
          registered.effectiveExpiresAt > claim.expiresAt ||
          registered.effectiveExpiresAt > cleanupRequest.authExpiresAt ||
          registered.effectiveExpiresAt <= cleanupRequest.verifiedAt
        )
          return unavailable();
        freezeClaim(registered.claim);
        cleanupAcknowledgment = Object.freeze(registered);
        ceiling = Math.min(ceiling, registered.effectiveExpiresAt);
        requireCurrent();
        if (sample() >= initial.verificationExpiresAt) return unavailable();
        await operation("claim");
        requireCurrent();
        await operation("inspect");
        requireCurrent();
        state = "active";
        return true;
      } catch {
        return invalidate();
      } finally {
        busy = false;
      }
    },
    async revalidate(...args: unknown[]): Promise<boolean> {
      if (args.length !== 0 || busy || terminal || state !== "active") return false;
      busy = true;
      try {
        await operation("inspect");
        requireCurrent();
        return true;
      } catch {
        return invalidate();
      } finally {
        busy = false;
      }
    },
    close(...args: unknown[]): Promise<boolean> {
      if (args.length !== 0) return Promise.resolve(false);
      if (state === "closed") return Promise.resolve(true);
      if (closing) return closing;
      terminal = true;
      request = null;
      state = "closing";
      const owned = ownership;
      if (!owned) {
        // Nothing could have written without retained ownership. A pending
        // verification is now fenced and cannot later allocate/register it.
        state = "closed";
        return Promise.resolve(true);
      }
      closing = Promise.resolve().then(async () => {
        try {
          const ack = CloseAck.parse(await bound.close(owned.cleanupId, owned.claim));
          if (!sameClaim(ack.claim, owned.claim)) return unavailable();
          closeAcknowledgment = Object.freeze({ claim: freezeClaim(ack.claim), state: "closed" });
          state = "closed";
          return true;
        } catch {
          state = "close-unconfirmed";
          return false;
        } finally {
          closing = null;
        }
      });
      return closing;
    },
  });
  if (!capacity) return admission;
  let markerAttempted = false;
  let marker: VoiceV2AdmissionMarkerSnapshot | null = null;
  function retainMarker(patch: Partial<VoiceV2AdmissionMarkerSnapshot>) {
    if (marker) marker = Object.freeze({ ...marker, ...patch });
  }
  return Object.freeze({
    ...admission,
    markerSnapshot: () => marker,
    async markCapacity(...args: unknown[]): Promise<VoiceV2AdmissionMarkerObservation | null> {
      if (args.length !== 0 || markerAttempted || busy || terminal || state !== "active")
        return null;
      // Fence before UUID generation and every wait. A failed started attempt
      // cannot create another operation identity, even if no transport ran.
      markerAttempted = true;
      busy = true;
      try {
        const operationId = Id.parse(crypto.randomUUID());
        const owned = ownership;
        if (!owned) return unavailable();
        marker = Object.freeze({
          protocol: 2,
          ownership: owned,
          operationId,
          expectedPoolVersion: capacity.expectedPoolVersion,
          state: "pending",
          request: null,
          registrationAttempted: false,
          registrationAcknowledgment: null,
          markAttempted: false,
          acknowledgment: null,
        });
        requireCurrent();
        const evidence = await verify();
        const deadline = evidence.verifiedAt + proofAge;
        if (!Number.isSafeInteger(deadline)) return unavailable();
        const proof = freezeProof(
          Proof.parse({
            protocol: 2,
            ...owned,
            receiptId: Id.parse(crypto.randomUUID()),
            operation: "inspect",
            identityExpiresAt: authCeiling,
            verifiedAt: evidence.verifiedAt,
            expiresAt: Math.min(deadline, ceiling),
            effectiveExpiresAt: ceiling,
          }),
        );
        requireCurrent(proof);
        const markRequest: VoiceV2MarkRequest = Object.freeze({
          protocol: 2,
          proof,
          operationId,
          expectedPoolVersion: capacity.expectedPoolVersion,
        });
        retainMarker({ request: markRequest, registrationAttempted: true });
        const registered = freezeProof(Proof.parse(await bound.registerProof(proof)));
        if (!sameProof(proof, registered)) return unavailable();
        retainMarker({ registrationAcknowledgment: registered });
        requireCurrent(proof);
        await verify(proof);
        if (ceiling < proof.effectiveExpiresAt) return unavailable();
        requireCurrent(proof);
        retainMarker({ markAttempted: true });
        const ack = MarkAck.parse(await capacity.mark(markRequest));
        if (
          ack.request.operationId !== markRequest.operationId ||
          ack.request.expectedPoolVersion !== markRequest.expectedPoolVersion ||
          !sameProof(ack.request.proof, markRequest.proof)
        )
          return unavailable();
        const echoed: VoiceV2MarkRequest = Object.freeze({
          ...ack.request,
          proof: freezeProof(ack.request.proof),
        });
        const acknowledgment: VoiceV2MarkAck = Object.freeze({
          protocol: 2,
          request: echoed,
          status: ack.status,
        });
        // Exact responses survive cancellation/expiry as content-free evidence;
        // no late acknowledgment can reactivate this private admission handle.
        retainMarker({ acknowledgment });
        requireCurrent(proof);
        if (ack.status !== "marked") return unavailable();
        await verify(proof);
        if (ceiling < proof.effectiveExpiresAt) return unavailable();
        requireCurrent(proof);
        retainMarker({ state: "observed" });
        return Object.freeze({ protocol: 2, status: "marked", operationId, claim: owned.claim });
      } catch {
        retainMarker({ state: "unconfirmed" });
        invalidate();
        return null;
      } finally {
        busy = false;
      }
    },
  });
}
