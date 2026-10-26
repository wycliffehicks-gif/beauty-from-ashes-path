// Conversation P3a — MOCK provider. Deterministic, local, no network.
//
// This is not a model. Its replies are canned fictional text derived from
// the immutable request the service built, so tests can prove what the
// APPLICATION sent and accepted — never response quality. Every reply is
// prefixed as fictional.

import type {
  ConversationProvider,
  ConversationProviderRequest,
  ConversationProviderResponse,
} from "./provider";

export const MOCK_REPLY_PREFIX = "Fictional preview reply (mock provider, not AI):";

// The neutral provider contract lives in ./provider (P4). These aliases keep
// the original P3a names working for existing tests and the service.
export type {
  ProviderEffectiveItem,
  ProviderHistoryEntry,
} from "./provider";
export type MockProviderRequest = ConversationProviderRequest;
export type MockProviderResponse = ConversationProviderResponse;
export type MockProvider = ConversationProvider;

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
  } else if (request.fixture.grantKind === "prayer") {
    parts.push(
      !ctx.spiritual.prayerPermitted
        ? "Respecting your current boundary, there is no prayer in this reply."
        : ctx.spiritual.reason === "scoped-grant-direct-follow-up"
          ? "[Fictional simpler prayer placeholder for the requested revision.]"
          : "[Fictional short prayer placeholder for the requested reply only.]",
    );
  } else if (request.fixture.grantKind === "passage") {
    const scripture = ctx.sources.find(
      (s) => s.excerpt.spiritualClassification === "christian-scripture",
    );
    if (!ctx.spiritual.scripturePermitted) {
      parts.push("Respecting your current boundary, there is no Scripture in this reply.");
    } else if (scripture) {
      parts.push(
        `Exact supplied text (${scripture.card.reference ?? ""}, ${scripture.card.translation ?? ""}): "${scripture.excerpt.exactText}"`,
      );
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
      // A pre-aborted request settles immediately and is never dispatched.
      if (signal.aborted && !options.ignoreAbort) return Promise.reject(new Error("aborted"));
      options.onDispatch?.(request);
      return new Promise((resolve, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", onAbort);
          fn();
        };
        const onAbort = () => {
          if (!options.ignoreAbort) settle(() => reject(new Error("aborted")));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        schedule(() => {
          if (settled) return;
          if (signal.aborted && !options.ignoreAbort) {
            settle(() => reject(new Error("aborted")));
            return;
          }
          if (options.failWith) {
            const code = options.failWith;
            settle(() => reject(new Error(code)));
            return;
          }
          try {
            const value = (options.respond ?? deterministicMockReply)(request);
            settle(() => resolve(value));
          } catch (err) {
            settle(() => reject(err instanceof Error ? err : new Error(String(err))));
          }
        }, options.delayMs ?? 0);
      });
    },
  };
}
