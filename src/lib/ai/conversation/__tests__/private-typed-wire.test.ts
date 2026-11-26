// The reference bytes were measured on the parent implementation with an
// injected transport. The user message contains a newline and multibyte text.
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import {
  createDirectOpenAIConversationProvider,
  describePrivateTypedWire,
} from "../service/openai-provider.server";
import type { ConversationProviderRequest } from "../service/provider";

const limits = {
  model: "gpt-6-luna",
  maxOutputTokens: 64,
  maxInputBytes: 64_000,
  deadlineMs: 4_000,
};
const thread = "e02a7548-9170-49ba-8345-945f51e2b96d";
const message = "I wrote “maybe”.\nCan we leave it there?";

async function assembleRequest() {
  let captured: ConversationProviderRequest | undefined;
  const service = new ConversationService({
    verifiedOwnerId: "76ea33fe-bb81-4078-a992-1da8e7666981",
    provider: {
      async generate(request) {
        captured = request;
        return { text: "We can leave it there.", sourceIds: [], interpretation: null };
      },
    },
  });
  service.ensureThread(thread, false);
  await service.ready();
  const turn = service.admitUserMessage(thread, "7a5cb285-c62b-4e54-b177-5476acdd9b13", message);
  await service.runTurn(thread, turn, { accept: () => true, apply: () => {} });
  if (!captured) throw new Error("Expected a service-built request");
  return captured;
}

describe("content-free typed wire preflight", () => {
  it("matches the original bytes and digest without requiring credentials", async () => {
    const request = await assembleRequest();
    const descriptor = describePrivateTypedWire(request, limits);
    const simulatedTransport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(null, { status: 503 });
    });
    const provider = createDirectOpenAIConversationProvider({
      ...limits,
      apiKey: "dummy-for-offline-test",
      fetchImpl: simulatedTransport,
    });
    await expect(provider.generate(request, new AbortController().signal)).rejects.toThrow();
    expect(simulatedTransport).toHaveBeenCalledTimes(1);
    const bytes = Buffer.from(String(simulatedTransport.mock.calls[0]?.[1]?.body), "utf8");
    expect(descriptor?.wireBytes).toBe(bytes.length);
    expect(descriptor?.wireSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(descriptor).toEqual({
      ...limits,
      serviceRequestId: request.requestId,
      wireBytes: 5859,
      wireSha256: "e1457650f555d73528955d80ef74ab38bdaf9bf4b2e807f1f78d1470de6762ed",
    });
  });

  it("changes with the message, and refuses out-of-bounds profiles before dispatch", async () => {
    const request = await assembleRequest();
    const descriptor = describePrivateTypedWire(request, limits)!;
    const revised = {
      ...request,
      context: { ...request.context, message: "Something different." },
    };
    expect(describePrivateTypedWire(revised, limits)?.wireSha256).not.toBe(descriptor.wireSha256);
    expect(
      describePrivateTypedWire(request, { ...limits, maxInputBytes: descriptor.wireBytes - 1 }),
    ).toBeNull();
    expect(describePrivateTypedWire(request, { ...limits, maxInputChars: 5 })).toBeNull();
    expect(describePrivateTypedWire(request, { ...limits, deadlineMs: 0 })).toBeNull();
    expect(describePrivateTypedWire(request, { ...limits, maxOutputTokens: NaN })).toBeNull();
  });
});
