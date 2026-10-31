// Independent issuer race checks: real local crypto, fictional protected ports.
// These tests do not establish Auth, HTTP, native SQL contention or live voice.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import { createVoiceAuthorityIssuer } from "../service/voice-issuance.server";
import { fingerprint, unseal } from "../staging/seal.server";

const OWNER = "d1111111-1111-4111-8111-111111111111";
const THREAD = "d2222222-2222-4222-8222-222222222222";
const SESSION = "d3333333-3333-4333-8333-333333333333";
const INCARNATION = "d4444444-4444-4444-8444-444444444444";
const CREATED = "2026-10-31T08:00:00.000Z";
const START = 1_793_440_800_000;

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
  const identity = { ownerId: OWNER, sessionId: SESSION, expiresAt: START + 40_000 };
  const fence = { ...identity, version: 3, revoked: false as const };
  const current = {
    ownerId: OWNER,
    threadId: THREAD,
    threadRevision: 4,
    sourceCreatedAt: CREATED,
    threadIncarnation: null as string | null,
    deleted: false as const,
    allowlist: { ownerId: OWNER, admitted: true as const, expiresAt: START + 50_000 },
  };
  const hooks: {
    generation?: () => Promise<string>;
    issuance?: () => Promise<boolean>;
    current?: () => Promise<unknown>;
  } = {};
  const registerGeneration = vi.fn(async () => {
    if (hooks.generation) return hooks.generation();
    current.threadIncarnation = INCARNATION;
    return INCARNATION;
  });
  const registerIssuance = vi.fn(async (_record: unknown) =>
    hooks.issuance ? hooks.issuance() : true,
  );
  const readCurrentThread = vi.fn(async () =>
    hooks.current ? hooks.current() : structuredClone(current),
  );
  const ports = {
    authenticate: vi.fn(async () => structuredClone(identity)),
    readSessionFence: vi.fn(async () => structuredClone(fence)),
    readCurrentThread,
    now: vi.fn(() => START),
    maxAuthorityAgeMs: 60_000,
    registerGeneration,
    registerIssuance,
  };
  const request = { service, threadId: THREAD, threadRevision: 4, sourceCreatedAt: CREATED };
  return {
    service,
    identity,
    fence,
    current,
    hooks,
    ports,
    request,
    issuer: createVoiceAuthorityIssuer(ports),
  };
}

describe("P5 trusted issuance independent adversarial review", () => {
  beforeEach(() => {
    vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID());
    vi.spyOn(Date, "now").mockReturnValue(START);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("registers the exact local encrypted envelope and never exposes its authority body to registration", async () => {
    const f = fixture();
    const issued = await f.issuer.issue(f.request);
    expect(issued).not.toBeNull();
    const envelope = await unseal(issued!.activeAuthority, OWNER, THREAD, 4);
    const record = f.ports.registerIssuance.mock.calls[0][0] as Record<string, unknown>;
    expect(record.authorityFingerprint).toBe(await fingerprint(issued!.activeAuthority));
    expect(envelope.authority).toEqual(f.service.exportAuthority(THREAD));
    expect(envelope.expires).toBe(START + 40_000);
    expect(Object.keys(record).sort()).toEqual(
      [
        "ownerId",
        "threadId",
        "threadIncarnation",
        "threadRevision",
        "authorityFingerprint",
        "issuedAt",
        "expiresAt",
      ].sort(),
    );
    expect(JSON.stringify(record)).not.toContain(issued!.activeAuthority);
    expect(f.ports.registerGeneration).toHaveBeenCalledTimes(1);
    expect(f.ports.registerIssuance).toHaveBeenCalledTimes(1);
  });

  it("withholds a token when the same service record is cancelled during issuance registration", async () => {
    const f = fixture();
    const original = f.service.getThreadLifecycleBinding(THREAD)!;
    f.hooks.issuance = async () => {
      f.service.cancelThread(THREAD, "review-stop");
      return true;
    };
    expect(await f.issuer.issue(f.request)).toBeNull();
    // Object identity remains current: the exact authority comparison catches it.
    expect(original.isCurrent()).toBe(true);
    expect(f.ports.registerIssuance).toHaveBeenCalledTimes(1);
  });

  it("rejects delete/recreate during a pending first generation registration", async () => {
    const f = fixture();
    const entered = deferred<void>();
    const reply = deferred<string>();
    f.hooks.generation = async () => {
      entered.resolve();
      return reply.promise;
    };
    const pending = f.issuer.issue(f.request);
    await entered.promise;
    f.service.deleteThread(THREAD);
    f.service.ensureThread(THREAD, false);
    f.current.threadIncarnation = INCARNATION;
    reply.resolve(INCARNATION);
    expect(await pending).toBeNull();
    expect(f.ports.registerIssuance).not.toHaveBeenCalled();
  });

  it("pins the trusted original creation value across first registration instead of binding an old service to a replacement", async () => {
    const f = fixture();
    f.hooks.generation = async () => {
      f.current.threadIncarnation = INCARNATION;
      f.current.sourceCreatedAt = "2026-10-31T08:01:00.000Z";
      return INCARNATION;
    };
    expect(await f.issuer.issue(f.request)).toBeNull();
    expect(f.ports.registerIssuance).not.toHaveBeenCalled();
  });

  it("withholds an already registered envelope if the session lifetime shortens after sealing", async () => {
    const f = fixture();
    f.hooks.issuance = async () => {
      f.fence.expiresAt = START + 5_000;
      return true;
    };
    expect(await f.issuer.issue(f.request)).toBeNull();
    expect(f.ports.registerIssuance).toHaveBeenCalledTimes(1);
    expect((f.ports.registerIssuance.mock.calls[0][0] as { expiresAt: number }).expiresAt).toBe(
      START + 40_000,
    );
  });

  it("does not extend the sealed lifetime when Auth and protected records renew during registration", async () => {
    const f = fixture();
    f.hooks.issuance = async () => {
      f.identity.expiresAt = START + 100_000;
      f.fence.expiresAt = START + 100_000;
      f.current.allowlist.expiresAt = START + 100_000;
      return true;
    };
    const issued = await f.issuer.issue(f.request);
    expect(issued?.expiresAt).toBe(START + 40_000);
    expect((await unseal(issued!.activeAuthority, OWNER, THREAD, 4)).expires).toBe(START + 40_000);
  });

  it("fails closed after a committed-registration model loses its reply, without returning or retrying a token", async () => {
    const f = fixture();
    const committed: unknown[] = [];
    f.ports.registerIssuance.mockImplementation(async (record) => {
      committed.push(structuredClone(record));
      throw new Error("fictional private transport body");
    });
    expect(await f.issuer.issue(f.request)).toBeNull();
    expect(committed).toHaveLength(1);
    expect(f.ports.registerIssuance).toHaveBeenCalledTimes(1);
    expect(f.ports.registerGeneration).toHaveBeenCalledTimes(1);
  });

  it("keeps concurrent pending attempts separate when one local service is cancelled", async () => {
    const left = fixture(),
      right = fixture();
    const entered = [deferred<void>(), deferred<void>()];
    const replies = [deferred<boolean>(), deferred<boolean>()];
    for (const [index, f] of [left, right].entries()) {
      f.hooks.issuance = async () => {
        entered[index].resolve();
        return replies[index].promise;
      };
    }
    const a = left.issuer.issue(left.request),
      b = right.issuer.issue(right.request);
    await Promise.all(entered.map((item) => item.promise));
    left.service.cancelThread(THREAD, "review-only-left");
    replies[1].resolve(true);
    const winner = await b;
    replies[0].resolve(true);
    expect(await a).toBeNull();
    expect(winner).not.toBeNull();
    expect((await unseal(winner!.activeAuthority, OWNER, THREAD, 4)).authority).toEqual(
      right.service.exportAuthority(THREAD),
    );
    expect(left.ports.registerIssuance).toHaveBeenCalledTimes(1);
    expect(right.ports.registerIssuance).toHaveBeenCalledTimes(1);
  });
});
