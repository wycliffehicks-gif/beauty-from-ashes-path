// Independent composition: actual issuer, metadata adapter and local crypto.
// RPC/Auth are fictional; these are not native SQL, HTTP or Auth acceptance.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import { createVoiceAuthorityIssuer } from "../service/voice-issuance.server";
import { createVoicePreissueReadRpcPorts } from "../service/voice-preissue-read-rpc.server";
import { fingerprint, unseal } from "../staging/seal.server";

const OWNER = "e1111111-1111-4111-8111-111111111111";
const THREAD = "e2222222-2222-4222-8222-222222222222";
const SESSION = "e3333333-3333-4333-8333-333333333333";
const INCARNATION = "e4444444-4444-4444-8444-444444444444";
const CREATED = "2026-10-31T08:00:00.123456Z";
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
  const state = { now: START, authenticated: true };
  const identity = { ownerId: OWNER, sessionId: SESSION, expiresAt: START + 40_000 };
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
    read?: (index: number) => Promise<unknown>;
    generation?: () => Promise<string>;
  } = {};
  let reads = 0;
  const rpc = vi.fn(async (_name: string, _args: Readonly<Record<string, unknown>>) => {
    reads += 1;
    return hooks.read
      ? hooks.read(reads)
      : { data: structuredClone(current), error: null, status: 200 };
  });
  const registerGeneration = vi.fn(async () => {
    if (hooks.generation) return hooks.generation();
    current.threadIncarnation = INCARNATION;
    return INCARNATION;
  });
  const registerIssuance = vi.fn(async (_record: unknown) => true);
  const ports = {
    ...createVoicePreissueReadRpcPorts({ rpc }),
    authenticate: vi.fn(async () => (state.authenticated ? structuredClone(identity) : null)),
    readSessionFence: vi.fn(async () => ({ ...identity, version: 3, revoked: false })),
    now: () => state.now,
    maxAuthorityAgeMs: 60_000,
    registerGeneration,
    registerIssuance,
  };
  return {
    service,
    state,
    current,
    hooks,
    rpc,
    ports,
    request: { service, threadId: THREAD, threadRevision: 4, sourceCreatedAt: CREATED },
    issuer: createVoiceAuthorityIssuer(ports),
  };
}

describe("P5 pre-issuance metadata independent composition review", () => {
  beforeEach(() => {
    vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID());
    vi.spyOn(Date, "now").mockReturnValue(START);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("preserves exact microseconds across absent-to-registered generation reads and actual sealing", async () => {
    const f = fixture();
    const issued = await f.issuer.issue(f.request);
    expect(issued).not.toBeNull();
    expect(f.rpc).toHaveBeenCalledTimes(4);
    for (const [name, args] of f.rpc.mock.calls) {
      expect(name).toBe("bfa_p5_voice_read_current_thread");
      expect(args).toEqual({ p_owner_id: OWNER, p_thread_id: THREAD });
      expect(Object.isFrozen(args)).toBe(true);
    }
    expect(f.current.sourceCreatedAt).toBe(CREATED);
    expect(issued!.threadIncarnation).toBe(INCARNATION);
    expect((await unseal(issued!.activeAuthority, OWNER, THREAD, 4)).authority).toEqual(
      f.service.exportAuthority(THREAD),
    );
    expect(f.ports.registerIssuance).toHaveBeenCalledWith(
      expect.objectContaining({ authorityFingerprint: await fingerprint(issued!.activeAuthority) }),
    );
  });

  it("rejects a one-microsecond lifecycle mismatch even when JavaScript Date would collapse it", async () => {
    const f = fixture();
    f.current.sourceCreatedAt = "2026-10-31T08:00:00.123457Z";
    expect(Date.parse(f.current.sourceCreatedAt)).toBe(Date.parse(CREATED));
    expect(await f.issuer.issue(f.request)).toBeNull();
    expect(f.ports.registerGeneration).not.toHaveBeenCalled();
    expect(f.ports.registerIssuance).not.toHaveBeenCalled();
  });

  it("does not manufacture a generation when the protected read still reports absence after registration", async () => {
    const f = fixture();
    f.hooks.generation = async () => INCARNATION;
    expect(await f.issuer.issue(f.request)).toBeNull();
    expect(f.rpc).toHaveBeenCalledTimes(2);
    expect(f.ports.registerGeneration).toHaveBeenCalledTimes(1);
    expect(f.ports.registerIssuance).not.toHaveBeenCalled();
    expect(f.current.threadIncarnation).toBeNull();
  });

  it("withholds the token after acknowledged issuance if the final protected metadata read denies", async () => {
    const f = fixture();
    f.hooks.read = async (index) => ({
      data: index === 4 ? null : structuredClone(f.current),
      error: null,
      status: 200,
    });
    expect(await f.issuer.issue(f.request)).toBeNull();
    expect(f.ports.registerIssuance).toHaveBeenCalledTimes(1);
    expect(f.rpc).toHaveBeenCalledTimes(4);
    expect(f.current.threadIncarnation).toBe(INCARNATION);
    // A committed registration can remain dormant; denial never retries or erases it.
    expect(f.ports.registerGeneration).toHaveBeenCalledTimes(1);
  });

  it("rechecks Auth after an initially valid metadata response waited across revocation", async () => {
    const f = fixture();
    const entered = deferred<void>();
    const reply = deferred<unknown>();
    f.hooks.read = async () => {
      entered.resolve();
      return reply.promise;
    };
    const pending = f.issuer.issue(f.request);
    await entered.promise;
    f.state.authenticated = false;
    reply.resolve({ data: structuredClone(f.current), error: null, status: 200 });
    expect(await pending).toBeNull();
    expect(f.ports.authenticate).toHaveBeenCalledTimes(2);
    expect(f.ports.registerGeneration).not.toHaveBeenCalled();
    expect(f.ports.registerIssuance).not.toHaveBeenCalled();
  });

  it("rejects an otherwise fresh metadata response arriving at the exact total issuance-age limit", async () => {
    const f = fixture();
    const entered = deferred<void>();
    const reply = deferred<unknown>();
    f.hooks.read = async () => {
      entered.resolve();
      return reply.promise;
    };
    const pending = f.issuer.issue(f.request);
    await entered.promise;
    f.state.now = START + 30_000;
    reply.resolve({ data: structuredClone(f.current), error: null, status: 200 });
    expect(await pending).toBeNull();
    expect(f.current.allowlist.expiresAt).toBeGreaterThan(f.state.now);
    expect(f.ports.registerGeneration).not.toHaveBeenCalled();
    expect(f.ports.registerIssuance).not.toHaveBeenCalled();
  });

  it("cannot release a registered token from valid-looking data in a failed final RPC envelope", async () => {
    const f = fixture();
    f.hooks.read = async (index) => ({
      data: structuredClone(f.current),
      error: null,
      status: index === 4 ? 503 : 200,
    });
    expect(await f.issuer.issue(f.request)).toBeNull();
    expect(f.rpc).toHaveBeenCalledTimes(4);
    expect(f.ports.registerGeneration).toHaveBeenCalledTimes(1);
    expect(f.ports.registerIssuance).toHaveBeenCalledTimes(1);
  });
});
