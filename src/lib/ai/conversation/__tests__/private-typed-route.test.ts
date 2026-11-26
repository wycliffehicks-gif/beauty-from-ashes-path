import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  createPrivateTypedRequestAuth,
  readPrivateTypedBearer,
} from "../staging/private-typed-auth.server";
import {
  createStagingPrivateTypedProvider,
  privateTypedMode,
  selectPrivateTypedMaterial,
} from "../staging/private-typed-runtime.server";
import { stagingOperation } from "../staging/adapter.server";
import { stagingInput } from "../staging/input";
import * as dispatchProvider from "../service/private-typed-dispatch.server";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: vi.fn(() => {
      throw new Error("Unexpected privileged RPC");
    }),
  },
}));
const owner = "e731f7ba-88bd-4b5c-a13d-7de91af2d16f";
const session = "916c9096-9223-4eec-ab0d-fd8682b214e2";
const other = "fe70e0fd-9438-432f-aaac-54708d65fbe8";
const thread = "709c3077-63d8-494c-97c4-f160d8089688";
const request = "0cc961ea-2b83-4918-85d5-b1af0de6ec6f";
const token = "fictional.request.bound";
const start = Date.UTC(2026, 10, 26, 12);
function authFixture() {
  let at = start;
  let claims: Record<string, unknown> = {
    sub: owner,
    session_id: session,
    exp: (start + 120000) / 1000,
  };
  let userId = owner,
    claimsError: unknown = null,
    userError: unknown = null;
  let afterClaims = () => {},
    afterUser = () => {};
  const getClaims = vi.fn(async (value: string) => {
    expect(value).toBe(token);
    afterClaims();
    return { data: { claims: { ...claims } }, error: claimsError };
  });
  const getUser = vi.fn(async (value: string) => {
    expect(value).toBe(token);
    afterUser();
    return { data: { user: { id: userId } }, error: userError };
  });
  const client = { auth: { getClaims, getUser } } as unknown as SupabaseClient<Database>;
  const original = { ...claims };
  return {
    client,
    original,
    getClaims,
    getUser,
    now: () => at,
    setTime: (value: number) => {
      at = value;
    },
    setClaims: (value: Record<string, unknown>) => {
      claims = value;
    },
    setUser: (value: string) => {
      userId = value;
    },
    setClaimsError: () => {
      claimsError = { message: "unavailable" };
    },
    setUserError: () => {
      userError = { message: "unavailable" };
    },
    onClaims: (callback: () => void) => {
      afterClaims = callback;
    },
    onUser: (callback: () => void) => {
      afterUser = callback;
    },
  };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("request-bound private typed Auth", () => {
  it("retains the pre-await start and exact original token across fresh verification", async () => {
    const f = authFixture();
    f.onClaims(() => f.setTime(start + 20));
    f.onUser(() => f.setTime(start + 45));
    const result = await createPrivateTypedRequestAuth(f.client, f.original, token, f.now);
    expect(result?.initialAuth).toEqual({
      ownerId: owner,
      authSessionId: session,
      verifiedAt: start,
      expiresAt: start + 120000,
    });
    expect(f.getClaims).toHaveBeenCalledTimes(1);
    expect(f.getUser).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(result)).toBe(true);
  });
  it.each([
    {},
    { sub: owner, exp: (start + 1000) / 1000 },
    { sub: owner, session_id: session, exp: NaN },
    { sub: owner, session_id: session, exp: 1.5 },
  ])("refuses missing or unsafe middleware claims %#", async (claims) => {
    const f = authFixture();
    expect(await createPrivateTypedRequestAuth(f.client, claims, token, f.now)).toBeNull();
    expect(f.getClaims).not.toHaveBeenCalled();
  });
  it.each(["owner", "session", "expired"])(
    "rejects changed %s in verified claims",
    async (kind) => {
      const f = authFixture();
      f.setClaims({
        ...f.original,
        ...(kind === "owner"
          ? { sub: other }
          : kind === "session"
            ? { session_id: other }
            : { exp: start / 1000 }),
      });
      expect(await createPrivateTypedRequestAuth(f.client, f.original, token, f.now)).toBeNull();
      expect(f.getUser).not.toHaveBeenCalled();
    },
  );
  it("does not treat a JWT check as current user verification", async () => {
    const f = authFixture();
    f.setUserError();
    expect(await createPrivateTypedRequestAuth(f.client, f.original, token, f.now)).toBeNull();
    expect(f.getClaims).toHaveBeenCalledOnce();
    expect(f.getUser).toHaveBeenCalledOnce();
  });
  it("denies changed current user", async () => {
    const f = authFixture();
    f.setUser(other);
    expect(await createPrivateTypedRequestAuth(f.client, f.original, token, f.now)).toBeNull();
  });
  it("stops before user lookup if claim verification fails", async () => {
    const f = authFixture();
    f.setClaimsError();
    expect(await createPrivateTypedRequestAuth(f.client, f.original, token, f.now)).toBeNull();
    expect(f.getUser).not.toHaveBeenCalled();
  });
  it.each(["claims", "user"])(
    "rejects the exact 30-second boundary after %s wait",
    async (wait) => {
      const f = authFixture();
      (wait === "claims" ? f.onClaims : f.onUser)(() => f.setTime(start + 30000));
      expect(await createPrivateTypedRequestAuth(f.client, f.original, token, f.now)).toBeNull();
    },
  );
  it.each([start - 1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe/backward local observation %s",
    async (value) => {
      const f = authFixture();
      f.onClaims(() => f.setTime(value));
      expect(await createPrivateTypedRequestAuth(f.client, f.original, token, f.now)).toBeNull();
    },
  );
  it("later claim observations can shorten but never extend the original deadline", async () => {
    const f = authFixture();
    const auth = (await createPrivateTypedRequestAuth(f.client, f.original, token, f.now))!;
    f.setTime(start + 100);
    f.setClaims({ ...f.original, exp: (start + 60000) / 1000 });
    expect((await auth.readAuth())?.expiresAt).toBe(start + 60000);
    f.setTime(start + 200);
    f.setClaims({ ...f.original, exp: (start + 240000) / 1000 });
    expect((await auth.readAuth())?.expiresAt).toBe(start + 60000);
    expect(auth.initialAuth.verifiedAt).toBe(start);
    f.setTime(start + 60000);
    expect(await auth.readAuth()).toBeNull();
  });
  it("separate request-owned readers do not share time or identity state", async () => {
    const a = authFixture(),
      b = authFixture();
    const [first, second] = await Promise.all([
      createPrivateTypedRequestAuth(a.client, a.original, token, a.now),
      createPrivateTypedRequestAuth(b.client, b.original, token, b.now),
    ]);
    a.setTime(start - 1);
    expect(await first!.readAuth()).toBeNull();
    expect(await second!.readAuth()).toEqual(second!.initialAuth);
  });
  it.each([
    null,
    "Basic value",
    "Bearer one.two",
    "Bearer one.two.three.four",
    "Bearer one.two.three trailing",
    "bearer one.two.three",
  ])("rejects non-exact original bearer form %#", (value) => {
    const headers = new Headers();
    if (value) headers.set("authorization", value);
    expect(readPrivateTypedBearer(headers)).toBeNull();
  });
  it("extracts only the actual request bearer", () =>
    expect(readPrivateTypedBearer(new Headers({ Authorization: `Bearer ${token}` }))).toBe(token));
});

const material = {
  approval: {
    approvalId: other,
    ownerId: owner,
    authSessionId: session,
    threadId: thread,
    revision: 2,
    requestId: request,
    manifestSha256: "a".repeat(64),
    payloadSha256: "b".repeat(64),
    maxMicros: 9500,
  },
  manifestBytes: JSON.stringify({
    model: "gpt-6-luna",
    maxInputBytes: 64000,
    maxOutputTokens: 64,
    deadlineMs: 4000,
  }),
  priceSnapshotBytes: "{}",
};
const binding = {
  ownerId: owner,
  authSessionId: session,
  threadId: thread,
  revision: 2,
  requestId: request,
};
describe("private route selection and trusted material lookup", () => {
  it("pins selected server material across waits without pinning unrelated entries", () => {
    vi.stubEnv("BFA_PRIVATE_TYPED_SEND_ENABLED", "true");
    const registry = (materials: unknown[]) =>
      vi.stubEnv(
        "BFA_PRIVATE_TYPED_SEND_MATERIALS_JSON",
        JSON.stringify({ version: 1, materials }),
      );
    registry([material]);
    const factory = vi
      .spyOn(dispatchProvider, "createPrivateTypedDispatchProvider")
      .mockReturnValue(null);
    createStagingPrivateTypedProvider(
      {
        initialAuth: {
          ownerId: owner,
          authSessionId: session,
          verifiedAt: start,
          expiresAt: start + 120000,
        },
        readAuth: vi.fn(async () => null),
      },
      {
        ownerId: owner,
        threadId: thread,
        revision: 2,
        requestId: request,
        envelopeExpiresAt: start + 60000,
        readAllowlistExpiresAt: () => start + 60000,
      },
    );
    expect(factory).toHaveBeenCalledOnce();
    const enabled = factory.mock.calls[0]![0].enabled;
    expect(enabled()).toBe(true);
    registry([{ ...material, approval: { ...material.approval, requestId: other } }, material]);
    expect(enabled()).toBe(true);
    registry([]);
    expect(enabled()).toBe(false);
    registry([material, material]);
    expect(enabled()).toBe(false);
    registry([{ ...material, priceSnapshotBytes: "{ }" }]);
    expect(enabled()).toBe(false);
    registry([{ ...material, approval: { ...material.approval, maxMicros: 9501 } }]);
    expect(enabled()).toBe(false);
    registry([material]);
    vi.stubEnv("BFA_PRIVATE_TYPED_SEND_ENABLED", "false");
    expect(enabled()).toBe(false);
  });
  it.each([undefined, "false", "true", "TRUE", "1", ""])(
    "has exact server selection semantics for %s",
    (value) => {
      vi.stubEnv("BFA_PRIVATE_TYPED_SEND_ENABLED", value);
      expect(privateTypedMode()).toBe(
        value === undefined || value === "false"
          ? "mock"
          : value === "true"
            ? "private"
            : "invalid",
      );
    },
  );
  it("selects one exact server-owned association, without authorizing its unhashed example", () => {
    expect(
      selectPrivateTypedMaterial(JSON.stringify({ version: 1, materials: [material] }), binding),
    ).toEqual({
      material,
      limits: { model: "gpt-6-luna", maxInputBytes: 64000, maxOutputTokens: 64, deadlineMs: 4000 },
    });
  });
  it.each([
    undefined,
    "",
    "{}",
    "not-json",
    JSON.stringify({ version: 1, materials: [] }),
    JSON.stringify({ version: 1, materials: [material, material] }),
    JSON.stringify({ version: 1, materials: [material], enable: true }),
  ])("refuses absent, duplicate or malformed registries %#", (raw) =>
    expect(selectPrivateTypedMaterial(raw, binding)).toBeNull(),
  );
  it.each(["ownerId", "authSessionId", "threadId", "revision", "requestId"] as const)(
    "rejects a mismatched %s",
    (key) => {
      expect(
        selectPrivateTypedMaterial(JSON.stringify({ version: 1, materials: [material] }), {
          ...binding,
          [key]: key === "revision" ? 3 : other,
        }),
      ).toBeNull();
    },
  );
  it.each([undefined, "false", "TRUE"])(
    "explicit private-append never falls back under disabled/invalid %s",
    async (flag) => {
      vi.stubEnv("BFA_PRIVATE_TYPED_SEND_ENABLED", flag);
      const f = authFixture();
      await expect(stagingOperation({ action: "private-append" }, f.client)).rejects.toThrow();
      expect(f.getUser).not.toHaveBeenCalled();
    },
  );
  it("ordinary append cannot bypass private Auth when private mode is selected", async () => {
    vi.stubEnv("BFA_PRIVATE_TYPED_SEND_ENABLED", "true");
    const f = authFixture();
    await expect(stagingOperation({ action: "append" }, f.client)).rejects.toThrow();
    expect(f.getUser).not.toHaveBeenCalled();
  });
  it("private selection never opens a voice path", async () => {
    vi.stubEnv("BFA_PRIVATE_TYPED_SEND_ENABLED", "true");
    const f = authFixture();
    await expect(stagingOperation({ action: "voice" }, f.client)).rejects.toThrow();
    expect(f.getUser).not.toHaveBeenCalled();
  });
  it.each(["ownerId", "authSessionId", "approval", "manifestBytes", "apiKey", "dispatchId"])(
    "browser cannot supply %s as authority",
    (key) =>
      expect(stagingInput.safeParse({ action: "private-append", [key]: "forged" }).success).toBe(
        false,
      ),
  );
});
