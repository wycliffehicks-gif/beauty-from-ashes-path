// Independent composition: actual adapters and issuer/local crypto, explicitly
// modeled protected records and Auth. This is not SQL, HTTP, native contention,
// real Auth verification/propagation, provider evidence or runtime integration.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import { createVoiceAuthorityIssuer } from "../service/voice-issuance.server";
import { createVoiceReadRpcPorts } from "../service/voice-read-rpc.server";
import { createVoiceSessionProvisionRpcPorts } from "../service/voice-session-provision-rpc.server";
import { createVoiceSessionRevokeRpcPorts } from "../service/voice-session-revoke-rpc.server";
import { fingerprint, unseal } from "../staging/seal.server";

const OWNER = "e1111111-1111-4111-8111-111111111111";
const SESSION = "e2222222-2222-4222-8222-222222222222";
const OTHER_SESSION = "e3333333-3333-4333-8333-333333333333";
const THREAD = "e4444444-4444-4444-8444-444444444444";
const INCARNATION = "e5555555-5555-4555-8555-555555555555";
const CREATED = "2026-11-01T12:00:00.000Z";
const START = 1_793_500_000_000;
type Args = Readonly<Record<string, unknown>>;
type Fence = {
  ownerId: string;
  sessionId: string;
  version: number;
  expiresAt: number;
  revoked: boolean;
};
const success = (data: unknown) => ({ data, error: null, status: 200 });
const key = (owner: string, session: string) => `${owner}:${session}`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture() {
  const clock = { now: START };
  vi.spyOn(Date, "now").mockImplementation(() => clock.now);
  const service = new ConversationService({ verifiedOwnerId: OWNER });
  service.ensureThread(THREAD, false);
  const rows = new Map<string, Fence>();
  const query = {
    ownerId: OWNER,
    sessionId: SESSION,
    verifiedAt: START,
    expiresAt: START + 20_000,
  };
  const current = {
    ownerId: OWNER,
    threadId: THREAD,
    threadRevision: 4,
    sourceCreatedAt: CREATED,
    threadIncarnation: null as string | null,
    deleted: false as const,
    allowlist: { ownerId: OWNER, admitted: true as const, expiresAt: START + 60_000 },
  };
  const hooks: {
    provisionReply?: (receipt: Fence | null) => Promise<unknown>;
    generation?: () => Promise<void>;
  } = {};
  const provisionRpc = vi.fn(async (_name: string, args: Args) => {
    const ownerId = args.p_owner_id as string;
    const sessionId = args.p_session_id as string;
    const expiresAt = args.p_expires_ms as number;
    // Model only enough persistence to exercise downstream orchestration.
    // The separate actual-SQL suite establishes database mutation/lock behavior.
    let row = rows.get(key(ownerId, sessionId));
    let receipt: Fence | null = null;
    if (!row) {
      row = { ownerId, sessionId, expiresAt, version: 0, revoked: false };
      rows.set(key(ownerId, sessionId), row);
    }
    if (!row.revoked && row.expiresAt === expiresAt && clock.now < row.expiresAt)
      receipt = structuredClone(row);
    return success(hooks.provisionReply ? await hooks.provisionReply(receipt) : receipt);
  });
  const revocations = createVoiceSessionRevokeRpcPorts({
    async rpc(_name, args) {
      const ownerId = args.p_owner_id as string;
      const sessionId = args.p_session_id as string;
      let row = rows.get(key(ownerId, sessionId));
      if (!row) {
        row = { ownerId, sessionId, expiresAt: 1, version: 0, revoked: true };
        rows.set(key(ownerId, sessionId), row);
      } else if (!row.revoked) {
        row.version = Math.min(Number.MAX_SAFE_INTEGER, row.version + 1);
        row.revoked = true;
      }
      return success(structuredClone(row));
    },
  });
  const readRpc = vi.fn(async (name: string, args: Args) => {
    if (name !== "bfa_p5_voice_read_session_fence") throw new Error("unexpected model read");
    const row = rows.get(key(args.p_owner_id as string, args.p_session_id as string));
    return success(row && !row.revoked && clock.now < row.expiresAt ? structuredClone(row) : null);
  });
  const authenticate = vi.fn<() => Promise<unknown>>(async () => ({
    ownerId: OWNER,
    sessionId: SESSION,
    expiresAt: START + 50_000,
  }));
  const registerGeneration = vi.fn(async () => {
    current.threadIncarnation = INCARNATION;
    await hooks.generation?.();
    return INCARNATION;
  });
  const registerIssuance = vi.fn(async (_record: unknown) => true);
  const issuer = createVoiceAuthorityIssuer({
    ...createVoiceReadRpcPorts({ rpc: readRpc }),
    authenticate,
    now: () => clock.now,
    maxAuthorityAgeMs: 60_000,
    readCurrentThread: async () => structuredClone(current),
    registerGeneration,
    registerIssuance,
  });
  return {
    clock,
    service,
    rows,
    query,
    current,
    hooks,
    provisionRpc,
    provisions: createVoiceSessionProvisionRpcPorts({ rpc: provisionRpc }),
    revocations,
    readRpc,
    authenticate,
    registerGeneration,
    registerIssuance,
    issuer,
    request: { service, threadId: THREAD, threadRevision: 4, sourceCreatedAt: CREATED },
  };
}

describe("P5 insert-once session provisioning independent issuer review", () => {
  beforeEach(() => vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID()));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("requires the separately provisioned fence and bounds the actual sealed issuance by its expiry", async () => {
    const f = fixture();
    expect(await f.issuer.issue(f.request)).toBeNull();
    expect(f.registerGeneration).not.toHaveBeenCalled();
    const receipt = await f.provisions.provisionSession(f.query);
    expect(receipt?.version).toBe(0);
    const issued = await f.issuer.issue(f.request);
    expect(issued?.expiresAt).toBe(f.query.expiresAt);
    const envelope = await unseal(issued!.activeAuthority, OWNER, THREAD, 4);
    expect(envelope.authority).toEqual(f.service.exportAuthority(THREAD));
    expect(envelope.expires).toBe(f.query.expiresAt);
    const registration = f.registerIssuance.mock.calls[0][0] as Record<string, unknown>;
    expect(registration.authorityFingerprint).toBe(await fingerprint(issued!.activeAuthority));
    expect(f.provisionRpc).toHaveBeenCalledTimes(1);
  });

  it("does not treat a matching active provisioning acknowledgment as verified Auth", async () => {
    const f = fixture();
    expect(await f.provisions.provisionSession(f.query)).not.toBeNull();
    f.authenticate.mockResolvedValue(null);
    expect(await f.issuer.issue(f.request)).toBeNull();
    expect(f.readRpc).not.toHaveBeenCalled();
    expect(f.registerGeneration).not.toHaveBeenCalled();
    expect(f.registerIssuance).not.toHaveBeenCalled();
    expect(f.rows.get(key(OWNER, SESSION))?.revoked).toBe(false);
  });

  it("retains a modeled committed fence after a lost reply without automatically retrying or issuing", async () => {
    const f = fixture();
    f.hooks.provisionReply = async () => {
      throw new Error("fictional response lost after commit");
    };
    await expect(f.provisions.provisionSession(f.query)).rejects.toThrow(
      "voice-session-provision-rpc-unavailable",
    );
    expect(f.rows.get(key(OWNER, SESSION))).toEqual({
      ownerId: OWNER,
      sessionId: SESSION,
      version: 0,
      expiresAt: f.query.expiresAt,
      revoked: false,
    });
    expect(f.provisionRpc).toHaveBeenCalledTimes(1);
    expect(f.authenticate).not.toHaveBeenCalled();
    expect(f.registerIssuance).not.toHaveBeenCalled();
    await f.revocations.revokeSession({ ownerId: OWNER, sessionId: SESSION });
    expect(await f.issuer.issue(f.request)).toBeNull();
    expect(f.provisionRpc).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a late active receipt after revocation as a current issuer fence", async () => {
    const f = fixture();
    const entered = deferred<void>();
    const reply = deferred<unknown>();
    let committed: Fence | null = null;
    f.hooks.provisionReply = async (receipt) => {
      committed = receipt;
      entered.resolve();
      return reply.promise;
    };
    const pending = f.provisions.provisionSession(f.query);
    await entered.promise;
    await f.revocations.revokeSession({ ownerId: OWNER, sessionId: SESSION });
    reply.resolve(committed);
    // Exact transport reports historical acknowledgment, not fresh eligibility.
    expect((await pending)?.revoked).toBe(false);
    expect(f.rows.get(key(OWNER, SESSION))?.revoked).toBe(true);
    expect(await f.issuer.issue(f.request)).toBeNull();
    expect(f.registerGeneration).not.toHaveBeenCalled();
  });

  it("refuses current issuance after a provisioning response arrives beyond its immutable expiry", async () => {
    const f = fixture();
    f.hooks.provisionReply = async (receipt) => {
      f.clock.now = f.query.expiresAt;
      return receipt;
    };
    expect(await f.provisions.provisionSession(f.query)).not.toBeNull();
    expect(await f.issuer.issue(f.request)).toBeNull();
    expect(f.registerGeneration).not.toHaveBeenCalled();
    expect(f.rows.get(key(OWNER, SESSION))?.expiresAt).toBe(f.query.expiresAt);
  });

  it("withholds issuance when revocation wins while generation acknowledgment is pending", async () => {
    const f = fixture();
    await f.provisions.provisionSession(f.query);
    const entered = deferred<void>();
    const release = deferred<void>();
    f.hooks.generation = async () => {
      entered.resolve();
      await release.promise;
    };
    const pending = f.issuer.issue(f.request);
    await entered.promise;
    await f.revocations.revokeSession({ ownerId: OWNER, sessionId: SESSION });
    release.resolve();
    expect(await pending).toBeNull();
    expect(f.current.threadIncarnation).toBe(INCARNATION);
    expect(f.registerGeneration).toHaveBeenCalledTimes(1);
    expect(f.registerIssuance).not.toHaveBeenCalled();
  });

  it("does not let another session's provisioned row satisfy the current Auth identity", async () => {
    const f = fixture();
    await f.provisions.provisionSession({ ...f.query, sessionId: OTHER_SESSION });
    expect(await f.issuer.issue(f.request)).toBeNull();
    expect(f.readRpc).toHaveBeenCalledWith("bfa_p5_voice_read_session_fence", {
      p_owner_id: OWNER,
      p_session_id: SESSION,
    });
    expect(f.rows.has(key(OWNER, OTHER_SESSION))).toBe(true);
    expect(f.rows.has(key(OWNER, SESSION))).toBe(false);
    expect(f.registerGeneration).not.toHaveBeenCalled();
  });
});
