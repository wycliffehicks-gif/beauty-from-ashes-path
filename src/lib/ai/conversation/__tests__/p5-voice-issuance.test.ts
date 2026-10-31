import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import {
  createVoiceAuthorityIssuer,
  type VoiceAuthorityIssuanceInput,
  type VoiceAuthorityIssuancePorts,
} from "../service/voice-issuance.server";
import type { VoiceIssuanceRegistration } from "../service/voice-issuance-rpc.server";
import { fingerprint, unseal } from "../staging/seal.server";

const OWNER = "d1111111-1111-4111-8111-111111111111";
const SESSION = "d2222222-2222-4222-8222-222222222222";
const THREAD = "d3333333-3333-4333-8333-333333333333";
const INCARNATION = "d4444444-4444-4444-8444-444444444444";
const OTHER = "d5555555-5555-4555-8555-555555555555";
const NOW = 1_900_000_000_000;
const CREATED = "2030-03-17 17:46:00+00";

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
  const input: VoiceAuthorityIssuanceInput = {
    service,
    threadId: THREAD,
    threadRevision: 2,
    sourceCreatedAt: CREATED,
  };
  const state = {
    now: NOW,
    identity: { ownerId: OWNER, sessionId: SESSION, expiresAt: NOW + 120_000 },
    fence: {
      ownerId: OWNER,
      sessionId: SESSION,
      version: 4,
      expiresAt: NOW + 100_000,
      revoked: false,
    },
    current: {
      ownerId: OWNER,
      threadId: THREAD,
      threadRevision: 2,
      sourceCreatedAt: CREATED,
      threadIncarnation: null as string | null,
      deleted: false,
      allowlist: { ownerId: OWNER, admitted: true, expiresAt: NOW + 80_000 },
    },
  };
  const registrations: VoiceIssuanceRegistration[] = [];
  const events: string[] = [];
  const ports: {
    -readonly [K in keyof VoiceAuthorityIssuancePorts]: VoiceAuthorityIssuancePorts[K];
  } = {
    maxAuthorityAgeMs: 60_000,
    now() {
      return state.now;
    },
    async authenticate() {
      events.push("auth");
      return structuredClone(state.identity);
    },
    async readSessionFence(query) {
      events.push("fence");
      expect(Object.isFrozen(query)).toBe(true);
      expect(query).toEqual({ ownerId: OWNER, sessionId: state.identity.sessionId });
      return structuredClone(state.fence);
    },
    async readCurrentThread(query) {
      events.push("current");
      expect(Object.isFrozen(query)).toBe(true);
      expect(query).toEqual({ ownerId: OWNER, threadId: THREAD });
      return structuredClone(state.current);
    },
    async registerGeneration(query) {
      events.push("generation");
      expect(Object.isFrozen(query)).toBe(true);
      expect(query).toEqual({ ownerId: OWNER, threadId: THREAD });
      state.current.threadIncarnation = INCARNATION;
      return INCARNATION;
    },
    async registerIssuance(registration) {
      events.push("issuance");
      expect(Object.isFrozen(registration)).toBe(true);
      registrations.push(registration);
      return true;
    },
  };
  return {
    service,
    input,
    state,
    ports,
    registrations,
    events,
    issue: () => createVoiceAuthorityIssuer(ports).issue(input),
  };
}
beforeEach(() => {
  vi.stubEnv("BFA_P3B_STATE_SECRET", "fictional-local-issuance-test-key");
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("inactive trusted voice authority issuance", () => {
  it("seals actual service authority and releases only its exactly registered fingerprint", async () => {
    const f = fixture(),
      output = await f.issue();
    expect(output).not.toBeNull();
    expect(output).toMatchObject({
      threadId: THREAD,
      threadIncarnation: INCARNATION,
      threadRevision: 2,
      expiresAt: NOW + 60_000,
    });
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.keys(output!).sort()).toEqual([
      "activeAuthority",
      "expiresAt",
      "threadId",
      "threadIncarnation",
      "threadRevision",
    ]);
    const envelope = await unseal(output!.activeAuthority, OWNER, THREAD, 2);
    expect(envelope.authority).toEqual(f.service.exportAuthority(THREAD));
    expect(envelope.expires).toBe(output!.expiresAt);
    expect(f.registrations).toEqual([
      {
        ownerId: OWNER,
        threadId: THREAD,
        threadIncarnation: INCARNATION,
        threadRevision: 2,
        authorityFingerprint: await fingerprint(output!.activeAuthority),
        issuedAt: NOW,
        expiresAt: output!.expiresAt,
      },
    ]);
    expect(f.events.filter((e) => e === "generation")).toHaveLength(1);
    expect(f.events.filter((e) => e === "issuance")).toHaveLength(1);
    expect(f.events.at(-1)).toBe("auth");
  });
  it("uses the shortest initial identity, fence and allowlist lifetime", async () => {
    const f = fixture();
    f.state.identity.expiresAt = NOW + 45_000;
    f.state.fence.expiresAt = NOW + 35_000;
    f.state.current.allowlist.expiresAt = NOW + 25_000;
    expect((await f.issue())?.expiresAt).toBe(NOW + 25_000);
  });
  it("requires explicit bounded lifetime configuration and all independent ports", () => {
    for (const ttl of [0, -1, 1.5, 900_001, Number.NaN, undefined]) {
      const f = fixture();
      expect(() =>
        createVoiceAuthorityIssuer({
          ...f.ports,
          maxAuthorityAgeMs: ttl,
        } as VoiceAuthorityIssuancePorts),
      ).toThrow("voice-issuance-unavailable");
      expect(f.events).toEqual([]);
    }
    const f = fixture();
    expect(() =>
      createVoiceAuthorityIssuer({
        ...f.ports,
        readCurrentThread: undefined,
      } as unknown as VoiceAuthorityIssuancePorts),
    ).toThrow("voice-issuance-unavailable");
  });
  it("captures each trusted method once and binds its receiver", async () => {
    const f = fixture();
    const original = f.ports.authenticate;
    f.ports.authenticate = async function () {
      expect(this).toBe(f.ports);
      return original();
    };
    const issuer = createVoiceAuthorityIssuer(f.ports);
    f.ports.authenticate = async () => {
      throw new Error("replaced method");
    };
    expect(await issuer.issue(f.input)).not.toBeNull();
  });
  it("rejects any caller-supplied existing token or authority without invoking ports", async () => {
    for (const extra of [{ activeAuthority: "old.token" }, { authority: {} }]) {
      const f = fixture();
      expect(await createVoiceAuthorityIssuer(f.ports).issue({ ...f.input, ...extra })).toBeNull();
      expect(f.events).toEqual([]);
    }
  });
  it("rejects inherited, accessor or missing trusted source metadata before Auth", async () => {
    for (const mutate of [
      (input: object) => Object.assign(Object.create({ sourceCreatedAt: CREATED }), input),
      (input: object) =>
        Object.defineProperty(input, "sourceCreatedAt", { enumerable: true, get: () => CREATED }),
      (input: object) => input,
    ]) {
      const f = fixture();
      const { sourceCreatedAt: _source, ...rest } = f.input;
      expect(
        await createVoiceAuthorityIssuer(f.ports).issue(
          mutate(rest) as VoiceAuthorityIssuanceInput,
        ),
      ).toBeNull();
      expect(f.events).toEqual([]);
    }
  });
  it("requires an existing owned service record without creating one", async () => {
    const f = fixture();
    const missing = new ConversationService({ verifiedOwnerId: OWNER });
    expect(
      await createVoiceAuthorityIssuer(f.ports).issue({ ...f.input, service: missing }),
    ).toBeNull();
    expect(missing.hasThread(THREAD)).toBe(false);
    expect(f.events).toEqual([]);
  });
  it("denies null or wrong-owner verified Auth without registering generation", async () => {
    for (const auth of [null, { ownerId: OTHER, sessionId: SESSION, expiresAt: NOW + 60_000 }]) {
      const f = fixture();
      f.ports.authenticate = async () => auth;
      expect(await f.issue()).toBeNull();
      expect(f.events).not.toContain("generation");
    }
  });
  it("denies absent revoked or mismatched session fences without provisioning", async () => {
    for (const change of [
      null,
      { revoked: true },
      { sessionId: OTHER },
      { ownerId: OTHER },
      { version: "4" },
    ]) {
      const f = fixture();
      f.ports.readSessionFence = async () => change && { ...f.state.fence, ...change };
      expect(await f.issue()).toBeNull();
      expect(f.events).not.toContain("generation");
    }
  });
  it("denies missing or stale current metadata before registration", async () => {
    for (const change of [
      null,
      { ownerId: OTHER },
      { threadId: OTHER },
      { threadRevision: 3 },
      { sourceCreatedAt: "different creation" },
      { deleted: true },
      { allowlist: { ownerId: OWNER, admitted: false, expiresAt: NOW + 90_000 } },
    ]) {
      const f = fixture();
      f.ports.readCurrentThread = async () => change && { ...f.state.current, ...change };
      expect(await f.issue()).toBeNull();
      expect(f.events).not.toContain("generation");
    }
  });
  it("refuses changed Auth identity or session during repeated verification", async () => {
    const f = fixture();
    let calls = 0;
    f.ports.authenticate = async () => ({
      ...f.state.identity,
      sessionId: ++calls > 1 ? OTHER : SESSION,
    });
    expect(await f.issue()).toBeNull();
    expect(f.events).not.toContain("generation");
  });
  it("requires the generation acknowledgment to match an already registered incarnation", async () => {
    const f = fixture();
    f.state.current.threadIncarnation = OTHER;
    expect(await f.issue()).toBeNull();
    expect(f.registrations).toEqual([]);
  });
  it("rejects malformed or lost generation replies without a retry or issuance", async () => {
    for (const reply of [
      null,
      { id: INCARNATION },
      INCARNATION.toUpperCase(),
      new Error("private"),
    ]) {
      const f = fixture();
      let calls = 0;
      f.ports.registerGeneration = async () => {
        calls++;
        if (reply instanceof Error) throw reply;
        return reply as string;
      };
      expect(await f.issue()).toBeNull();
      expect(calls).toBe(1);
      expect(f.registrations).toEqual([]);
    }
  });
  it("withholds the envelope while exact issuance registration remains pending", async () => {
    const f = fixture(),
      pending = deferred<boolean>(),
      entered = deferred<void>();
    f.ports.registerIssuance = async (r) => {
      f.registrations.push(r);
      entered.resolve();
      return pending.promise;
    };
    let settled = false;
    const result = f.issue().then((output) => {
      settled = true;
      return output;
    });
    await entered.promise;
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(Object.keys(f.registrations[0]!)).not.toContain("activeAuthority");
    pending.resolve(true);
    expect(await result).not.toBeNull();
  });
  it("rejects false malformed or missing issuance acknowledgments without automatic retry", async () => {
    for (const reply of [
      false,
      null,
      undefined,
      "true",
      { registered: true },
      new Error("private database body"),
    ]) {
      const f = fixture();
      let calls = 0;
      f.ports.registerIssuance = async () => {
        calls++;
        if (reply instanceof Error) throw reply;
        return reply as boolean;
      };
      expect(await f.issue()).toBeNull();
      expect(calls).toBe(1);
    }
  });
  it("withholds an already registered envelope if final Auth fails", async () => {
    const f = fixture();
    let registered = false;
    f.ports.registerIssuance = async () => {
      registered = true;
      return true;
    };
    f.ports.authenticate = async () => (registered ? null : f.state.identity);
    expect(await f.issue()).toBeNull();
    expect(registered).toBe(true);
  });
  it("enforces the 30-second operation bound without attempting late issuance", async () => {
    const f = fixture(),
      original = f.ports.registerGeneration;
    f.ports.registerGeneration = async (q) => {
      const v = await original(q);
      f.state.now += 30_000;
      return v;
    };
    expect(await f.issue()).toBeNull();
    expect(f.registrations).toEqual([]);
  });
  it("denies backward or invalid clocks and safe-integer deadline overflow", async () => {
    for (const value of [NOW - 1, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      const f = fixture(),
        original = f.ports.registerGeneration;
      f.ports.registerGeneration = async (q) => {
        const v = await original(q);
        f.state.now = value;
        return v;
      };
      expect(await f.issue()).toBeNull();
      expect(f.registrations).toEqual([]);
    }
    const f = fixture();
    f.state.now = Number.MAX_SAFE_INTEGER - 1;
    expect(await f.issue()).toBeNull();
    expect(f.events).toEqual([]);
  });
  it("does not release a token when crypto configuration is absent", async () => {
    vi.stubEnv("BFA_P3B_STATE_SECRET", "");
    const f = fixture();
    expect(await f.issue()).toBeNull();
    expect(f.registrations).toEqual([]);
  });
  it("withholds an oversized service envelope before fingerprint registration", async () => {
    const f = fixture();
    f.service.recordNotSent(THREAD, "fictional-large-local-draft", "x".repeat(300_000));
    expect(await f.issue()).toBeNull();
    expect(f.events.filter((event) => event === "generation")).toHaveLength(1);
    expect(f.registrations).toEqual([]);
  });
  it("does not expose thrown metadata, private content or fingerprints through failure", async () => {
    const f = fixture();
    f.ports.readCurrentThread = async () => {
      throw new Error("private Auth secret body");
    };
    expect(await f.issue()).toBeNull();
    expect(f.events).not.toContain("generation");
  });
});
