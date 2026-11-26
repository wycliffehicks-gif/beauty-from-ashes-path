import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ConversationService } from "../service/service";
import { seal, unseal } from "../staging/seal.server";
import { reviewPrivateTypedMessage } from "../staging/private-typed-review.server";

const admin = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: admin }));
function query(row: () => unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: async () => ({ data: row(), error: null }),
  };
}
const secret = "isolated-typed-review-fixture";
const bearer = "fictional.signed.bearer";
beforeEach(() => {
  vi.stubEnv("BFA_PRIVATE_TYPED_SEND_ENABLED", "true");
  vi.stubEnv("BFA_P3B_STATE_SECRET", secret);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("Unexpected network request");
    }),
  );
  admin.from.mockReset();
  admin.rpc.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function arrange() {
  const owner = randomUUID(),
    thread = randomUUID(),
    requestId = randomUUID();
  const authSessionId = randomUUID(),
    now = Date.now();
  const claims = { sub: owner, session_id: authSessionId, exp: Math.floor(now / 1000) + 120 };
  const allow = {
    user_id: owner,
    admitted: true,
    expires_at: new Date(now + 60_000).toISOString(),
  };
  const threadRow = { id: thread, owner_id: owner, revision: 0, deleted_at: null as string | null };
  const accessRead = vi.fn(() => allow);
  const threadRead = vi.fn(() => threadRow);
  const getClaims = vi.fn(async () => ({ data: { claims }, error: null }));
  const getUser = vi.fn(async () => ({ data: { user: { id: owner } }, error: null }));
  admin.from.mockImplementation((table: string) => {
    if (table !== "bfa_p3b_staging_accounts") throw Error();
    return query(accessRead);
  });
  const client = {
    auth: { getClaims, getUser },
    from(table: string) {
      if (table !== "bfa_p3b_threads") throw Error();
      return query(threadRead);
    },
  } as unknown as SupabaseClient<Database>;
  const service = new ConversationService({ verifiedOwnerId: owner });
  service.ensureThread(thread, false);
  const envelope = {
    owner,
    thread,
    revision: 0,
    expires: now + 90_000,
    authority: service.exportAuthority(thread),
  };
  const token = await seal(envelope);
  const input = {
    thread,
    revision: 0,
    requestId,
    message: "FICTIONAL_PRIVATE_DRAFT_SENTINEL",
    token,
    preferenceOn: false,
  };
  const run = (changes: object = {}) =>
    reviewPrivateTypedMessage({ ...input, ...changes }, client, claims, bearer);
  return {
    owner,
    thread,
    claims,
    allow,
    threadRow,
    accessRead,
    threadRead,
    getClaims,
    getUser,
    envelope,
    input,
    run,
  };
}
it("derives a content-free review from the original sealed conversation and leaves it reusable", async () => {
  const h = await arrange();
  const [a, b] = await Promise.all([h.run(), h.run()]);
  expect(a).toEqual(b);
  expect(a).toMatchObject({
    threadId: h.thread,
    revision: 0,
    requestId: h.input.requestId,
    serviceRequestId: expect.stringMatching(/^req-/),
    wireSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
  });
  expect(Object.keys(a).sort()).toEqual(
    [
      "deadlineMs",
      "maxInputBytes",
      "maxOutputTokens",
      "model",
      "requestId",
      "revision",
      "serviceRequestId",
      "threadId",
      "wireBytes",
      "wireSha256",
    ].sort(),
  );
  expect((await h.run({ message: "A different fictional draft." })).wireSha256).not.toBe(
    a.wireSha256,
  );
  const output = JSON.stringify(a);
  for (const value of [h.input.message, h.input.token, h.owner, h.claims.session_id, bearer])
    expect(output).not.toContain(value);
  expect(await unseal(h.input.token, h.owner, h.thread, 0)).toEqual(h.envelope);
  expect(admin.rpc).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["false", "1", "TRUE", ""])("requires the exact server opt-in (%j)", async (value) => {
  const h = await arrange();
  vi.stubEnv("BFA_PRIVATE_TYPED_SEND_ENABLED", value);
  await expect(h.run()).rejects.toThrow();
  expect(h.getUser).not.toHaveBeenCalled();
  expect(admin.from).not.toHaveBeenCalled();
});
it.each([
  "allowlist revoked",
  "thread deleted",
  "revision advanced",
  "owner mismatch",
  "session replaced",
  "earlier expiry",
  "age 30s",
])("withholds review after %s", async (fault) => {
  const h = await arrange();
  let at = Date.now();
  const start = at;
  vi.spyOn(Date, "now").mockImplementation(() => at);
  if (fault === "session replaced")
    h.getClaims
      .mockImplementationOnce(async () => ({ data: { claims: h.claims }, error: null }))
      .mockImplementationOnce(async () => ({ data: { claims: h.claims }, error: null }))
      .mockImplementationOnce(async () => ({
        data: { claims: { ...h.claims, session_id: randomUUID() } },
        error: null,
      }));
  if (fault === "earlier expiry")
    h.accessRead.mockImplementationOnce(() => ({
      ...h.allow,
      expires_at: new Date(start + 50).toISOString(),
    }));
  if (fault !== "session replaced")
    h.threadRead
      .mockImplementationOnce(() => h.threadRow)
      .mockImplementationOnce(() => {
        if (fault === "allowlist revoked") h.allow.admitted = false;
        if (fault === "thread deleted") h.threadRow.deleted_at = new Date(start).toISOString();
        if (fault === "revision advanced") h.threadRow.revision++;
        if (fault === "owner mismatch") h.threadRow.owner_id = randomUUID();
        if (fault === "earlier expiry") at = start + 50;
        if (fault === "age 30s") at = start + 30_000;
        return h.threadRow;
      });
  await expect(h.run()).rejects.toThrow();
  expect(admin.rpc).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("refuses stale envelope, foreign token, changed spiritual preference and client-supplied approval", async () => {
  const h = await arrange();
  await expect(h.run()).resolves.toHaveProperty("requestId", h.input.requestId);
  for (const input of [
    { token: await seal({ ...h.envelope, expires: Date.now() - 1 }) },
    { token: await seal({ ...h.envelope, owner: randomUUID() }) },
    { preferenceOn: true },
    { approval: true },
    { message: " " },
  ])
    await expect(h.run(input)).rejects.toThrow();
  expect(admin.rpc).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
