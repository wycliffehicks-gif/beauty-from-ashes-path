import { describe, expect, it, vi } from "vitest";
import {
  createVoiceSessionInitializer,
  type VoiceSessionInitializerPorts,
} from "../service/voice-session-initializer.server";
import type {
  VoiceSessionProvisioningQuery,
  VoiceSessionProvisioningReceipt,
} from "../service/voice-session-provision-rpc.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const START = 1_790_000_000_000;
type MutableFence = {
  -readonly [K in keyof VoiceSessionProvisioningReceipt]: VoiceSessionProvisioningReceipt[K];
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function receipt(
  query: VoiceSessionProvisioningQuery,
  version = 0,
): VoiceSessionProvisioningReceipt {
  return {
    ownerId: query.ownerId,
    sessionId: query.sessionId,
    version,
    expiresAt: query.expiresAt,
    revoked: false,
  };
}
function fixture() {
  const clock = { now: START };
  const identity = { ownerId: OWNER, sessionId: SESSION, expiresAt: START + 120_000 };
  const data: { fence: MutableFence | null } = { fence: null };
  const events: string[] = [];
  const hooks: Record<string, (() => Promise<void> | void) | undefined> = {};
  let authCalls = 0;
  let reads = 0;
  const ports: VoiceSessionInitializerPorts = {
    maxFenceAgeMs: 60_000,
    now: vi.fn(() => clock.now),
    authenticate: vi.fn(async () => {
      const event = `auth:${++authCalls}`;
      events.push(event);
      await hooks[event]?.();
      return structuredClone(identity);
    }),
    readSessionFence: vi.fn(async () => {
      const event = `read:${++reads}`;
      events.push(event);
      await hooks[event]?.();
      return structuredClone(data.fence);
    }),
    provisionSession: vi.fn(async (query) => {
      events.push("provision");
      data.fence = receipt(query, data.fence?.version ?? 0);
      await hooks.provision?.();
      return structuredClone(data.fence);
    }),
  };
  const initializer = createVoiceSessionInitializer(ports);
  return { clock, identity, data, events, hooks, ports, initializer };
}

describe("P5 inactive trusted session initializer", () => {
  it("requires explicit bounded configuration and all trusted ports without doing Auth work", () => {
    const h = fixture();
    for (const maxFenceAgeMs of [undefined, 0, -1, 0.5, 900_001, NaN, Infinity])
      expect(() =>
        createVoiceSessionInitializer({
          ...h.ports,
          maxFenceAgeMs,
        } as VoiceSessionInitializerPorts),
      ).toThrow("voice-session-initializer-unavailable");
    for (const key of ["now", "authenticate", "readSessionFence", "provisionSession"])
      expect(() =>
        createVoiceSessionInitializer({
          ...h.ports,
          [key]: null,
        } as unknown as VoiceSessionInitializerPorts),
      ).toThrow("voice-session-initializer-unavailable");
    expect(h.ports.authenticate).not.toHaveBeenCalled();
    expect(h.ports.provisionSession).not.toHaveBeenCalled();
  });
  it("takes no caller metadata, so a forged JS argument cannot supply identity or expiry", async () => {
    const h = fixture();
    const call = h.initializer.initialize as unknown as (raw: unknown) => Promise<unknown>;
    expect(
      await call({ ownerId: OTHER, sessionId: OTHER, verifiedAt: START, expiresAt: START + 500 }),
    ).toBeNull();
    expect(h.ports.authenticate).not.toHaveBeenCalled();
    expect(h.ports.provisionSession).not.toHaveBeenCalled();
    expect(h.initializer.snapshot()).toMatchObject({
      state: "unconfirmed",
      request: null,
      writeAttempted: false,
    });
    expect(await h.initializer.initialize()).toBeNull();
  });
  it("derives one request from fresh Auth and conservative start time, with final Auth/read/Auth", async () => {
    const h = fixture();
    h.hooks["auth:1"] = () => {
      h.clock.now += 100;
    };
    const result = await h.initializer.initialize();
    expect(result).toEqual({
      state: "observed",
      fence: {
        ownerId: OWNER,
        sessionId: SESSION,
        expiresAt: START + 60_000,
        version: 0,
        revoked: false,
      },
    });
    expect(h.events).toEqual([
      "auth:1",
      "read:1",
      "auth:2",
      "provision",
      "auth:3",
      "read:2",
      "auth:4",
    ]);
    expect(h.ports.provisionSession).toHaveBeenCalledExactlyOnceWith({
      ownerId: OWNER,
      sessionId: SESSION,
      verifiedAt: START,
      expiresAt: START + 60_000,
    });
    expect(h.initializer.snapshot()).toMatchObject({
      state: "observed",
      expectedVersion: 0,
      writeAttempted: true,
      request: { verifiedAt: START },
    });
    expect(await h.initializer.initialize()).toBeNull();
    expect(h.ports.provisionSession).toHaveBeenCalledTimes(1);
  });
  it("captures configuration and port functions before external mutation", async () => {
    const h = fixture();
    Object.assign(h.ports, {
      maxFenceAgeMs: 900_000,
      provisionSession: vi.fn(async () => {
        throw new Error();
      }),
    });
    expect(await h.initializer.initialize()).not.toBeNull();
    expect(h.initializer.snapshot().request?.expiresAt).toBe(START + 60_000);
    expect(h.ports.provisionSession).not.toHaveBeenCalled();
  });
  it("retains exact active expiry and maximum safe version without renewal or reset", async () => {
    const h = fixture();
    h.data.fence = {
      ownerId: OWNER,
      sessionId: SESSION,
      version: Number.MAX_SAFE_INTEGER,
      expiresAt: START + 20_000,
      revoked: false,
    };
    h.hooks["auth:2"] = () => {
      h.clock.now += 500;
      h.identity.expiresAt += 100_000;
    };
    const result = await h.initializer.initialize();
    expect(result?.fence).toEqual(h.data.fence);
    expect(h.initializer.snapshot()).toMatchObject({
      expectedVersion: Number.MAX_SAFE_INTEGER,
      request: { expiresAt: START + 20_000, verifiedAt: START },
    });
  });
  it.each(["configuration", "initial Auth", "later Auth"])(
    "denies an existing expiry above %s eligibility without rewriting it",
    async (kind) => {
      const h = fixture();
      const expiresAt = kind === "configuration" ? START + 70_000 : START + 20_000;
      h.data.fence = { ownerId: OWNER, sessionId: SESSION, version: 4, expiresAt, revoked: false };
      if (kind === "initial Auth") h.identity.expiresAt = START + 10_000;
      if (kind === "later Auth")
        h.hooks["auth:2"] = () => {
          h.identity.expiresAt = START + 10_000;
        };
      const before = structuredClone(h.data.fence);
      expect(await h.initializer.initialize()).toBeNull();
      expect(h.ports.provisionSession).not.toHaveBeenCalled();
      expect(h.data.fence).toEqual(before);
    },
  );
  it("uses the shorter newly verified Auth bound for a genuinely absent initial read", async () => {
    const h = fixture();
    h.hooks["auth:2"] = () => {
      h.identity.expiresAt = START + 10_000;
    };
    expect((await h.initializer.initialize())?.fence.expiresAt).toBe(START + 10_000);
  });
  it("does not infer absence from null reads or bypass the SQL denial", async () => {
    const h = fixture();
    vi.mocked(h.ports.provisionSession).mockResolvedValue(null);
    expect(await h.initializer.initialize()).toBeNull();
    expect(h.ports.provisionSession).toHaveBeenCalledTimes(1);
    expect(h.initializer.snapshot()).toMatchObject({
      state: "unconfirmed",
      expectedVersion: 0,
      writeAttempted: true,
      acknowledgment: null,
      request: { ownerId: OWNER, sessionId: SESSION },
    });
  });
  it("fences concurrent initialization before the first Auth wait", async () => {
    const h = fixture();
    const gate = deferred<void>();
    h.hooks["auth:1"] = () => gate.promise;
    const first = h.initializer.initialize();
    expect(h.initializer.snapshot()).toMatchObject({
      state: "pending",
      request: null,
      writeAttempted: false,
    });
    expect(await h.initializer.initialize()).toBeNull();
    gate.resolve();
    expect(await first).not.toBeNull();
    expect(h.ports.provisionSession).toHaveBeenCalledTimes(1);
  });
  it("retains immutable detached request and exact acknowledgment across all snapshots", async () => {
    const h = fixture();
    h.hooks.provision = () => {
      const snapshot = h.initializer.snapshot();
      expect(snapshot.writeAttempted).toBe(true);
      expect(snapshot.request).toBe(vi.mocked(h.ports.provisionSession).mock.calls[0]![0]);
      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(Object.isFrozen(snapshot.request)).toBe(true);
      expect(() => Object.assign(snapshot.request!, { expiresAt: START + 900_000 })).toThrow();
    };
    const result = await h.initializer.initialize();
    const snapshot = h.initializer.snapshot();
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.fence)).toBe(true);
    expect(Object.isFrozen(snapshot.acknowledgment)).toBe(true);
    expect(snapshot.acknowledgment).not.toBe(h.data.fence);
    const before = JSON.stringify(snapshot);
    h.identity.ownerId = OTHER;
    h.data.fence!.expiresAt = START + 900_000;
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it.each(["auth:1", "read:1", "auth:2", "provision", "auth:3", "read:2", "auth:4"])(
    "cancels synchronously during %s without later success or retry",
    async (event) => {
      const h = fixture();
      h.hooks[event] = () => {
        h.initializer.cancel();
      };
      expect(await h.initializer.initialize()).toBeNull();
      const at = h.events.indexOf(event);
      expect(h.events).toHaveLength(at + 1);
      expect(h.initializer.snapshot().state).toBe("cancelled");
      const calls = vi.mocked(h.ports.provisionSession).mock.calls.length;
      expect(await h.initializer.initialize()).toBeNull();
      expect(h.ports.provisionSession).toHaveBeenCalledTimes(calls);
      if (calls) expect(h.initializer.snapshot().acknowledgment).not.toBeNull();
    },
  );
  it("cancels before initialization without Auth or record mutation", async () => {
    const h = fixture();
    h.initializer.cancel();
    expect(await h.initializer.initialize()).toBeNull();
    expect(h.events).toEqual([]);
    expect(h.initializer.snapshot()).toMatchObject({
      state: "cancelled",
      request: null,
      writeAttempted: false,
    });
  });
  it("keeps completed evidence when later local cancellation occurs", async () => {
    const h = fixture();
    expect(await h.initializer.initialize()).not.toBeNull();
    const before = h.initializer.snapshot();
    h.initializer.cancel();
    expect(h.initializer.snapshot()).toEqual({ ...before, state: "cancelled" });
    expect(h.data.fence).toEqual(before.acknowledgment);
  });
  it.each(["lost", "malformed", "wrong identity", "wrong expiry", "wrong version"])(
    "retains the one attempted request after a %s acknowledgment",
    async (kind) => {
      const h = fixture();
      vi.mocked(h.ports.provisionSession).mockImplementation(async (query) => {
        h.data.fence = receipt(query);
        if (kind === "lost") throw new Error("private provider details must not escape");
        if (kind === "malformed") return { ...h.data.fence, secret: "untrusted" };
        if (kind === "wrong identity") return { ...h.data.fence, sessionId: OTHER };
        if (kind === "wrong expiry") return { ...h.data.fence, expiresAt: query.expiresAt + 1 };
        return { ...h.data.fence, version: 1 };
      });
      expect(await h.initializer.initialize()).toBeNull();
      const first = h.initializer.snapshot();
      expect(first).toMatchObject({
        state: "unconfirmed",
        writeAttempted: true,
        request: { ownerId: OWNER, sessionId: SESSION },
      });
      expect(first.acknowledgment?.version ?? null).toBe(kind === "wrong version" ? 1 : null);
      expect(h.data.fence).not.toBeNull();
      expect(await h.initializer.initialize()).toBeNull();
      expect(h.initializer.snapshot()).toEqual(first);
      expect(h.ports.provisionSession).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["owner", "session"])("denies changed Auth %s before the write", async (field) => {
    const h = fixture();
    h.hooks["auth:2"] = () => {
      if (field === "owner") h.identity.ownerId = OTHER;
      else h.identity.sessionId = OTHER;
    };
    expect(await h.initializer.initialize()).toBeNull();
    expect(h.ports.provisionSession).not.toHaveBeenCalled();
  });
  it("withholds a committed observation when Auth eligibility shortens below the immutable request", async () => {
    const h = fixture();
    h.hooks["auth:3"] = () => {
      h.identity.expiresAt = START + 50_000;
    };
    expect(await h.initializer.initialize()).toBeNull();
    expect(h.initializer.snapshot()).toMatchObject({
      request: { expiresAt: START + 60_000 },
      acknowledgment: { expiresAt: START + 60_000 },
      writeAttempted: true,
    });
    expect(h.ports.readSessionFence).toHaveBeenCalledTimes(1);
  });
  it.each(["null", "version", "expiry", "session", "revoked"])(
    "rejects a final protected %s change after the exact acknowledgment",
    async (kind) => {
      const h = fixture();
      h.hooks["read:2"] = () => {
        if (kind === "null") h.data.fence = null;
        else if (kind === "version") h.data.fence!.version += 1;
        else if (kind === "expiry") h.data.fence!.expiresAt -= 1;
        else if (kind === "session") h.data.fence!.sessionId = OTHER;
        else Object.assign(h.data.fence!, { revoked: true });
      };
      expect(await h.initializer.initialize()).toBeNull();
      expect(h.initializer.snapshot().acknowledgment).toMatchObject({
        sessionId: SESSION,
        version: 0,
        expiresAt: START + 60_000,
        revoked: false,
      });
    },
  );
  it("rechecks Auth after the final protected read", async () => {
    const h = fixture();
    h.hooks["auth:4"] = () => {
      h.identity.sessionId = OTHER;
    };
    expect(await h.initializer.initialize()).toBeNull();
    expect(h.ports.authenticate).toHaveBeenCalledTimes(4);
    expect(h.initializer.snapshot().acknowledgment).not.toBeNull();
  });
  it.each(["slow Auth", "late acknowledgment", "backward clock", "expired Auth"])(
    "refuses %s without refreshing verification time or retrying",
    async (kind) => {
      const h = fixture();
      if (kind === "slow Auth")
        h.hooks["auth:1"] = () => {
          h.clock.now = START + 30_000;
        };
      if (kind === "late acknowledgment")
        h.hooks.provision = () => {
          h.clock.now = START + 30_000;
        };
      if (kind === "backward clock")
        h.hooks["read:1"] = () => {
          h.clock.now = START - 1;
        };
      if (kind === "expired Auth") h.identity.expiresAt = START;
      expect(await h.initializer.initialize()).toBeNull();
      expect(h.initializer.snapshot().request?.verifiedAt ?? null).toBe(
        kind === "late acknowledgment" ? START : null,
      );
      expect(h.ports.provisionSession).toHaveBeenCalledTimes(
        kind === "late acknowledgment" ? 1 : 0,
      );
    },
  );
  it("rejects unsafe or throwing clocks without exposing the cause", async () => {
    for (const value of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
      const h = fixture();
      h.clock.now = value;
      expect(await h.initializer.initialize()).toBeNull();
      expect(h.ports.authenticate).not.toHaveBeenCalled();
    }
    const h = fixture();
    vi.mocked(h.ports.now).mockImplementation(() => {
      throw new Error("private clock cause");
    });
    expect(await h.initializer.initialize()).toBeNull();
    expect(h.initializer.snapshot().state).toBe("unconfirmed");
  });
  it("rejects accessors and inherited Auth/fence/ack fields without evaluating them", async () => {
    for (const port of ["authenticate", "readSessionFence", "provisionSession"] as const) {
      const h = fixture();
      const getter = vi.fn(() => OWNER);
      const value =
        port === "authenticate"
          ? { ...h.identity }
          : {
              ownerId: OWNER,
              sessionId: SESSION,
              version: 0,
              expiresAt: START + 60_000,
              revoked: false,
            };
      Object.defineProperty(value, "ownerId", { enumerable: true, get: getter });
      vi.mocked(h.ports[port]).mockResolvedValueOnce(value);
      expect(await h.initializer.initialize()).toBeNull();
      expect(getter).not.toHaveBeenCalled();
    }
    const h = fixture();
    vi.mocked(h.ports.authenticate).mockResolvedValueOnce(Object.create(h.identity));
    expect(await h.initializer.initialize()).toBeNull();
    expect(h.ports.provisionSession).not.toHaveBeenCalled();
  });
});
