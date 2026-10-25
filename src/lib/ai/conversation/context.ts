// Conversation v1 — allowed-context assembly.
//
// The single place a provider-bound context could be built. It enforces, in
// order: contract validity, verified principal and thread ownership, server /
// client thread agreement, exact excerpt-preview binding, scoped spiritual
// grants, and registry-resolved sources only.
//
// STRUCTURAL EXCLUSIONS (O03): the assembled context type has no field that
// can carry other threads, private journals, weekly notes, undisclosed
// prior-day answers, hidden Day 10 material, progress-derived profiles,
// provider credentials or unrelated files. There is no spread of a whole day,
// request, or storage object anywhere in this namespace.
//
// TRUST LIMITS (documented, not hidden): P1 uses fictional trusted fixtures.
// A caller choosing a thread ID never proves ownership — ownership comes from
// the server-supplied TrustedPrincipal. Real authenticated wiring (session
// verification, preview-store persistence, turn-linkage validation) is P3b.

import {
  validateClientTurnRequest,
  validateServerContext,
  validateTrustedPrincipal,
  type ClientTurnRequest,
  type ConversationErrorCode,
  type SelectedExcerptReference,
  type ServerContext,
  type TrustedPrincipal,
} from "./contract";
import { resolveSpiritualAccess, type SpiritualAccess } from "./grants";
import {
  resolveSourceCard,
  type SourceCard,
  type SourceRegistry,
} from "./sources";
import { CONVERSATION_POLICY_IDENTITY } from "./policy";

export const EXCLUDED_CONTEXT_NOTE =
  "Other threads, private journals, weekly notes, undisclosed prior-day answers, hidden Day 10 material, progress-derived profiles, provider credentials and unrelated files are structurally excluded: the assembled context has no field that can carry them.";

/** Server-owned record of an exact excerpt preview shown to the person. */
export interface ExcerptPreviewRecord {
  readonly excerptSha256: string;
  readonly previewedAtIso: string;
}

export interface AssembleConversationContextInput {
  /** Raw client payload (untrusted). */
  readonly request: unknown;
  /** Server-supplied trusted principal (fixture at P1). */
  readonly principal: unknown;
  /** Server-owned thread/preference state (fixture at P1). */
  readonly serverContext: unknown;
  readonly registry: SourceRegistry;
  /**
   * Server-owned preview records keyed by previewId. An excerpt reference
   * must match a record exactly; a changed underlying note invalidates the
   * preview rather than widening to adjacent text.
   */
  readonly previewStore: ReadonlyMap<string, ExcerptPreviewRecord>;
  /** Teaching source keys the SERVER selected for this turn. */
  readonly selectedTeachingKeys?: readonly string[];
  /** Test harnesses only: permits test-only source fixtures. */
  readonly allowTestSources?: boolean;
}

export interface AssembledConversationContext {
  readonly contractVersion: ClientTurnRequest["contractVersion"];
  readonly policyIdentity: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly message: string;
  readonly excerpts: readonly SelectedExcerptReference[];
  readonly spiritual: SpiritualAccess;
  readonly sources: readonly SourceCard[];
  readonly exclusionsNote: string;
}

export type AssembleConversationContextResult =
  | { readonly ok: true; readonly context: AssembledConversationContext }
  | { readonly ok: false; readonly code: ConversationErrorCode };

export function assembleConversationContext(
  input: AssembleConversationContextInput,
): AssembleConversationContextResult {
  const requestResult = validateClientTurnRequest(input.request);
  if (!requestResult.ok) return requestResult;
  const request = requestResult.value;

  const principalResult = validateTrustedPrincipal(input.principal);
  if (!principalResult.ok) return principalResult;
  const principal: TrustedPrincipal = principalResult.value;
  if (principal.principalId !== principal.threadOwnerId) {
    return { ok: false, code: "owner-mismatch" };
  }

  const serverResult = validateServerContext(input.serverContext);
  if (!serverResult.ok) return serverResult;
  const serverContext: ServerContext = serverResult.value;
  if (serverContext.threadId !== request.threadId) {
    return { ok: false, code: "thread-mismatch" };
  }

  // Exact preview binding: every referenced excerpt must match a server-owned
  // preview record byte-for-byte (by hash). No preview record, a hash change,
  // or a missing store entry refuses the turn rather than widening context.
  for (const excerpt of request.selectedExcerpts) {
    const preview = input.previewStore.get(excerpt.previewId);
    if (!preview || preview.excerptSha256 !== excerpt.excerptSha256) {
      return { ok: false, code: "stale-excerpt-preview" };
    }
  }

  // A direct follow-up inherits a scoped grant only when the server re-attached
  // the original grant to this turn. P1 cannot validate the turn linkage
  // itself; that is P3b wiring, documented in the baseline/change map.
  if (
    request.spiritualFollowUpOfTurnId !== null &&
    request.spiritualRequestGrant === null
  ) {
    return { ok: false, code: "follow-up-without-grant" };
  }

  const spiritual = resolveSpiritualAccess({
    preferenceOn: serverContext.spiritualPreferenceOn,
    restrictions: serverContext.restrictions,
    grant: request.spiritualRequestGrant,
    isDirectFollowUp: request.spiritualFollowUpOfTurnId !== null,
  });

  const allowTestSources = input.allowTestSources === true;
  const sources: SourceCard[] = [];

  if (request.spiritualRequestGrant?.sourceId !== undefined) {
    const card = resolveSourceCard(
      input.registry,
      request.spiritualRequestGrant.sourceId,
      allowTestSources,
    );
    if (!card.ok) return card;
    sources.push(card.value);
  }

  for (const key of input.selectedTeachingKeys ?? []) {
    const card = resolveSourceCard(input.registry, key, allowTestSources);
    if (!card.ok) return card;
    if (card.value.kind !== "journey-day-teaching") {
      return { ok: false, code: "unknown-source-id" };
    }
    sources.push(card.value);
  }

  return {
    ok: true,
    context: {
      contractVersion: request.contractVersion,
      policyIdentity: CONVERSATION_POLICY_IDENTITY,
      threadId: request.threadId,
      turnId: request.turnId,
      message: request.message,
      excerpts: request.selectedExcerpts,
      spiritual,
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
