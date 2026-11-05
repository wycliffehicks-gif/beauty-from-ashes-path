// Actual local P3b AES-GCM/HMAC, inactive v2 verifier and protected v2 SQL.
// Auth/policy/approval and timing/response faults are fictional local fixtures.
// No deployed Auth, HTTP, provider/device, native scheduling or runtime wiring.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile, readdir, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ConversationService } from "../service/service";
import { seal, fingerprint as tokenFingerprint } from "../staging/seal.server";
import { createVoiceV2AuthorityVerifier } from "../service/voice-v2-authority-verifier.server";
import {
  createVoiceV2CurrentRpcPorts,
  type VoiceV2CurrentQuery,
} from "../service/voice-v2-current-rpc.server";
import {
  createVoiceV2ParentIssuanceRpcPorts,
  type VoiceV2IssuanceRegistration,
} from "../service/voice-v2-parent-issuance-rpc.server";
import { createVoiceV2PreissueRpcPorts } from "../service/voice-v2-preissue-rpc.server";

interface LocalDatabase {
  exec(sql: string): Promise<unknown>;
  query(sql: string, parameters?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
  dumpDataDir(compression: string): Promise<unknown>;
  readonly closed: boolean;
}
type Args = Readonly<Record<string, unknown>>;
type Role = "anon" | "authenticated" | "service_role";
const enginePath = process.env.BFA_PGLITE_MODULE;
const sqlSuite = enginePath ? describe : describe.skip;
const ROOT = process.cwd();
const SOURCE = "2001-02-03T04:05:06.123456Z";
const digest = () => createHash("sha256").update(randomUUID()).digest("hex");
const fingerprint = digest;
const names = [
  "bfa_p5_v2_read_current",
  "bfa_p5_v2_read_parent",
  "bfa_p5_v2_observe_parent",
  "bfa_p5_v2_revoke_parent",
  "bfa_p5_v2_register_issuance",
  "bfa_p5_v2_register_generation",
];
const tables = [
  ...["staging_accounts", "threads", "allowances", "admissions"].map((n) => `public.bfa_p3b_${n}`),
  ...[
    "generations",
    "owner_clocks",
    "session_fences",
    "issuances",
    "quotas",
    "approvals",
    "cleanup_owners",
    "proofs",
    "attempts",
    "claims",
  ].map((n) => `bfa_p5_voice.${n}`),
  ...["pools", "routes", "allocations", "sessions", "evidence", "conflicts"].map(
    (n) => `bfa_p5_capacity.${n}`,
  ),
  "bfa_p5_voice_v2.auth_parents",
  "bfa_p5_voice_v2.issuance_auth_bindings",
];

sqlSuite("P5 inactive v2 authority verifier in isolated PostgreSQL", () => {
  let db: LocalDatabase | undefined;
  let seed: LocalDatabase | undefined;
  let realClockDefinition: string | undefined;
  const database = () => {
    if (!db) throw new Error("Offline fixture database unavailable");
    return db;
  };
  const one = async (sql: string, args: unknown[] = []) =>
    (await database().query(sql, args)).rows[0]!;
  beforeAll(async () => {
    vi.stubEnv("BFA_P3B_STATE_SECRET", `offline-v2-verifier-${randomUUID()}`);
    if (!enginePath || !path.isAbsolute(enginePath))
      throw new Error("Absolute local engine path required");
    const modulePath = await realpath(enginePath);
    const pkg = JSON.parse(await readFile(path.resolve(modulePath, "../../package.json"), "utf8"));
    expect({ name: pkg.name, version: pkg.version }).toEqual({
      name: "@electric-sql/pglite",
      version: "0.5.12",
    });
    const { PGlite } = await import(/* @vite-ignore */ pathToFileURL(modulePath).href);
    seed = await PGlite.create();
    await seed!.exec("CREATE DATABASE bfa_p5_offline_fixture;");
    const bundle = await seed!.dumpDataDir("none");
    await seed!.close();
    expect(seed!.closed).toBe(true);
    db = await PGlite.create({ loadDataDir: bundle, database: "bfa_p5_offline_fixture" });
    expect((await one("SELECT current_database() AS name;")).name).toBe("bfa_p5_offline_fixture");
    expect((await one("SHOW server_version;")).server_version).toMatch(/^18\.6/);
    const install = async (relative: string) =>
      database().exec(await readFile(path.join(ROOT, relative), "utf8"));
    await install("scripts/conversation-eval/p5-sql/bootstrap.sql");
    const migrations = (await readdir(path.join(ROOT, "drizzle/migrations")))
      .filter((n) => /^000[0-5]_.*\.sql$/.test(n))
      .sort();
    expect(migrations).toHaveLength(6);
    for (const name of migrations) await install(`drizzle/migrations/${name}`);
    for (const name of [
      "admission",
      "reads",
      "preissue-read",
      "capacity",
      "session-revoke",
      "session-provision",
      "v2-parent-issuance",
      "v2-preissue",
    ])
      await install(`docs/pilot/conversation/sql-drafts/p5-voice-${name}.sql`);
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-cleanup.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-proof.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-capacity.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-mark.sql");
    await install("docs/pilot/conversation/sql-drafts/p5-voice-v2-current.sql");
    realClockDefinition = (
      await one("SELECT pg_get_functiondef('bfa_p5_voice.ms()'::regprocedure) AS definition;")
    ).definition as string;
  }, 60000);
  afterEach(async () => {
    vi.restoreAllMocks();
    if (db && !db.closed && realClockDefinition) {
      await db.exec(realClockDefinition);
      expect(
        (await one("SELECT pg_get_functiondef('bfa_p5_voice.ms()'::regprocedure) AS definition;"))
          .definition,
      ).toBe(realClockDefinition);
    }
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    for (const instance of [seed, db]) {
      if (instance && !instance.closed) await instance.close();
      if (instance) expect(instance.closed).toBe(true);
    }
  });
  async function asRole(role: Role, sql: string, args: unknown[] = []) {
    await database().exec(`BEGIN; SET LOCAL ROLE ${role};`);
    try {
      expect((await one("SELECT current_user AS role;")).role).toBe(role);
      const row = await one(sql, args);
      await database().exec("COMMIT;");
      return row;
    } catch (error) {
      await database().exec("ROLLBACK;");
      throw error;
    }
  }
  async function raw(name: string, args: Args, role: Role = "service_role") {
    expect(names).toContain(name);
    const types: Record<string, string> = {
      p_request: "jsonb",
      p_proof: "jsonb",
      p_cleanup_id: "uuid",
      p_claim: "jsonb",
      p_owner_id: "uuid",
      p_auth_session_id: "uuid",
      p_parent_version: "bigint",
      p_fingerprint: "text",
      p_verified_ms: "bigint",
      p_auth_expires_ms: "bigint",
      p_thread_id: "uuid",
      p_revision: "bigint",
      p_incarnation: "uuid",
      p_issued_ms: "bigint",
      p_expires_ms: "bigint",
      p_source_created_at: "text",
    };
    const entries = Object.entries(args);
    for (const [key] of entries) expect(Object.hasOwn(types, key)).toBe(true);
    const named = entries.map(([key], i) => `${key}=>$${i + 1}::${types[key]}`).join(",");
    return (
      await asRole(
        role,
        `SELECT public.${name}(${named}) AS value;`,
        entries.map(([key, value]) =>
          ["p_claim", "p_proof", "p_request"].includes(key) ? JSON.stringify(value) : value,
        ),
      )
    ).value;
  }
  function transport() {
    const calls: { name: string; args: Args; committed: boolean }[] = [];
    const hooks: {
      before?: (name: string, args: Args) => Promise<void>;
      afterCommit?: (name: string, data: unknown) => Promise<unknown>;
    } = {};
    const client = {
      async rpc(name: string, args: Args) {
        const call = { name, args, committed: false };
        calls.push(call);
        await hooks.before?.(name, args);
        const data = await raw(name, args);
        call.committed = true;
        return {
          data: hooks.afterCommit ? await hooks.afterCommit(name, data) : data,
          error: null,
          status: 200,
        };
      },
    };
    return {
      calls,
      hooks,
      current: createVoiceV2CurrentRpcPorts(client),
      parents: createVoiceV2ParentIssuanceRpcPorts(client),
      preissue: createVoiceV2PreissueRpcPorts(client),
    };
  }
  async function setClock(value: number) {
    expect(Number.isInteger(value)).toBe(true);
    await database().exec(
      `CREATE OR REPLACE FUNCTION bfa_p5_voice.ms() RETURNS bigint LANGUAGE sql VOLATILE SET search_path=pg_catalog,pg_temp AS $$ SELECT ${value}::bigint $$;`,
    );
  }
  async function fixture(at = Date.now()) {
    const clock = { now: at };
    vi.spyOn(Date, "now").mockImplementation(() => clock.now);
    const now = at,
      ownerId = randomUUID(),
      threadId = randomUUID(),
      authSessionId = randomUUID();
    await setClock(now);
    await database().query(
      "INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES($1,true,to_timestamp($2/1000.0));",
      [ownerId, now + 7200000],
    );
    await database().query(
      "INSERT INTO public.bfa_p3b_threads(id,owner_id,created_at,saved_snapshot,saved_at) VALUES($1,$2,$3::timestamptz,to_jsonb('fictional private source must not escape'::text),clock_timestamp());",
      [threadId, ownerId, SOURCE],
    );
    const t = transport();
    expect(
      await t.parents.observeParent({
        ownerId,
        authSessionId,
        verifiedAt: now,
        authExpiresAt: now + 1800000,
      }),
    ).toMatchObject({ parentVersion: 0, revoked: false });
    const g = await t.preissue.registerGeneration({
      ownerId,
      authSessionId,
      parentVersion: 0,
      threadId,
      threadRevision: 0,
      sourceCreatedAt: SOURCE,
      verifiedAt: now,
      authExpiresAt: now + 1800000,
    });
    expect(g).not.toBeNull();
    const service = new ConversationService({ verifiedOwnerId: ownerId });
    service.ensureThread(threadId, false);
    const activeAuthority = await seal({
      owner: ownerId,
      thread: threadId,
      revision: 0,
      expires: now + 60000,
      authority: service.exportAuthority(threadId),
    });
    const issuance: VoiceV2IssuanceRegistration = {
      ownerId,
      authSessionId,
      parentVersion: 0,
      threadId,
      threadIncarnation: g!.threadIncarnation,
      threadRevision: 0,
      authorityFingerprint: await tokenFingerprint(activeAuthority),
      verifiedAt: now,
      authExpiresAt: now + 1800000,
      issuedAt: now,
      expiresAt: now + 60000,
    };
    expect(await t.parents.registerIssuance(issuance)).toMatchObject({
      authorityFingerprint: issuance.authorityFingerprint,
    });
    const attemptId = randomUUID(),
      approvalId = randomUUID(),
      approvalDigest = digest(),
      policyId = randomUUID();
    await database().query(
      "INSERT INTO bfa_p5_voice.approvals VALUES($1,$2,$3,$4,$5,0,$6,'developer-voice-session',$7,false,$8);",
      [
        approvalId,
        approvalDigest,
        ownerId,
        threadId,
        g!.threadIncarnation,
        attemptId,
        now + 60000,
        policyId,
      ],
    );
    const q: VoiceV2CurrentQuery = {
      protocol: 2,
      ownerId,
      authSessionId,
      parentVersion: 0,
      threadId,
      attemptId,
      authorityFingerprint: issuance.authorityFingerprint,
      verifiedAt: now,
      identityExpiresAt: now + 1800000,
    };
    return {
      q,
      issuance,
      now,
      approvalId,
      approvalDigest,
      policyId,
      clock,
      service,
      identity: { ownerId, sessionId: authSessionId, expiresAt: now + 1800000 },
      request: {
        threadId,
        threadIncarnation: g!.threadIncarnation,
        threadRevision: 0,
        attemptId,
        activeAuthority,
      },
    };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function snapshot() {
    const result: Record<string, Record<string, unknown>[]> = {};
    for (const table of tables)
      result[table] = (
        await one(
          `SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM ${table} t;`,
        )
      ).rows as Record<string, unknown>[];
    expect(Object.keys(result)).toHaveLength(22);
    return result;
  }
  async function preserved(before: Awaited<ReturnType<typeof snapshot>>, ownerId?: string) {
    const after = await snapshot();
    for (const table of tables) {
      if (ownerId && table === "bfa_p5_voice.owner_clocks")
        expect(
          after[table]!.filter((r) => r.owner_id !== ownerId),
          table,
        ).toEqual(before[table]!.filter((r) => r.owner_id !== ownerId));
      else expect(after[table], table).toEqual(before[table]);
    }
  }
  const clockRow = (q: VoiceV2CurrentQuery) =>
    one("SELECT observed_ms FROM bfa_p5_voice.owner_clocks WHERE owner_id=$1;", [q.ownerId]);
  async function seedHolds(q: VoiceV2IssuanceRegistration) {
    const claimId = randomUUID(),
      cleanupId = randomUUID(),
      poolId = randomUUID(),
      policyId = randomUUID(),
      attemptId = randomUUID();
    const claim = JSON.stringify({
      claimId,
      expiresAt: q.authExpiresAt,
      binding: {
        ownerId: q.ownerId,
        threadId: q.threadId,
        threadIncarnation: q.threadIncarnation,
        threadRevision: 0,
        attemptId,
        approvalId: randomUUID(),
        approvalDigest: fingerprint(),
        scope: "developer-voice-session",
      },
    });
    await database().query("INSERT INTO public.bfa_p3b_allowances VALUES($1,'voice',7,3);", [
      q.ownerId,
    ]);
    await database().query(
      "INSERT INTO public.bfa_p3b_admissions(owner_id,request_id,thread_id,thread_revision,mode,fingerprint,reserved_units,state) VALUES($1,$2,$3,0,'voice',$4,3,'uncertain');",
      [q.ownerId, randomUUID(), q.threadId, fingerprint()],
    );
    await database().query("INSERT INTO bfa_p5_voice.quotas VALUES($1,$2,7,3,true);", [
      q.ownerId,
      policyId,
    ]);
    await database().query(
      "INSERT INTO bfa_p5_voice.cleanup_owners(cleanup_id,claim_id,owner_id,claim,effective_expires_ms) VALUES($1,$2,$3,$4,$5);",
      [cleanupId, claimId, q.ownerId, claim, q.authExpiresAt],
    );
    await database().query("INSERT INTO bfa_p5_voice.claims VALUES($1,$2,$3,$4,'claimed',$5,3);", [
      claimId,
      q.ownerId,
      claim,
      q.authExpiresAt,
      policyId,
    ]);
    await database().query(
      "INSERT INTO bfa_p5_capacity.pools(pool_id,active_limit,unit_limit,reservation_units,occupied,held_units,enabled) VALUES($1,4,12,3,1,3,true);",
      [poolId],
    );
    await database().query("INSERT INTO bfa_p5_capacity.routes VALUES($1,$2,$3);", [
      q.ownerId,
      policyId,
      poolId,
    ]);
    await database().query(
      "INSERT INTO bfa_p5_capacity.allocations(claim_id,owner_id,attempt_id,claim,cleanup_id,pool_id,pool_version,units,operation_id) VALUES($1,$2,$3,$4,$5,$6,1,3,$7);",
      [claimId, q.ownerId, attemptId, claim, cleanupId, poolId, randomUUID()],
    );
  }

  function verifier(f: Fixture, t = transport()) {
    const authenticate = vi.fn(async () => structuredClone(f.identity));
    const ports = {
      now: () => f.clock.now,
      authenticate,
      readParent: t.parents.readParent,
      readCurrent: t.current.readCurrent,
    };
    return { t, authenticate, ports, verify: createVoiceV2AuthorityVerifier(ports).verifyCurrent };
  }
  function requests(t: ReturnType<typeof transport>) {
    return t.calls
      .filter((call) => call.name === "bfa_p5_v2_read_current")
      .map((call) => call.args.p_request as VoiceV2CurrentQuery);
  }

  it("verifies real sealed issued authority before a target claim and preserves all 22 tables", async () => {
    const f = await fixture();
    await seedHolds(f.issuance);
    const before = await snapshot(),
      h = verifier(f);
    f.clock.now++;
    await setClock(f.clock.now);
    const result = await h.verify(f.request);
    expect(result).toMatchObject({
      protocol: 2,
      binding: {
        ownerId: f.q.ownerId,
        threadId: f.q.threadId,
        threadIncarnation: f.request.threadIncarnation,
        threadRevision: 0,
        attemptId: f.q.attemptId,
        approvalId: f.approvalId,
        approvalDigest: f.approvalDigest,
        scope: "developer-voice-session",
      },
      authSessionId: f.q.authSessionId,
      parentVersion: 0,
      authorityFingerprint: f.q.authorityFingerprint,
      issuedAt: f.now,
      issuanceExpiresAt: f.now + 60000,
      envelopeExpiresAt: f.now + 60000,
      verifiedAt: f.now + 1,
      verificationExpiresAt: f.now + 30001,
      identityExpiresAt: f.now + 1800000,
      allowlistExpiresAt: f.now + 7200000,
      approvalExpiresAt: f.now + 60000,
      effectiveExpiresAt: f.now + 30001,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result!.binding)).toBe(true);
    expect(requests(h.t).length).toBeGreaterThanOrEqual(2);
    for (const request of requests(h.t)) {
      expect(request).toEqual({ ...f.q, verifiedAt: f.now + 1 });
      expect(Object.keys(request)).toHaveLength(9);
    }
    for (const call of h.t.calls)
      expect(["bfa_p5_v2_read_parent", "bfa_p5_v2_read_current"]).toContain(call.name);
    expect(JSON.stringify({ result, calls: h.t.calls })).not.toContain(f.request.activeAuthority);
    expect(JSON.stringify({ result, calls: h.t.calls })).not.toContain("fictional private source");
    expect(await clockRow(f.q)).toEqual({ observed_ms: f.clock.now });
    await preserved(before, f.q.ownerId);
    expect(
      (
        await one(
          "SELECT count(*)::integer AS n FROM bfa_p5_voice.attempts WHERE owner_id=$1 AND attempt_id=$2;",
          [f.q.ownerId, f.q.attemptId],
        )
      ).n,
    ).toBe(0);
  });

  it("uses fresh shorter Auth over an older original envelope without renewing issuance", async () => {
    const f = await fixture();
    f.clock.now += 40000;
    f.identity.expiresAt = f.now + 45000;
    await setClock(f.clock.now);
    const before = await snapshot(),
      h = verifier(f),
      result = await h.verify(f.request);
    expect(result).toMatchObject({
      verifiedAt: f.now + 40000,
      identityExpiresAt: f.now + 45000,
      issuanceExpiresAt: f.now + 60000,
      envelopeExpiresAt: f.now + 60000,
      effectiveExpiresAt: f.now + 45000,
    });
    expect(
      requests(h.t).every(
        (q) => q.verifiedAt === f.now + 40000 && q.identityExpiresAt === f.now + 45000,
      ),
    ).toBe(true);
    await preserved(before, f.q.ownerId);
  });

  const changes: [string, (f: Fixture) => Promise<unknown>][] = [
    [
      "revoked parent",
      (f) =>
        transport().parents.revokeParent({
          ownerId: f.q.ownerId,
          authSessionId: f.q.authSessionId,
        }),
    ],
    [
      "withdrawn allowlist",
      (f) =>
        database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET admitted=false WHERE user_id=$1;",
          [f.q.ownerId],
        ),
    ],
    [
      "expired allowlist",
      (f) =>
        database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($1/1000.0) WHERE user_id=$2;",
          [f.now, f.q.ownerId],
        ),
    ],
    [
      "deleted thread",
      (f) =>
        database().query(
          "UPDATE public.bfa_p3b_threads SET deleted_at=clock_timestamp(),saved_snapshot=NULL,saved_at=NULL WHERE id=$1;",
          [f.q.threadId],
        ),
    ],
    [
      "foreign thread owner",
      (f) =>
        database().query("UPDATE public.bfa_p3b_threads SET owner_id=$1 WHERE id=$2;", [
          randomUUID(),
          f.q.threadId,
        ]),
    ],
    [
      "changed revision",
      (f) =>
        database().query("UPDATE public.bfa_p3b_threads SET revision=1 WHERE id=$1;", [
          f.q.threadId,
        ]),
    ],
    [
      "recreated source",
      (f) =>
        database().query(
          "UPDATE public.bfa_p3b_threads SET created_at=created_at+interval '1 microsecond' WHERE id=$1;",
          [f.q.threadId],
        ),
    ],
    [
      "retired generation",
      (f) =>
        database().query("UPDATE bfa_p5_voice.generations SET retired=true WHERE thread_id=$1;", [
          f.q.threadId,
        ]),
    ],
    [
      "changed incarnation",
      (f) =>
        database().query("UPDATE bfa_p5_voice.generations SET incarnation=$1 WHERE thread_id=$2;", [
          randomUUID(),
          f.q.threadId,
        ]),
    ],
    [
      "legacy unbound issuance",
      (f) =>
        database().query(
          "DELETE FROM bfa_p5_voice_v2.issuance_auth_bindings WHERE fingerprint=$1;",
          [f.q.authorityFingerprint],
        ),
    ],
    [
      "foreign issuance owner",
      (f) =>
        database().query("UPDATE bfa_p5_voice.issuances SET owner_id=$1 WHERE fingerprint=$2;", [
          randomUUID(),
          f.q.authorityFingerprint,
        ]),
    ],
    [
      "revoked issuance",
      (f) =>
        database().query("UPDATE bfa_p5_voice.issuances SET revoked=true WHERE fingerprint=$1;", [
          f.q.authorityFingerprint,
        ]),
    ],
    [
      "changed original issuance time",
      (f) =>
        database().query("UPDATE bfa_p5_voice.issuances SET issued_ms=$1 WHERE fingerprint=$2;", [
          f.now - 1,
          f.q.authorityFingerprint,
        ]),
    ],
    [
      "changed original issuance expiry",
      (f) =>
        database().query("UPDATE bfa_p5_voice.issuances SET expires_ms=$1 WHERE fingerprint=$2;", [
          f.now + 50000,
          f.q.authorityFingerprint,
        ]),
    ],
    [
      "mismatched binding version",
      (f) =>
        database().query(
          "UPDATE bfa_p5_voice_v2.issuance_auth_bindings SET parent_version=1 WHERE fingerprint=$1;",
          [f.q.authorityFingerprint],
        ),
    ],
    [
      "missing approval",
      (f) =>
        database().query("DELETE FROM bfa_p5_voice.approvals WHERE approval_id=$1;", [
          f.approvalId,
        ]),
    ],
    [
      "revoked approval",
      (f) =>
        database().query("UPDATE bfa_p5_voice.approvals SET revoked=true WHERE approval_id=$1;", [
          f.approvalId,
        ]),
    ],
    [
      "expired approval",
      (f) =>
        database().query("UPDATE bfa_p5_voice.approvals SET expires_ms=$1 WHERE approval_id=$2;", [
          f.now,
          f.approvalId,
        ]),
    ],
    [
      "changed approval digest",
      (f) =>
        database().query("UPDATE bfa_p5_voice.approvals SET digest=$1 WHERE approval_id=$2;", [
          digest(),
          f.approvalId,
        ]),
    ],
    [
      "foreign approval attempt",
      (f) =>
        database().query("UPDATE bfa_p5_voice.approvals SET attempt_id=$1 WHERE approval_id=$2;", [
          randomUUID(),
          f.approvalId,
        ]),
    ],
  ];
  it.each(changes)(
    "rejects %s arriving after its first actual current read",
    async (_name, change) => {
      const f = await fixture(),
        h = verifier(f);
      let changed = false,
        afterChange: Awaited<ReturnType<typeof snapshot>> | undefined;
      h.t.hooks.afterCommit = async (name, data) => {
        if (name === "bfa_p5_v2_read_current" && !changed) {
          expect(data).not.toBeNull();
          changed = true;
          await change(f);
          afterChange = await snapshot();
        }
        return data;
      };
      expect(await h.verify(f.request)).toBeNull();
      expect(changed).toBe(true);
      expect(afterChange).toBeDefined();
      await preserved(afterChange!, f.q.ownerId);
    },
  );

  it.each(["active", "expired", "revoked"])(
    "refuses a retained %s legacy fence with no fallback",
    async (kind) => {
      const f = await fixture();
      await database().query("INSERT INTO bfa_p5_voice.session_fences VALUES($1,$2,0,$3,$4);", [
        f.q.ownerId,
        f.q.authSessionId,
        kind === "expired" ? f.now - 1 : f.now + 60000,
        kind === "revoked",
      ]);
      const before = await snapshot(),
        h = verifier(f);
      expect(await h.verify(f.request)).toBeNull();
      expect(h.t.calls.every((c) => c.name.startsWith("bfa_p5_v2_"))).toBe(true);
      await preserved(before);
    },
  );

  it.each(["Auth owner", "Auth session", "missing Auth"])(
    "denies %s changed after first SQL observation without manufacturing revocation",
    async (kind) => {
      const f = await fixture(),
        h = verifier(f);
      h.t.hooks.afterCommit = async (name, data) => {
        if (name === "bfa_p5_v2_read_current") {
          if (kind === "Auth owner") f.identity.ownerId = randomUUID();
          if (kind === "Auth session") f.identity.sessionId = randomUUID();
          if (kind === "missing Auth")
            h.authenticate.mockResolvedValue(null as unknown as typeof f.identity);
        }
        return data;
      };
      const before = await snapshot();
      expect(await h.verify(f.request)).toBeNull();
      await preserved(before, f.q.ownerId);
    },
  );

  it.each(["Auth", "allowlist", "approval"])(
    "retains the shorter %s ceiling even after a later extension",
    async (kind) => {
      const f = await fixture(),
        h = verifier(f);
      const shorter = f.now + 1000;
      if (kind === "Auth") f.identity.expiresAt = shorter;
      if (kind === "allowlist")
        await database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($1/1000.0) WHERE user_id=$2;",
          [shorter, f.q.ownerId],
        );
      if (kind === "approval")
        await database().query(
          "UPDATE bfa_p5_voice.approvals SET expires_ms=$1 WHERE approval_id=$2;",
          [shorter, f.approvalId],
        );
      let reads = 0,
        afterChange: Awaited<ReturnType<typeof snapshot>> | undefined;
      h.t.hooks.afterCommit = async (name, data) => {
        if (name === "bfa_p5_v2_read_current" && ++reads === 1) {
          if (kind === "Auth") f.identity.expiresAt = f.now + 1800000;
          if (kind === "allowlist")
            await database().query(
              "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($1/1000.0) WHERE user_id=$2;",
              [f.now + 7200000, f.q.ownerId],
            );
          if (kind === "approval")
            await database().query(
              "UPDATE bfa_p5_voice.approvals SET expires_ms=$1 WHERE approval_id=$2;",
              [f.now + 60000, f.approvalId],
            );
          afterChange = await snapshot();
        }
        return data;
      };
      const result = await h.verify(f.request);
      expect(result).toMatchObject({ effectiveExpiresAt: shorter });
      expect(
        result![
          kind === "Auth"
            ? "identityExpiresAt"
            : kind === "allowlist"
              ? "allowlistExpiresAt"
              : "approvalExpiresAt"
        ],
      ).toBe(shorter);
      await preserved(afterChange!, f.q.ownerId);
    },
  );

  it("shortens every independently observed ceiling across actual current reads", async () => {
    const f = await fixture(),
      h = verifier(f);
    let reads = 0,
      afterChange: Awaited<ReturnType<typeof snapshot>> | undefined;
    h.t.hooks.afterCommit = async (name, data) => {
      if (name === "bfa_p5_v2_read_current" && ++reads === 1) {
        f.identity.expiresAt = f.now + 9000;
        await database().query(
          "UPDATE public.bfa_p3b_staging_accounts SET expires_at=to_timestamp($1/1000.0) WHERE user_id=$2;",
          [f.now + 8000, f.q.ownerId],
        );
        await database().query(
          "UPDATE bfa_p5_voice.approvals SET expires_ms=$1 WHERE approval_id=$2;",
          [f.now + 7000, f.approvalId],
        );
        afterChange = await snapshot();
      }
      return data;
    };
    expect(await h.verify(f.request)).toMatchObject({
      identityExpiresAt: f.now + 9000,
      allowlistExpiresAt: f.now + 8000,
      approvalExpiresAt: f.now + 7000,
      effectiveExpiresAt: f.now + 7000,
      issuanceExpiresAt: f.now + 60000,
    });
    await preserved(afterChange!, f.q.ownerId);
  });

  it.each(["lost", "null", "mismatched echo", "legacy peeled reply"])(
    "denies a committed %s current reply without retry or lifecycle effects",
    async (fault) => {
      const f = await fixture(),
        h = verifier(f),
        before = await snapshot();
      h.t.hooks.afterCommit = async (name, data) => {
        if (name !== "bfa_p5_v2_read_current") return data;
        if (fault === "lost") throw new Error("private transport sentinel");
        if (fault === "null") return null;
        const body = structuredClone(data) as { request: VoiceV2CurrentQuery; current: unknown };
        if (fault === "legacy peeled reply") return body.current;
        return { ...body, request: { ...body.request, attemptId: randomUUID() } };
      };
      expect(await h.verify(f.request)).toBeNull();
      expect(requests(h.t)).toHaveLength(1);
      expect(h.t.calls.filter((c) => c.name === "bfa_p5_v2_read_current")[0]!.committed).toBe(true);
      await preserved(before, f.q.ownerId);
    },
  );

  it.each([29999, 30000, 30001])(
    "checks original verification age at %i ms after a current read",
    async (elapsed) => {
      const f = await fixture(),
        h = verifier(f),
        before = await snapshot();
      let first = true;
      h.t.hooks.afterCommit = async (name, data) => {
        if (name === "bfa_p5_v2_read_current" && first) {
          first = false;
          f.clock.now = f.now + elapsed;
          await setClock(f.clock.now);
        }
        return data;
      };
      const result = await h.verify(f.request);
      if (elapsed < 30000)
        expect(result).toMatchObject({
          verifiedAt: f.now,
          verificationExpiresAt: f.now + 30000,
          effectiveExpiresAt: f.now + 30000,
        });
      else expect(result).toBeNull();
      expect(requests(h.t).every((q) => q.verifiedAt === f.now)).toBe(true);
      await preserved(before, f.q.ownerId);
    },
  );

  it("denies rollback after a real current read and never rolls back the SQL high-water", async () => {
    const f = await fixture(),
      h = verifier(f),
      before = await snapshot();
    h.t.hooks.afterCommit = async (name, data) => {
      if (name === "bfa_p5_v2_read_current") f.clock.now = f.now - 1;
      return data;
    };
    expect(await h.verify(f.request)).toBeNull();
    expect(requests(h.t)).toHaveLength(1);
    expect(await clockRow(f.q)).toEqual({ observed_ms: f.now });
    await preserved(before);
  });

  it("refuses a shorter ceiling which expires while its SQL result waits", async () => {
    const f = await fixture(),
      h = verifier(f);
    await database().query(
      "UPDATE bfa_p5_voice.approvals SET expires_ms=$1 WHERE approval_id=$2;",
      [f.now + 100, f.approvalId],
    );
    const before = await snapshot();
    h.t.hooks.afterCommit = async (name, data) => {
      if (name === "bfa_p5_v2_read_current") f.clock.now = f.now + 100;
      return data;
    };
    expect(await h.verify(f.request)).toBeNull();
    expect(requests(h.t)).toHaveLength(1);
    await preserved(before);
  });

  it("does not accept a freshly resealed equivalent envelope absent its exact immutable registration", async () => {
    const f = await fixture(),
      h = verifier(f),
      before = await snapshot();
    const other = await seal({
      owner: f.q.ownerId,
      thread: f.q.threadId,
      revision: 0,
      expires: f.issuance.expiresAt,
      authority: f.service.exportAuthority(f.q.threadId),
    });
    expect(other).not.toBe(f.request.activeAuthority);
    expect(await h.verify({ ...f.request, activeAuthority: other })).toBeNull();
    expect(requests(h.t)[0]!.authorityFingerprint).not.toBe(f.q.authorityFingerprint);
    await preserved(before, f.q.ownerId);
  });
  it.each(["parent", "approval"])("rechecks %s changed during final Auth wait", async (kind) => {
    const f = await fixture(),
      h = verifier(f);
    let changed = false;
    let afterChange: Awaited<ReturnType<typeof snapshot>> | undefined;
    h.authenticate.mockImplementation(async () => {
      if (!changed && requests(h.t).length >= 2) {
        changed = true;
        if (kind === "parent")
          await transport().parents.revokeParent({
            ownerId: f.q.ownerId,
            authSessionId: f.q.authSessionId,
          });
        else
          await database().query(
            "UPDATE bfa_p5_voice.approvals SET revoked=true WHERE approval_id=$1;",
            [f.approvalId],
          );
        afterChange = await snapshot();
      }
      return structuredClone(f.identity);
    });
    expect(await h.verify(f.request)).toBeNull();
    expect(changed).toBe(true);
    await preserved(afterChange!, f.q.ownerId);
  });
  it("denies another genuinely present clear parent for this exact issued ciphertext", async () => {
    const f = await fixture(),
      otherSession = randomUUID();
    expect(
      await transport().parents.observeParent({
        ownerId: f.q.ownerId,
        authSessionId: otherSession,
        verifiedAt: f.now,
        authExpiresAt: f.identity.expiresAt,
      }),
    ).toMatchObject({ protocol: 2, revoked: false });
    f.identity.sessionId = otherSession;
    const before = await snapshot(),
      h = verifier(f);
    expect(await h.verify(f.request)).toBeNull();
    expect(requests(h.t)).toHaveLength(1);
    expect(requests(h.t)[0]!.authSessionId).toBe(otherSession);
    expect(requests(h.t)[0]!.authorityFingerprint).toBe(f.q.authorityFingerprint);
    await preserved(before, f.q.ownerId);
  });
});
