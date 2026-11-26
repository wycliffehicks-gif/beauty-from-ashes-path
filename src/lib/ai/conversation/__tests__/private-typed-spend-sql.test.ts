// Actual disposable PostgreSQL/PGlite; fictional server Auth/grant/receipt data.
// These cases are not native concurrency, live Auth, pricing or provider evidence.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPrivateTypedSpendFixture,
  privateSpendBaseArgs,
  privateSpendClaimArgs,
  privateSpendDigest,
  type PrivateSpendApproval,
} from "./private-typed-spend-fixture";

const engine = process.env.BFA_PGLITE_MODULE;
const suite = engine ? describe : describe.skip;
const CLAIM = "bfa_private_text_spend_claim";
const SETTLE = "bfa_private_text_spend_settle";

suite("inactive single-send private typed monetary SQL", () => {
  let f: Awaited<ReturnType<typeof createPrivateTypedSpendFixture>>;
  beforeAll(async () => {
    f = await createPrivateTypedSpendFixture(engine!);
  }, 60000);
  afterAll(async () => {
    if (f) await f.close();
  });
  const claim = (a: PrivateSpendApproval, extra: Record<string, unknown> = {}) =>
    f.rpc(CLAIM, { ...privateSpendClaimArgs(a), ...extra });
  const settlement = (a: PrivateSpendApproval, extra: Record<string, unknown> = {}) => ({
    ...privateSpendBaseArgs(a),
    p_response_id: `resp/${a.requestId}`,
    p_evidence_sha256: privateSpendDigest(a.requestId),
    p_charged_micros: 167,
    ...extra,
  });
  const row = async (a: PrivateSpendApproval) =>
    f.one("SELECT * FROM bfa_private_text_spend.approvals WHERE approval_id=$1;", [a.approvalId]);

  it("installs with no approval or funding and exact service-only functions", async () => {
    expect((await f.one("SELECT count(*) AS n FROM bfa_private_text_spend.approvals;")).n).toBe(0);
    const functions = (
      await f.db.query(
        "SELECT p.proname,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'bfa_private_text_spend_%' ORDER BY p.proname;",
      )
    ).rows;
    expect(functions).toHaveLength(2);
    for (const func of functions) {
      expect(func.prosecdef).toBe(true);
      expect(func.proconfig).toEqual(["search_path=pg_catalog"]);
    }
  });

  it("claims once and holds the entire ceiling indefinitely without a receipt", async () => {
    const a = await f.seedApproval();
    expect(await claim(a)).toBe(true);
    const held = await row(a);
    expect(held.state).toBe("held");
    expect(held.max_micros).toBe(9112);
    expect(held.charged_micros).toBeNull();
    expect(held.response_sha256).toBeNull();
    expect(await claim(a)).toBe(false);
    await f.db.query(
      "UPDATE public.bfa_p3b_staging_accounts SET admitted=false WHERE user_id=$1;",
      [a.ownerId],
    );
    expect(await claim(a)).toBe(false);
    expect(await row(a)).toEqual(held);
  });

  const mismatches: [string, unknown][] = [
    ["p_approval", randomUUID()],
    ["p_owner", randomUUID()],
    ["p_session", randomUUID()],
    ["p_thread", randomUUID()],
    ["p_revision", 1],
    ["p_request", randomUUID()],
    ["p_manifest", privateSpendDigest()],
    ["p_payload", privateSpendDigest()],
    ["p_provider", "foreign"],
    ["p_model", "other-model"],
    ["p_tier", "priority"],
    ["p_max_micros", 9113],
    ["p_approval_expires_at", "2100-01-01T00:00:00Z"],
  ];
  it.each(mismatches)(
    "rejects mismatched or null immutable %s without mutation",
    async (key, value) => {
      const a = await f.seedApproval();
      const before = await row(a);
      expect(await claim(a, { [key]: value })).toBe(false);
      expect(await claim(a, { [key]: null })).toBe(false);
      expect(await row(a)).toEqual(before);
      expect(await claim(a)).toBe(true);
      const held = await row(a);
      expect(await f.rpc(SETTLE, settlement(a, { [key]: value }))).toBe(false);
      expect(await f.rpc(SETTLE, settlement(a, { [key]: null }))).toBe(false);
      expect(await row(a)).toEqual(held);
    },
  );

  it("never uses a second approval to replay the same request identity", async () => {
    const a = await f.seedApproval();
    expect(await claim(a)).toBe(true);
    await expect(f.seedApproval({ requestId: a.requestId })).rejects.toMatchObject({
      code: "23505",
    });
    expect(await claim(a)).toBe(false);
  });

  const gates = [
    "revoked",
    "approval-expired",
    "allowlist-closed",
    "allowlist-expired",
    "allowlist-missing",
    "thread-missing",
    "thread-deleted",
    "thread-revised",
    "thread-foreign",
  ] as const;
  it.each(gates)("denies current gate %s without creating a hold", async (gate) => {
    const a = await f.seedApproval();
    if (gate === "revoked")
      await f.db.query(
        "UPDATE bfa_private_text_spend.approvals SET revoked=true WHERE approval_id=$1;",
        [a.approvalId],
      );
    if (gate === "approval-expired") {
      a.approvalExpiresAt = new Date(Date.now() - 1000).toISOString();
      await f.db.query(
        "UPDATE bfa_private_text_spend.approvals SET expires_at=$2 WHERE approval_id=$1;",
        [a.approvalId, a.approvalExpiresAt],
      );
    }
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
    if (gate === "allowlist-missing")
      await f.db.query("DELETE FROM public.bfa_p3b_staging_accounts WHERE user_id=$1;", [
        a.ownerId,
      ]);
    if (gate === "thread-missing")
      await f.db.query("DELETE FROM public.bfa_p3b_threads WHERE id=$1;", [a.threadId]);
    if (gate === "thread-deleted")
      await f.db.query(
        "UPDATE public.bfa_p3b_threads SET deleted_at=clock_timestamp() WHERE id=$1;",
        [a.threadId],
      );
    if (gate === "thread-revised")
      await f.db.query("UPDATE public.bfa_p3b_threads SET revision=revision+1 WHERE id=$1;", [
        a.threadId,
      ]);
    if (gate === "thread-foreign")
      await f.db.query("UPDATE public.bfa_p3b_threads SET owner_id=$2 WHERE id=$1;", [
        a.threadId,
        randomUUID(),
      ]);
    const before = await row(a);
    expect(await claim(a)).toBe(false);
    expect(await row(a)).toEqual(before);
  });

  it.each([
    ["missing verification", "p_auth_verified_at", null],
    ["infinite verification", "p_auth_verified_at", "infinity"],
    ["future verification", "p_auth_verified_at", "2100-01-01T00:00:00Z"],
    ["missing expiry", "p_auth_expires_at", null],
    ["infinite expiry", "p_auth_expires_at", "infinity"],
    ["expired identity", "p_auth_expires_at", "2000-01-01T00:00:00Z"],
  ])("denies %s", async (_name, key, value) => {
    const a = await f.seedApproval();
    const before = await row(a);
    expect(await claim(a, { [key as string]: value })).toBe(false);
    expect(await row(a)).toEqual(before);
  });
  it("enforces strict verification age below 30 seconds at the database clock", async () => {
    const a = await f.seedApproval();
    const old = await f.one("SELECT clock_timestamp()-interval '30 seconds' AS old;");
    expect(await claim(a, { p_auth_verified_at: old.old })).toBe(false);
    expect((await row(a)).state).toBe("approved");
  });

  it.each([0, 9112])(
    "settles a real-shaped receipt at %s micro-USD exactly once",
    async (charge) => {
      const a = await f.seedApproval();
      expect(await claim(a)).toBe(true);
      const args = settlement(a, {
        p_charged_micros: charge,
        p_response_id: `resp/${a.requestId}/${"a".repeat(158)}`,
      });
      expect((args.p_response_id as string).length).toBe(200);
      expect(await f.rpc(SETTLE, args)).toBe(true);
      const settled = await row(a);
      expect(settled.state).toBe("settled");
      expect(settled.charged_micros).toBe(charge);
      expect(settled.response_sha256).toBe(privateSpendDigest(`openai:${args.p_response_id}`));
      expect(await f.rpc(SETTLE, args)).toBe(true);
      expect(await row(a)).toEqual(settled);
      expect(await claim(a)).toBe(false);
    },
  );

  it("accepts slash and 129-character provider IDs without UUID substitution", async () => {
    const a = await f.seedApproval();
    expect(await claim(a)).toBe(true);
    const response = `resp/${"b".repeat(124)}`;
    expect(response.length).toBe(129);
    expect(await f.rpc(SETTLE, settlement(a, { p_response_id: response }))).toBe(true);
    expect((await row(a)).response_sha256).toBe(privateSpendDigest(`openai:${response}`));
  });
  it("rejects changed receipt, changed evidence or changed charge after settlement", async () => {
    const a = await f.seedApproval();
    expect(await claim(a)).toBe(true);
    expect(await f.rpc(SETTLE, settlement(a))).toBe(true);
    const settled = await row(a);
    for (const extra of [
      { p_response_id: "resp/changed" },
      { p_evidence_sha256: privateSpendDigest() },
      { p_charged_micros: 168 },
    ])
      expect(await f.rpc(SETTLE, settlement(a, extra))).toBe(false);
    expect(await row(a)).toEqual(settled);
  });
  it("does not consume the same provider receipt for another funded approval", async () => {
    const a = await f.seedApproval();
    const b = await f.seedApproval();
    expect(await claim(a)).toBe(true);
    expect(await claim(b)).toBe(true);
    expect(await f.rpc(SETTLE, settlement(a, { p_response_id: "resp/shared-id" }))).toBe(true);
    const held = await row(b);
    expect(await f.rpc(SETTLE, settlement(b, { p_response_id: "resp/shared-id" }))).toBe(false);
    expect(await row(b)).toEqual(held);
  });

  it.each([
    ["negative charge", { p_charged_micros: -1 }],
    ["over reserve", { p_charged_micros: 9113 }],
    ["null charge", { p_charged_micros: null }],
    ["missing ID", { p_response_id: null }],
    ["empty ID", { p_response_id: "" }],
    ["overlong ID", { p_response_id: "x".repeat(201) }],
    ["malformed ID", { p_response_id: "resp\nwrong" }],
    ["null evidence", { p_evidence_sha256: null }],
    ["malformed evidence", { p_evidence_sha256: "F".repeat(64) }],
  ])("retains full hold on %s", async (_name, extra) => {
    const a = await f.seedApproval();
    expect(await claim(a)).toBe(true);
    const held = await row(a);
    expect(await f.rpc(SETTLE, settlement(a, extra as Record<string, unknown>))).toBe(false);
    expect(await row(a)).toEqual(held);
  });
  it("refuses settlement before any claim", async () => {
    const a = await f.seedApproval();
    const before = await row(a);
    expect(await f.rpc(SETTLE, settlement(a))).toBe(false);
    expect(await row(a)).toEqual(before);
  });
  it("permits exact later reconciliation after withdrawal and thread tombstone", async () => {
    const a = await f.seedApproval();
    expect(await claim(a)).toBe(true);
    await f.db.query(
      "UPDATE bfa_private_text_spend.approvals SET revoked=true WHERE approval_id=$1;",
      [a.approvalId],
    );
    await f.db.query("DELETE FROM public.bfa_p3b_staging_accounts WHERE user_id=$1;", [a.ownerId]);
    await f.db.query(
      "UPDATE public.bfa_p3b_threads SET deleted_at=clock_timestamp(),revision=revision+1 WHERE id=$1;",
      [a.threadId],
    );
    expect(await claim(a)).toBe(false);
    expect(await f.rpc(SETTLE, settlement(a))).toBe(true);
  });
  it("preserves every P3b row and existing fictional accounting through claim/settlement", async () => {
    const a = await f.seedApproval();
    await f.db.query(
      "UPDATE public.bfa_p3b_threads SET saved_snapshot=$2::jsonb,saved_at=clock_timestamp(),saved_revision=0 WHERE id=$1;",
      [a.threadId, JSON.stringify({ syntheticPrivate: "never selected by spend RPC" })],
    );
    await f.db.query(
      "INSERT INTO public.bfa_p3b_allowances(owner_id,mode,remaining_units,reservation_units) VALUES($1,'text',7,1);",
      [a.ownerId],
    );
    const snapshot = async () => {
      const result: Record<string, unknown> = {};
      for (const name of ["staging_accounts", "threads", "allowances", "admissions"])
        result[name] = (
          await f.one(
            `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM public.bfa_p3b_${name} t;`,
          )
        ).rows;
      return result;
    };
    const before = await snapshot();
    expect(await claim(a)).toBe(true);
    expect(await f.rpc(SETTLE, settlement(a))).toBe(true);
    expect(await snapshot()).toEqual(before);
  });

  it.each(["anon", "authenticated", "service_role"] as const)(
    "denies %s direct private table access",
    async (role) => {
      for (const sql of [
        "SELECT * FROM bfa_private_text_spend.approvals;",
        "DELETE FROM bfa_private_text_spend.approvals;",
        "UPDATE bfa_private_text_spend.approvals SET revoked=false;",
        "INSERT INTO bfa_private_text_spend.approvals DEFAULT VALUES;",
      ])
        await expect(f.asRole(role, () => f.db.exec(sql))).rejects.toMatchObject({ code: "42501" });
    },
  );
  it.each(["anon", "authenticated"] as const)(
    "denies %s both state-changing RPCs",
    async (role) => {
      const a = await f.seedApproval();
      await expect(f.rpc(CLAIM, privateSpendClaimArgs(a), role)).rejects.toMatchObject({
        code: "42501",
      });
      await expect(f.rpc(SETTLE, settlement(a), role)).rejects.toMatchObject({ code: "42501" });
      expect((await row(a)).state).toBe("approved");
    },
  );
});
