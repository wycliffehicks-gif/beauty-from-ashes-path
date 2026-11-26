// Private spend port only. No real Auth, provider, configured grant, or database.
import { describe, expect, it, vi } from "vitest";
import {
  preparePrivateTypedSpend,
  type PrivateTypedSpendMaterial,
} from "../service/private-typed-spend.server";
import type { ConversationExchangeMeta } from "../service/openai-provider.server";
import { sha256HexSync as hash } from "../service/sha256-sync";
import {
  GPT6_LUNA_STANDARD_PRICE_BASIS,
  worstCaseDispatchCostMicros,
} from "../../../../../scripts/conversation-eval/pricing";

const at = Date.parse("2026-11-26T12:00:00Z");
const ok = { data: true, error: null, status: 200 };
const wire = JSON.stringify({
  model: "gpt-6-luna",
  service_tier: "default",
  max_output_tokens: 1200,
  reasoning: { effort: "none" },
  store: false,
  background: false,
  stream: false,
  truncation: "disabled",
  input: [
    {
      role: "user",
      content: JSON.stringify({
        threadId: "bfa-thread-44444444-4444-4444-8444-444444444444",
        message: "Fictional practice — é",
      }),
    },
  ],
});
const bytes = new TextEncoder().encode(wire).length;
const basis = {
  snapshotVersion: "bfa-price-snapshot-v1",
  ...GPT6_LUNA_STANDARD_PRICE_BASIS,
  retrievedOn: "2026-11-25",
};
const manifest = {
  version: "bfa-private-typed-send-v1",
  serviceRequestId: "req-7",
  model: "gpt-6-luna",
  tier: "default",
  priceSnapshotSha256: hash(JSON.stringify(basis)),
  wireBytes: bytes,
  maxInputBytes: 64_000,
  maxOutputTokens: 1200,
  deadlineMs: 5_000,
  expiresAt: at + 60_000,
};
const approval = {
  approvalId: "11111111-1111-4111-8111-111111111111",
  ownerId: "22222222-2222-4222-8222-222222222222",
  authSessionId: "33333333-3333-4333-8333-333333333333",
  threadId: "44444444-4444-4444-8444-444444444444",
  revision: 0,
  requestId: "55555555-5555-4555-8555-555555555555",
  manifestSha256: hash(JSON.stringify(manifest)),
  payloadSha256: hash(wire),
  maxMicros: 9_112,
};
const material: PrivateTypedSpendMaterial = {
  approval,
  manifestBytes: JSON.stringify(manifest),
  priceSnapshotBytes: JSON.stringify(basis),
};
const auth = {
  ownerId: approval.ownerId,
  authSessionId: approval.authSessionId,
  verifiedAt: at - 200,
  expiresAt: at + 10000,
};
const call = { serviceRequestId: "req-7", maxInputBytes: 64_000, deadlineMs: 5_000 };
const meta: ConversationExchangeMeta = {
  requestId: "req-7",
  requestPayloadSha256: hash(wire),
  requestedModel: "gpt-6-luna",
  reportedModel: "gpt-6-luna",
  didDispatch: true,
  serviceTier: "default",
  responseId: "resp_AB:x/7",
  providerRequestId: null,
  usageConsistent: true,
  usage: {
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    cachedInputTokens: null,
    cacheWriteTokens: 10,
    reasoningTokens: 0,
  },
  outcome: "complete",
  latencyMs: 42,
};
function fixture(now = () => at, m = material) {
  const rpc = vi.fn(
    async (_name: string, _args: Readonly<Record<string, unknown>>): Promise<unknown> => ok,
  );
  return { rpc, spend: preparePrivateTypedSpend({ rpc }, m, now) };
}
function requireSpend(f = fixture()) {
  expect(f.spend).not.toBeNull();
  return { ...f, spend: f.spend! };
}

describe("private typed spend port", () => {
  it("sends one exact content-free bound claim and conservative charge; parses the service-generated ID independently", async () => {
    const { spend, rpc } = requireSpend();
    expect(await spend.claim(auth, call, wire)).toBe("claimed");
    expect(await spend.claim(auth, call, wire)).toBe("unconfirmed");
    expect(await spend.settle(meta)).toBe("settled");
    expect(rpc.mock.calls.map((x) => x[0])).toEqual([
      "bfa_private_text_spend_claim",
      "bfa_private_text_spend_settle",
    ]);
    const base = {
      p_approval: approval.approvalId,
      p_owner: approval.ownerId,
      p_session: approval.authSessionId,
      p_thread: approval.threadId,
      p_revision: 0,
      p_request: approval.requestId,
      p_manifest: approval.manifestSha256,
      p_payload: hash(wire),
      p_provider: "openai",
      p_model: "gpt-6-luna",
      p_tier: "default",
      p_max_micros: 9_112,
      p_approval_expires_at: new Date(manifest.expiresAt).toISOString(),
    };
    expect(rpc.mock.calls[0][1]).toEqual({
      ...base,
      p_auth_verified_at: new Date(auth.verifiedAt).toISOString(),
      p_auth_expires_at: new Date(auth.expiresAt).toISOString(),
    });
    expect(rpc.mock.calls[1][1]).toEqual({
      ...base,
      p_response_id: "resp_AB:x/7",
      p_evidence_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_charged_micros: 5,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("Fictional practice");
  });

  it("covers the two separate input roundings when the approved wire can fill the entire byte limit", () => {
    const exactBytes = 64_000;
    const manifestBytes = JSON.stringify({ ...manifest, wireBytes: exactBytes });
    const pinned = {
      ...material,
      manifestBytes,
      approval: { ...approval, manifestSha256: hash(manifestBytes) },
    };
    const unsplit = worstCaseDispatchCostMicros(exactBytes, manifest.maxOutputTokens, basis);
    expect(unsplit).toBe(9_112);
    // At 68,096 actual input tokens: ceil(68,095 × .125) + ceil(1 × .01)
    // plus 1,200 output tokens × .5 = 9,113 integer micros.
    expect(fixture(() => at, pinned).spend).toBeNull();
    expect(
      fixture(() => at, { ...pinned, approval: { ...pinned.approval, maxMicros: unsplit + 1 } })
        .spend,
    ).not.toBeNull();
  });

  it("rejects a funded wire from a different thread even if its SHA and byte count match the approval", async () => {
    const foreignWire = wire.replace(approval.threadId, approval.authSessionId);
    const { spend, rpc } = requireSpend(
      fixture(() => at, {
        ...material,
        approval: { ...approval, payloadSha256: hash(foreignWire) },
      }),
    );
    expect(await spend.claim(auth, call, foreignWire)).toBe("unconfirmed");
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["manifest byte change", { ...material, manifestBytes: material.manifestBytes + " " }],
    [
      "historical rates replaced",
      { ...material, priceSnapshotBytes: material.priceSnapshotBytes.replace("125000", "120000") },
    ],
    ["insufficient budget", { ...material, approval: { ...approval, maxMicros: 9_111 } }],
  ] as const)("refuses preparation on %s", (_name, m) => {
    const { rpc, spend } = fixture(() => at, m);
    expect(spend).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["wire bytes changed", auth, call, wire + " "],
    ["different service request", auth, { ...call, serviceRequestId: approval.requestId }, wire],
    ["different input allowance", auth, { ...call, maxInputBytes: 63999 }, wire],
    ["different operation deadline", auth, { ...call, deadlineMs: 5001 }, wire],
    ["different session", { ...auth, authSessionId: approval.ownerId }, call, wire],
    ["aged session", { ...auth, verifiedAt: at - 30_000 }, call, wire],
    ["expired session", { ...auth, expiresAt: at }, call, wire],
  ] as const)("denies %s before RPC", async (_label, a, c, w) => {
    const { spend, rpc } = requireSpend();
    expect(await spend.claim(a, c, w)).toBe("unconfirmed");
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([at - 1, at + 10_000, Number.NaN])(
    "a late, backward, or invalid return clock cannot confirm a claimed send",
    async (after) => {
      let next = at;
      const { spend, rpc } = requireSpend(fixture(() => next));
      rpc.mockImplementation(async () => {
        next = after;
        return ok;
      });
      expect(await spend.claim(auth, call, wire)).toBe("unconfirmed");
      expect(await spend.claim(auth, call, wire)).toBe("unconfirmed");
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );

  it("checks the original price age for claiming, not for reconciling an older receipt", async () => {
    const later = at + 30 * 86_400_000;
    const past = JSON.stringify({ ...manifest, expiresAt: later + 60_000 });
    const { rpc, spend } = requireSpend(
      fixture(() => later, {
        ...material,
        manifestBytes: past,
        approval: { ...approval, manifestSha256: hash(past) },
      }),
    );
    expect(
      await spend.claim({ ...auth, verifiedAt: later - 10, expiresAt: later + 10_000 }, call, wire),
    ).toBe("unconfirmed");
    expect(rpc).not.toHaveBeenCalled();
    expect(await spend.settle(meta)).toBe("settled");
    expect(rpc.mock.calls[0][0]).toBe("bfa_private_text_spend_settle");
  });

  it.each([
    { responseId: null },
    { responseId: "bad id" },
    { providerRequestId: "request\n" },
    { serviceTier: "priority" },
    { didDispatch: false },
    { outcome: "incomplete" },
    { requestedModel: "other" },
    { reportedModel: null },
    { requestId: approval.requestId },
    { requestPayloadSha256: "0".repeat(64) },
    { usageConsistent: false },
    { usage: { ...meta.usage, totalTokens: 99 } },
    { usage: { ...meta.usage, outputTokens: 1201, totalTokens: 1211 } },
    { usage: { ...meta.usage, inputTokens: 10000, totalTokens: 10005 } },
    {
      usage: {
        ...meta.usage,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cacheWriteTokens: null,
      },
    },
    { usage: { ...meta.usage, cachedInputTokens: 3 } },
    { usage: { ...meta.usage, totalTokens: null } },
  ] as Partial<ConversationExchangeMeta>[])(
    "preserves the hold for uncertain or unbound evidence %#",
    async (change) => {
      const { rpc, spend } = requireSpend();
      expect(await spend.settle({ ...meta, ...change })).toBe("unconfirmed");
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("pins exact billing evidence across replays even when rounded estimates coincide", async () => {
    const { rpc, spend } = requireSpend();
    let first: unknown;
    rpc.mockImplementation(async (_name, args) => {
      first ??= args.p_evidence_sha256;
      return { ...ok, data: args.p_evidence_sha256 === first };
    });
    expect(await spend.settle(meta)).toBe("settled");
    expect(await spend.settle(structuredClone(meta))).toBe("settled");
    expect(await spend.settle({ ...meta, usage: { ...meta.usage, cacheWriteTokens: null } })).toBe(
      "unconfirmed",
    );
    expect(rpc.mock.calls.map((c) => c[1].p_charged_micros)).toEqual([5, 5, 5]);
  });

  it.each([
    null,
    { data: true },
    false,
    { data: "true", error: null },
    { data: true, error: "secret diagnostic" },
    { ...ok, status: 500 },
  ])("lost or malformed acknowledgments are unconfirmed %#", async (reply) => {
    const { rpc, spend } = requireSpend();
    rpc.mockResolvedValue(reply);
    expect(await spend.claim(auth, call, wire)).toBe("unconfirmed");
    expect(await spend.settle(meta)).toBe("unconfirmed");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("masks transport exceptions and never retries", async () => {
    const { rpc, spend } = requireSpend();
    rpc.mockRejectedValue(new Error("private exception"));
    expect(await spend.claim(auth, call, wire)).toBe("unconfirmed");
    expect(await spend.settle(meta)).toBe("unconfirmed");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
