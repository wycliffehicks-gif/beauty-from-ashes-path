// Inactive request/lease-bound bridge only. No route, production Auth/database
// client, applied schema, provider session or dispatch capability is installed.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import {
  createVoiceAdmissionChecks,
  parseVoiceAdmissionRequest,
  type VoiceAdmissionAck,
  type VoiceAdmissionClaim,
  type VoiceAdmissionEvidence,
  type VoiceAdmissionLease,
} from "./voice-admission.server";
import type { VoiceCapacityMarkRequest, VoiceCapacityMarkState } from "./voice-capacity-rpc.server";
import {
  createVoiceServerVerifier,
  type VoiceVerificationPorts,
} from "./voice-verification.server";

const Id = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase());
const Count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Expiry = Count.positive();
const Digest = z.string().regex(/^[0-9a-f]{64}$/);
const Binding = z
  .object({
    ownerId: Id,
    threadId: Id,
    threadIncarnation: Id,
    threadRevision: Count,
    attemptId: Id,
    approvalId: Id,
    approvalDigest: Digest,
    scope: z.literal("developer-voice-session"),
  })
  .strict();
const Claim = z.object({ claimId: Id, binding: Binding, expiresAt: Expiry }).strict();
const Identity = z.object({ ownerId: Id, sessionId: Id, expiresAt: Expiry }).strict();
const Fence = z
  .object({
    ownerId: Id,
    sessionId: Id,
    version: Count,
    expiresAt: Expiry,
    revoked: z.literal(false),
  })
  .strict();
const Cleanup = z.object({ cleanupId: Id, claim: Claim }).strict();
const ProofAck = z
  .object({
    receiptId: Id,
    operation: z.enum(["claim", "inspect"]),
    claim: Claim,
    expiresAt: Expiry,
    effectiveExpiresAt: Expiry,
  })
  .strict();
const Ack = z
  .object({ claim: Claim, state: z.enum(["claimed", "denied", "replayed", "uncertain", "closed"]) })
  .strict();

function exactData(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => {
      const field = Object.getOwnPropertyDescriptor(value, key);
      return !!field && Object.hasOwn(field, "value") && field.enumerable === true;
    })
  );
}
const CapacityAck = z
  .unknown()
  .refine(
    (value) =>
      exactData(value, ["claim", "state"]) &&
      exactData(value.claim, ["claimId", "binding", "expiresAt"]) &&
      exactData(value.claim.binding, [
        "ownerId",
        "threadId",
        "threadIncarnation",
        "threadRevision",
        "attemptId",
        "approvalId",
        "approvalDigest",
        "scope",
      ]),
  )
  .pipe(
    z
      .object({
        claim: Claim,
        state: z.enum(["marked", "already-marked", "denied", "quarantined", "closed"]),
      })
      .strict(),
  );

export interface VoiceCleanupRegistration {
  readonly cleanupId: string;
  readonly claim: VoiceAdmissionClaim;
}
export interface VoiceOperationProof extends VoiceCleanupRegistration {
  readonly receiptId: string;
  readonly operation: "claim" | "inspect";
  readonly ownerSessionId: string;
  readonly sessionVersion: number;
  readonly authorityFingerprint: string;
  readonly identityExpiresAt: number;
  /** Conservative start of this verification, in trusted Unix milliseconds. */
  readonly verifiedAt: number;
  /** Short single-operation receipt expiry, never an admission renewal. */
  readonly expiresAt: number;
  /** Never-extended eligibility ceiling, independent of the receipt's short TTL. */
  readonly effectiveExpiresAt: number;
}
export interface VoiceStoreAdapterPorts extends VoiceVerificationPorts {
  /** Required explicit server configuration; integer 1..30000. No runtime default. */
  readonly maxProofAgeMs: number;
  /** Trusted current server-maintained session/revocation fence. The production
   * writer and its synchronization with remote Auth remain unimplemented.
   * Missing, changed, revoked or expired fences deny. Never infer from client JWT.
   */
  readSessionFence(query: Readonly<{ ownerId: string; sessionId: string }>): Promise<unknown>;
  /** Service-only protected record registration. Exact acknowledgment is required
   * before any proof/claim. Lost replies retain cleanup ownership; no retries.
   */
  registerCleanup(registration: VoiceCleanupRegistration): Promise<unknown>;
  /** Service-only one-use, operation/claim-bound proof registration. Database must
   * independently verify current protected records under the agreed locks. Shape
   * checks here do not authenticate a browser JSON proof. Never expose this port.
   */
  registerProof(proof: VoiceOperationProof): Promise<unknown>;
  claim(receiptId: string, claim: VoiceAdmissionClaim): Promise<unknown>;
  inspect(receiptId: string, claim: VoiceAdmissionClaim): Promise<unknown>;
  /** Dedicated trusted cleanup path: only the bridge's retained exact ownership
   * reaches this port. May create an absent terminal tombstone after lost/late
   * registration; must compare existing bindings and preserve a different winner.
   * No current Auth/allowlist/clock required; no browser-supplied claim is authority.
   */
  close(cleanupId: string, claim: VoiceAdmissionClaim): Promise<unknown>;
}

/** Trusted server configuration only; never accept these ports or the version
 * from a browser request. The mark port must preserve exact request/reply
 * association and must not transparently retry or refresh/replay transport.
 */
export interface VoiceCapacityStoreAdapterPorts extends VoiceStoreAdapterPorts {
  readonly expectedPoolVersion: number;
  mark(request: VoiceCapacityMarkRequest): Promise<unknown>;
}
export interface VoiceCapacityMarkerObservation {
  readonly state: "marked";
  readonly operationId: string;
  readonly claim: VoiceAdmissionClaim;
}
export interface VoiceCapacityMarkerSnapshot extends VoiceCleanupRegistration {
  readonly state: "pending" | "observed" | "unconfirmed";
  readonly operationId: string;
  readonly expectedPoolVersion: number;
  readonly acknowledgment: VoiceCapacityMarkState | null;
}
export interface VoiceCapacityAdmissionLease extends VoiceAdmissionLease {
  /** At most one local observation per lease. This is not provider permission.
   * Null never proves rollback or authorizes a different operation identity.
   */
  markCapacity(): Promise<VoiceCapacityMarkerObservation | null>;
  /** Retained content-free server-only reconciliation address. Never serialize
   * cleanup handles to the browser. No proof, token or provider fact is exposed.
   */
  markerSnapshot(): VoiceCapacityMarkerSnapshot | null;
}
type CapacityConfiguration = Readonly<{
  expectedPoolVersion: number;
  mark: VoiceCapacityStoreAdapterPorts["mark"];
}>;

function sameClaim(a: VoiceAdmissionClaim, b: VoiceAdmissionClaim): boolean {
  return (
    a.claimId === b.claimId &&
    a.expiresAt === b.expiresAt &&
    Object.entries(a.binding).every(
      ([key, value]) => b.binding[key as keyof typeof b.binding] === value,
    )
  );
}
function frozenClaim(raw: VoiceAdmissionClaim): VoiceAdmissionClaim {
  const value = Claim.parse(raw);
  return Object.freeze({ ...value, binding: Object.freeze(value.binding) });
}
function evidenceDeadline(value: VoiceAdmissionEvidence) {
  return Math.min(
    value.identityExpiresAt,
    value.allowlistExpiresAt,
    value.authorityExpiresAt,
    value.approvalExpiresAt,
  );
}
function unavailable(): never {
  throw new Error("voice-store-unavailable");
}

/** Construct only inside a verified server request context. Each admit call owns
 * a separate closure; there is no shared last-verified context or memory ledger.
 * The existing admission lease captures the opaque active envelope for repeated
 * verification while reachable. This is bounded lease state, not a shared cache;
 * do not log/serialize it, proofs or cleanup handles to the browser. Terminal
 * cleanup discards this bridge's request copy; retry retains content-free ownership.
 * Production RPC wiring, trusted issuers and actual concurrency acceptance are absent.
 */
export function createVoiceStoreAdmission(ports: VoiceStoreAdapterPorts): {
  admit(raw: unknown): Promise<VoiceAdmissionLease | null>;
} {
  return createStoreAdmission(ports, null);
}

/** Inactive extension of the same admission-owned closure. No arbitrary claim
 * or lease snapshot can be attached later. One fresh INSPECT proof goes directly
 * to mark, never through the consuming base inspect. The returned observation
 * is neither an atomic boundary with Auth nor a provider-dispatch grant. Real
 * Auth/session provisioning, host integration and provider finality are absent.
 */
export function createVoiceCapacityStoreAdmission(ports: VoiceCapacityStoreAdapterPorts): {
  admit(raw: unknown): Promise<VoiceCapacityAdmissionLease | null>;
} {
  const version = ports.expectedPoolVersion;
  const mark = ports.mark;
  if (!Number.isSafeInteger(version) || version < 1 || typeof mark !== "function") unavailable();
  return createStoreAdmission(
    ports,
    Object.freeze({ expectedPoolVersion: version, mark: mark.bind(ports) }),
  );
}
function createStoreAdmission(
  ports: VoiceStoreAdapterPorts,
  capacity: CapacityConfiguration,
): { admit(raw: unknown): Promise<VoiceCapacityAdmissionLease | null> };
function createStoreAdmission(
  ports: VoiceStoreAdapterPorts,
  capacity: null,
): { admit(raw: unknown): Promise<VoiceAdmissionLease | null> };
function createStoreAdmission(
  ports: VoiceStoreAdapterPorts,
  capacity: CapacityConfiguration | null,
) {
  if (
    !Number.isSafeInteger(ports.maxProofAgeMs) ||
    ports.maxProofAgeMs < 1 ||
    ports.maxProofAgeMs > 30_000
  )
    unavailable();
  const proofAge = ports.maxProofAgeMs;
  return {
    async admit(raw: unknown): Promise<VoiceAdmissionLease | VoiceCapacityAdmissionLease | null> {
      let request = parseVoiceAdmissionRequest(raw);
      if (!request) return null;
      let owned: VoiceCleanupRegistration | null = null;
      let expectedSession: { ownerId: string; sessionId: string; version: number } | null = null;
      let ceiling = Number.MAX_SAFE_INTEGER;
      let observedNow = -1;
      let badClock = false;
      let terminal = false;
      function now() {
        let time: number;
        try {
          time = ports.now();
        } catch {
          badClock = true;
          return unavailable();
        }
        if (badClock || !Number.isSafeInteger(time) || time < 0 || time < observedNow) {
          badClock = true;
          return unavailable();
        }
        observedNow = time;
        return time;
      }
      function alive() {
        return !terminal && now() < ceiling;
      }
      function shorten(deadline: number) {
        ceiling = Math.min(ceiling, deadline);
        return alive();
      }
      async function verify(current = alive) {
        if (!request || !current()) return null;
        const startedAt = now();
        const observations: {
          session: { ownerId: string; sessionId: string; version: number } | null;
          authorityFingerprint: string | null;
        } = { session: null, authorityFingerprint: null };
        // All captured observations belong ONLY to this invocation, never another
        // in-flight admission or a previous verification result.
        const verifier = createVoiceServerVerifier({
          now,
          async authenticate() {
            if (!current()) return null;
            const identity = Identity.safeParse(await ports.authenticate());
            if (!identity.success || !shorten(identity.data.expiresAt) || !current()) return null;
            const query = Object.freeze({
              ownerId: identity.data.ownerId,
              sessionId: identity.data.sessionId,
            });
            const fence = Fence.safeParse(await ports.readSessionFence(query));
            if (
              !fence.success ||
              fence.data.ownerId !== query.ownerId ||
              fence.data.sessionId !== query.sessionId ||
              !shorten(fence.data.expiresAt) ||
              !current()
            )
              return null;
            const candidate = Object.freeze({ ...query, version: fence.data.version });
            for (const previous of [observations.session, expectedSession]) {
              if (
                previous &&
                (previous.ownerId !== candidate.ownerId ||
                  previous.sessionId !== candidate.sessionId ||
                  previous.version !== candidate.version)
              )
                return null;
            }
            observations.session = candidate;
            return Object.freeze({
              ...identity.data,
              expiresAt: Math.min(identity.data.expiresAt, fence.data.expiresAt),
            });
          },
          async readCurrent(query) {
            if (!current()) return null;
            // query is emitted by the existing verifier after authenticated crypto.
            if (
              observations.authorityFingerprint !== null &&
              observations.authorityFingerprint !== query.authorityFingerprint
            )
              return null;
            observations.authorityFingerprint = query.authorityFingerprint;
            const value = await ports.readCurrent(query);
            return current() ? value : null;
          },
        });
        const evidence = await verifier.verifyCurrent(request);
        if (evidence && !Binding.safeParse(evidence.binding).success) return null;
        if (
          !evidence ||
          !observations.session ||
          !observations.authorityFingerprint ||
          !shorten(evidenceDeadline(evidence)) ||
          !current()
        )
          return null;
        if (!expectedSession) expectedSession = observations.session;
        return Object.freeze({
          evidence,
          session: observations.session,
          authorityFingerprint: observations.authorityFingerprint,
          startedAt,
        });
      }
      function requireOwned(claim: VoiceAdmissionClaim) {
        if (!owned || !sameClaim(owned.claim, claim)) return unavailable();
        return owned;
      }
      async function prepareProof(
        kind: "claim" | "inspect",
        claim: VoiceAdmissionClaim,
        current = alive,
      ): Promise<VoiceOperationProof> {
        const ownership = requireOwned(claim);
        const checked = await verify(current);
        if (
          !checked ||
          !sameClaim({ ...claim, binding: checked.evidence.binding }, claim) ||
          !current()
        )
          unavailable();
        const receiptDeadline = checked.startedAt + proofAge;
        if (!Number.isSafeInteger(receiptDeadline)) unavailable();
        const expiresAt = Math.min(ceiling, receiptDeadline);
        if (!Number.isSafeInteger(expiresAt) || now() >= expiresAt) unavailable();
        const proof: VoiceOperationProof = Object.freeze({
          ...ownership,
          receiptId: crypto.randomUUID(),
          operation: kind,
          ownerSessionId: checked.session.sessionId,
          sessionVersion: checked.session.version,
          authorityFingerprint: checked.authorityFingerprint,
          identityExpiresAt: checked.evidence.identityExpiresAt,
          verifiedAt: checked.startedAt,
          expiresAt,
          effectiveExpiresAt: Math.min(ceiling, claim.expiresAt),
        });
        const registration = ProofAck.safeParse(await ports.registerProof(proof));
        if (
          !registration.success ||
          registration.data.receiptId !== proof.receiptId ||
          registration.data.operation !== kind ||
          !sameClaim(registration.data.claim, claim) ||
          registration.data.expiresAt !== proof.expiresAt ||
          registration.data.effectiveExpiresAt !== proof.effectiveExpiresAt ||
          !current() ||
          now() >= proof.expiresAt
        )
          unavailable();
        // Recheck after the receipt wait. Shorter evidence requires a new deliberate
        // admission, never silent retry/reissue of this already registered proof.
        const after = await verify(current);
        if (
          !after ||
          !sameClaim({ ...claim, binding: after.evidence.binding }, claim) ||
          ceiling < proof.effectiveExpiresAt ||
          !current() ||
          now() >= proof.expiresAt
        )
          unavailable();
        return proof;
      }
      async function operation(
        kind: "claim" | "inspect",
        claim: VoiceAdmissionClaim,
      ): Promise<VoiceAdmissionAck> {
        const ownership = requireOwned(claim);
        const proof = await prepareProof(kind, claim);
        if (ceiling < proof.effectiveExpiresAt || !alive() || now() >= proof.expiresAt)
          unavailable();
        const rawAck =
          kind === "claim"
            ? await ports.claim(proof.receiptId, ownership.claim)
            : await ports.inspect(proof.receiptId, ownership.claim);
        const ack = Ack.safeParse(rawAck);
        if (
          !ack.success ||
          !sameClaim(ack.data.claim, claim) ||
          !alive() ||
          now() >= proof.expiresAt
        )
          unavailable();
        return Object.freeze({ claim: ownership.claim, state: ack.data.state });
      }
      const checks = createVoiceAdmissionChecks({
        now,
        async verifyCurrent() {
          const checked = await verify();
          return checked
            ? Object.freeze({
                ...checked.evidence,
                identityExpiresAt: Math.min(checked.evidence.identityExpiresAt, ceiling),
              })
            : null;
        },
        async claimAdmission(claim) {
          if (owned || terminal) return unavailable();
          owned = Object.freeze({ cleanupId: crypto.randomUUID(), claim: frozenClaim(claim) });
          ceiling = Math.min(ceiling, owned.claim.expiresAt);
          const registration = Cleanup.safeParse(await ports.registerCleanup(owned));
          if (
            !registration.success ||
            registration.data.cleanupId !== owned.cleanupId ||
            !sameClaim(registration.data.claim, owned.claim) ||
            !alive()
          )
            unavailable();
          return operation("claim", owned.claim);
        },
        async inspectAdmission(claim) {
          return operation("inspect", claim);
        },
        async closeAdmission(claim) {
          const ownership = requireOwned(claim);
          terminal = true;
          request = null;
          const ack = Ack.safeParse(await ports.close(ownership.cleanupId, ownership.claim));
          if (
            !ack.success ||
            ack.data.state !== "closed" ||
            !sameClaim(ack.data.claim, ownership.claim)
          )
            unavailable();
          return Object.freeze({ claim: ownership.claim, state: "closed" });
        },
      });
      const lease = await checks.admit(request);
      if (!lease || !capacity) return lease;
      let marker: VoiceCapacityMarkerSnapshot | null = null;
      let attempted = false;
      // This is the actual private lease created immediately above. Only its
      // local state is consulted; its snapshot claim is never read or adopted.
      // All durable ownership comes exclusively from `owned` in this closure.
      const markerAlive = () => lease.snapshot().state === "active" && alive();
      function retain(
        state: VoiceCapacityMarkerSnapshot["state"],
        acknowledgment: VoiceCapacityMarkState | null,
      ) {
        if (marker) marker = Object.freeze({ ...marker, state, acknowledgment });
      }
      const extended: VoiceCapacityAdmissionLease = {
        snapshot: lease.snapshot,
        revalidate: lease.revalidate,
        close() {
          // The base lease fences itself synchronously but invokes its close
          // port in a microtask. Fence the bridge NOW, before any marker await.
          terminal = true;
          request = null;
          return lease.close();
        },
        markerSnapshot: () => marker,
        async markCapacity() {
          if (attempted) return null;
          attempted = true;
          // The one-attempt fence precedes even UUID allocation. A failure must
          // never allocate a replacement identity or infer that SQL rolled back.
          try {
            const operationId = crypto.randomUUID();
            const ownership = owned;
            if (!ownership) return null;
            marker = Object.freeze({
              ...ownership,
              operationId,
              expectedPoolVersion: capacity.expectedPoolVersion,
              state: "pending",
              acknowledgment: null,
            });
            if (!markerAlive()) unavailable();
            const proof = await prepareProof("inspect", ownership.claim, markerAlive);
            if (ceiling < proof.effectiveExpiresAt || !markerAlive() || now() >= proof.expiresAt)
              unavailable();
            const ack = CapacityAck.safeParse(
              await capacity.mark(
                Object.freeze({
                  receiptId: proof.receiptId,
                  claim: ownership.claim,
                  operationId,
                  expectedPoolVersion: capacity.expectedPoolVersion,
                }),
              ),
            );
            if (!ack.success || !sameClaim(ack.data.claim, ownership.claim)) unavailable();
            // Retain an exact SQL observation even when its reply arrives after
            // cancellation/expiry. It still cannot become local success.
            retain("unconfirmed", ack.data.state);
            if (ack.data.state !== "marked" || !markerAlive() || now() >= proof.expiresAt)
              unavailable();
            const final = await verify(markerAlive);
            if (
              !final ||
              !sameClaim(
                { ...ownership.claim, binding: final.evidence.binding },
                ownership.claim,
              ) ||
              ceiling < proof.effectiveExpiresAt ||
              !markerAlive() ||
              now() >= proof.expiresAt
            )
              unavailable();
            retain("observed", "marked");
            return Object.freeze({ state: "marked", operationId, claim: ownership.claim });
          } catch {
            retain("unconfirmed", marker?.acknowledgment ?? null);
            return null;
          }
        },
      };
      return Object.freeze(extended);
    },
  };
}
