// App boundary through real SDK queries, P1, AES-GCM, provider parser and SQL.
// All identities, amounts and provider HTTP responses are fictional. The only
// fetch implementation in this file is an in-process responder with no egress.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { stagingOperation } from "../staging/adapter.server";
import { createPrivateTypedRequestAuth } from "../staging/private-typed-auth.server";
import { reviewPrivateTypedMessage } from "../staging/private-typed-review.server";
import { unseal } from "../staging/seal.server";
import { privateSpendDigest } from "./private-typed-spend-fixture";
import { createPrivateTypedDispatchFixture } from "./private-typed-dispatch-fixture";
import prices from "../../../../../scripts/conversation-eval/price-snapshot.json";

const engine = process.env.BFA_PGLITE_MODULE;
const dbUrl = "http://127.0.0.1:12472";
const publicKey = "sb_publishable_fictional_joined_test";
const serviceKey = "sb_secret_fictional_joined_test";
const message = "I miss sitting by the window on Sundays.";
const reply = "What do you miss about that Sunday moment?";
const priceSnapshotBytes = JSON.stringify({
  ...prices,
  retrievedOn: new Date().toISOString().slice(0, 10),
});

let database: Awaited<ReturnType<typeof createPrivateTypedDispatchFixture>>;
beforeAll(async () => {
  if (!engine) return;
  database = await createPrivateTypedDispatchFixture(engine);
  // The production policies run as written. This disposable database
  // substitutes its test JWT subject for hosted auth.uid() and supplies
  // the service role's ordinary RLS bypass.
  await database.db.exec(`
    ALTER ROLE service_role BYPASSRLS;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
  `);
}, 60_000);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  if (database) await database.close();
});

type RequestEffect =
  | "complete"
  | "revoke"
  | "session-closed"
  | "thread-stopped"
  | "logout-after-finish"
  | "close-after-hold"
  | "change-key-source-after-hold"
  | "change-key-source-after-mark"
  | "lost-response"
  | "invalid-answer";

async function prepareExchange(effect: RequestEffect = "complete") {
  const owner = randomUUID();
  const session = randomUUID();
  const claims = {
    sub: owner,
    session_id: session,
    role: "authenticated",
    aud: "authenticated",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 600,
  };
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const bearer = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded(claims)}.ZmFrZQ`;
  let revoked = false;
  let authRequests = 0;
  const sent: string[] = [];
  const rpcNames: string[] = [];
  const unexpected: string[] = [];
  // Each emulated REST request gets its own role transaction on this single connection.
  let readQueue = Promise.resolve();
  const publicReadColumns = {
    bfa_p3b_staging_accounts: ["user_id", "admitted", "expires_at"],
    bfa_p3b_threads: ["id", "owner_id", "revision", "deleted_at"],
  };

  vi.stubEnv("SUPABASE_URL", dbUrl);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", serviceKey);
  vi.stubEnv("BFA_P3B_STATE_SECRET", "fictional joined test seal only");
  vi.stubEnv("BFA_PRIVATE_TYPED_SEND_ENABLED", "true");
  vi.stubEnv(
    "BFA_PRIVATE_TYPED_SEND_MATERIALS_JSON",
    JSON.stringify({ version: 1, materials: [] }),
  );
  vi.stubEnv("BFA_PRIVATE_TYPED_KEY_SOURCE", undefined);
  vi.stubEnv("BFA_PRIVATE_TYPED_OPENAI_API_KEY", "offline_test_only");
  vi.stubEnv("OPENAI_API_KEY", "offline_project_only");
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    const isService = request.headers.get("apikey") === serviceKey;
    const isTester = request.headers.get("authorization") === `Bearer ${bearer}`;
    if (url.href === "https://api.openai.com/v1/responses" && request.method === "POST") {
      const expectedKey =
        process.env.BFA_PRIVATE_TYPED_KEY_SOURCE === "project-openai"
          ? "offline_project_only"
          : "offline_test_only";
      if (request.headers.get("authorization") !== `Bearer ${expectedKey}`)
        unexpected.push("Wrong private test credential");
      sent.push(await request.text());
      if (effect === "lost-response") throw new TypeError("Fictional receipt unavailable");
      if (effect === "revoke") revoked = true;
      if (effect === "thread-stopped")
        await database.asRole("service_role", () =>
          database.one("SELECT public.bfa_p3b_fence($1::uuid,$2::uuid,'cancel') AS revision", [
            owner,
            activeThreadId,
          ]),
        );
      if (effect === "session-closed")
        await database.db.query("DELETE FROM auth.sessions WHERE id = $1 AND user_id = $2", [
          session,
          owner,
        ]);
      return Response.json({
        id: `response_${randomUUID()}`,
        status: "completed",
        model: "gpt-6-luna",
        service_tier: "default",
        output: [
          {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [
              {
                type: "output_text",
                text:
                  effect === "invalid-answer"
                    ? "invalid"
                    : JSON.stringify({ text: reply, sourceIds: [] }),
              },
            ],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 22, total_tokens: 122 },
      });
    }
    if (url.origin !== dbUrl) {
      unexpected.push("Non-fixture destination");
      return Response.json({}, { status: 400 });
    }
    if (path === "/auth/v1/user" && request.method === "GET") {
      authRequests++;
      return isTester && !revoked
        ? Response.json({
            id: owner,
            aud: "authenticated",
            role: "authenticated",
            app_metadata: {},
            user_metadata: {},
          })
        : Response.json({ code: "session_not_found", msg: "Session not found" }, { status: 401 });
    }
    if (path.startsWith("/rest/v1/rpc/") && request.method === "POST" && isService) {
      const name = path.slice("/rest/v1/rpc/".length);
      const args = await request.json();
      rpcNames.push(name);
      const value =
        name === "bfa_p3b_create"
          ? await database.asRole(
              "service_role",
              async () =>
                (await database.one("SELECT public.bfa_p3b_create($1::uuid) AS id", [args.p_owner]))
                  .id,
            )
          : await database.rpc(name, args);
      if (
        name === "bfa_private_text_spend_claim_dispatch" &&
        effect === "close-after-hold" &&
        value === true
      )
        await database.db.query("DELETE FROM auth.sessions WHERE id = $1 AND user_id = $2", [
          session,
          owner,
        ]);
      if (
        (name === "bfa_private_text_spend_claim_dispatch" &&
          effect === "change-key-source-after-hold" &&
          value === true) ||
        (name === "bfa_private_text_spend_dispatch" &&
          effect === "change-key-source-after-mark" &&
          value)
      ) {
        vi.stubEnv("BFA_PRIVATE_TYPED_KEY_SOURCE", "project-openai");
      }
      if (name === "bfa_private_text_spend_finish" && effect === "logout-after-finish" && value)
        await database.db.query("DELETE FROM auth.sessions WHERE id = $1 AND user_id = $2", [
          session,
          owner,
        ]);
      return Response.json(value);
    }
    const table = path.slice("/rest/v1/".length) as keyof typeof publicReadColumns;
    if (
      request.method !== "GET" ||
      !Object.hasOwn(publicReadColumns, table) ||
      (!isService && !isTester)
    ) {
      unexpected.push("Unrecognized database request");
      return Response.json({}, { status: 400 });
    }
    const allowed = publicReadColumns[table];
    const columns = (url.searchParams.get("select") ?? "").split(",");
    if (columns.some((column) => !allowed.includes(column))) {
      unexpected.push("Unnecessary database column");
      return Response.json({}, { status: 400 });
    }
    const where: string[] = [];
    const values: unknown[] = [];
    for (const [column, condition] of url.searchParams) {
      if (column === "select") continue;
      const match = /^(eq|gt|is)\.(.*)$/.exec(condition);
      if (!allowed.includes(column) || !match) throw new Error("Unknown fixture filter");
      if (match[1] === "is" && match[2] === "null") {
        where.push(`${column} IS NULL`);
      } else {
        values.push(match[2]);
        where.push(`${column} ${match[1] === "eq" ? "=" : ">"} $${values.length}`);
      }
    }
    const rows = readQueue.then(() =>
      database.asRole(isService ? "service_role" : "authenticated", async () => {
        if (!isService)
          await database.db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [owner]);
        return (
          await database.db.query(
            `SELECT ${columns.join(",")} FROM public.${table} WHERE ${where.join(" AND ")}`,
            values,
          )
        ).rows;
      }),
    );
    readQueue = rows.then(
      () => {},
      () => {},
    );
    return Response.json(await rows);
  });

  const client = createClient<Database>(dbUrl, publicKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  await database.db.query(
    "INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES($1,true,clock_timestamp()+interval '5 minutes')",
    [owner],
  );
  await database.seedSession({ authSessionId: session, ownerId: owner });
  const active = await stagingOperation({ action: "create", preferenceOn: false }, client);
  if (active.kind !== "active") throw new Error("Missing fictional thread");
  const activeThreadId = active.thread;
  const draft = {
    thread: active.thread,
    revision: active.revision,
    token: active.token,
    message,
    preferenceOn: false,
    requestId: randomUUID(),
  };
  const reviewed = await reviewPrivateTypedMessage(draft, client, claims, bearer);
  expect(reviewed).toMatchObject({
    threadId: active.thread,
    revision: 0,
    requestId: draft.requestId,
    model: "gpt-6-luna",
  });
  expect(Object.values(reviewed)).not.toContain(active.token);
  expect(JSON.stringify(reviewed)).not.toContain(message);
  expect(sent).toHaveLength(0);
  expect(rpcNames).toEqual(["bfa_p3b_create"]);

  const expiresAt = Date.now() + 120_000;
  const manifestBytes = JSON.stringify({
    version: "bfa-private-typed-send-v1",
    serviceRequestId: reviewed.serviceRequestId,
    model: reviewed.model,
    tier: "default",
    priceSnapshotSha256: privateSpendDigest(priceSnapshotBytes),
    wireBytes: reviewed.wireBytes,
    maxInputBytes: reviewed.maxInputBytes,
    maxOutputTokens: reviewed.maxOutputTokens,
    deadlineMs: reviewed.deadlineMs,
    expiresAt,
  });
  const record = await database.seedApproval({
    ownerId: owner,
    authSessionId: session,
    threadId: active.thread,
    threadRevision: active.revision,
    requestId: draft.requestId,
    manifestSha256: privateSpendDigest(manifestBytes),
    payloadSha256: reviewed.wireSha256,
    maxMicros: 9500,
    approvalExpiresAt: new Date(expiresAt).toISOString(),
  });
  const approval = {
    approvalId: record.approvalId,
    ownerId: owner,
    authSessionId: session,
    threadId: active.thread,
    revision: active.revision,
    requestId: draft.requestId,
    manifestSha256: record.manifestSha256,
    payloadSha256: record.payloadSha256,
    maxMicros: record.maxMicros,
  };
  vi.stubEnv(
    "BFA_PRIVATE_TYPED_SEND_MATERIALS_JSON",
    JSON.stringify({ version: 1, materials: [{ approval, manifestBytes, priceSnapshotBytes }] }),
  );

  async function send(changes: Partial<typeof draft> = {}) {
    const auth = await createPrivateTypedRequestAuth(client, claims, bearer);
    if (!auth) throw new Error("Fictional private session refused");
    return stagingOperation({ ...draft, ...changes, action: "private-append" }, client, auth);
  }
  async function state() {
    const charge = await database.one(
      "SELECT state,charged_micros FROM bfa_private_text_spend.approvals WHERE approval_id=$1",
      [approval.approvalId],
    );
    const thread = await database.one(
      "SELECT revision,saved_snapshot FROM public.bfa_p3b_threads WHERE id=$1",
      [draft.thread],
    );
    return { ...charge, ...thread };
  }
  function assertTransport() {
    expect(authRequests).toBeGreaterThan(0);
    expect(unexpected).toEqual([]);
    expect(rpcNames.filter((name) => /^bfa_p3b_(reserve|claim|finish|settle)$/.test(name))).toEqual(
      [],
    );
  }
  async function finishedRevision() {
    const row = await database.one(
      "SELECT finished_revision FROM bfa_private_text_spend.dispatches WHERE approval_id=$1",
      [approval.approvalId],
    );
    return row?.finished_revision ?? null;
  }
  return { send, state, sent, reviewed, owner, assertTransport, finishedRevision };
}

it.skipIf(!engine)(
  "uses the reviewed wire and exact request once through private staging",
  async () => {
    const test = await prepareExchange();
    const result = await test.send();
    expect(result.kind).toBe("active");
    if (result.kind !== "active") throw new Error("Expected the authorized reply");
    expect(result.inspection?.events.map((e) => e.text)).toEqual([message, reply]);
    const envelope = await unseal(result.token, test.owner, test.reviewed.threadId, 1);
    expect(envelope.authority.record.events.map((e) => e.text)).toEqual([message, reply]);
    expect(test.sent).toHaveLength(1);
    expect(privateSpendDigest(test.sent[0])).toBe(test.reviewed.wireSha256);
    await expect(test.send()).rejects.toThrow();
    expect(test.sent).toHaveLength(1);
    expect(await test.state()).toEqual({
      state: "settled",
      charged_micros: 24,
      revision: 1,
      saved_snapshot: null,
    });
    test.assertTransport();
  },
);
it.skipIf(!engine)(
  "sends the approved request using the explicitly selected project test credential",
  async () => {
    const test = await prepareExchange();
    vi.stubEnv("BFA_PRIVATE_TYPED_KEY_SOURCE", "project-openai");
    expect((await test.send()).kind).toBe("active");
    expect(test.sent).toHaveLength(1);
    expect(await test.state()).toMatchObject({ state: "settled", charged_micros: 24 });
    test.assertTransport();
  },
);
it.skipIf(!engine).each(["change-key-source-after-hold", "change-key-source-after-mark"] as const)(
  "refuses transmission and preserves the held amount on %s",
  async (effect) => {
    const test = await prepareExchange(effect);
    await expect(test.send()).rejects.toThrow();
    expect(test.sent).toHaveLength(0);
    expect(await test.state()).toEqual({
      state: "held",
      charged_micros: null,
      revision: 0,
      saved_snapshot: null,
    });
    test.assertTransport();
  },
);

it.skipIf(!engine).each(["revoke", "session-closed", "invalid-answer"] as const)(
  "settles verified returned usage but withholds a reply for %s",
  async (effect) => {
    const test = await prepareExchange(effect);
    await expect(test.send()).rejects.toThrow();
    expect(test.sent).toHaveLength(1);
    expect(await test.state()).toEqual({
      state: "settled",
      charged_micros: 24,
      revision: 0,
      saved_snapshot: null,
    });
    test.assertTransport();
  },
);
it.skipIf(!engine)(
  "stops after the paid hold when the database session is closed while Auth still accepts the token",
  async () => {
    const test = await prepareExchange("close-after-hold");
    await expect(test.send()).rejects.toThrow();
    expect(test.sent).toHaveLength(0);
    expect(await test.state()).toEqual({
      state: "held",
      charged_micros: null,
      revision: 0,
      saved_snapshot: null,
    });
    test.assertTransport();
  },
);
it.skipIf(!engine).each(["thread-stopped", "logout-after-finish"] as const)(
  "suppresses a funded reply after %s despite a committed revision",
  async (effect) => {
    const test = await prepareExchange(effect);
    await expect(test.send()).rejects.toThrow();
    expect(test.sent).toHaveLength(1);
    expect(await test.state()).toEqual({
      state: "settled",
      charged_micros: 24,
      revision: 1,
      saved_snapshot: null,
    });
    expect(await test.finishedRevision()).toBe(effect === "logout-after-finish" ? 1 : null);
    test.assertTransport();
  },
);
it.skipIf(!engine)("holds uncertain cost after an ambiguous send without resending", async () => {
  const test = await prepareExchange("lost-response");
  await expect(test.send()).rejects.toThrow();
  await expect(test.send()).rejects.toThrow();
  expect(test.sent).toHaveLength(1);
  expect(await test.state()).toEqual({
    state: "held",
    charged_micros: null,
    revision: 0,
    saved_snapshot: null,
  });
  test.assertTransport();
});
it.skipIf(!engine)(
  "rejects a changed UUID and changed message before any hold or HTTP send",
  async () => {
    const test = await prepareExchange();
    await expect(test.send({ requestId: randomUUID() })).rejects.toThrow();
    await expect(test.send({ message: "A different fictional message." })).rejects.toThrow();
    expect(test.sent).toHaveLength(0);
    expect(await test.state()).toEqual({
      state: "approved",
      charged_micros: null,
      revision: 0,
      saved_snapshot: null,
    });
    expect((await test.send()).kind).toBe("active");
    expect(test.sent).toHaveLength(1);
    test.assertTransport();
  },
);
