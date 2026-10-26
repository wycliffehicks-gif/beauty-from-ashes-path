// Conversation P4 — provider-request serialization.
//
// Pure and isomorphic (no secrets, no I/O): turns the immutable, service-built
// ConversationProviderRequest into the exact grounded payload string a live
// adapter may send. The P1-assembled context is the ONLY authority serialized
// here: the current message, authorized same-thread history, effective
// derived items with provenance kinds, current restrictions, resolved
// spiritual access, registry-admitted sources with their exact bytes, and
// server-confirmed exact excerpt bytes (marked untrusted user data).
//
// STRUCTURAL EXCLUSIONS are preserved: the `fixture` block (mock-only
// directives and canned interpretations) is NEVER serialized — it is testing
// scaffolding, not model instructions. No cross-thread or cross-account
// history, journal/weekly/prior-day/hidden-Day-10 material, credentials or
// storage internals can appear: the request type carries no field for them
// beyond what P1 already admitted.

import type { ConversationProviderRequest } from "./provider";

export const CONVERSATION_SERIALIZATION_VERSION = "bfa-conversation-serialization-v1";

/**
 * Transport-specific response-format instructions. Deliberately SEPARATE from
 * the approved policy body: the approved block (and its recorded SHA-256) is
 * never edited for transport needs; this note is appended by the adapter.
 */
export const CONVERSATION_TRANSPORT_FORMAT_NOTE =
  "TRANSPORT FORMAT (adapter note, not part of the approved policy body): " +
  'Reply only with JSON matching the required schema: {"text": string, "sourceIds": string[]}. ' +
  '"text" is the complete reply to the person. "sourceIds" lists only source keys from the ' +
  "supplied sources that the reply actually quotes or relies on; use [] when none. " +
  "Never invent a source key, and never cite a source whose exact text was not supplied.";

/** Approved policy body first, transport note clearly separated after it. */
export function buildConversationInstructions(
  request: ConversationProviderRequest,
): string {
  return `${request.policyBody}\n\n${CONVERSATION_TRANSPORT_FORMAT_NOTE}`;
}

/**
 * The exact grounded payload string (JSON) carrying the authorized context.
 * Key order is fixed so captured bytes are stable evidence.
 */
export function serializeConversationGroundedPayload(
  request: ConversationProviderRequest,
): string {
  const ctx = request.context;
  const payload = {
    serializationVersion: CONVERSATION_SERIALIZATION_VERSION,
    contractVersion: ctx.contractVersion,
    policyIdentity: request.policyIdentity,
    threadId: ctx.threadId,
    turnId: ctx.turnId,
    historyComplete: request.historyComplete,
    message: ctx.message,
    history: request.history.map((h) => ({
      role: h.role,
      text: h.text,
      unheardWithheld: h.unheardWithheld,
    })),
    effectiveContext: request.effective.map((e) => ({
      kind: e.kind,
      text: e.text,
    })),
    restrictions: [...ctx.restrictions],
    spiritual: {
      devotionalContentPermitted: ctx.spiritual.devotionalContentPermitted,
      prayerPermitted: ctx.spiritual.prayerPermitted,
      scripturePermitted: ctx.spiritual.scripturePermitted,
      reason: ctx.spiritual.reason,
    },
    sources: ctx.sources.map((s) => ({
      sourceKey: s.excerpt.sourceKey,
      kind: s.excerpt.kind,
      title: s.excerpt.title,
      exactText: s.excerpt.exactText,
      reference: s.excerpt.origin.reference ?? null,
      translation: s.excerpt.origin.translation ?? null,
      limitations: [...s.excerpt.limitations],
    })),
    sharedExcerpts: ctx.excerpts.map((e) => ({
      exactText: e.exactText,
      dataClass: e.dataClass,
      previewedAtIso: e.previewedAtIso,
    })),
    exclusionsNote: ctx.exclusionsNote,
  };
  return JSON.stringify(payload);
}
