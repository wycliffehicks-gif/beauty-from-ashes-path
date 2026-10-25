// Conversation v1 — allowed-context assembly.
//
// The single place a provider-bound context could be built. It enforces, in
// order: contract validity; verified principal bound to the exact authorized
// thread; principal ↔ owner ↔ server-thread ↔ request-thread agreement;
// server-owned grant binding (owner, thread, exact current turn, kind,
// permitted sources, validated follow-up lineage); exact excerpt-preview
// binding with async hash verification; and registry-resolved, spiritually
// permitted sources only.
//
// STRUCTURAL EXCLUSIONS (O03): the assembled context type has no field that
// can carry other threads, private journals, weekly notes, undisclosed
// prior-day answers, hidden Day 10 material, progress-derived profiles,
// provider credentials or unrelated files. There is no spread of a whole day,
// request, or storage object anywhere in this namespace.
//
// TRUST LIMITS (documented, not hidden): P1 uses fictional trusted fixtures.
// A caller choosing a thread ID never proves ownership — ownership comes from
// the server-supplied TrustedPrincipal. P3a's shared service now issues
// grants with lineage and supplies a FIXTURE principal internally; real
// authenticated identity, ownership and persistence remain P3b.

import {
  validateClientTurnRequest,
  validateExcerptPreviewRecord,
  validateServerContext,
  validateServerGrant,
  validateTrustedPrincipal,
  CONVERSATION_MAX_SOURCES_PER_TURN,
  type ClientTurnRequest,
  type ConversationErrorCode,
  type ServerContext,
  type ServerGrant,
  type TrustedPrincipal,
} from "./contract";
import { resolveSpiritualAccess, type SpiritualAccess } from "./grants";
import {
  resolveRegistrySource,
  sha256Hex,
  type ResolvedSource,
  type SourceRegistry,
} from "./sources";
import { CONVERSATION_POLICY_IDENTITY } from "./policy";

export const EXCLUDED_CONTEXT_NOTE =
  "Other threads, private journals, weekly notes, undisclosed prior-day answers, hidden Day 10 material, progress-derived profiles, provider credentials and unrelated files are structurally excluded: the assembled context has no field that can carry them.";

export interface AssembleConversationContextInput {
  /** Raw client payload (untrusted). */
  readonly request: unknown;
  /** Server-supplied trusted principal (fixture at P1). */
  readonly principal: unknown;
  /** Server-owned thread/preference state (fixture at P1). */
  readonly serverContext: unknown;
  readonly registry: SourceRegistry;
  /**
   * Server-owned preview records keyed by previewId (fixtures at P1). Each
   * record is schema-validated and its text re-hashed; the client reference
   * may only select the exact previously shown bytes.
   */
  readonly previewStore: ReadonlyMap<string, unknown>;
  /**
   * Server-owned current revision per excerpt source key. A preview made
   * against an older revision is stale and refused.
   */
  readonly currentSourceRevisions: ReadonlyMap<string, string>;
  /** Server-owned grant for this turn, or null. Never client-supplied. */
  readonly serverGrant?: unknown;
  /** Teaching source keys the SERVER selected for this turn. */
  readonly selectedTeachingKeys?: readonly string[];
  /** Test harnesses only: permits test-only source fixtures. */
  readonly allowTestSources?: boolean;
  /** Current time (ISO) for preview expiry checks. */
  readonly nowIso?: string;
}

/** An assembled excerpt: only the validated selected bytes plus permitted
 * provenance, explicitly classed as untrusted user data. */
export interface AssembledExcerpt {
  readonly previewId: string;
  readonly sourceKey: "private-note";
  readonly exactText: string;
  readonly textSha256: string;
  readonly previewedAtIso: string;
  readonly sourceRevision: string;
  readonly dataClass: "untrusted-user-data";
}

export interface AssembledConversationContext {
  readonly contractVersion: ClientTurnRequest["contractVersion"];
  readonly policyIdentity: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly message: string;
  readonly excerpts: readonly AssembledExcerpt[];
  readonly spiritual: SpiritualAccess;
  /** ALL current restrictions, preserved verbatim. */
  readonly restrictions: readonly ServerContext["restrictions"][number][];
  readonly sources: readonly ResolvedSource[];
  readonly exclusionsNote: string;
}

export type AssembleConversationContextResult =
  | { readonly ok: true; readonly context: AssembledConversationContext }
  | { readonly ok: false; readonly code: ConversationErrorCode };

export async function assembleConversationContext(
  input: AssembleConversationContextInput,
): Promise<AssembleConversationContextResult> {
  const requestResult = validateClientTurnRequest(input.request);
  if (!requestResult.ok) return requestResult;
  const request = requestResult.value;

  const principalResult = validateTrustedPrincipal(input.principal);
  if (!principalResult.ok) return principalResult;
  const principal: TrustedPrincipal = principalResult.value;
  if (principal.principalId !== principal.threadOwnerId) {
    return { ok: false, code: "owner-mismatch" };
  }
  if (principal.authorizedThreadId !== request.threadId) {
    return { ok: false, code: "unauthorized-thread" };
  }

  const serverResult = validateServerContext(input.serverContext);
  if (!serverResult.ok) return serverResult;
  const serverContext: ServerContext = serverResult.value;
  if (serverContext.threadId !== request.threadId) {
    return { ok: false, code: "thread-mismatch" };
  }
  if (serverContext.ownerId !== principal.principalId) {
    return { ok: false, code: "owner-mismatch" };
  }

  // --- Server-owned grant binding --------------------------------------
  let grant: ServerGrant | null = null;
  if (input.serverGrant !== null && input.serverGrant !== undefined) {
    const grantResult = validateServerGrant(input.serverGrant);
    if (!grantResult.ok) return grantResult;
    grant = grantResult.value;
    if (
      grant.ownerId !== principal.principalId ||
      grant.threadId !== request.threadId ||
      grant.turnId !== request.turnId
    ) {
      // Replayed in a new/unrelated turn, cross-owner, or cross-thread.
      return { ok: false, code: "grant-not-bound" };
    }
  }
  const isDirectFollowUp = grant !== null && grant.followUpOfTurnId !== null;

  const spiritual = resolveSpiritualAccess({
    preferenceOn: serverContext.spiritualPreferenceOn,
    restrictions: serverContext.restrictions,
    grant: grant ? { kind: grant.kind } : null,
    isDirectFollowUp,
  });

  // --- Exact excerpt-preview binding ------------------------------------
  const seenPreviews = new Set<string>();
  const excerpts: AssembledExcerpt[] = [];
  for (const reference of request.selectedExcerpts) {
    if (seenPreviews.has(reference.previewId)) {
      return { ok: false, code: "duplicate-excerpt" };
    }
    seenPreviews.add(reference.previewId);

    const rawPreview = input.previewStore.get(reference.previewId);
    const previewResult = validateExcerptPreviewRecord(rawPreview);
    if (!previewResult.ok) return previewResult;
    const preview = previewResult.value;

    // The stored record's own ID must equal the referenced ID — a map key
    // alias cannot stand in for the record's identity.
    if (preview.previewId !== reference.previewId) {
      return { ok: false, code: "preview-id-mismatch" };
    }
    if (
      preview.ownerId !== principal.principalId ||
      preview.threadId !== request.threadId ||
      preview.turnId !== request.turnId
    ) {
      return { ok: false, code: "stale-excerpt-preview" };
    }
    // Re-hash the server-held text rather than trusting any declared hash.
    if ((await sha256Hex(preview.exactText)) !== preview.textSha256) {
      return { ok: false, code: "stale-excerpt-preview" };
    }
    if (
      reference.excerptSha256 !== preview.textSha256 ||
      reference.previewedAtIso !== preview.previewedAtIso
    ) {
      return { ok: false, code: "stale-excerpt-preview" };
    }
    const currentRevision = input.currentSourceRevisions.get(preview.sourceKey);
    if (currentRevision === undefined || currentRevision !== preview.sourceRevision) {
      return { ok: false, code: "stale-excerpt-preview" };
    }
    // Expiry is enforced by epoch comparison, never lexical string order.
    // A non-null expiry requires a valid clock: if nowIso is absent or
    // unparseable, the preview cannot be admitted. Expiry at or before now
    // is rejected (boundary equality is expired).
    if (preview.expiresAtIso !== null) {
      const expiresAtMs = Date.parse(preview.expiresAtIso);
      if (!Number.isFinite(expiresAtMs)) {
        return { ok: false, code: "invalid-timestamp" };
      }
      if (input.nowIso === undefined) {
        return { ok: false, code: "invalid-timestamp" };
      }
      const nowMs = Date.parse(input.nowIso);
      if (!Number.isFinite(nowMs)) {
        return { ok: false, code: "invalid-timestamp" };
      }
      if (expiresAtMs <= nowMs) {
        return { ok: false, code: "stale-excerpt-preview" };
      }
    }

    excerpts.push({
      previewId: preview.previewId,
      sourceKey: preview.sourceKey,
      exactText: preview.exactText,
      textSha256: preview.textSha256,
      previewedAtIso: preview.previewedAtIso,
      sourceRevision: preview.sourceRevision,
      dataClass: "untrusted-user-data",
    });
  }

  // --- Sources: registry-resolved, permission-gated, bounded, deduped ---
  const allowTestSources = input.allowTestSources === true;
  const restrictions = new Set(serverContext.restrictions);
  const sources: ResolvedSource[] = [];
  const seenSources = new Set<string>();

  const admit = (sourceId: string): ConversationErrorCode | null => {
    if (seenSources.has(sourceId)) return null; // dedupe
    const resolved = resolveRegistrySource(input.registry, sourceId, allowTestSources);
    if (!resolved.ok) return resolved.code;
    const { excerpt } = resolved.value;

    if (excerpt.reviewStatus === "provisional-review-pending") {
      return "pending-review-source";
    }
    // No-Bible constrains actual sources, not only booleans.
    if (
      restrictions.has("no-bible") &&
      excerpt.spiritualClassification === "christian-scripture"
    ) {
      return "source-not-permitted";
    }
    // Christian-classified material requires resolved spiritual permission.
    if (
      excerpt.spiritualClassification !== "nonreligious-teaching" &&
      !spiritual.devotionalContentPermitted
    ) {
      return "source-not-permitted";
    }
    if (sources.length >= CONVERSATION_MAX_SOURCES_PER_TURN) {
      return "source-not-permitted";
    }
    seenSources.add(sourceId);
    sources.push(resolved.value);
    return null;
  };

  // Grant-named sources must be compatible with the grant kind.
  for (const sourceId of grant?.sourceIds ?? []) {
    const resolved = resolveRegistrySource(input.registry, sourceId, allowTestSources);
    if (!resolved.ok) return { ok: false, code: resolved.code };
    const { excerpt } = resolved.value;
    if (grant!.kind === "passage") {
      if (
        excerpt.kind !== "verified-scripture-test-excerpt" ||
        excerpt.spiritualClassification !== "christian-scripture"
      ) {
        // A passage grant naming teaching (e.g. BFA-D01) fails.
        return { ok: false, code: "source-not-permitted" };
      }
      if (!spiritual.scripturePermitted) {
        return { ok: false, code: "source-not-permitted" };
      }
    } else {
      // A prayer grant cannot smuggle the Scripture fixture.
      if (excerpt.spiritualClassification === "christian-scripture") {
        return { ok: false, code: "source-not-permitted" };
      }
      if (!spiritual.prayerPermitted) {
        return { ok: false, code: "source-not-permitted" };
      }
    }
    const code = admit(sourceId);
    if (code) return { ok: false, code };
  }

  // Server-selected teaching: kind/classification compatibility enforced.
  for (const key of input.selectedTeachingKeys ?? []) {
    const resolved = resolveRegistrySource(input.registry, key, allowTestSources);
    if (!resolved.ok) return { ok: false, code: resolved.code };
    if (resolved.value.excerpt.kind !== "journey-day-teaching") {
      return { ok: false, code: "unknown-source-id" };
    }
    const code = admit(key);
    if (code) return { ok: false, code };
  }

  return {
    ok: true,
    context: {
      contractVersion: request.contractVersion,
      policyIdentity: CONVERSATION_POLICY_IDENTITY,
      threadId: request.threadId,
      turnId: request.turnId,
      message: request.message,
      excerpts,
      spiritual,
      restrictions: [...serverContext.restrictions],
      sources,
      exclusionsNote: EXCLUDED_CONTEXT_NOTE,
    },
  };
}

/**
 * Test-harness helper (O03 evidence): scan a serialized outbound payload for
 * private canary strings. Returns the canaries found; an empty result is the
 * passing condition. This is an application-boundary check — it does not
 * prove model prompt-injection resistance.
 */
export function scanForExcludedContent(
  serializedPayload: string,
  canaries: readonly string[],
): string[] {
  return canaries.filter((canary) => serializedPayload.includes(canary));
}
