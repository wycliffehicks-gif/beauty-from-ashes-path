// Real P1 service, wire serializer, response parser, pricing and SQL. Only the
// identity, operator approval and provider HTTP response are fictional.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ConversationService } from "../service/service";
import {
  createDirectOpenAIConversationProvider,
  describePrivateTypedWire,
  type ConversationExchangeMeta,
} from "../service/openai-provider.server";
import { preparePrivateTypedSpend } from "../service/private-typed-spend.server";
import type { ConversationProvider, ConversationProviderResponse } from "../service/provider";
import { createPrivateTypedSpendFixture, privateSpendDigest } from "./private-typed-spend-fixture";
import priceExample from "../../../../../scripts/conversation-eval/price-snapshot.json";

const engine = process.env.BFA_PGLITE_MODULE;
let database: Awaited<ReturnType<typeof createPrivateTypedSpendFixture>>;
beforeAll(async () => {
  if (engine) database = await createPrivateTypedSpendFixture(engine);
}, 60_000);
afterAll(async () => {
  if (database) await database.close();
});

it.skipIf(!engine)(
  "matches a reviewed service turn to a single database-funded provider exchange",
  async () => {
    const thread = randomUUID();
    const owner = randomUUID();
    const outerRequest = randomUUID();
    const origin = new ConversationService({ verifiedOwnerId: owner });
    origin.ensureThread("another-thread", false);
    origin.admitUserMessage("another-thread", "unshared", "PRIVATE_OTHER_THREAD_SENTINEL");
    origin.ensureThread(thread, false);
    const authority = origin.exportAuthority(thread);
    const message = "Today I need a quiet moment.";
    const answer: ConversationProviderResponse = {
      text: "We can pause here.",
      sourceIds: [],
      interpretation: null,
    };
    const limits = {
      model: "gpt-6-luna",
      maxOutputTokens: 64,
      maxInputBytes: 64_000,
      deadlineMs: 4_000,
    };

    // Both passes start at the same state. Preflight cannot record a turn in
    // the authority subsequently used for the deliberately approved operation.
    async function runFromOrigin(provider: ConversationProvider) {
      const service = new ConversationService({ verifiedOwnerId: owner, provider });
      service.restoreAuthority(authority, thread);
      await service.ready();
      const turn = service.admitUserMessage(thread, outerRequest, message);
      await service.runTurn(thread, turn, { accept: () => true, apply: () => {} });
      return service.inspect(thread)?.events.filter((event) => event.role === "assistant");
    }

    type Descriptor = NonNullable<ReturnType<typeof describePrivateTypedWire>>;
    const descriptions: Descriptor[] = [];
    await runFromOrigin({
      async generate(request) {
        const details = describePrivateTypedWire(request, limits);
        if (!details) throw new Error("Invalid preflight");
        descriptions.push(details);
        return answer;
      },
    });
    expect(descriptions).toHaveLength(1);
    const [reviewed] = descriptions;
    expect(reviewed!.serviceRequestId).not.toBe(outerRequest);
    const expiresAt = Date.now() + 120_000;
    const priceSnapshotBytes = JSON.stringify({
      ...priceExample,
      retrievedOn: new Date().toISOString().slice(0, 10),
    });
    const manifestBytes = JSON.stringify({
      version: "bfa-private-typed-send-v1",
      serviceRequestId: reviewed!.serviceRequestId,
      model: limits.model,
      tier: "default",
      priceSnapshotSha256: privateSpendDigest(priceSnapshotBytes),
      wireBytes: reviewed!.wireBytes,
      maxInputBytes: limits.maxInputBytes,
      maxOutputTokens: limits.maxOutputTokens,
      deadlineMs: limits.deadlineMs,
      expiresAt,
    });

    const row = await database.seedApproval({
      ownerId: owner,
      threadId: thread,
      requestId: outerRequest,
      approvalExpiresAt: new Date(expiresAt).toISOString(),
      payloadSha256: reviewed!.wireSha256,
      manifestSha256: privateSpendDigest(manifestBytes),
      maxMicros: 9500,
    });
    const material = {
      approval: {
        approvalId: row.approvalId,
        ownerId: owner,
        authSessionId: row.authSessionId,
        threadId: thread,
        revision: row.threadRevision,
        requestId: outerRequest,
        manifestSha256: row.manifestSha256,
        payloadSha256: row.payloadSha256,
        maxMicros: row.maxMicros,
      },
      manifestBytes,
      priceSnapshotBytes,
    };
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => ({
        data: await database.rpc(name, args),
        error: null,
      }),
    };
    const spend = preparePrivateTypedSpend(client, material, Date.now)!;
    const auth = {
      ownerId: owner,
      authSessionId: row.authSessionId,
      verifiedAt: Date.now(),
      expiresAt,
    };
    let dispatches = 0;
    let wire: string | undefined;
    const receipts: ConversationExchangeMeta[] = [];
    const events = await runFromOrigin({
      async generate(request, signal) {
        const profile = describePrivateTypedWire(request, limits)!;
        const provider = createDirectOpenAIConversationProvider({
          ...limits,
          apiKey: "offline-placeholder",
          onExchange: (exchange) => receipts.push(exchange),
          fetchImpl: async (_url, init) => {
            wire = String(init?.body);
            if ((await spend.claim(auth, profile, wire)) !== "claimed")
              throw new Error("Unconfirmed");
            dispatches++;
            return Response.json({
              id: "resp_fictional/typed.1",
              model: limits.model,
              service_tier: "default",
              status: "completed",
              output: [
                {
                  type: "message",
                  role: "assistant",
                  status: "completed",
                  content: [
                    {
                      type: "output_text",
                      text: JSON.stringify({ text: answer.text, sourceIds: [] }),
                    },
                  ],
                },
              ],
              usage: { input_tokens: 100, output_tokens: 22, total_tokens: 122 },
            });
          },
        });
        const reply = await provider.generate(request, signal);
        if ((await spend.settle(receipts[0]!)) !== "settled") throw new Error("Unconfirmed");
        return reply;
      },
    });
    expect(dispatches).toBe(1);
    expect(wire).toContain(message);
    expect(wire).not.toContain("PRIVATE_OTHER_THREAD_SENTINEL");
    expect(receipts).toHaveLength(1);
    expect(events?.map((event) => event.text)).toEqual([answer.text]);
    const state = await database.one(
      "SELECT state, charged_micros FROM bfa_private_text_spend.approvals WHERE approval_id = $1",
      [row.approvalId],
    );
    expect(state).toEqual({ state: "settled", charged_micros: 24 });
    const recovered = preparePrivateTypedSpend(client, material, Date.now)!;
    expect(await recovered.settle(receipts[0]!)).toBe("settled");
    expect(await recovered.claim(auth, reviewed!, wire!)).toBe("unconfirmed");
  },
);
