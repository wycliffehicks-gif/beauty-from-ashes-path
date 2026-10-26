// P4 — direct OpenAI conversation provider, OFFLINE tests only.
// Every test injects a simulated fetchImpl; no network, no credentials.
import { describe, expect, it } from "vitest";
import {
  createDirectOpenAIConversationProvider,
  ProviderRequestError,
  OPENAI_RESPONSES_URL,
  type ConversationExchangeMeta,
} from "../service/openai-provider.server";
import {
  CONVERSATION_TRANSPORT_FORMAT_NOTE,
  buildConversationInstructions,
  serializeConversationGroundedPayload,
} from "../service/serialize";
import {
  CONVERSATION_POLICY_BLOCK,
  CONVERSATION_POLICY_BLOCK_SHA256,
} from "../policy";
import { sha256HexSync } from "../service/sha256-sync";
import type { ConversationProviderRequest } from "../service/provider";

const KEY = "test-key-not-a-real-credential";
const MODEL = "gpt-6-luna";

function makeRequest(over: Partial<ConversationProviderRequest> = {}): ConversationProviderRequest {
  return {
    requestId: "req-1",
    policyIdentity: "bfa-conversation-guide-v0.1",
    policySha256: CONVERSATION_POLICY_BLOCK_SHA256,
    policyBody: CONVERSATION_POLICY_BLOCK,
    context: {
      contractVersion: "bfa-conversation-contract-v1",
      policyIdentity: "bfa-conversation-guide-v0.1",
      threadId: "bfa-thread-t1",
      turnId: "bfa-turn-e0-t1",
      message: "I was angry when I came home yesterday.",
      excerpts: [],
      spiritual: {
        devotionalContentPermitted: false,
        prayerPermitted: false,
        scripturePermitted: false,
        reason: "preference-off-no-grant",
      },
      restrictions: [],
      sources: [],
      exclusionsNote: "excluded",
    },
    history: [],
    effective: [],
    historyComplete: true,
    revisions: { preference: 0, restrictions: 0 },
    fixture: {
      caseId: "C07-report",
      recallRequest: false,
      mockInterpretation: { tag: "guess-anger", text: "Perhaps you were angry." },
      grantKind: null,
    },
    ...over,
  };
}

function okApiResponse(replyText: string, sourceIds: string[] = [], over: Record<string, unknown> = {}) {
  return {
    id: "resp_abc123",
    model: MODEL,
    service_tier: "default",
    status: "completed",
    output: [
      { type: "reasoning", summary: [] },
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify({ text: replyText, sourceIds }) }],
      },
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      output_tokens_details: { reasoning_tokens: 0 },
      input_tokens_details: { cached_tokens: 0 },
    },
    ...over,
  };
}

type FetchCall = { url: string; init: RequestInit };
function fetchReturning(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: FetchCall[] = [];
  const fetchImpl = async (url: unknown, i: unknown) => {
    calls.push({ url: String(url), init: i as RequestInit });
    return new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      { status: init.status ?? 200, headers: init.headers },
    );
  };
  return { calls, fetchImpl: fetchImpl as typeof fetch };
}

function providerWith(fetchImpl: typeof fetch, extra: Record<string, unknown> = {}) {
  const metas: ConversationExchangeMeta[] = [];
  const provider = createDirectOpenAIConversationProvider({
    apiKey: KEY,
    model: MODEL,
    fetchImpl,
    maxOutputTokens: 1200,
    deadlineMs: 5000,
    onExchange: (m) => metas.push(m),
    ...extra,
  });
  return { provider, metas };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy(
    (e) => e instanceof ProviderRequestError && e.code === code && e.message === code,
  );
}

describe("P4 direct provider — exact request bytes", () => {
  it("sends the verified wire profile with the approved policy body intact", async () => {
    const { calls, fetchImpl } = fetchReturning(okApiResponse("A reply."));
    const { provider } = providerWith(fetchImpl);
    await provider.generate(makeRequest(), new AbortController().signal);

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe(OPENAI_RESPONSES_URL);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(MODEL);
    expect(body.store).toBe(false);
    expect(body.background).toBe(false);
    expect(body.stream).toBe(false);
    expect(body.service_tier).toBe("default");
    expect(body.truncation).toBe("disabled");
    expect(body.reasoning).toEqual({ effort: "none" });
    expect(body.max_output_tokens).toBe(1200);
    // No provider memory, tools, search, or cache prewarm fields.
    for (const forbidden of [
      "tools",
      "tool_choice",
      "conversation",
      "previous_response_id",
      "prompt_cache_key",
      "prompt_cache_retention",
      "include",
    ]) {
      expect(body).not.toHaveProperty(forbidden);
    }
    // Strict JSON schema under text.format.
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
      schema: {
        type: "object",
        required: ["text", "sourceIds"],
        additionalProperties: false,
      },
    });

    // Policy body is byte-identical and the transport note is separate.
    expect(body.instructions.startsWith(CONVERSATION_POLICY_BLOCK)).toBe(true);
    expect(body.instructions).toBe(
      `${CONVERSATION_POLICY_BLOCK}\n\n${CONVERSATION_TRANSPORT_FORMAT_NOTE}`,
    );
    expect(sha256HexSync(CONVERSATION_POLICY_BLOCK)).toBe(CONVERSATION_POLICY_BLOCK_SHA256);
    expect(CONVERSATION_POLICY_BLOCK).not.toContain("TRANSPORT FORMAT");
  });

  it("serializes exact authorized context and never mock fixture directives", async () => {
    const { calls, fetchImpl } = fetchReturning(okApiResponse("ok"));
    const { provider } = providerWith(fetchImpl);
    const request = makeRequest({
      history: [
        { eventId: "evt-1", role: "user", text: "Earlier freeform “quote” ✓.", unheardWithheld: false },
        { eventId: "evt-2", role: "assistant", text: "Earlier reply.", unheardWithheld: true },
      ],
      effective: [
        { itemId: "item-1", kind: "user-correction", text: "Was exhausted, not angry.", sourceEventId: "evt-1" },
      ],
      context: {
        ...makeRequest().context,
        restrictions: ["no-questions"],
        excerpts: [
          {
            previewId: "bfa-preview-x1",
            sourceKey: "private-note",
            exactText: "FICTIONAL_PRIVATE_EXCERPT_CANARY_37BYTES!!",
            textSha256: "a".repeat(64),
            previewedAtIso: "2026-10-26T00:00:00.000Z",
            sourceRevision: "rev-1",
            dataClass: "untrusted-user-data",
          },
        ],
      },
    });
    await provider.generate(request, new AbortController().signal);
    const body = JSON.parse(String(calls[0].init.body));
    const payload = JSON.parse(body.input[0].content);

    // Exact bytes: message, freeform history, excerpt canary, restriction.
    expect(payload.message).toBe("I was angry when I came home yesterday.");
    expect(payload.history[0].text).toBe("Earlier freeform “quote” ✓.");
    expect(payload.history[1].unheardWithheld).toBe(true);
    expect(payload.sharedExcerpts[0].exactText).toBe("FICTIONAL_PRIVATE_EXCERPT_CANARY_37BYTES!!");
    expect(payload.sharedExcerpts[0].dataClass).toBe("untrusted-user-data");
    expect(payload.restrictions).toEqual(["no-questions"]);
    expect(payload.spiritual).toMatchObject({
      devotionalContentPermitted: false,
      reason: "preference-off-no-grant",
    });
    expect(payload.effectiveContext[0]).toEqual({
      kind: "user-correction",
      text: "Was exhausted, not angry.",
    });

    // Mock-only fixture directives never reach the wire.
    const raw = String(calls[0].init.body);
    expect(raw).not.toContain("C07-report");
    expect(raw).not.toContain("guess-anger");
    expect(raw).not.toContain("Perhaps you were angry");
    expect(raw).not.toContain("recallRequest");
    expect(payload).not.toHaveProperty("fixture");
  });

  it("arbitrary freeform text is preserved verbatim", () => {
    const weird = "Line one\nLine “two” — 45% & <tag> {\"json\": true} emoji 🕊️";
    const payload = JSON.parse(serializeConversationGroundedPayload(makeRequest({
      context: { ...makeRequest().context, message: weird },
    })));
    expect(payload.message).toBe(weird);
    expect(buildConversationInstructions(makeRequest())).toContain(CONVERSATION_POLICY_BLOCK);
  });
});

describe("P4 direct provider — response validation", () => {
  it("accepts an ordinary valid answer citing no source", async () => {
    const { fetchImpl } = fetchReturning(okApiResponse("A warm, ordinary reply.", []));
    const { provider, metas } = providerWith(fetchImpl);
    const res = await provider.generate(makeRequest(), new AbortController().signal);
    expect(res).toEqual({ text: "A warm, ordinary reply.", sourceIds: [], interpretation: null });
    expect(metas[0]).toMatchObject({
      outcome: "complete",
      reportedModel: MODEL,
      serviceTier: "default",
      usageConsistent: true,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
  });

  it("rejects source IDs that were not admitted", async () => {
    const { fetchImpl } = fetchReturning(okApiResponse("reply", ["BFA-D01"]));
    const { provider } = providerWith(fetchImpl);
    await expectCode(provider.generate(makeRequest(), new AbortController().signal), "invalid-sources");
  });

  it("accepts an admitted source ID", async () => {
    const { fetchImpl } = fetchReturning(okApiResponse("reply", ["BFA-D01"]));
    const { provider } = providerWith(fetchImpl);
    const withSource = makeRequest({
      context: {
        ...makeRequest().context,
        sources: [
          {
            excerpt: {
              sourceKey: "BFA-D01",
              kind: "journey-day-teaching",
              title: "Day 1",
              exactText: "Teaching text.",
              textSha256: "b".repeat(64),
              origin: { file: "days.ts", day: 1 },
              sourceCommit: "c".repeat(40),
              reviewStatus: "approved-guided-content",
              spiritualClassification: "nonreligious-teaching",
              limitations: [],
              testOnly: false,
            },
            card: {
              sourceKey: "BFA-D01",
              kind: "journey-day-teaching",
              title: "Day 1",
              reference: null,
              translation: null,
              reviewStatus: "approved-guided-content",
              spiritualClassification: "nonreligious-teaching",
              limitations: [],
              testOnly: false,
            },
          },
        ],
      },
    });
    const res = await provider.generate(withSource, new AbortController().signal);
    expect(res.sourceIds).toEqual(["BFA-D01"]);
  });

  it("refusal, incomplete, malformed, oversize and unexpected output are distinct", async () => {
    const refusal = fetchReturning({
      ...okApiResponse("x"),
      output: [
        { type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "no" }] },
      ],
    });
    await expectCode(providerWith(refusal.fetchImpl).provider.generate(makeRequest(), new AbortController().signal), "refused");

    const incomplete = fetchReturning(okApiResponse("x", [], { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }));
    await expectCode(providerWith(incomplete.fetchImpl).provider.generate(makeRequest(), new AbortController().signal), "incomplete");

    const malformed = fetchReturning("{not json");
    await expectCode(providerWith(malformed.fetchImpl).provider.generate(makeRequest(), new AbortController().signal), "invalid-response");

    const badReplyJson = fetchReturning({
      ...okApiResponse("x"),
      output: [
        { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "plain text, not schema JSON" }] },
      ],
    });
    await expectCode(providerWith(badReplyJson.fetchImpl).provider.generate(makeRequest(), new AbortController().signal), "invalid-response");

    const oversize = fetchReturning("x".repeat(300 * 1024));
    await expectCode(providerWith(oversize.fetchImpl).provider.generate(makeRequest(), new AbortController().signal), "response-too-large");

    const toolOutput = fetchReturning({
      ...okApiResponse("x"),
      output: [{ type: "function_call", name: "search", arguments: "{}" }],
    });
    await expectCode(providerWith(toolOutput.fetchImpl).provider.generate(makeRequest(), new AbortController().signal), "unexpected-output");
  });

  it("model and tier must match the request exactly", async () => {
    const wrongModel = fetchReturning(okApiResponse("x", [], { model: "gpt-6-luna-alt" }));
    await expectCode(providerWith(wrongModel.fetchImpl).provider.generate(makeRequest(), new AbortController().signal), "model-mismatch");

    const wrongTier = fetchReturning(okApiResponse("x", [], { service_tier: "flex" }));
    await expectCode(providerWith(wrongTier.fetchImpl).provider.generate(makeRequest(), new AbortController().signal), "tier-mismatch");
  });

  it("inconsistent usage is reported, never trusted", async () => {
    const badUsage = fetchReturning(okApiResponse("x", [], {
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 999 },
    }));
    const { provider, metas } = providerWith(badUsage.fetchImpl);
    await provider.generate(makeRequest(), new AbortController().signal);
    expect(metas[0].usageConsistent).toBe(false);

    const negativeUsage = fetchReturning(okApiResponse("x", [], {
      usage: { input_tokens: -5, output_tokens: 50, total_tokens: 45 },
    }));
    const second = providerWith(negativeUsage.fetchImpl);
    await second.provider.generate(makeRequest(), new AbortController().signal);
    expect(second.metas[0].usage.inputTokens).toBeNull();
    expect(second.metas[0].usageConsistent).toBe(false);
  });

  it("HTTP failure, rate limit and redirect map to distinct codes with no body leakage", async () => {
    const sensitiveBody = `provider error details including ${KEY} and stack`;
    const server = fetchReturning(sensitiveBody, { status: 500 });
    const err = await providerWith(server.fetchImpl)
      .provider.generate(makeRequest(), new AbortController().signal)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ProviderRequestError);
    expect(err.code).toBe("provider-failure");
    expect(JSON.stringify(err)).not.toContain(KEY);
    expect(err.message).not.toContain("provider error details");

    const limited = fetchReturning("slow down", { status: 429 });
    await expectCode(providerWith(limited.fetchImpl).provider.generate(makeRequest(), new AbortController().signal), "rate-limited");

    const redirect = async () => new Response("x", { status: 302 });
    await expectCode(
      providerWith(redirect as typeof fetch).provider.generate(makeRequest(), new AbortController().signal),
      "redirect",
    );
  });

  it("pre-abort makes zero provider calls", async () => {
    const { calls, fetchImpl } = fetchReturning(okApiResponse("x"));
    const { provider } = providerWith(fetchImpl);
    const controller = new AbortController();
    controller.abort();
    await expectCode(provider.generate(makeRequest(), controller.signal), "pre-aborted");
    expect(calls).toHaveLength(0);
  });

  it("deadline covers a delayed body after headers; the reader is cancelled", async () => {
    let cancelled = false;
    const fetchImpl = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start() {
            // Never enqueues: a stalled body after successful headers.
          },
          cancel() {
            cancelled = true;
          },
        }),
        { status: 200 },
      )) as typeof fetch;
    const { provider, metas } = providerWith(fetchImpl, { deadlineMs: 60 });
    await expectCode(provider.generate(makeRequest(), new AbortController().signal), "timeout");
    expect(cancelled).toBe(true);
    expect(metas[0].outcome).toBe("timeout");
  });

  it("a single failed fetch is never retried", async () => {
    let attempts = 0;
    const fetchImpl = (async () => {
      attempts += 1;
      throw new Error("socket reset");
    }) as typeof fetch;
    const { provider } = providerWith(fetchImpl);
    await expectCode(provider.generate(makeRequest(), new AbortController().signal), "network");
    expect(attempts).toBe(1);
  });

  it("missing key and invalid options fail before any fetch", async () => {
    const { calls, fetchImpl } = fetchReturning(okApiResponse("x"));
    const noKey = createDirectOpenAIConversationProvider({
      apiKey: undefined,
      model: MODEL,
      fetchImpl,
      maxOutputTokens: 1200,
      deadlineMs: 5000,
    });
    await expectCode(noKey.generate(makeRequest(), new AbortController().signal), "missing-key");
    const badTokens = createDirectOpenAIConversationProvider({
      apiKey: KEY,
      model: MODEL,
      fetchImpl,
      maxOutputTokens: 99999,
      deadlineMs: 5000,
    });
    await expectCode(badTokens.generate(makeRequest(), new AbortController().signal), "invalid-request");
    expect(calls).toHaveLength(0);
  });
});
