// Actual isolated PGlite SQL. Auth sessions, funding and receipts are fictional;
// this suite establishes no hosted Auth or provider acceptance.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrivateTypedDispatchFixture } from "./private-typed-dispatch-fixture";
import {
  privateSpendBaseArgs,
  privateSpendClaimArgs,
  privateSpendDigest,
  type PrivateSpendApproval,
} from "./private-typed-spend-fixture";

const engine = process.env.BFA_PGLITE_MODULE;
const suite = engine ? describe : describe.skip;
const prefix = "bfa_private_text_spend_";
type Ack = {
  state: string;
  dispatchId: string | null;
  binding: Record<string, unknown>;
  currentRevision: number;
  checkedAt: number;
  verifiedAt: number;
  verificationExpiresAt: number;
  identityExpiresAt: number;
  allowlistExpiresAt: number;
  effectiveExpiresAt: number;
  dispatchMarkedAt: number | null;
  settlementEvidenceSha256: string | null;
  finishedRevision: number | null;
  protocol: number;
};

suite("inactive one-use typed dispatch and conditional finish SQL", () => {
  let f: Awaited<ReturnType<typeof createPrivateTypedDispatchFixture>>;
  beforeAll(async () => {
    f = await createPrivateTypedDispatchFixture(engine!);
  }, 60000);
  afterAll(async () => {
    if (f) await f.close();
  });
  const args = (
    a: PrivateSpendApproval,
    dispatchId: string | null,
    extra: Record<string, unknown> = {},
  ) => ({
    ...privateSpendBaseArgs(a),
    p_dispatch_id: dispatchId,
    p_auth_verified_at: a.authVerifiedAt,
    p_auth_expires_at: a.authExpiresAt,
    p_eligibility_expires_at: a.approvalExpiresAt,
    ...extra,
  });
  const receipt = (a: PrivateSpendApproval, id: string, extra: Record<string, unknown> = {}) => ({
    ...privateSpendBaseArgs(a),
    p_dispatch_id: id,
    p_response_id: `resp/${a.requestId}`,
    p_evidence_sha256: privateSpendDigest(a.requestId),
    p_charged_micros: 167,
    ...extra,
  });
  const finish = (a: PrivateSpendApproval, id: string, extra: Record<string, unknown> = {}) =>
    f.rpc(
      prefix + "finish",
      args(a, id, { p_evidence_sha256: privateSpendDigest(a.requestId), ...extra }),
    );
  const dispatchRow = async (a: PrivateSpendApproval) =>
    (
      await f.db.query("SELECT * FROM bfa_private_text_spend.dispatches WHERE approval_id=$1;", [
        a.approvalId,
      ])
    ).rows[0] ?? null;
  const approvalRow = (a: PrivateSpendApproval) =>
    f.one("SELECT * FROM bfa_private_text_spend.approvals WHERE approval_id=$1;", [a.approvalId]);
  const thread = (a: PrivateSpendApproval) =>
    f.one("SELECT * FROM public.bfa_p3b_threads WHERE id=$1;", [a.threadId]);
  async function held(overrides: Partial<PrivateSpendApproval> = {}) {
    const a = await f.seedApproval(overrides);
    expect(await f.rpc(prefix + "claim_dispatch", privateSpendClaimArgs(a))).toBe(true);
    return a;
  }
  async function marked(overrides: Partial<PrivateSpendApproval> = {}) {
    const a = await held(overrides);
    const id = randomUUID();
    const ack = (await f.rpc(prefix + "dispatch", args(a, id))) as Ack;
    expect(ack?.state).toBe("dispatched");
    return { a, id, ack };
  }

  it("installs empty sidecar without changing old settlement privileges", async () => {
    expect((await f.one("SELECT count(*) AS n FROM bfa_private_text_spend.dispatches;")).n).toBe(0);
    expect(
      (
        await f.one(
          "SELECT has_function_privilege('service_role','public.bfa_private_text_spend_settle(uuid,uuid,uuid,uuid,bigint,uuid,text,text,text,text,text,bigint,timestamptz,text,text,bigint)','EXECUTE') AS permitted;",
        )
      ).permitted,
    ).toBe(true);
  });
  it("returns exact content-free binding and fresh bounded observation, no dispatch", async () => {
    const a = await held();
    const before = await approvalRow(a);
    const r = (await f.rpc(prefix + "read", args(a, null))) as Ack;
    expect(r).toMatchObject({
      protocol: 1,
      dispatchId: null,
      state: "held",
      currentRevision: 0,
      dispatchMarkedAt: null,
      settlementEvidenceSha256: null,
      finishedRevision: null,
    });
    expect(r.binding).toEqual({
      approvalId: a.approvalId,
      ownerId: a.ownerId,
      authSessionId: a.authSessionId,
      threadId: a.threadId,
      threadRevision: 0,
      requestId: a.requestId,
      manifestSha256: a.manifestSha256,
      payloadSha256: a.payloadSha256,
      provider: a.provider,
      model: a.model,
      tier: a.tier,
      maxMicros: a.maxMicros,
      approvalExpiresAt: Date.parse(a.approvalExpiresAt),
    });
    expect(r.verificationExpiresAt).toBe(r.verifiedAt + 30000);
    for (const value of [
      r.checkedAt,
      r.verifiedAt,
      r.verificationExpiresAt,
      r.identityExpiresAt,
      r.allowlistExpiresAt,
      r.effectiveExpiresAt,
    ])
      expect(Number.isSafeInteger(value)).toBe(true);
    expect(r.effectiveExpiresAt).toBeLessThanOrEqual(Date.parse(a.authExpiresAt));
    expect(await approvalRow(a)).toEqual(before);
    expect(await dispatchRow(a)).toBeNull();
  });
  it("requires a held approval and never manufactures one", async () => {
    const a = await f.seedApproval();
    const id = randomUUID();
    expect(await f.rpc(prefix + "read", args(a, null))).toBeNull();
    expect(await f.rpc(prefix + "dispatch", args(a, id))).toBeNull();
    expect(await f.rpc(prefix + "settle_dispatched", receipt(a, id))).toBe(false);
    expect(await finish(a, id)).toBeNull();
    expect((await approvalRow(a)).state).toBe("approved");
  });
  it("does not adopt a legacy hold or disturb its old settlement", async () => {
    const a = await f.seedApproval();
    const id = randomUUID();
    expect(await f.rpc(prefix + "claim", privateSpendClaimArgs(a))).toBe(true);
    expect(await f.rpc(prefix + "claim_dispatch", privateSpendClaimArgs(a))).toBe(false);
    expect(await f.rpc(prefix + "read", args(a, null))).toBeNull();
    expect(await f.rpc(prefix + "dispatch", args(a, id))).toBeNull();
    const { p_dispatch_id: unused, ...oldReceipt } = receipt(a, id);
    void unused;
    expect(await f.rpc(prefix + "settle", oldReceipt)).toBe(true);
    expect(await dispatchRow(a)).toBeNull();
  });
  it("new claim denies a deleted session without creating an old hold", async () => {
    const a = await f.seedApproval();
    await f.db.query("DELETE FROM auth.sessions WHERE id=$1;", [a.authSessionId]);
    const before = await approvalRow(a);
    expect(await f.rpc(prefix + "claim_dispatch", privateSpendClaimArgs(a))).toBe(false);
    expect(await approvalRow(a)).toEqual(before);
    expect(
      (
        await f.one(
          "SELECT count(*) AS n FROM bfa_private_text_spend.holds WHERE approval_id=$1;",
          [a.approvalId],
        )
      ).n,
    ).toBe(0);
  });
  it.each(["allowlist", "session"] as const)(
    "retains original %s expiry when extended before the first held read",
    async (gate) => {
      const a = await f.seedApproval();
      const original = new Date(Date.now() + 10000).toISOString();
      if (gate === "allowlist")
        await f.db.query(
          "UPDATE public.bfa_p3b_staging_accounts SET expires_at=$2 WHERE user_id=$1;",
          [a.ownerId, original],
        );
      else
        await f.db.query("UPDATE auth.sessions SET not_after=$2 WHERE id=$1;", [
          a.authSessionId,
          original,
        ]);
      expect(await f.rpc(prefix + "claim_dispatch", privateSpendClaimArgs(a))).toBe(true);
      if (gate === "allowlist")
        await f.db.query(
          "UPDATE public.bfa_p3b_staging_accounts SET expires_at=clock_timestamp()+interval '1 hour' WHERE user_id=$1;",
          [a.ownerId],
        );
      else
        await f.db.query("UPDATE auth.sessions SET not_after=NULL WHERE id=$1;", [a.authSessionId]);
      const first = (await f.rpc(prefix + "read", args(a, null))) as Ack;
      expect(first.effectiveExpiresAt).toBe(Date.parse(original));
      const marked = (await f.rpc(prefix + "dispatch", args(a, randomUUID()))) as Ack;
      expect(marked.effectiveExpiresAt).toBe(Date.parse(original));
    },
  );
  it("fresh observations cannot restart the original held verification window", async () => {
    const original = new Date(Date.now() - 27000).toISOString();
    const a = await held({ authVerifiedAt: original });
    const m = await marked({ authVerifiedAt: original });
    await f.db.exec("SELECT pg_sleep(3.15);");
    const fresh = { p_auth_verified_at: new Date().toISOString() };
    expect(await f.rpc(prefix + "read", args(a, null, fresh))).toBeNull();
    expect(await f.rpc(prefix + "dispatch", args(a, randomUUID(), fresh))).toBeNull();
    expect(await f.rpc(prefix + "settle_dispatched", receipt(m.a, m.id))).toBe(true);
    expect(await finish(m.a, m.id, fresh)).toBeNull();
    expect((await thread(m.a)).revision).toBe(0);
  }, 10000);
  it("creates exactly one marker, with no repeat or replacement identity", async () => {
    const { a, id, ack } = await marked();
    const before = await dispatchRow(a);
    expect(ack.dispatchId).toBe(id);
    expect(ack.currentRevision).toBe(0);
    expect(await f.rpc(prefix + "dispatch", args(a, id))).toBeNull();
    expect(await f.rpc(prefix + "dispatch", args(a, randomUUID()))).toBeNull();
    expect(await f.rpc(prefix + "read", args(a, null))).toBeNull();
    expect(await f.rpc(prefix + "read", args(a, randomUUID()))).toBeNull();
    expect(((await f.rpc(prefix + "read", args(a, id))) as Ack).state).toBe("dispatched");
    expect(await dispatchRow(a)).toEqual(before);
    expect((await approvalRow(a)).state).toBe("held");
  });
  it("refuses a globally reused dispatch identity without marking another approval", async () => {
    const { id } = await marked();
    const a = await held();
    expect(await f.rpc(prefix + "dispatch", args(a, id))).toBeNull();
    expect(await dispatchRow(a)).toBeNull();
    expect((await approvalRow(a)).state).toBe("held");
  });
  it("rejects every altered or null base binding at read, dispatch, settle and finish", async () => {
    const a = await held();
    const id = randomUUID();
    const wrong: Record<string, unknown> = {
      p_approval: randomUUID(),
      p_owner: randomUUID(),
      p_session: randomUUID(),
      p_thread: randomUUID(),
      p_revision: 1,
      p_request: randomUUID(),
      p_manifest: privateSpendDigest(),
      p_payload: privateSpendDigest(),
      p_provider: "other",
      p_model: "other",
      p_tier: "priority",
      p_max_micros: 9999,
      p_approval_expires_at: "2100-01-01T00:00:00Z",
    };
    for (const [key, value] of Object.entries(wrong))
      for (const v of [value, null]) {
        expect(await f.rpc(prefix + "read", args(a, null, { [key]: v }))).toBeNull();
        expect(await f.rpc(prefix + "dispatch", args(a, id, { [key]: v }))).toBeNull();
      }
    expect(((await f.rpc(prefix + "dispatch", args(a, id))) as Ack).state).toBe("dispatched");
    for (const [key, value] of Object.entries(wrong))
      for (const v of [value, null])
        expect(await f.rpc(prefix + "settle_dispatched", receipt(a, id, { [key]: v }))).toBe(false);
    expect(await f.rpc(prefix + "settle_dispatched", receipt(a, id))).toBe(true);
    for (const [key, value] of Object.entries(wrong))
      for (const v of [value, null]) expect(await finish(a, id, { [key]: v })).toBeNull();
    expect((await thread(a)).revision).toBe(0);
  });

  const gates = [
    "revoked",
    "allowlist-closed",
    "allowlist-expired",
    "thread-revised",
    "thread-deleted",
    "thread-foreign",
    "session-missing",
    "session-foreign",
    "session-expired",
    "session-infinite",
  ] as const;
  async function change(a: PrivateSpendApproval, gate: (typeof gates)[number]) {
    if (gate === "revoked")
      await f.db.query(
        "UPDATE bfa_private_text_spend.approvals SET revoked=true WHERE approval_id=$1;",
        [a.approvalId],
      );
    if (gate === "allowlist-closed")
      await f.db.query(
        "UPDATE public.bfa_p3b_staging_accounts SET admitted=false WHERE user_id=$1;",
        [a.ownerId],
      );
    if (gate === "allowlist-expired")
      await f.db.query(
        "UPDATE public.bfa_p3b_staging_accounts SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id=$1;",
        [a.ownerId],
      );
    if (gate === "thread-revised")
      await f.db.query("UPDATE public.bfa_p3b_threads SET revision=revision+1 WHERE id=$1;", [
        a.threadId,
      ]);
    if (gate === "thread-deleted")
      await f.db.query(
        "UPDATE public.bfa_p3b_threads SET deleted_at=clock_timestamp() WHERE id=$1;",
        [a.threadId],
      );
    if (gate === "thread-foreign")
      await f.db.query("UPDATE public.bfa_p3b_threads SET owner_id=$2 WHERE id=$1;", [
        a.threadId,
        randomUUID(),
      ]);
    if (gate === "session-missing")
      await f.db.query("DELETE FROM auth.sessions WHERE id=$1;", [a.authSessionId]);
    if (gate === "session-foreign")
      await f.db.query("UPDATE auth.sessions SET user_id=$2 WHERE id=$1;", [
        a.authSessionId,
        randomUUID(),
      ]);
    if (gate === "session-expired")
      await f.db.query(
        "UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=$1;",
        [a.authSessionId],
      );
    if (gate === "session-infinite")
      await f.db.query("UPDATE auth.sessions SET not_after='infinity' WHERE id=$1;", [
        a.authSessionId,
      ]);
  }
  it.each(gates)("denies dispatch and finish after %s, retaining settlement", async (gate) => {
    const a = await held();
    await change(a, gate);
    expect(await f.rpc(prefix + "read", args(a, null))).toBeNull();
    expect(await f.rpc(prefix + "dispatch", args(a, randomUUID()))).toBeNull();
    expect(await dispatchRow(a)).toBeNull();
    expect((await approvalRow(a)).state).toBe("held");
    const m = await marked();
    await change(m.a, gate);
    const before = await thread(m.a);
    expect(await f.rpc(prefix + "settle_dispatched", receipt(m.a, m.id))).toBe(true);
    expect(await f.rpc(prefix + "read", args(m.a, m.id))).toBeNull();
    expect(await finish(m.a, m.id)).toBeNull();
    expect(await thread(m.a)).toEqual(before);
    expect((await dispatchRow(m.a))?.finished_at).toBeNull();
    expect((await approvalRow(m.a)).state).toBe("settled");
  });
  it.each([
    ["p_auth_verified_at", null],
    ["p_auth_verified_at", "infinity"],
    ["p_auth_verified_at", "2100-01-01T00:00:00Z"],
    ["p_auth_verified_at", "2000-01-01T00:00:00Z"],
    ["p_auth_expires_at", null],
    ["p_auth_expires_at", "infinity"],
    ["p_auth_expires_at", "2000-01-01T00:00:00Z"],
    ["p_eligibility_expires_at", null],
    ["p_eligibility_expires_at", "infinity"],
    ["p_eligibility_expires_at", "2000-01-01T00:00:00Z"],
  ])("denies invalid temporal %s=%s", async (key, value) => {
    const a = await held();
    const extra = { [key as string]: value };
    expect(await f.rpc(prefix + "read", args(a, null, extra))).toBeNull();
    expect(await f.rpc(prefix + "dispatch", args(a, randomUUID(), extra))).toBeNull();
    const m = await marked();
    expect(await f.rpc(prefix + "settle_dispatched", receipt(m.a, m.id))).toBe(true);
    expect(await finish(m.a, m.id, extra)).toBeNull();
    expect((await thread(m.a)).revision).toBe(0);
  });
  it("pins the shortest marked lifecycle ceiling despite later session and caller renewal", async () => {
    const a = await held();
    const limit = new Date(Date.now() + 10000).toISOString();
    await f.db.query("UPDATE auth.sessions SET not_after=$2 WHERE id=$1;", [
      a.authSessionId,
      limit,
    ]);
    const id = randomUUID();
    const first = (await f.rpc(prefix + "dispatch", args(a, id))) as Ack;
    expect(first.effectiveExpiresAt).toBe(Date.parse(limit));
    await f.db.query("UPDATE auth.sessions SET not_after=NULL WHERE id=$1;", [a.authSessionId]);
    const later = (await f.rpc(
      prefix + "read",
      args(a, id, {
        p_auth_expires_at: "2100-01-01T00:00:00Z",
        p_eligibility_expires_at: "2100-01-01T00:00:00Z",
      }),
    )) as Ack;
    expect(later.effectiveExpiresAt).toBe(first.effectiveExpiresAt);
    const shortened = new Date(Date.now() + 5000).toISOString();
    const shorter = (await f.rpc(
      prefix + "read",
      args(a, id, { p_eligibility_expires_at: shortened }),
    )) as Ack;
    expect(shorter.effectiveExpiresAt).toBe(Date.parse(shortened));
  });
  it("never rounds a microsecond expiry ceiling upward", async () => {
    const a = await held();
    const exact = new Date(Date.now() + 10000).toISOString().replace(/Z$/, "456Z");
    await f.db.query("UPDATE auth.sessions SET not_after=$2 WHERE id=$1;", [
      a.authSessionId,
      exact,
    ]);
    const r = (await f.rpc(prefix + "read", args(a, null))) as Ack;
    expect(r.effectiveExpiresAt).toBe(Date.parse(exact));
  });
  it("settles and finishes once, changes only current revision, then protects the finished association", async () => {
    const { a, id } = await marked();
    const before = await thread(a);
    expect(await finish(a, id)).toBeNull();
    expect(await f.rpc(prefix + "settle_dispatched", receipt(a, id))).toBe(true);
    const settled = await dispatchRow(a);
    expect(await f.rpc(prefix + "settle_dispatched", receipt(a, id))).toBe(true);
    expect(await dispatchRow(a)).toEqual(settled);
    expect(await finish(a, id, { p_evidence_sha256: privateSpendDigest() })).toBeNull();
    const done = (await finish(a, id)) as Ack;
    expect(done).toMatchObject({
      state: "finished",
      currentRevision: 1,
      finishedRevision: 1,
      settlementEvidenceSha256: privateSpendDigest(a.requestId),
    });
    expect(await thread(a)).toEqual({ ...before, revision: 1 });
    expect(await finish(a, id)).toBeNull();
    expect(((await f.rpc(prefix + "read", args(a, id))) as Ack).state).toBe("finished");
    await f.db.query("UPDATE public.bfa_p3b_threads SET revision=revision+1 WHERE id=$1;", [
      a.threadId,
    ]);
    expect(await f.rpc(prefix + "read", args(a, id))).toBeNull();
    expect(await f.rpc(prefix + "settle_dispatched", receipt(a, id))).toBe(true);
  });
  it("old settlement alone confers neither post-marker send nor finish rights", async () => {
    const { a, id } = await marked();
    const r = receipt(a, id);
    const { p_dispatch_id: unused, ...legacy } = r;
    void unused;
    expect(await f.rpc(prefix + "settle", legacy)).toBe(true);
    const old = await approvalRow(a);
    expect(await f.rpc(prefix + "read", args(a, id))).toBeNull();
    expect(await finish(a, id)).toBeNull();
    expect((await dispatchRow(a))?.evidence_sha256).toBeNull();
    expect(await f.rpc(prefix + "settle_dispatched", r)).toBe(true);
    expect(await approvalRow(a)).toEqual(old);
    expect(((await finish(a, id)) as Ack).state).toBe("finished");
  });
  it("does not accept foreign dispatch or altered settlement evidence", async () => {
    const { a, id } = await marked();
    const heldRow = await approvalRow(a);
    expect(await f.rpc(prefix + "settle_dispatched", receipt(a, randomUUID()))).toBe(false);
    expect(await approvalRow(a)).toEqual(heldRow);
    expect(await f.rpc(prefix + "settle_dispatched", receipt(a, id))).toBe(true);
    const settled = await dispatchRow(a);
    for (const extra of [
      { p_evidence_sha256: privateSpendDigest() },
      { p_response_id: "resp/foreign" },
      { p_charged_micros: 168 },
    ])
      expect(await f.rpc(prefix + "settle_dispatched", receipt(a, id, extra))).toBe(false);
    expect(await dispatchRow(a)).toEqual(settled);
  });
  it("two independently funded same-revision replies can settle but advance only once", async () => {
    const first = await marked();
    const second = await marked({
      ownerId: first.a.ownerId,
      authSessionId: first.a.authSessionId,
      threadId: first.a.threadId,
    });
    expect(await f.rpc(prefix + "settle_dispatched", receipt(first.a, first.id))).toBe(true);
    expect(await f.rpc(prefix + "settle_dispatched", receipt(second.a, second.id))).toBe(true);
    expect(((await finish(first.a, first.id)) as Ack).finishedRevision).toBe(1);
    expect(await finish(second.a, second.id)).toBeNull();
    expect((await thread(first.a)).revision).toBe(1);
    expect((await approvalRow(second.a)).state).toBe("settled");
  });
  it.each(["anon", "authenticated", "service_role"] as const)(
    "denies %s private sidecar and helper access",
    async (role) => {
      await expect(
        f.asRole(role, () => f.db.exec("SELECT * FROM bfa_private_text_spend.dispatches;")),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        f.asRole(role, () => f.db.exec("SELECT bfa_private_text_spend.ack(NULL,NULL,NULL);")),
      ).rejects.toMatchObject({ code: "42501" });
    },
  );
  it.each(["anon", "authenticated"] as const)(
    "denies %s all five new public RPCs",
    async (role) => {
      const a = await held();
      const id = randomUUID();
      await expect(
        f.rpc(prefix + "claim_dispatch", privateSpendClaimArgs(a), role),
      ).rejects.toMatchObject({ code: "42501" });
      for (const name of ["read", "dispatch"])
        await expect(f.rpc(prefix + name, args(a, id), role)).rejects.toMatchObject({
          code: "42501",
        });
      await expect(f.rpc(prefix + "settle_dispatched", receipt(a, id), role)).rejects.toMatchObject(
        { code: "42501" },
      );
      await expect(
        f.rpc(
          prefix + "finish",
          args(a, id, { p_evidence_sha256: privateSpendDigest(a.requestId) }),
          role,
        ),
      ).rejects.toMatchObject({ code: "42501" });
    },
  );
  it("fails closed if the required supported Auth schema is absent", async () => {
    const a = await held();
    await f.db.exec("ALTER TABLE auth.sessions RENAME COLUMN not_after TO unsupported;");
    try {
      await expect(f.rpc(prefix + "read", args(a, null))).rejects.toMatchObject({ code: "42703" });
    } finally {
      await f.db.exec("ALTER TABLE auth.sessions RENAME COLUMN unsupported TO not_after;");
    }
    expect(await dispatchRow(a)).toBeNull();
    expect((await approvalRow(a)).state).toBe("held");
  });
});
