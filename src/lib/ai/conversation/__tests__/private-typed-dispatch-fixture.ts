// Local-only synthetic auth.sessions fixture; never authenticates a real user.
import { readFile } from "node:fs/promises";
import {
  createPrivateTypedSpendFixture,
  type PrivateSpendApproval,
} from "./private-typed-spend-fixture";

export async function createPrivateTypedDispatchFixture(enginePath: string) {
  const base = await createPrivateTypedSpendFixture(enginePath);
  try {
    await base.db
      .exec(`CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz);
      REVOKE ALL ON auth.sessions FROM PUBLIC,anon,authenticated,service_role;`);
    await base.db.exec(
      await readFile("docs/pilot/conversation/sql-drafts/private-typed-dispatch.sql", "utf8"),
    );
    const types: Record<string, string> = {
      p_approval: "uuid",
      p_owner: "uuid",
      p_session: "uuid",
      p_thread: "uuid",
      p_revision: "bigint",
      p_request: "uuid",
      p_manifest: "text",
      p_payload: "text",
      p_provider: "text",
      p_model: "text",
      p_tier: "text",
      p_max_micros: "bigint",
      p_approval_expires_at: "timestamptz",
      p_dispatch_id: "uuid",
      p_auth_verified_at: "timestamptz",
      p_auth_expires_at: "timestamptz",
      p_eligibility_expires_at: "timestamptz",
      p_response_id: "text",
      p_evidence_sha256: "text",
      p_charged_micros: "bigint",
    };
    async function seedSession(
      a: Pick<PrivateSpendApproval, "authSessionId" | "ownerId">,
      notAfter: string | null = null,
    ) {
      await base.db.query(
        "INSERT INTO auth.sessions(id,user_id,not_after) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING;",
        [a.authSessionId, a.ownerId, notAfter],
      );
    }
    async function seedApproval(overrides: Partial<PrivateSpendApproval> = {}) {
      const a = await base.seedApproval(overrides);
      await seedSession(a);
      return a;
    }
    async function rpc(
      name: string,
      args: Record<string, unknown>,
      role: "anon" | "authenticated" | "service_role" = "service_role",
    ) {
      if (["bfa_private_text_spend_claim", "bfa_private_text_spend_settle"].includes(name))
        return base.rpc(name, args, role);
      if (
        ![
          "bfa_private_text_spend_claim_dispatch",
          "bfa_private_text_spend_read",
          "bfa_private_text_spend_dispatch",
          "bfa_private_text_spend_settle_dispatched",
          "bfa_private_text_spend_finish",
        ].includes(name)
      )
        throw new Error("Unknown dispatch fixture RPC");
      const entries = Object.entries(args);
      if (!entries.length || entries.some(([key]) => !Object.hasOwn(types, key)))
        throw new Error("Unknown dispatch fixture argument");
      return base.asRole(
        role,
        async () =>
          (
            await base.one(
              `SELECT public.${name}(${entries.map(([key], i) => `${key} => $${i + 1}::${types[key]}`).join(",")}) AS result;`,
              entries.map(([, value]) => value),
            )
          ).result,
      );
    }
    return { ...base, seedSession, seedApproval, rpc };
  } catch (error) {
    await base.close();
    throw error;
  }
}
