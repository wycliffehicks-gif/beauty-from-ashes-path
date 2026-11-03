// Independent orchestration review using the actual v2 transport adapters and
// unchanged local crypto. Auth and persisted rows below are deliberately modeled;
// these are not SQL, remote Auth, native concurrency, HTTP or provider evidence.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import { createVoiceV2AuthorityIssuer } from "../service/voice-v2-issuance.server";
import {
  createVoiceV2ParentIssuanceRpcPorts,
  type VoiceV2IssuanceReceipt,
  type VoiceV2ParentReceipt,
} from "../service/voice-v2-parent-issuance-rpc.server";
import { createVoiceV2PreissueRpcPorts } from "../service/voice-v2-preissue-rpc.server";

const OWNER = "a1111111-1111-4111-8111-111111111111";
const SESSION = "a2222222-2222-4222-8222-222222222222";
const THREAD = "a3333333-3333-4333-8333-333333333333";
const INCARNATION = "a4444444-4444-4444-8444-444444444444";
const CREATED = "2026-11-03T12:00:00.123456Z";
const START = 1_793_700_000_000;
type Args = Readonly<Record<string, unknown>>;
const success = (data: unknown) => ({ data, error: null, status: 200 });

function fixture() {
  const clock = { now: START };
  const hooks: { beforePort?: () => void } = {};
  let parent: VoiceV2ParentReceipt | null = null;
  let generation: string | null = null;
  let issuance: VoiceV2IssuanceReceipt | null = null;
  const writes: string[] = [];
  const now = vi.fn(() => clock.now);
  const authenticate = vi.fn(async () => {
    hooks.beforePort?.();
    return { ownerId: OWNER, sessionId: SESSION, expiresAt: START + 90_000 };
  });
  const current = () => ({
    protocol: 2,
    ownerId: OWNER,
    authSessionId: SESSION,
    parentVersion: 0,
    threadId: THREAD,
    threadRevision: 7,
    sourceCreatedAt: CREATED,
    threadIncarnation: generation,
    deleted: false,
    allowlist: { ownerId: OWNER, admitted: true, expiresAt: START + 80_000 },
  });
  const parentRpc = vi.fn(async (name: string, args: Args) => {
    hooks.beforePort?.();
    if (name === "bfa_p5_v2_read_parent") return success(parent);
    if (name === "bfa_p5_v2_observe_parent") {
      writes.push(name);
      parent ??= {
        protocol: 2,
        ownerId: OWNER,
        authSessionId: SESSION,
        parentVersion: 0,
        revoked: false,
      };
      return success(parent);
    }
    if (name === "bfa_p5_v2_register_issuance") {
      writes.push(name);
      issuance = {
        protocol: 2,
        ownerId: args.p_owner_id as string,
        authSessionId: args.p_auth_session_id as string,
        parentVersion: args.p_parent_version as number,
        authorityFingerprint: args.p_fingerprint as string,
        threadId: args.p_thread_id as string,
        threadIncarnation: args.p_incarnation as string,
        threadRevision: args.p_revision as number,
        issuedAt: args.p_issued_ms as number,
        expiresAt: args.p_expires_ms as number,
        revoked: false,
      };
      return success(issuance);
    }
    if (name === "bfa_p5_v2_read_issuance") return success(issuance);
    throw new Error("Unexpected modeled parent/issuance operation");
  });
  const preissueRpc = vi.fn(async (name: string, _args: Args) => {
    hooks.beforePort?.();
    if (name === "bfa_p5_v2_read_current_thread") return success(current());
    if (name === "bfa_p5_v2_register_generation") {
      writes.push(name);
      generation = INCARNATION;
      return success(current());
    }
    throw new Error("Unexpected modeled pre-issuance operation");
  });
  const issuer = createVoiceV2AuthorityIssuer({
    ...createVoiceV2ParentIssuanceRpcPorts({ rpc: parentRpc }),
    ...createVoiceV2PreissueRpcPorts({ rpc: preissueRpc }),
    now,
    authenticate,
    maxAuthorityAgeMs: 60_000,
  });
  const service = new ConversationService({ verifiedOwnerId: OWNER });
  service.ensureThread(THREAD, false);
  return {
    issuer,
    service,
    now,
    clock,
    hooks,
    writes,
    authenticate,
    parentRpc,
    preissueRpc,
    input: { service, threadId: THREAD, threadRevision: 7, sourceCreatedAt: CREATED },
  };
}

describe("P5 v2 issuer independent await-boundary review", () => {
  beforeEach(() => vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID()));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  async function boundaries() {
    const baseline = fixture();
    expect(await baseline.issuer.issue(baseline.input)).not.toBeNull();
    expect(baseline.writes).toEqual([
      "bfa_p5_v2_observe_parent",
      "bfa_p5_v2_register_generation",
      "bfa_p5_v2_register_issuance",
    ]);
    return baseline.now.mock.calls.length;
  }

  it("starts no further Auth, protected read or write after cancellation at each observed clock-read microtask boundary", async () => {
    const count = await boundaries();
    expect(count).toBeGreaterThan(0);
    for (let boundary = 1; boundary <= count; boundary += 1) {
      const f = fixture();
      let cancelled = false;
      let calls = 0;
      const violations: number[] = [];
      f.now.mockImplementation(() => {
        if (++calls === boundary)
          queueMicrotask(() => {
            cancelled = true;
            f.issuer.cancel();
          });
        return f.clock.now;
      });
      f.hooks.beforePort = () => {
        if (cancelled) violations.push(boundary);
      };
      const result = await f.issuer.issue(f.input);
      expect(violations, `port after cancellation boundary ${boundary}`).toEqual([]);
      // At the final synchronous check, the result can already have been
      // released before this queued change runs. Local cancel cannot retract it.
      if (boundary < count) expect(result).toBeNull();
      expect(cancelled).toBe(true);
      expect(f.issuer.snapshot().state).toBe("cancelled");
      expect(await f.issuer.issue(f.input)).toBeNull();
      expect(f.writes.length).toBe(new Set(f.writes).size);
    }
  });

  it("starts no further port after conservative verification reaches exactly 30000 ms in an intervening microtask", async () => {
    const count = await boundaries();
    for (let boundary = 1; boundary <= count; boundary += 1) {
      const f = fixture();
      let calls = 0;
      const violations: number[] = [];
      f.now.mockImplementation(() => {
        if (++calls === boundary)
          queueMicrotask(() => {
            f.clock.now = START + 30_000;
          });
        return f.clock.now;
      });
      f.hooks.beforePort = () => {
        if (f.clock.now - START >= 30_000) violations.push(boundary);
      };
      const result = await f.issuer.issue(f.input);
      expect(violations, `stale port after boundary ${boundary}`).toEqual([]);
      if (boundary < count) expect(result).toBeNull();
      expect(f.clock.now).toBe(START + 30_000);
      expect(await f.issuer.issue(f.input)).toBeNull();
      expect(f.writes.length).toBe(new Set(f.writes).size);
    }
  });

  it("starts no further port after the owned service snapshot changes in an intervening microtask", async () => {
    const count = await boundaries();
    for (let boundary = 1; boundary <= count; boundary += 1) {
      const f = fixture();
      let changed = false;
      let calls = 0;
      const violations: number[] = [];
      f.now.mockImplementation(() => {
        if (++calls === boundary)
          queueMicrotask(() => {
            changed = true;
            f.service.cancelThread(THREAD, "independent-issuance-review");
          });
        return f.clock.now;
      });
      f.hooks.beforePort = () => {
        if (changed) violations.push(boundary);
      };
      const result = await f.issuer.issue(f.input);
      expect(violations, `port after changed service at boundary ${boundary}`).toEqual([]);
      if (boundary < count) expect(result).toBeNull();
      expect(changed).toBe(true);
      expect(await f.issuer.issue(f.input)).toBeNull();
      expect(f.writes.length).toBe(new Set(f.writes).size);
    }
  });
});
