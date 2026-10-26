// P4 — shared conversation service wired to the DIRECT provider (offline;
// simulated fetch). Proves the service stays the authority: it builds the
// request, the adapter only carries it, and service fencing still drops late
// results after Stop/Delete.
import { describe, expect, it } from "vitest";
import { ConversationService, type TurnOutcome } from "../service/service";
import { createDirectOpenAIConversationProvider } from "../service/openai-provider.server";
import { CONVERSATION_POLICY_BLOCK_SHA256 } from "../policy";

const KEY = "test-key-not-a-real-credential";

function apiResponse(replyText: string, sourceIds: string[] = []) {
  return {
    id: "resp_svc1",
    model: "gpt-6-luna",
    service_tier: "default",
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify({ text: replyText, sourceIds }) }],
      },
    ],
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  };
}

function fetchWith(body: unknown, delayMs = 0) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

async function makeService(fetchImpl: typeof fetch) {
  const service = new ConversationService({
    provider: createDirectOpenAIConversationProvider({
      apiKey: KEY,
      model: "gpt-6-luna",
      fetchImpl,
      maxOutputTokens: 1200,
      deadlineMs: 5000,
    }),
  });
  await service.ready();
  service.ensureThread("s1", false);
  return service;
}

async function send(service: ConversationService, text: string, id: string) {
  const turnId = service.admitUserMessage("s1", id, text);
  let outcome: TurnOutcome | null = null;
  const result = await service.runTurn("s1", turnId, {
    accept: () => true,
    apply: (o) => {
      outcome = o;
    },
  });
  return { result, outcome: outcome as TurnOutcome | null };
}

describe("P4 service + direct provider (simulated fetch)", () => {
  it("commits a valid reply; the service-built request keeps the approved policy hash", async () => {
    const { calls, fetchImpl } = fetchWith(apiResponse("Noted: you were angry when you came home."));
    const service = await makeService(fetchImpl);
    const { result, outcome } = await send(service, "I was angry when I came home yesterday.", "m-1");
    expect(result).toBe("committed");
    expect(outcome).toMatchObject({ ok: true, text: "Noted: you were angry when you came home." });

    const inspect = service.inspect("s1")!;
    expect(inspect.lastRequest?.policySha256).toBe(CONVERSATION_POLICY_BLOCK_SHA256);
    expect(inspect.events.filter((e) => e.role === "assistant")).toHaveLength(1);

    // The wire payload carried the exact user text and no fixture directives.
    const body = JSON.parse(String(calls[0].init.body));
    const payload = JSON.parse(body.input[0].content);
    expect(payload.message).toBe("I was angry when I came home yesterday.");
    expect(String(calls[0].init.body)).not.toContain("C07-report");
  });

  it("a late reply after Delete never commits or resurrects", async () => {
    const { fetchImpl } = fetchWith(apiResponse("late reply"), 120);
    const service = await makeService(fetchImpl);
    const turnId = service.admitUserMessage("s1", "m-1", "I was angry when I came home yesterday.");
    let outcome: TurnOutcome | null = null;
    const run = service.runTurn("s1", turnId, {
      accept: () => true,
      apply: (o) => {
        outcome = o;
      },
    });
    // Delete while the provider call is in flight.
    service.deleteThread("s1");
    const result = await run;
    expect(result).toBe("stale");
    expect(outcome).toBeNull();
    expect(service.inspect("s1")).toBeNull();
  });

  it("a reply naming an unadmitted source is refused and not committed", async () => {
    const { fetchImpl } = fetchWith(apiResponse("reply", ["BFA-D01"]));
    const service = await makeService(fetchImpl);
    const { result, outcome } = await send(service, "I was angry when I came home yesterday.", "m-1");
    expect(result).toBe("committed"); // the refusal is the committed outcome
    expect(outcome).toMatchObject({ ok: false });
    expect(service.inspect("s1")!.events.filter((e) => e.role === "assistant")).toHaveLength(0);
  });

  it("cross-thread canaries never enter another thread's request", async () => {
    const { calls, fetchImpl } = fetchWith(apiResponse("ok"));
    const service = await makeService(fetchImpl);
    service.ensureThread("s2", false);
    const other = service.admitUserMessage("s2", "x-1", "CROSS_THREAD_CANARY_NEVER_SEND");
    await service.runTurn("s2", other, { accept: () => true, apply: () => {} });

    calls.length = 0;
    await send(service, "I was angry when I came home yesterday.", "m-1");
    expect(calls).toHaveLength(1);
    expect(String(calls[0].init.body)).not.toContain("CROSS_THREAD_CANARY_NEVER_SEND");
  });
});
