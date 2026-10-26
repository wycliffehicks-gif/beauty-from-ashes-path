// Conversation P4 — NEUTRAL provider contract.
//
// Extracted from mock-provider.ts so the shared conversation service depends
// on a provider-independent request/response shape, not on the mock. The
// service remains the sole authority for what enters a request: it builds
// this immutable payload through the P1 boundary and validates every
// response against it. A provider (mock OR live) never gains authority from
// anything it returns.
//
// The `fixture` block is MOCK-ONLY testing scaffolding. A live provider
// adapter must NEVER serialize fixture directives or canned mock
// interpretations into a model request; it exists so the deterministic mock
// can prove what the application sent and accepted.

import type { AssembledConversationContext } from "../context";

export interface ProviderHistoryEntry {
  readonly eventId: string;
  readonly role: "user" | "assistant" | "shared-source";
  readonly text: string;
  /** For voice-delivered replies: whether unplayed segments were withheld. */
  readonly unheardWithheld: boolean;
}

export interface ProviderEffectiveItem {
  readonly itemId: string;
  readonly kind: "user-report" | "user-intention" | "user-correction" | "ai-interpretation";
  readonly text: string;
  readonly sourceEventId: string;
}

export interface ConversationProviderRequest {
  readonly requestId: string;
  readonly policyIdentity: string;
  readonly policySha256: string;
  /** The exact approved candidate policy body bytes. */
  readonly policyBody: string;
  readonly context: AssembledConversationContext;
  readonly history: readonly ProviderHistoryEntry[];
  readonly effective: readonly ProviderEffectiveItem[];
  readonly historyComplete: boolean;
  readonly revisions: {
    readonly preference: number;
    readonly restrictions: number;
  };
  /** MOCK-ONLY scaffolding; never model instructions for a live adapter. */
  readonly fixture: {
    readonly caseId: string | null;
    readonly recallRequest: boolean;
    readonly mockInterpretation: { readonly tag: string; readonly text: string } | null;
    /** Kind of the service-issued scoped grant bound to this turn, if any. */
    readonly grantKind: "prayer" | "passage" | null;
  };
}

export interface ConversationProviderResponse {
  readonly text: string;
  /** Must be a subset of the admitted request sources, or the service refuses. */
  readonly sourceIds: readonly string[];
  /**
   * Mock-only tentative interpretation. A live adapter always returns null:
   * returned interpretation/operational claims never create app authority,
   * memory or grants, and never pretend an action was performed.
   */
  readonly interpretation: { readonly tag: string; readonly text: string } | null;
  /** Operational claims in the payload are NEVER executed by the service. */
  readonly claims?: readonly string[];
}

export interface ConversationProvider {
  generate(
    request: ConversationProviderRequest,
    signal: AbortSignal,
  ): Promise<ConversationProviderResponse>;
}
