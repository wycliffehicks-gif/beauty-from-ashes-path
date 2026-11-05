import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createVoiceV2AuthorityVerifier,
  type VoiceV2AuthorityVerificationPorts,
} from "../service/voice-v2-authority-verifier.server";
import { ConversationService } from "../service/service";
import { fingerprint, seal, type Envelope } from "../staging/seal.server";
import type { VoiceV2CurrentQuery } from "../service/voice-v2-current-rpc.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";
const INCARNATION = "33333333-3333-4333-8333-333333333333";
const ATTEMPT = "44444444-4444-4444-8444-444444444444";
const APPROVAL = "55555555-5555-4555-8555-555555555555";
const SESSION = "66666666-6666-4666-8666-666666666666";
const OTHER = "77777777-7777-4777-8777-777777777777";
const NOW = 1_800_000_000_000;
const SECRET = "fictional-local-v2-verifier-only-secret";

async function fixture() {
  const state = { now: NOW };
  const service = new ConversationService({ verifiedOwnerId: OWNER });
  service.ensureThread(THREAD, false);
  service.recordNotSent(THREAD, "fictional-unsent", "private writing never returned");
  const envelope: Envelope = {
    owner: OWNER,
    thread: THREAD,
    revision: 7,
    expires: NOW + 60_000,
    authority: service.exportAuthority(THREAD),
  };
  const token = await seal(envelope);
  const request = {
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 7,
    attemptId: ATTEMPT,
    activeAuthority: token,
  };
  const identity = { ownerId: OWNER, sessionId: SESSION, expiresAt: NOW + 80_000 };
  const parent = {
    protocol: 2,
    ownerId: OWNER,
    authSessionId: SESSION,
    parentVersion: 4,
    revoked: false,
  };
  const owned = {
    ownerId: OWNER,
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 7,
  };
  const current = {
    ...owned,
    deleted: false,
    allowlist: { ownerId: OWNER, admitted: true, expiresAt: NOW + 70_000 },
    authority: {
      ...owned,
      fingerprint: await fingerprint(token),
      issuedAt: NOW - 1000,
      expiresAt: NOW + 60_000,
      revoked: false,
    },
    approval: {
      ...owned,
      id: APPROVAL,
      digest: "a".repeat(64),
      scope: "developer-voice-session",
      attemptId: ATTEMPT,
      expiresAt: NOW + 50_000,
      revoked: false,
    },
  };
  const events: string[] = [];
  const counts: Record<string, number> = {};
  const hooks = new Map<string, () => void | Promise<void>>();
  const overrides = new Map<string, unknown>();
  const queries: VoiceV2CurrentQuery[] = [];
  const returned: unknown[] = [];
  async function reply(name: string, result: unknown) {
    const key = `${name}:${(counts[name] = (counts[name] ?? 0) + 1)}`;
    events.push(key);
    await hooks.get(key)?.();
    const value = overrides.has(key) ? overrides.get(key) : result;
    returned.push(value);
    return value;
  }
  const ports: VoiceV2AuthorityVerificationPorts = {
    now: vi.fn(() => state.now),
    authenticate: vi.fn(() => reply("auth", structuredClone(identity))),
    readParent: vi.fn(() => reply("parent", structuredClone(parent))),
    readCurrent: vi.fn((query) => {
      queries.push(query);
      return reply("current", {
        protocol: 2,
        request: structuredClone(query),
        current: structuredClone(current),
      });
    }),
  };
  return {
    state,
    service,
    envelope,
    token,
    request,
    identity,
    parent,
    current,
    events,
    hooks,
    overrides,
    queries,
    returned,
    ports,
    create: () => createVoiceV2AuthorityVerifier(ports),
  };
}
function setPath(value: object, path: string, next: unknown) {
  const keys = path.split(".");
  let target = value as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
  target[keys.at(-1)!] = next;
}

describe("P5 inactive v2 authority verifier: real local crypto, fictional Auth and current reads", () => {
  beforeEach(() => {
    vi.stubEnv("BFA_P3B_STATE_SECRET", SECRET);
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns frozen content-free explicit v2 evidence with conservative original time", async () => {
    const f = await fixture();
    const verifier = f.create();
    expect(f.events).toEqual([]);
    const evidence = await verifier.verifyCurrent(f.request);
    expect(evidence).toEqual({
      protocol: 2,
      binding: {
        ownerId: OWNER,
        threadId: THREAD,
        threadIncarnation: INCARNATION,
        threadRevision: 7,
        attemptId: ATTEMPT,
        approvalId: APPROVAL,
        approvalDigest: "a".repeat(64),
        scope: "developer-voice-session",
      },
      authSessionId: SESSION,
      parentVersion: 4,
      authorityFingerprint: f.current.authority.fingerprint,
      issuedAt: NOW - 1000,
      issuanceExpiresAt: NOW + 60_000,
      envelopeExpiresAt: NOW + 60_000,
      verifiedAt: NOW,
      verificationExpiresAt: NOW + 30_000,
      identityExpiresAt: NOW + 80_000,
      allowlistExpiresAt: NOW + 70_000,
      authorityExpiresAt: NOW + 60_000,
      approvalExpiresAt: NOW + 50_000,
      effectiveExpiresAt: NOW + 30_000,
    });
    expect(f.events).toEqual([
      "auth:1",
      "parent:1",
      "auth:2",
      "parent:2",
      "current:1",
      "auth:3",
      "parent:3",
      "current:2",
      "auth:4",
      "parent:4",
      "current:3",
    ]);
    expect(Object.isFrozen(verifier)).toBe(true);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence!.binding)).toBe(true);
    expect(f.queries.every(Object.isFrozen)).toBe(true);
    const text = JSON.stringify(evidence);
    for (const hidden of [
      f.token,
      SECRET,
      "private writing",
      "activeAuthority",
      'authority":{',
      "credentials",
    ])
      expect(text).not.toContain(hidden);
    f.current.approval.digest = "b".repeat(64);
    f.identity.expiresAt = NOW + 1;
    expect(evidence!.binding.approvalDigest).toBe("a".repeat(64));
    expect(evidence!.identityExpiresAt).toBe(NOW + 80_000);
  });

  it("anchors the original verification start before delayed Auth and carries it in both full queries", async () => {
    const f = await fixture();
    f.hooks.set("auth:1", () => {
      f.state.now += 12_000;
    });
    const evidence = await f.create().verifyCurrent(f.request);
    expect(evidence?.verifiedAt).toBe(NOW);
    expect(evidence?.verificationExpiresAt).toBe(NOW + 30_000);
    expect(f.queries.map((query) => query.verifiedAt)).toEqual([NOW, NOW, NOW]);
  });

  it("keeps the shortest fresh Auth/allowlist/approval ceilings without rewriting original issuance", async () => {
    const f = await fixture();
    f.identity.expiresAt = NOW + 24_000;
    f.current.allowlist.expiresAt = NOW + 22_000;
    f.current.approval.expiresAt = NOW + 20_000;
    f.hooks.set("current:1", () => {
      f.identity.expiresAt = NOW + 100_000;
      f.current.allowlist.expiresAt = NOW + 110_000;
      f.current.approval.expiresAt = NOW + 120_000;
    });
    const evidence = await f.create().verifyCurrent(f.request);
    expect(evidence).toMatchObject({
      identityExpiresAt: NOW + 24_000,
      allowlistExpiresAt: NOW + 22_000,
      approvalExpiresAt: NOW + 20_000,
      effectiveExpiresAt: NOW + 20_000,
      issuanceExpiresAt: NOW + 60_000,
      envelopeExpiresAt: NOW + 60_000,
    });
    expect(f.queries.map((query) => query.identityExpiresAt)).toEqual([
      NOW + 24_000,
      NOW + 24_000,
      NOW + 24_000,
    ]);
  });

  it("shortens effective eligibility when final same-session Auth is shorter than immutable issuance", async () => {
    const f = await fixture();
    f.overrides.set("auth:4", { ...f.identity, expiresAt: NOW + 5000 });
    expect(await f.create().verifyCurrent(f.request)).toMatchObject({
      identityExpiresAt: NOW + 5000,
      effectiveExpiresAt: NOW + 5000,
      issuanceExpiresAt: NOW + 60_000,
      envelopeExpiresAt: NOW + 60_000,
    });
  });

  it("accepts an originally shorter registered issuance but never extends it to the seal deadline", async () => {
    const f = await fixture();
    f.current.authority.expiresAt = NOW + 12_000;
    expect(await f.create().verifyCurrent(f.request)).toMatchObject({
      authorityExpiresAt: NOW + 12_000,
      effectiveExpiresAt: NOW + 12_000,
      issuanceExpiresAt: NOW + 12_000,
      envelopeExpiresAt: NOW + 60_000,
    });
  });

  it.each(["now", "authenticate", "readParent", "readCurrent"] as const)(
    "requires captured trusted port %s",
    async (key) => {
      const f = await fixture();
      expect(() =>
        createVoiceV2AuthorityVerifier({
          ...f.ports,
          [key]: null,
        } as unknown as VoiceV2AuthorityVerificationPorts),
      ).toThrow("voice-v2-authority-verification-unavailable");
      expect(f.events).toEqual([]);
    },
  );

  it.each([
    { protocol: 2 },
    { ownerId: OWNER },
    { authSessionId: SESSION },
    { parentVersion: 4 },
    { verifiedAt: NOW },
    { threadId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
    { threadId: "00000000-0000-0000-0000-000000000000" },
    { threadRevision: -1 },
    { threadRevision: 7.5 },
    { activeAuthority: "" },
    { activeAuthority: "x".repeat(350_001) },
  ])("rejects caller authority or malformed request before Auth: %j", async (change) => {
    const f = await fixture();
    expect(await f.create().verifyCurrent({ ...f.request, ...change })).toBeNull();
    expect(f.events).toEqual([]);
  });

  it("rejects request accessors, hidden/symbol fields, prototypes and extra JS arguments", async () => {
    const f = await fixture();
    const getter = vi.fn(() => f.token);
    const accessor = { ...f.request };
    Object.defineProperty(accessor, "activeAuthority", { enumerable: true, get: getter });
    const hidden = { ...f.request };
    Object.defineProperty(hidden, "private", { value: true });
    const inherited = Object.assign(Object.create({ extra: true }) as object, f.request);
    for (const bad of [accessor, hidden, inherited, { ...f.request, [Symbol("extra")]: true }])
      expect(await f.create().verifyCurrent(bad)).toBeNull();
    const verifier = f.create();
    expect(await Reflect.apply(verifier.verifyCurrent, verifier, [f.request, true])).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    expect(f.events).toEqual([]);
  });

  it.each(["auth:1", "auth:2", "auth:3", "auth:4"])(
    "denies missing/changed/nonexact Auth at %s",
    async (stage) => {
      for (const identity of [
        null,
        { ownerId: OTHER, sessionId: SESSION, expiresAt: NOW + 80_000 },
        { ownerId: OWNER, sessionId: OTHER, expiresAt: NOW + 80_000 },
        { ownerId: OWNER, sessionId: SESSION, expiresAt: NOW + 80_000, verified: true },
      ]) {
        const f = await fixture();
        // At initial Auth a different owner fails the exact parent association;
        // a different session similarly cannot adopt the already-bound issuance.
        f.overrides.set(stage, identity);
        expect(await f.create().verifyCurrent(f.request)).toBeNull();
      }
    },
  );

  it.each(["parent:1", "parent:2", "parent:3", "parent:4"])(
    "rejects missing/revoked/foreign/legacy parent at %s",
    async (stage) => {
      for (const change of [
        null,
        { protocol: 1 },
        { revoked: true },
        { ownerId: OTHER },
        { authSessionId: OTHER },
        { parentVersion: 5 },
        { expiresAt: NOW + 60_000 },
      ]) {
        const f = await fixture();
        if (stage === "parent:1" && change?.parentVersion === 5) {
          // An existing clear version is pinned initially; current echo cannot
          // claim a different one later. This changed first parent fails later.
          f.overrides.set("parent:2", f.parent);
        }
        f.overrides.set(stage, change === null ? null : { ...f.parent, ...change });
        expect(await f.create().verifyCurrent(f.request)).toBeNull();
      }
    },
  );

  it.each(["current:1", "current:2", "current:3"])(
    "requires the full v2 receipt and exact every-field query echo at %s",
    async (stage) => {
      for (const field of [
        "protocol",
        "ownerId",
        "authSessionId",
        "parentVersion",
        "threadId",
        "attemptId",
        "authorityFingerprint",
        "verifiedAt",
        "identityExpiresAt",
      ]) {
        const f = await fixture();
        f.hooks.set(stage, () => {
          const request = { ...f.queries.at(-1)! };
          const value = request[field as keyof typeof request];
          Object.assign(request, {
            [field]:
              typeof value === "number"
                ? value + 1
                : field === "authorityFingerprint"
                  ? "b".repeat(64)
                  : OTHER,
          });
          f.overrides.set(stage, { protocol: 2, request, current: f.current });
        });
        expect(await f.create().verifyCurrent(f.request)).toBeNull();
      }
      for (const mode of ["null", "peeled", "legacy", "extra"]) {
        const f = await fixture();
        f.hooks.set(stage, () => {
          f.overrides.set(
            stage,
            mode === "null"
              ? null
              : mode === "peeled"
                ? f.current
                : {
                    protocol: mode === "legacy" ? 1 : 2,
                    request: f.queries.at(-1),
                    current: f.current,
                    ...(mode === "extra" ? { usable: true } : {}),
                  },
          );
        });
        expect(await f.create().verifyCurrent(f.request)).toBeNull();
      }
    },
  );

  it.each([
    ["ownerId", OTHER],
    ["threadId", OTHER],
    ["threadIncarnation", OTHER],
    ["threadRevision", 8],
    ["deleted", true],
    ["allowlist.ownerId", OTHER],
    ["allowlist.admitted", false],
    ["allowlist.expiresAt", NOW],
    ["authority.ownerId", OTHER],
    ["authority.threadId", OTHER],
    ["authority.threadIncarnation", OTHER],
    ["authority.threadRevision", 8],
    ["authority.fingerprint", "b".repeat(64)],
    ["authority.issuedAt", NOW + 1],
    ["authority.expiresAt", NOW + 60_001],
    ["authority.revoked", true],
    ["approval.ownerId", OTHER],
    ["approval.threadId", OTHER],
    ["approval.threadIncarnation", OTHER],
    ["approval.threadRevision", 8],
    ["approval.attemptId", OTHER],
    ["approval.scope", "participant-voice"],
    ["approval.revoked", true],
    ["approval.expiresAt", NOW],
  ] as const)("rejects foreign/stale current field %s", async (path, value) => {
    const f = await fixture();
    setPath(f.current, path, value);
    expect(await f.create().verifyCurrent(f.request)).toBeNull();
  });

  it.each([
    ["authority.issuedAt", NOW - 999],
    ["authority.expiresAt", NOW + 59_999],
    ["approval.id", OTHER],
    ["approval.digest", "b".repeat(64)],
  ] as const)(
    "never adopts changed immutable issuance or exact approval %s after a wait",
    async (path, value) => {
      const f = await fixture();
      f.hooks.set("current:1", () => setPath(f.current, path, value));
      expect(await f.create().verifyCurrent(f.request)).toBeNull();
    },
  );

  it("requires original authority lifetime to be positive and at most fifteen minutes", async () => {
    for (const issuedAt of [NOW + 60_000, NOW - 840_001]) {
      const f = await fixture();
      f.current.authority.issuedAt = issuedAt;
      expect(await f.create().verifyCurrent(f.request)).toBeNull();
    }
    const f = await fixture();
    f.current.authority.issuedAt = NOW - 840_000;
    expect(await f.create().verifyCurrent(f.request)).not.toBeNull();
  });

  it.each([
    "auth:1",
    "parent:1",
    "auth:2",
    "parent:2",
    "current:1",
    "auth:3",
    "parent:3",
    "current:2",
    "auth:4",
    "parent:4",
    "current:3",
  ])("denies exact 30000ms age at %s without resetting time or retrying", async (stage) => {
    const f = await fixture();
    f.hooks.set(stage, () => {
      f.state.now = NOW + 30_000;
    });
    expect(await f.create().verifyCurrent(f.request)).toBeNull();
    expect(f.events.at(-1)).toBe(stage);
    expect(f.events.filter((event) => event === stage)).toHaveLength(1);
  });

  it("accepts 29999ms original age and rejects exactly observed deadlines", async () => {
    const f = await fixture();
    f.hooks.set("auth:4", () => {
      f.state.now = NOW + 29_999;
    });
    expect(await f.create().verifyCurrent(f.request)).not.toBeNull();
    for (const source of ["auth", "allowlist", "approval", "issuance"]) {
      const g = await fixture();
      if (source === "auth") g.identity.expiresAt = NOW + 10_000;
      if (source === "allowlist") g.current.allowlist.expiresAt = NOW + 10_000;
      if (source === "approval") g.current.approval.expiresAt = NOW + 10_000;
      if (source === "issuance") g.current.authority.expiresAt = NOW + 10_000;
      g.hooks.set("current:2", () => {
        g.state.now = NOW + 10_000;
      });
      expect(await g.create().verifyCurrent(g.request)).toBeNull();
    }
  });

  it.each([NOW - 1, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "denies unsafe/backward local clock %s after protected wait",
    async (value) => {
      const f = await fixture();
      f.hooks.set("current:1", () => {
        f.state.now = value;
      });
      expect(await f.create().verifyCurrent(f.request)).toBeNull();
      expect(f.events.at(-1)).toBe("current:1");
    },
  );

  it("rejects unsafe initial and overflowing freshness clocks before Auth", async () => {
    for (const value of [-1, Number.NaN, Number.MAX_SAFE_INTEGER]) {
      const f = await fixture();
      f.state.now = value;
      expect(await f.create().verifyCurrent(f.request)).toBeNull();
      expect(f.events).toEqual([]);
    }
  });

  it.each(["auth:1", "parent:1", "current:1", "auth:4"])(
    "sanitizes errors at %s and never falls back/retries",
    async (stage) => {
      const f = await fixture();
      f.hooks.set(stage, () => {
        throw new Error(`${f.token} ${SECRET} private text`);
      });
      expect(await f.create().verifyCurrent(f.request)).toBeNull();
      expect(f.events.at(-1)).toBe(stage);
      expect(f.events.filter((event) => event === stage)).toHaveLength(1);
    },
  );

  it.each([
    "tamper",
    "wrong-key",
    "missing-key",
    "foreign-owner",
    "foreign-thread",
    "wrong-revision",
    "expired-seal",
  ])("rejects actual local crypto failure %s before current eligibility", async (mode) => {
    const f = await fixture();
    if (mode === "tamper") f.request.activeAuthority = `${f.token.slice(0, -3)}aaa`;
    if (mode === "wrong-key") vi.stubEnv("BFA_P3B_STATE_SECRET", "another-fictional-key");
    if (mode === "missing-key") vi.stubEnv("BFA_P3B_STATE_SECRET", "");
    if (mode === "foreign-owner")
      f.request.activeAuthority = await seal({ ...f.envelope, owner: OTHER });
    if (mode === "foreign-thread")
      f.request.activeAuthority = await seal({ ...f.envelope, thread: OTHER });
    if (mode === "wrong-revision")
      f.request.activeAuthority = await seal({ ...f.envelope, revision: 8 });
    if (mode === "expired-seal")
      f.request.activeAuthority = await seal({ ...f.envelope, expires: NOW });
    expect(await f.create().verifyCurrent(f.request)).toBeNull();
    expect(f.queries).toEqual([]);
  });

  it("does not accept another legitimate seal for the same outer identity without its exact registered HMAC", async () => {
    const f = await fixture();
    f.request.activeAuthority = await seal(f.envelope);
    expect(f.request.activeAuthority).not.toBe(f.token);
    expect(await f.create().verifyCurrent(f.request)).toBeNull();
    expect(f.queries[0].authorityFingerprint).not.toBe(f.current.authority.fingerprint);
  });
});
