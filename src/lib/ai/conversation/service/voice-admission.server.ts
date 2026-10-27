// Inactive server orchestration only. Production verification/transaction ports
// are deliberately unimplemented. No route, credential, capability, provider,
// capture, database client or ledger implementation is created here.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import type { VoiceAdmission } from "./voice-lifecycle";

const Id = z.string().uuid();
const Count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Expiry = Count.positive();
const RequestSchema = z
  .object({
    threadId: Id,
    threadIncarnation: Id,
    threadRevision: Count,
    attemptId: Id,
    // This is an opaque active authority envelope, not identity or approval.
    activeAuthority: z.string().min(1).max(350_000),
  })
  .strict();
const BindingSchema = z
  .object({
    ownerId: Id,
    threadId: Id,
    threadIncarnation: Id,
    threadRevision: Count,
    attemptId: Id,
    approvalId: Id,
    approvalDigest: z.string().regex(/^[0-9a-f]{64}$/),
    scope: z.literal("developer-voice-session"),
  })
  .strict();
const EvidenceSchema = z
  .object({
    binding: BindingSchema,
    identityExpiresAt: Expiry,
    allowlistExpiresAt: Expiry,
    authorityExpiresAt: Expiry,
    approvalExpiresAt: Expiry,
  })
  .strict();
const ClaimSchema = z
  .object({
    claimId: Id,
    binding: BindingSchema,
    expiresAt: Expiry,
  })
  .strict();
const AckSchema = z
  .object({
    claim: ClaimSchema,
    state: z.enum(["claimed", "denied", "replayed", "uncertain", "closed"]),
  })
  .strict();

export type VoiceAdmissionRequest = Readonly<z.infer<typeof RequestSchema>>;
export type VoiceAdmissionBinding = Readonly<z.infer<typeof BindingSchema>>;
export type VoiceAdmissionEvidence = Readonly<
  Omit<z.infer<typeof EvidenceSchema>, "binding"> & { binding: VoiceAdmissionBinding }
>;
export type VoiceAdmissionClaim = Readonly<{
  claimId: string;
  binding: VoiceAdmissionBinding;
  expiresAt: number;
}>;
export type VoiceAdmissionAck = Readonly<{
  claim: VoiceAdmissionClaim;
  state: z.infer<typeof AckSchema>["state"];
}>;

export interface VoiceAdmissionCheckPorts {
  /** Trusted server clock in integer Unix milliseconds, never a client value. */
  now(): number;
  /** Derive fresh identity from verified server Auth, then validate the expiring
   * allowlist, owned nondeleted current row/incarnation/revision, authenticated
   * active sealed authority and separately approved exact voice scope/digest.
   * Unsealing alone does not authenticate the caller. Return null on denial.
   * The existing P3b seal does not itself supply an incarnation field: a future
   * adapter must establish that binding against current server authority.
   * Evidence is trusted ONLY because this port runs at the verified server
   * boundary; parsing evidence does not authenticate arbitrary objects.
   */
  verifyCurrent(request: VoiceAdmissionRequest): Promise<unknown>;
  /** ATOMIC durable admission claim, NOT permission to dispatch. Under lock,
   * independently recheck identity/allowlist, thread/incarnation/revision,
   * sealed authority, exact voice approval/expiry and server quota. Enforce
   * attempt uniqueness across claim IDs/processes; a duplicate never acquires
   * another hold. Do not open a provider session or mint a client capability.
   * The provided claimId is allocated before this await for ambiguous cleanup.
   * Throws/lost replies can have committed: retain durable uncertainty, never
   * automatically refund or retry. Prefer an owned "uncertain" acknowledgment.
   */
  claimAdmission(claim: VoiceAdmissionClaim): Promise<unknown>;
  /** Fresh durable read/transaction for this exact claim. Return "claimed"
   * only while it remains current and usable for admission checks. Downstream
   * dispatch STILL needs its own atomic authority/quota/claim checks.
   */
  inspectAdmission(claim: VoiceAdmissionClaim): Promise<unknown>;
  /** Idempotently close/fence this exact claimId, including a lost claim reply.
   * Closure must defeat any late commit for this ID without touching a different
   * claim that won the same attempt. It acknowledges terminal admission closure,
   * NOT provider termination, release/refund or completed usage reconciliation.
   * Return exact "closed" acknowledgment only with durable evidence; uncertainty
   * remains retained/retryable even after content deletion or account change.
   */
  closeAdmission(claim: VoiceAdmissionClaim): Promise<unknown>;
}

export type VoiceAdmissionLeaseState =
  | "active"
  | "invalid"
  | "closing"
  | "close-unconfirmed"
  | "closed";
export interface VoiceAdmissionLease extends VoiceAdmission {
  /** Content-free local check state. This is not a capability or dispatch grant. */
  snapshot(): {
    readonly state: VoiceAdmissionLeaseState;
    readonly claim: VoiceAdmissionClaim;
    /** This local ceiling only shrinks; claim.expiresAt remains the original
     * immutable durable cleanup/acknowledgment identity. */
    readonly effectiveExpiresAt: number;
  };
}

/** Exact, noncoercing input; caller-supplied owner/approval/status fields fail. */
export function parseVoiceAdmissionRequest(raw: unknown): VoiceAdmissionRequest | null {
  try {
    const result = RequestSchema.safeParse(raw);
    return result.success ? Object.freeze(result.data) : null;
  } catch {
    return null;
  }
}

function freezeClaim(value: z.infer<typeof ClaimSchema>): VoiceAdmissionClaim {
  return Object.freeze({ ...value, binding: Object.freeze({ ...value.binding }) });
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
function expiresAt(evidence: VoiceAdmissionEvidence): number {
  return Math.min(
    evidence.identityExpiresAt,
    evidence.allowlistExpiresAt,
    evidence.authorityExpiresAt,
    evidence.approvalExpiresAt,
  );
}

/** No production ports or defaults. No memory ledger, auth shortcut, lease
 * renewal or dispatch implementation. The server-only import is a framework
 * boundary marker; live integration still must enforce verified server routing.
 */
export function createVoiceAdmissionChecks(ports: VoiceAdmissionCheckPorts) {
  function before(deadline: number): boolean {
    try {
      const now = ports.now();
      return Number.isSafeInteger(now) && now >= 0 && now < deadline;
    } catch {
      return false;
    }
  }
  async function verify(request: VoiceAdmissionRequest): Promise<VoiceAdmissionEvidence | null> {
    try {
      const result = EvidenceSchema.safeParse(await ports.verifyCurrent(request));
      if (!result.success) return null;
      // Parsing copies nested data; never retain mutable port-owned evidence.
      const evidence = Object.freeze({
        ...result.data,
        binding: Object.freeze(result.data.binding),
      });
      const binding = evidence.binding;
      if (
        binding.threadId !== request.threadId ||
        binding.threadIncarnation !== request.threadIncarnation ||
        binding.threadRevision !== request.threadRevision ||
        binding.attemptId !== request.attemptId ||
        !before(expiresAt(evidence))
      )
        return null;
      return evidence;
    } catch {
      return null;
    }
  }
  function acknowledged(
    raw: unknown,
    claim: VoiceAdmissionClaim,
    state: VoiceAdmissionAck["state"],
  ): boolean {
    const parsed = AckSchema.safeParse(raw);
    return parsed.success && parsed.data.state === state && sameClaim(parsed.data.claim, claim);
  }

  return {
    /** null means no claim was attempted. Once claim may have run, ALWAYS
     * return its owned lease, even on denial, malformed/lost acknowledgment or
     * postclaim revocation. Caller must close that handle; revalidate is false.
     */
    async admit(raw: unknown): Promise<VoiceAdmissionLease | null> {
      const request = parseVoiceAdmissionRequest(raw);
      if (!request) return null;
      const initial = await verify(request);
      if (!initial || !before(expiresAt(initial))) return null;
      // Opaque cleanup identity, never a secret or provider/client capability.
      const claim = freezeClaim({
        claimId: crypto.randomUUID(),
        binding: initial.binding,
        expiresAt: expiresAt(initial),
      });
      let state: VoiceAdmissionLeaseState = "invalid";
      let effectiveExpiresAt = claim.expiresAt;
      let closing: Promise<void> | null = null;
      const fresh = (evidence: VoiceAdmissionEvidence | null) => {
        if (!evidence || !sameBinding(evidence.binding, claim.binding)) return false;
        effectiveExpiresAt = Math.min(effectiveExpiresAt, expiresAt(evidence));
        return before(effectiveExpiresAt);
      };
      const invalidate = () => {
        if (state === "active") state = "invalid";
        return false;
      };
      const lease: VoiceAdmissionLease = {
        snapshot: () => Object.freeze({ state, claim, effectiveExpiresAt }),
        async revalidate() {
          if (state !== "active") return false;
          try {
            if (!before(effectiveExpiresAt)) return invalidate();
            const first = await verify(request);
            if (state !== "active" || !fresh(first)) return invalidate();
            const current = await ports.inspectAdmission(claim);
            if (
              state !== "active" ||
              !acknowledged(current, claim, "claimed") ||
              !before(effectiveExpiresAt)
            )
              return invalidate();
            // Recheck server identity/approval after the ledger wait. This is
            // eligibility evidence, not an atomic dispatch authorization.
            const final = await verify(request);
            if (state !== "active" || !fresh(final)) return invalidate();
            return true;
          } catch {
            return invalidate();
          }
        },
        close() {
          if (state === "closed") return Promise.resolve();
          if (closing) return closing;
          // Terminal local fence before ANY await: neither a late verification
          // nor a later successful close retry can make this lease active again.
          state = "closing";
          closing = Promise.resolve().then(async () => {
            try {
              const result = await ports.closeAdmission(claim);
              if (!acknowledged(result, claim, "closed")) throw new Error();
              state = "closed";
            } catch {
              state = "close-unconfirmed";
              throw new Error("voice-admission-close-unconfirmed");
            } finally {
              closing = null;
            }
          });
          return closing;
        },
      };
      try {
        const result = await ports.claimAdmission(claim);
        if (acknowledged(result, claim, "claimed") && before(claim.expiresAt)) {
          state = "active";
          await lease.revalidate();
        }
      } catch {
        // No inference that the claim did not commit. Its exact cleanup address
        // remains owned and observable, with no automatic retry or refund.
        invalidate();
      }
      return Object.freeze(lease);
    },
  };
}
