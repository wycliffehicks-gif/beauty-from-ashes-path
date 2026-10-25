// Conversation P3a — MOCK provider. Deterministic, local, no network.
//
// This is not a model. Its replies are canned fictional text derived from
// the immutable request the service built, so tests can prove what the
// APPLICATION sent and accepted — never response quality. Every reply is
// prefixed as fictional.

import type { AssembledConversationContext } from "../context";

export const MOCK_REPLY_PREFIX = "Fictional preview reply (mock provider, not AI):";

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

export interface MockProviderRequest {
  readonly requestId: string;
  readonly policyIdentity: string;
  readonly policySha256: string;
  readonly context: AssembledConversationContext;
  readonly history: readonly ProviderHistoryEntry[];
  readonly effective: readonly ProviderEffectiveItem[];
  readonly historyComplete: boolean;
  readonly revisions: {
    readonly preference: number;
    readonly restrictions: number;
  };
  readonly fixture: {
    readonly caseId: string | null;
    readonly recallRequest: boolean;
    readonly mockInterpretation: { readonly tag: string; readonly text: string } | null;
  };
}

export interface MockProviderResponse {
  readonly text: string;
  /** Must be a subset of the admitted request sources, or the service refuses. */
  readonly sourceIds: readonly string[];
  readonly interpretation: { readonly tag: string; readonly text: string } | null;
  /** Operational claims in the payload are NEVER executed by the service. */
  readonly claims?: readonly string[];
}

export interface MockProvider {
  generate(request: MockProviderRequest, signal: AbortSignal): Promise<MockProviderResponse>;
}

/** Deterministic reply text built only from the request. */
export function deterministicMockReply(request: MockProviderRequest): MockProviderResponse {
  const ctx = request.context;
  const noQuestions = ctx.restrictions.includes("no-questions");
  const parts: string[] = [MOCK_REPLY_PREFIX];
  let sourceIds: string[] = [];

  if (!request.historyComplete) {
    parts.push("Part of this conversation's earlier history is missing, so I can't claim to remember all of it.");
  }

  if (request.fixture.recallRequest) {
    const reports = request.effective.filter(
      (e) => e.kind === "user-report" || e.kind === "user-correction",
    );
    const intentions = request.effective.filter((e) => e.kind === "user-intention");
    parts.push(
      reports.length
        ? `In this conversation you told me: ${reports.map((r) => r.text).join(" ")}`
        : "I have nothing you've told me in this conversation to recount.",
    );
    if (intentions.length) {
      parts.push(`You mentioned an intention, not something done: ${intentions.map((i) => i.text).join(" ")}`);
    }
  } else if (ctx.spiritual.prayerPermitted && ctx.spiritual.reason.startsWith("scoped-grant")) {
    parts.push(
      ctx.spiritual.reason === "scoped-grant-direct-follow-up"
        ? "[Fictional simpler prayer placeholder for the requested revision.]"
        : "[Fictional short prayer placeholder for the requested reply only.]",
    );
  } else if (ctx.spiritual.reason.startsWith("scoped-grant") && ctx.spiritual.scripturePermitted) {
    const scripture = ctx.sources.find(
      (s) => s.excerpt.spiritualClassification === "christian-scripture",
    );
    if (scripture) {
      parts.push(`Exact supplied text: "${scripture.excerpt.exactText}"`);
      sourceIds = [scripture.excerpt.sourceKey];
    } else {
      parts.push("I can't verify the exact wording of that passage in this preview, so I won't quote it.");
    }
  } else {
    parts.push("This canned reply does not understand what you wrote; it only demonstrates the service lifecycle.");
  }

  const teaching = ctx.sources.filter((s) => s.excerpt.kind === "journey-day-teaching");
  if (teaching.length) sourceIds = [...sourceIds, ...teaching.map((s) => s.excerpt.sourceKey)];

  if (!noQuestions && !request.fixture.recallRequest) {
    parts.push("Is there anything else you'd like to add?");
  }
  if (request.fixture.mockInterpretation) {
    parts.push(request.fixture.mockInterpretation.text);
  }
  return {
    text: parts.join(" "),
    sourceIds,
    interpretation: request.fixture.mockInterpretation,
  };
}

export interface MockProviderOptions {
  /** Async delay via the injected scheduler (0 = next macrotask). */
  readonly schedule?: (fn: () => void, ms: number) => unknown;
  readonly delayMs?: number;
  /** Simulate a provider that ignores AbortSignal and resolves anyway. */
  readonly ignoreAbort?: boolean;
  /** Override the response (adversarial tests). */
  readonly respond?: (request: MockProviderRequest) => MockProviderResponse;
  /** Reject with this error code (delayed error path). */
  readonly failWith?: string;
  /** Observe each dispatched request (evidence). */
  readonly onDispatch?: (request: MockProviderRequest) => void;
}

export function createMockProvider(options: MockProviderOptions = {}): MockProvider {
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  return {
    generate(request, signal) {
      options.onDispatch?.(request);
      return new Promise((resolve, reject) => {
        const onAbort = () => {
          if (!options.ignoreAbort) reject(new Error("aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        schedule(() => {
          signal.removeEventListener("abort", onAbort);
          if (signal.aborted && !options.ignoreAbort) return;
          if (options.failWith) {
            reject(new Error(options.failWith));
            return;
          }
          resolve((options.respond ?? deterministicMockReply)(request));
        }, options.delayMs ?? 0);
      });
    },
  };
}
