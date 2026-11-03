import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import { createVoiceV2AuthorityIssuer } from "../service/voice-v2-issuance.server";
import type {
  VoiceV2IssuanceReceipt,
  VoiceV2IssuanceRegistration,
  VoiceV2ParentObservationQuery,
  VoiceV2ParentReceipt,
} from "../service/voice-v2-parent-issuance-rpc.server";
import type {
  VoiceV2GenerationReceipt,
  VoiceV2GenerationRegistration,
} from "../service/voice-v2-preissue-rpc.server";
import { fingerprint, unseal } from "../staging/seal.server";

const OWNER = "d1111111-1111-4111-8111-111111111111";
const SESSION = "d2222222-2222-4222-8222-222222222222";
const THREAD = "d3333333-3333-4333-8333-333333333333";
const INCARNATION = "d4444444-4444-4444-8444-444444444444";
const OTHER = "d5555555-5555-4555-8555-555555555555";
const NOW = 1_900_000_000_000;
const CREATED = "2030-03-17T17:46:00.123456Z";
type Ports = Parameters<typeof createVoiceV2AuthorityIssuer>[0];
type Input = Parameters<ReturnType<typeof createVoiceV2AuthorityIssuer>["issue"]>[0];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture() {
  const service = new ConversationService({ verifiedOwnerId: OWNER });
  service.ensureThread(THREAD, false);
  const input: Input = { service, threadId: THREAD, threadRevision: 2, sourceCreatedAt: CREATED };
  const state = {
    now: NOW,
    identity: { ownerId: OWNER, sessionId: SESSION, expiresAt: NOW + 120_000 },
    parent: {
      protocol: 2,
      ownerId: OWNER,
      authSessionId: SESSION,
      parentVersion: 4,
      revoked: false,
    } as VoiceV2ParentReceipt | null,
    current: {
      protocol: 2 as const,
      ownerId: OWNER,
      authSessionId: SESSION,
      parentVersion: 4,
      threadId: THREAD,
      threadRevision: 2,
      sourceCreatedAt: CREATED,
      threadIncarnation: null as string | null,
      deleted: false as const,
      allowlist: { ownerId: OWNER, admitted: true as const, expiresAt: NOW + 80_000 },
    },
    issuance: null as VoiceV2IssuanceReceipt | null,
  };
  const events: string[] = [];
  const hooks = new Map<string, () => void | Promise<void>>();
  const replies = new Map<string, unknown>();
  const parentRequests: VoiceV2ParentObservationQuery[] = [];
  const generationRequests: VoiceV2GenerationRegistration[] = [];
  const issuanceRequests: VoiceV2IssuanceRegistration[] = [];
  const returned = {
    parent: null as unknown,
    generation: null as unknown,
    issuance: null as unknown,
  };
  async function visit(name: string) {
    events.push(name);
    const key = `${name}:${events.filter((entry) => entry === name).length}`;
    await hooks.get(key)?.();
    return key;
  }
  function reply(key: string, value: unknown) {
    return replies.has(key) ? replies.get(key) : value;
  }
  const ports: { -readonly [K in keyof Ports]: Ports[K] } = {
    maxAuthorityAgeMs: 60_000,
    now() {
      return state.now;
    },
    async authenticate() {
      const key = await visit("auth");
      return reply(key, structuredClone(state.identity));
    },
    async readParent(query) {
      expect(Object.isFrozen(query)).toBe(true);
      expect(query).toEqual({ ownerId: OWNER, authSessionId: SESSION });
      const key = await visit("parent-read");
      return reply(key, structuredClone(state.parent));
    },
    async observeParent(query) {
      expect(Object.isFrozen(query)).toBe(true);
      parentRequests.push(query);
      if (!state.parent) {
        state.parent = {
          protocol: 2,
          ownerId: OWNER,
          authSessionId: SESSION,
          parentVersion: 0,
          revoked: false,
        };
      }
      const ack = structuredClone(state.parent);
      returned.parent = ack;
      const key = await visit("parent-write");
      return reply(key, ack);
    },
    async readCurrentThread(query) {
      expect(Object.isFrozen(query)).toBe(true);
      expect(query).toMatchObject({
        ownerId: OWNER,
        authSessionId: SESSION,
        threadId: THREAD,
        verifiedAt: NOW,
      });
      const key = await visit("current");
      return reply(key, structuredClone(state.current));
    },
    async registerGeneration(query) {
      expect(Object.isFrozen(query)).toBe(true);
      generationRequests.push(query);
      state.current.threadIncarnation ??= INCARNATION;
      const ack = structuredClone(state.current) as VoiceV2GenerationReceipt;
      returned.generation = ack;
      const key = await visit("generation");
      return reply(key, ack);
    },
    async registerIssuance(query) {
      expect(Object.isFrozen(query)).toBe(true);
      issuanceRequests.push(query);
      const ack: VoiceV2IssuanceReceipt = {
        protocol: 2,
        ownerId: query.ownerId,
        authSessionId: query.authSessionId,
        parentVersion: query.parentVersion,
        threadId: query.threadId,
        threadIncarnation: query.threadIncarnation,
        threadRevision: query.threadRevision,
        authorityFingerprint: query.authorityFingerprint,
        issuedAt: query.issuedAt,
        expiresAt: query.expiresAt,
        revoked: false,
      };
      state.issuance = structuredClone(ack);
      returned.issuance = ack;
      const key = await visit("issuance");
      return reply(key, ack);
    },
    async readIssuance(query) {
      expect(Object.isFrozen(query)).toBe(true);
      expect(query).toEqual({
        ownerId: OWNER,
        authSessionId: SESSION,
        parentVersion: state.current.parentVersion,
        authorityFingerprint: issuanceRequests[0]?.authorityFingerprint,
      });
      const key = await visit("issuance-read");
      return reply(key, structuredClone(state.issuance));
    },
  };
  return {
    service,
    input,
    state,
    ports,
    events,
    hooks,
    replies,
    parentRequests,
    generationRequests,
    issuanceRequests,
    returned,
    create: () => createVoiceV2AuthorityIssuer(ports),
  };
}

beforeEach(() => {
  vi.stubEnv("BFA_P3B_STATE_SECRET", "fictional-local-v2-issuance-test-key");
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("inactive v2 trusted authority issuance", () => {
  it("seals the owned snapshot with unchanged local P3b crypto and releases only the exact registered association", async () => {
    const f = fixture();
    const issuer = f.create();
    const output = await issuer.issue(f.input);
    expect(output).toMatchObject({
      protocol: 2,
      ownerId: OWNER,
      authSessionId: SESSION,
      parentVersion: 4,
      threadId: THREAD,
      threadIncarnation: INCARNATION,
      threadRevision: 2,
      issuedAt: NOW,
      expiresAt: NOW + 60_000,
    });
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.keys(output!).sort()).toEqual([
      "activeAuthority",
      "authSessionId",
      "authorityFingerprint",
      "expiresAt",
      "issuedAt",
      "ownerId",
      "parentVersion",
      "protocol",
      "threadId",
      "threadIncarnation",
      "threadRevision",
    ]);
    const envelope = await unseal(output!.activeAuthority, OWNER, THREAD, 2);
    expect(envelope.authority).toEqual(f.service.exportAuthority(THREAD));
    expect(envelope.expires).toBe(output!.expiresAt);
    expect(output!.authorityFingerprint).toBe(await fingerprint(output!.activeAuthority));
    expect(f.parentRequests).toEqual([
      { ownerId: OWNER, authSessionId: SESSION, verifiedAt: NOW, authExpiresAt: NOW + 120_000 },
    ]);
    expect(f.generationRequests).toEqual([
      {
        ownerId: OWNER,
        authSessionId: SESSION,
        parentVersion: 4,
        threadId: THREAD,
        threadRevision: 2,
        sourceCreatedAt: CREATED,
        verifiedAt: NOW,
        authExpiresAt: NOW + 120_000,
      },
    ]);
    expect(f.issuanceRequests).toEqual([
      {
        ownerId: OWNER,
        authSessionId: SESSION,
        parentVersion: 4,
        threadId: THREAD,
        threadIncarnation: INCARNATION,
        threadRevision: 2,
        authorityFingerprint: output!.authorityFingerprint,
        issuedAt: NOW,
        expiresAt: NOW + 60_000,
        verifiedAt: NOW,
        authExpiresAt: NOW + 120_000,
      },
    ]);
    expect(
      f.events.filter((event) =>
        ["parent-write", "generation", "issuance", "issuance-read"].includes(event),
      ),
    ).toEqual(["parent-write", "generation", "issuance", "issuance-read"]);
    expect(f.events.slice(-4)).toEqual(["auth", "parent-read", "current", "auth"]);
    expect(issuer.snapshot().state).toBe("issued");
    expect(JSON.stringify(issuer.snapshot())).not.toContain(output!.activeAuthority);
  });

  it("observes absent parent as version zero without inventing an episode session or renewing the parent", async () => {
    const f = fixture();
    f.state.parent = null;
    f.state.current.parentVersion = 0;
    const issuer = f.create();
    expect((await issuer.issue(f.input))?.parentVersion).toBe(0);
    expect(issuer.snapshot().expectedParentVersion).toBe(0);
    expect(issuer.snapshot().parentAcknowledgment).toEqual({
      protocol: 2,
      ownerId: OWNER,
      authSessionId: SESSION,
      parentVersion: 0,
      revoked: false,
    });
    expect(f.events.filter((event) => event === "parent-write")).toHaveLength(1);
  });

  it("keeps detached immutable metadata evidence without exposing authority or private writing", async () => {
    const f = fixture();
    f.service.recordNotSent(THREAD, "fictional-draft", "private local writing must remain private");
    const issuer = f.create();
    expect(issuer.snapshot()).toMatchObject({
      state: "idle",
      expectedParentVersion: null,
      parentWriteAttempted: false,
      generationWriteAttempted: false,
      issuanceWriteAttempted: false,
    });
    const initial = issuer.snapshot();
    expect(await issuer.issue(f.input)).not.toBeNull();
    const snapshot = issuer.snapshot();
    expect(initial.state).toBe("idle");
    for (const value of [
      snapshot,
      snapshot.parentRequest,
      snapshot.parentAcknowledgment,
      snapshot.generationRequest,
      snapshot.generationAcknowledgment,
      snapshot.generationAcknowledgment?.allowlist,
      snapshot.issuanceRequest,
      snapshot.issuanceAcknowledgment,
    ])
      expect(Object.isFrozen(value)).toBe(true);
    Object.assign(f.returned.parent as object, { parentVersion: 99 });
    Object.assign(f.returned.generation as object, { threadIncarnation: OTHER });
    Object.assign(f.returned.issuance as object, { expiresAt: NOW + 500_000 });
    expect(issuer.snapshot()).toEqual(snapshot);
    expect(snapshot.parentAcknowledgment?.parentVersion).toBe(4);
    expect(snapshot.generationAcknowledgment?.threadIncarnation).toBe(INCARNATION);
    expect(snapshot.issuanceAcknowledgment?.expiresAt).toBe(NOW + 60_000);
    expect(JSON.stringify(snapshot)).not.toContain("private local writing");
    expect(JSON.stringify(snapshot)).not.toContain("activeAuthority");
    expect(JSON.stringify(snapshot)).not.toContain("fictional-local-v2-issuance-test-key");
  });

  it.each([0, -1, 1.5, 900_001, Number.NaN, Number.POSITIVE_INFINITY, undefined])(
    "rejects invalid explicit lifetime %s at construction",
    (maxAuthorityAgeMs) => {
      const f = fixture();
      expect(() =>
        createVoiceV2AuthorityIssuer({ ...f.ports, maxAuthorityAgeMs } as Ports),
      ).toThrow();
      expect(f.events).toEqual([]);
    },
  );

  it("requires every independent trusted port and captures bound methods/configuration once", async () => {
    const f = fixture();
    for (const name of [
      "now",
      "authenticate",
      "readParent",
      "observeParent",
      "readCurrentThread",
      "registerGeneration",
      "registerIssuance",
      "readIssuance",
    ] as const)
      expect(() =>
        createVoiceV2AuthorityIssuer({ ...f.ports, [name]: undefined } as unknown as Ports),
      ).toThrow();
    const original = f.ports.authenticate;
    f.ports.authenticate = async function () {
      expect(this).toBe(f.ports);
      return original.call(this);
    };
    const issuer = f.create();
    f.ports.maxAuthorityAgeMs = 900_000;
    f.ports.authenticate = async () => {
      throw new Error("replacement must not run");
    };
    f.ports.registerIssuance = async () => {
      throw new Error("replacement must not run");
    };
    expect((await issuer.issue(f.input))?.expiresAt).toBe(NOW + 60_000);
    expect(f.issuanceRequests).toHaveLength(1);
  });

  it.each([
    { threadId: "00000000-0000-0000-0000-000000000000" },
    { threadRevision: -1 },
    { threadRevision: 1.5 },
    { sourceCreatedAt: "2030-02-29T17:46:00.123456Z" },
    { sourceCreatedAt: "2030-03-17T17:46:00.123Z" },
    { sourceCreatedAt: "2030-03-17 17:46:00+00" },
    { activeAuthority: "caller-supplied-token" },
    { authority: {} },
  ])("consumes invalid trusted input without authentication or writing: %j", async (change) => {
    const f = fixture();
    const issuer = f.create();
    expect(await issuer.issue({ ...f.input, ...change } as Input)).toBeNull();
    expect(await issuer.issue(f.input)).toBeNull();
    expect(f.events).toEqual([]);
  });

  it("rejects input accessors, inherited fields and extra JavaScript arguments without evaluating them", async () => {
    const f = fixture();
    const getter = vi.fn(() => THREAD);
    const accessor = { ...f.input };
    Object.defineProperty(accessor, "threadId", { enumerable: true, get: getter });
    expect(await f.create().issue(accessor)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    expect(
      await f.create().issue(
        Object.assign(Object.create({ threadId: THREAD }) as object, {
          service: f.service,
          threadRevision: 2,
          sourceCreatedAt: CREATED,
        }) as Input,
      ),
    ).toBeNull();
    const issuer = f.create();
    expect(await Reflect.apply(issuer.issue, issuer, [f.input, "unexpected"])).toBeNull();
    expect(await issuer.issue(f.input)).toBeNull();
    expect(f.events).toEqual([]);
  });

  it("does not create a missing owned thread as a side effect of issuance", async () => {
    const f = fixture();
    const empty = new ConversationService({ verifiedOwnerId: OWNER });
    expect(await f.create().issue({ ...f.input, service: empty })).toBeNull();
    expect(empty.hasThread(THREAD)).toBe(false);
    expect(f.events).toEqual([]);
  });

  it.each([
    null,
    { ownerId: OTHER, sessionId: SESSION, expiresAt: NOW + 120_000 },
    { ownerId: OWNER, sessionId: SESSION, expiresAt: NOW + 120_000, verified: true },
  ])("rejects absent, wrong-owner or nonexact initial Auth %j", async (identity) => {
    const f = fixture();
    f.replies.set("auth:1", identity);
    expect(await f.create().issue(f.input)).toBeNull();
    expect(f.events).toEqual(["auth"]);
  });

  it.each(["ownerId", "sessionId"] as const)(
    "does not bridge a changed verified Auth %s across the parent wait",
    async (field) => {
      const f = fixture();
      f.hooks.set("parent-read:1", () => {
        f.state.identity[field] = OTHER;
      });
      expect(await f.create().issue(f.input)).toBeNull();
      expect(f.parentRequests).toEqual([]);
    },
  );

  it.each([
    { revoked: true },
    { parentVersion: -1 },
    { protocol: 1 },
    { authSessionId: OTHER },
    { expiresAt: NOW + 60_000 },
  ])("denies an incompatible initial parent without observation: %j", async (change) => {
    const f = fixture();
    f.replies.set("parent-read:1", { ...f.state.parent, ...change });
    expect(await f.create().issue(f.input)).toBeNull();
    expect(f.parentRequests).toEqual([]);
  });

  it.each(["current", "generation"])(
    "never adopts a mismatched %s parent/session/source/revision",
    async (stage) => {
      for (const change of [
        { parentVersion: 5 },
        { authSessionId: OTHER },
        { threadId: OTHER },
        { sourceCreatedAt: "2030-03-17T17:46:00.123457Z" },
        { threadRevision: 3 },
        { allowlist: { ownerId: OTHER, admitted: true, expiresAt: NOW + 80_000 } },
      ]) {
        const f = fixture();
        f.replies.set(`${stage}:1`, {
          ...f.state.current,
          threadIncarnation: stage === "generation" ? INCARNATION : null,
          ...change,
        });
        expect(await f.create().issue(f.input)).toBeNull();
        expect(f.issuanceRequests).toEqual([]);
        if (stage === "current") expect(f.generationRequests).toEqual([]);
      }
    },
  );

  it("requires registration to match an already observed permanent incarnation", async () => {
    const f = fixture();
    f.state.current.threadIncarnation = OTHER;
    f.replies.set("generation:1", { ...f.state.current, threadIncarnation: INCARNATION });
    const issuer = f.create();
    expect(await issuer.issue(f.input)).toBeNull();
    expect(f.generationRequests).toHaveLength(1);
    // The registrar request does not carry an expected incarnation. Its exact
    // metadata ACK remains evidence; disagreement with the prior read denies
    // token release without pretending that registration rolled back.
    expect(issuer.snapshot().generationAcknowledgment?.threadIncarnation).toBe(INCARNATION);
    expect(f.issuanceRequests).toEqual([]);
  });

  it("withholds authority when the current incarnation changes after successful generation registration", async () => {
    const f = fixture();
    f.hooks.set("generation:1", () => {
      f.state.current.threadIncarnation = OTHER;
    });
    const issuer = f.create();
    expect(await issuer.issue(f.input)).toBeNull();
    expect(issuer.snapshot().generationAcknowledgment?.threadIncarnation).toBe(INCARNATION);
    expect(f.issuanceRequests).toEqual([]);
  });

  it("retains the shortest independently observed Auth and allowlist ceilings even if later reads grow", async () => {
    const f = fixture();
    f.hooks.set("auth:3", () => {
      f.state.identity.expiresAt = NOW + 40_000;
    });
    f.hooks.set("auth:4", () => {
      f.state.identity.expiresAt = NOW + 120_000;
    });
    f.hooks.set("current:1", () => {
      f.state.current.allowlist.expiresAt = NOW + 25_000;
    });
    f.hooks.set("current:2", () => {
      f.state.current.allowlist.expiresAt = NOW + 80_000;
    });
    expect((await f.create().issue(f.input))?.expiresAt).toBe(NOW + 25_000);
    expect(f.issuanceRequests[0].authExpiresAt).toBe(NOW + 40_000);
  });

  it("anchors issuedAt and verifiedAt before the first Auth wait rather than refreshing age", async () => {
    const f = fixture();
    f.hooks.set("auth:1", () => {
      f.state.now += 10_000;
    });
    expect((await f.create().issue(f.input))?.issuedAt).toBe(NOW);
    expect(f.parentRequests[0].verifiedAt).toBe(NOW);
    expect(f.generationRequests[0].verifiedAt).toBe(NOW);
    expect(f.issuanceRequests[0]).toMatchObject({
      verifiedAt: NOW,
      issuedAt: NOW,
      expiresAt: NOW + 60_000,
    });
  });

  it.each(["parent-write", "generation", "issuance"])(
    "retains an exact late %s ACK but withholds authority at the 30-second boundary",
    async (stage) => {
      const f = fixture();
      f.hooks.set(`${stage}:1`, () => {
        f.state.now = NOW + 30_000;
      });
      const issuer = f.create();
      expect(await issuer.issue(f.input)).toBeNull();
      const snapshot = issuer.snapshot();
      expect(snapshot.state).toBe("unconfirmed");
      const ack =
        stage === "parent-write"
          ? snapshot.parentAcknowledgment
          : stage === "generation"
            ? snapshot.generationAcknowledgment
            : snapshot.issuanceAcknowledgment;
      expect(ack).not.toBeNull();
      expect(await issuer.issue(f.input)).toBeNull();
      expect(f.events.filter((event) => event === stage)).toHaveLength(1);
    },
  );

  it.each([NOW - 1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "denies invalid or rolled-back clock %s after a generation write",
    async (clock) => {
      const f = fixture();
      f.hooks.set("generation:1", () => {
        f.state.now = clock;
      });
      const issuer = f.create();
      expect(await issuer.issue(f.input)).toBeNull();
      expect(issuer.snapshot().generationAcknowledgment).not.toBeNull();
      expect(f.issuanceRequests).toEqual([]);
    },
  );

  it("does not issue a previously sealed lifetime after a later Auth ceiling shrinks", async () => {
    const f = fixture();
    f.hooks.set("issuance:1", () => {
      f.state.identity.expiresAt = NOW + 20_000;
    });
    const issuer = f.create();
    expect(await issuer.issue(f.input)).toBeNull();
    expect(issuer.snapshot().issuanceAcknowledgment?.expiresAt).toBe(NOW + 60_000);
    expect(f.issuanceRequests).toHaveLength(1);
    expect(f.state.issuance?.expiresAt).toBe(NOW + 60_000);
  });

  it.each(["parent-write", "generation", "issuance"])(
    "retains a single attempted %s request after a lost committed reply without retrying or adopting it",
    async (stage) => {
      const f = fixture();
      f.hooks.set(`${stage}:1`, () => {
        throw new Error("private transport diagnostic must not escape");
      });
      const issuer = f.create();
      expect(await issuer.issue(f.input)).toBeNull();
      const snapshot = issuer.snapshot();
      expect(snapshot.state).toBe("unconfirmed");
      if (stage === "parent-write")
        expect(snapshot).toMatchObject({
          parentWriteAttempted: true,
          parentAcknowledgment: null,
          generationWriteAttempted: false,
        });
      if (stage === "generation")
        expect(snapshot).toMatchObject({
          generationWriteAttempted: true,
          generationAcknowledgment: null,
          issuanceWriteAttempted: false,
        });
      if (stage === "issuance")
        expect(snapshot).toMatchObject({
          issuanceWriteAttempted: true,
          issuanceAcknowledgment: null,
        });
      const requests =
        stage === "parent-write"
          ? f.parentRequests
          : stage === "generation"
            ? f.generationRequests
            : f.issuanceRequests;
      expect(requests).toHaveLength(1);
      expect(await issuer.issue(f.input)).toBeNull();
      expect(f.events.filter((event) => event === stage)).toHaveLength(1);
      expect(JSON.stringify(snapshot)).not.toContain("private transport diagnostic");
    },
  );

  it.each([
    "ownerId",
    "authSessionId",
    "parentVersion",
    "threadId",
    "threadIncarnation",
    "threadRevision",
    "authorityFingerprint",
    "issuedAt",
    "expiresAt",
    "revoked",
    "protocol",
  ])("requires an exact committed issuance ACK field: %s", async (field) => {
    const f = fixture();
    f.hooks.set("issuance:1", () => {
      const ack = f.returned.issuance as Record<string, unknown>;
      const value = ack[field];
      f.replies.set("issuance:1", {
        ...ack,
        [field]:
          typeof value === "number"
            ? value + 1
            : typeof value === "boolean"
              ? true
              : field === "authorityFingerprint"
                ? "f".repeat(64)
                : OTHER,
      });
    });
    const issuer = f.create();
    expect(await issuer.issue(f.input)).toBeNull();
    expect(issuer.snapshot()).toMatchObject({
      issuanceWriteAttempted: true,
      issuanceAcknowledgment: null,
      issuanceRequest: f.issuanceRequests[0],
    });
    expect(f.state.issuance).not.toBeNull();
    expect(f.events).not.toContain("issuance-read");
  });

  it.each([null, true, { committed: true }])(
    "does not promote a nonexact committed issuance reply %j",
    async (reply) => {
      const f = fixture();
      f.replies.set("issuance:1", reply);
      const issuer = f.create();
      expect(await issuer.issue(f.input)).toBeNull();
      expect(issuer.snapshot().issuanceAcknowledgment).toBeNull();
      expect(issuer.snapshot().issuanceWriteAttempted).toBe(true);
      expect(f.state.issuance).not.toBeNull();
    },
  );

  it("rejects receipt getters without evaluating their private side effects", async () => {
    const f = fixture();
    const getter = vi.fn(() => NOW + 60_000);
    f.hooks.set("issuance:1", () => {
      const ack = { ...(f.returned.issuance as object) };
      Object.defineProperty(ack, "expiresAt", { enumerable: true, get: getter });
      f.replies.set("issuance:1", ack);
    });
    expect(await f.create().issue(f.input)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });

  it.each(["parent", "session", "source", "allowlist", "issuance"])(
    "requires final current %s evidence after registration and exact issuance read",
    async (change) => {
      const f = fixture();
      f.hooks.set("issuance-read:1", () => {
        if (change === "parent") f.state.parent = { ...f.state.parent!, parentVersion: 5 };
        if (change === "session") f.state.identity.sessionId = OTHER;
        if (change === "source") f.state.current.sourceCreatedAt = "2030-03-17T17:46:00.123457Z";
        if (change === "allowlist") f.state.current.allowlist.expiresAt = NOW;
        if (change === "issuance")
          f.state.issuance = { ...f.state.issuance!, threadIncarnation: OTHER };
      });
      const issuer = f.create();
      expect(await issuer.issue(f.input)).toBeNull();
      expect(issuer.snapshot().issuanceAcknowledgment?.threadIncarnation).toBe(INCARNATION);
      expect(f.issuanceRequests).toHaveLength(1);
      expect(f.events.filter((event) => event === "issuance-read")).toHaveLength(1);
    },
  );

  it.each(["parent-write", "generation", "issuance"])(
    "cancels synchronously during %s and retains a matching late ACK without another operation",
    async (stage) => {
      const f = fixture();
      const entered = deferred<void>();
      const release = deferred<void>();
      f.hooks.set(`${stage}:1`, async () => {
        entered.resolve();
        await release.promise;
      });
      const issuer = f.create();
      const pending = issuer.issue(f.input);
      await entered.promise;
      const count = f.events.length;
      issuer.cancel();
      expect(issuer.snapshot().state).toBe("cancelled");
      expect(await issuer.issue(f.input)).toBeNull();
      release.resolve();
      expect(await pending).toBeNull();
      expect(f.events).toHaveLength(count);
      const snapshot = issuer.snapshot();
      expect(snapshot.state).toBe("cancelled");
      expect(
        stage === "parent-write"
          ? snapshot.parentAcknowledgment
          : stage === "generation"
            ? snapshot.generationAcknowledgment
            : snapshot.issuanceAcknowledgment,
      ).not.toBeNull();
    },
  );

  it("claims the attempt before the first Auth await and never replays a successful issuance", async () => {
    const f = fixture();
    const entered = deferred<void>();
    const release = deferred<void>();
    f.hooks.set("auth:1", async () => {
      entered.resolve();
      await release.promise;
    });
    const issuer = f.create();
    const pending = issuer.issue(f.input);
    await entered.promise;
    expect(await issuer.issue(f.input)).toBeNull();
    expect(f.events).toEqual(["auth"]);
    release.resolve();
    expect(await pending).not.toBeNull();
    const count = f.events.length;
    expect(await issuer.issue(f.input)).toBeNull();
    expect(f.events).toHaveLength(count);
    expect(f.issuanceRequests).toHaveLength(1);
  });

  it("pre-cancellation is terminal and starts no trusted operation", async () => {
    const f = fixture();
    const issuer = f.create();
    issuer.cancel();
    issuer.cancel();
    expect(issuer.snapshot().state).toBe("cancelled");
    expect(await issuer.issue(f.input)).toBeNull();
    expect(f.events).toEqual([]);
  });

  it("does not register an issuance when local sealing fails and leaves generation evidence intact", async () => {
    const f = fixture();
    vi.stubEnv("BFA_P3B_STATE_SECRET", "");
    const issuer = f.create();
    expect(await issuer.issue(f.input)).toBeNull();
    expect(issuer.snapshot().generationAcknowledgment?.threadIncarnation).toBe(INCARNATION);
    expect(f.issuanceRequests).toEqual([]);
  });
});
