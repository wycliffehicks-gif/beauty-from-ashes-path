// Inactive verification adapter. No route or production Auth/database ports are
// wired here; neither its evidence nor successful decryption permits dispatch.
import "@tanstack/react-start/server-only";
import { z } from "zod";
import { fingerprint, unseal } from "../staging/seal.server";
import { parseVoiceAdmissionRequest, type VoiceAdmissionEvidence } from "./voice-admission.server";

const Id = z.string().uuid();
const Count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Expiry = Count.positive();
const Digest = z.string().regex(/^[0-9a-f]{64}$/);
const Identity = z.object({ ownerId: Id, sessionId: Id, expiresAt: Expiry }).strict();
const OwnedThread = {
  ownerId: Id,
  threadId: Id,
  threadIncarnation: Id,
  threadRevision: Count,
};
const Current = z
  .object({
    ...OwnedThread,
    deleted: z.literal(false),
    allowlist: z.object({ ownerId: Id, admitted: z.literal(true), expiresAt: Expiry }).strict(),
    authority: z
      .object({ ...OwnedThread, fingerprint: Digest, expiresAt: Expiry, revoked: z.literal(false) })
      .strict(),
    approval: z
      .object({
        ...OwnedThread,
        id: Id,
        digest: Digest,
        scope: z.literal("developer-voice-session"),
        attemptId: Id,
        expiresAt: Expiry,
        revoked: z.literal(false),
      })
      .strict(),
  })
  .strict();
const Envelope = z
  .object({
    owner: Id,
    thread: Id,
    revision: Count,
    expires: Expiry,
    // No content is restored, inspected, logged or returned by this adapter.
    authority: z.record(z.unknown()),
  })
  .strict();

export interface VoiceVerificationQuery {
  readonly ownerId: string;
  readonly threadId: string;
  readonly attemptId: string;
  readonly authorityFingerprint: string;
}
export interface VoiceVerificationPorts {
  /** Trusted integer Unix milliseconds. Failure/backwards movement denies. */
  now(): number;
  /** Mandatory request-bound server Auth verification, not a parsed JWT, client
   * owner, getSession-only result, or an arbitrary object presented by a caller.
   * Verify the current session with the authentication authority on EVERY call;
   * return { ownerId, sessionId, expiresAt } or null. No browser token is returned.
   * Production wiring is absent. Parsing the return value cannot authenticate it.
   */
  authenticate(): Promise<unknown>;
  /** Mandatory trusted server atomic snapshot of current owned thread, expiring
   * allowlist, exact authority issuance registration, and exact voice approval.
   * Return the strict Current schema or null. Do not return personal content.
   *
   * The legacy seal has NO incarnation/issuedAt. authority.fingerprint MUST be
   * the keyed HMAC of this exact envelope, recorded atomically at trusted issuance
   * against the original server-generated incarnation/revision. Never register a
   * presented token here, infer incarnation from the request or lazily bind an
   * old seal to a recreated row. Missing registration denies. Records may shorten
   * the seal's lifetime but cannot extend it. Production schema/issuer are absent.
   *
   * This snapshot is eligibility evidence, not a lock spanning remote Auth or a
   * dispatch transaction. claim/inspect ports still need their own authoritative
   * transaction-bound rechecks; these parsed objects are never capabilities.
   */
  readCurrent(query: VoiceVerificationQuery): Promise<unknown>;
}

/** Concrete crypto and cross-record verification using mandatory server ports.
 * Retains no envelope, private content, credentials, cache or approval registry
 * between calls. It verifies envelope identity/issuance, not the authority body
 * as executable service context; any later dispatch must restore and validate
 * that body through the existing service/P1 boundary. Only content-free admission
 * evidence is returned. No defaults
 * silently substitute fictional Auth or store implementations in application code.
 */
export function createVoiceServerVerifier(ports: VoiceVerificationPorts) {
  return {
    async verifyCurrent(raw: unknown): Promise<VoiceAdmissionEvidence | null> {
      try {
        const parsedRequest = parseVoiceAdmissionRequest(raw);
        if (!parsedRequest) return null;
        const request = parsedRequest;
        let observedNow = -1;
        let deadline = Number.MAX_SAFE_INTEGER;
        function alive(): boolean {
          const now = ports.now();
          if (!Number.isSafeInteger(now) || now < 0 || now < observedNow) return false;
          observedNow = now;
          return now < deadline;
        }
        function shorten(...expiries: number[]): boolean {
          deadline = Math.min(deadline, ...expiries);
          return alive();
        }
        if (!alive()) return null;
        const firstIdentity = Identity.safeParse(await ports.authenticate());
        if (!firstIdentity.success || !shorten(firstIdentity.data.expiresAt)) return null;
        const identity = Object.freeze(firstIdentity.data);
        let identityExpiresAt = identity.expiresAt;
        const opened = Envelope.safeParse(
          await unseal(
            request.activeAuthority,
            identity.ownerId,
            request.threadId,
            request.threadRevision,
          ),
        );
        if (!opened.success || !shorten(opened.data.expires)) return null;
        const authorityExpires = opened.data.expires;
        const keyedFingerprint = await fingerprint(request.activeAuthority);
        if (!alive()) return null;
        const query = Object.freeze({
          ownerId: identity.ownerId,
          threadId: request.threadId,
          attemptId: request.attemptId,
          authorityFingerprint: keyedFingerprint,
        });
        const matchesThread = (value: {
          ownerId: string;
          threadId: string;
          threadIncarnation: string;
          threadRevision: number;
        }) =>
          value.ownerId === identity.ownerId &&
          value.threadId === request.threadId &&
          value.threadIncarnation === request.threadIncarnation &&
          value.threadRevision === request.threadRevision;
        function currentRecord(rawRecord: unknown) {
          const parsed = Current.safeParse(rawRecord);
          if (!parsed.success) return null;
          const current = parsed.data;
          if (
            !matchesThread(current.authority) ||
            !matchesThread(current) ||
            !matchesThread(current.approval) ||
            current.allowlist.ownerId !== identity.ownerId ||
            current.authority.fingerprint !== keyedFingerprint ||
            current.authority.expiresAt > authorityExpires ||
            current.approval.attemptId !== request.attemptId ||
            !shorten(
              current.allowlist.expiresAt,
              current.authority.expiresAt,
              current.approval.expiresAt,
            )
          )
            return null;
          return current;
        }
        async function sameIdentity() {
          const result = Identity.safeParse(await ports.authenticate());
          if (
            !result.success ||
            result.data.ownerId !== identity.ownerId ||
            result.data.sessionId !== identity.sessionId
          )
            return false;
          identityExpiresAt = Math.min(identityExpiresAt, result.data.expiresAt);
          return shorten(identityExpiresAt);
        }
        const first = currentRecord(await ports.readCurrent(query));
        if (!first || !(await sameIdentity())) return null;
        const last = currentRecord(await ports.readCurrent(query));
        if (
          !last ||
          last.approval.id !== first.approval.id ||
          last.approval.digest !== first.approval.digest ||
          !(await sameIdentity()) ||
          !alive()
        )
          return null;
        return Object.freeze({
          binding: Object.freeze({
            ownerId: identity.ownerId,
            threadId: request.threadId,
            // Compared with both independently retrieved server records above.
            threadIncarnation: last.threadIncarnation,
            threadRevision: last.threadRevision,
            attemptId: request.attemptId,
            approvalId: last.approval.id,
            approvalDigest: last.approval.digest,
            scope: last.approval.scope,
          }),
          identityExpiresAt,
          allowlistExpiresAt: Math.min(first.allowlist.expiresAt, last.allowlist.expiresAt),
          authorityExpiresAt: Math.min(
            authorityExpires,
            first.authority.expiresAt,
            last.authority.expiresAt,
          ),
          approvalExpiresAt: Math.min(first.approval.expiresAt, last.approval.expiresAt),
        });
      } catch {
        // No raw error, envelope, token, private text or auth detail escapes.
        return null;
      }
    },
  };
}
