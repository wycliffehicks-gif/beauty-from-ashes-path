// Independent composition of the real bridge, both exact RPC adapters and local
// crypto. Auth, current metadata and RPC persistence below are fictional doubles;
// these cases are not database concurrency, HTTP faults or provider acceptance.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createVoiceCapacityStoreAdmission,
  type VoiceOperationProof,
} from "../service/voice-store-adapter.server";
import { createVoiceRpcStore, type VoiceRpcName } from "../service/voice-rpc-store.server";
import {
  createVoiceCapacityRpcPorts,
  type VoiceCapacityRpcName,
} from "../service/voice-capacity-rpc.server";
import type { VoiceAdmissionClaim } from "../service/voice-admission.server";
import { ConversationService } from "../service/service";
import { fingerprint, seal } from "../staging/seal.server";

type Name = VoiceRpcName | VoiceCapacityRpcName;
type Args = Readonly<Record<string, unknown>>;
const OWNER = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";
const INCARNATION = "33333333-3333-4333-8333-333333333333";
const ATTEMPT = "44444444-4444-4444-8444-444444444444";
const APPROVAL = "55555555-5555-4555-8555-555555555555";
const SESSION = "66666666-6666-4666-8666-666666666666";
const START = 1_790_000_000_000;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture() {
  const clock: { now: number; onRead?: () => void } = { now: START };
  vi.spyOn(Date, "now").mockImplementation(() => clock.now);
  const service = new ConversationService({ verifiedOwnerId: OWNER });
  service.ensureThread(THREAD, false);
  const token = await seal({
    owner: OWNER,
    thread: THREAD,
    revision: 7,
    expires: START + 20_000,
    authority: service.exportAuthority(THREAD),
  });
  const request = {
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 7,
    attemptId: ATTEMPT,
    activeAuthority: token,
  };
  const identity = { ownerId: OWNER, sessionId: SESSION, expiresAt: START + 30_000 };
  const fence = { ...identity, version: 4, revoked: false };
  const binding = {
    ownerId: OWNER,
    threadId: THREAD,
    threadIncarnation: INCARNATION,
    threadRevision: 7,
  };
  const current = {
    ...binding,
    deleted: false,
    allowlist: { ownerId: OWNER, admitted: true, expiresAt: START + 15_000 },
    authority: {
      ...binding,
      fingerprint: await fingerprint(token),
      expiresAt: START + 20_000,
      revoked: false,
    },
    approval: {
      ...binding,
      id: APPROVAL,
      digest: "a".repeat(64),
      scope: "developer-voice-session",
      attemptId: ATTEMPT,
      expiresAt: START + 10_000,
      revoked: false,
    },
  };
  const calls: { name: Name; args: Args }[] = [];
  const proofs = new Map<string, { proof: VoiceOperationProof; consumed: boolean }>();
  const held = { cumulative: 0, slot: false, closed: false, operationId: null as string | null };
  const hooks: { afterReply?: (name: Name, data: unknown) => unknown | Promise<unknown> } = {};
  const client = {
    async rpc(name: Name, args: Args) {
      calls.push({ name, args });
      let data: unknown;
      const claim = args.p_claim as VoiceAdmissionClaim;
      const ack = (state: string) => ({ claim, state });
      const consume = (operation: "claim" | "inspect") => {
        const entry = proofs.get(args.p_receipt_id as string);
        if (!entry || entry.consumed || entry.proof.operation !== operation) return false;
        entry.consumed = true;
        return true;
      };
      switch (name) {
        case "bfa_p5_voice_register_cleanup":
          data = { cleanupId: args.p_cleanup_id, claim };
          break;
        case "bfa_p5_voice_register_proof": {
          const p = args.p_proof as VoiceOperationProof;
          proofs.set(p.receiptId, { proof: p, consumed: false });
          data = {
            receiptId: p.receiptId,
            operation: p.operation,
            claim: p.claim,
            expiresAt: p.expiresAt,
            effectiveExpiresAt: p.effectiveExpiresAt,
          };
          break;
        }
        case "bfa_p5_capacity_claim":
          if (consume("claim") && !held.closed) {
            held.cumulative = 1;
            held.slot = true;
            data = ack("claimed");
          } else data = ack("denied");
          break;
        case "bfa_p5_voice_inspect":
          data = ack(consume("inspect") && !held.closed ? "claimed" : "denied");
          break;
        case "bfa_p5_capacity_mark":
          if (!consume("inspect") || held.closed || !held.slot) data = ack("denied");
          else if (held.operationId) data = ack("already-marked");
          else {
            held.operationId = args.p_operation_id as string;
            data = ack("marked");
          }
          break;
        case "bfa_p5_capacity_close":
          held.closed = true;
          if (!held.operationId) held.slot = false;
          data = ack("closed");
          break;
        default:
          throw new Error("Unexpected fictional RPC");
      }
      return { data: hooks.afterReply ? await hooks.afterReply(name, data) : data, error: null };
    },
  };
  const store = createVoiceRpcStore(client);
  const capacity = createVoiceCapacityRpcPorts(client);
  const authenticate = vi.fn(async (): Promise<unknown> => structuredClone(identity));
  const bridge = createVoiceCapacityStoreAdmission({
    ...store,
    mark: capacity.mark,
    expectedPoolVersion: 3,
    maxProofAgeMs: 100,
    now: () => {
      clock.onRead?.();
      return clock.now;
    },
    authenticate,
    readSessionFence: async () => structuredClone(fence),
    readCurrent: async () => structuredClone(current),
  });
  const lease = await bridge.admit(request);
  expect(lease?.snapshot().state).toBe("active");
  return {
    lease: lease!,
    bridge,
    clock,
    current,
    identity,
    fence,
    calls,
    proofs,
    held,
    hooks,
    authenticate,
  };
}

describe("independent admission-owned capacity marker composition", () => {
  beforeEach(() => vi.stubEnv("BFA_P3B_STATE_SECRET", crypto.randomUUID()));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("owns an immutable attempt before the first Auth wait and never shares one success across callers", async () => {
    const h = await fixture();
    const pause = deferred<unknown>();
    h.authenticate.mockImplementationOnce(() => pause.promise);
    const first = h.lease.markCapacity();
    const pending = h.lease.markerSnapshot();
    expect(pending).toMatchObject({
      state: "pending",
      expectedPoolVersion: 3,
      acknowledgment: null,
    });
    expect(Object.isFrozen(pending)).toBe(true);
    expect(await h.lease.markCapacity()).toBeNull();
    expect(h.calls.filter((c) => c.name === "bfa_p5_capacity_mark")).toHaveLength(0);
    pause.resolve(h.identity);
    expect(await first).toMatchObject({ state: "marked", operationId: pending!.operationId });
    expect(await h.lease.markCapacity()).toBeNull();
    expect(h.lease.markerSnapshot()).toMatchObject({
      state: "observed",
      operationId: pending!.operationId,
    });
    const marked = h.calls.filter((c) => c.name === "bfa_p5_capacity_mark");
    const inspected = h.calls.filter((c) => c.name === "bfa_p5_voice_inspect");
    expect(marked).toHaveLength(1);
    expect(inspected).toHaveLength(1);
    expect(marked[0]!.args.p_receipt_id).not.toBe(inspected[0]!.args.p_receipt_id);
    expect(h.proofs.get(marked[0]!.args.p_receipt_id as string)?.consumed).toBe(true);
    expect(JSON.stringify(h.lease.markerSnapshot())).not.toContain("receiptId");
    await h.lease.close();
    expect(h.held).toMatchObject({ slot: true, cumulative: 1, closed: true });
  });

  it("fences same-tick close before the underlying cleanup microtask or any marker Auth read", async () => {
    const h = await fixture();
    const reads = h.authenticate.mock.calls.length;
    const closing = h.lease.close();
    const marking = h.lease.markCapacity();
    expect(h.authenticate).toHaveBeenCalledTimes(reads);
    expect(await marking).toBeNull();
    await closing;
    expect(h.calls.filter((c) => c.name === "bfa_p5_capacity_mark")).toHaveLength(0);
    expect(h.held).toMatchObject({ slot: false, cumulative: 1, closed: true });
  });

  it("does not resurrect an invalid base lease when temporary Auth failure clears", async () => {
    const h = await fixture();
    h.authenticate.mockResolvedValueOnce(null);
    expect(await h.lease.revalidate()).toBe(false);
    expect(h.lease.snapshot().state).toBe("invalid");
    const reads = h.authenticate.mock.calls.length;
    expect(await h.lease.markCapacity()).toBeNull();
    expect(h.authenticate).toHaveBeenCalledTimes(reads);
    expect(h.calls.filter((c) => c.name === "bfa_p5_capacity_mark")).toHaveLength(0);
    await h.lease.close();
  });

  it("never invokes a base inspection after close starts at any observed clock-read microtask boundary", async () => {
    const reference = await fixture();
    let boundaries = 0;
    reference.clock.onRead = () => {
      boundaries += 1;
    };
    expect(await reference.lease.revalidate()).toBe(true);
    reference.clock.onRead = undefined;
    await reference.lease.close();
    expect(boundaries).toBeGreaterThan(0);
    // Explore scheduler boundaries without assuming an implementation-specific
    // clock-read count. The clock remains valid and monotonic in every case.
    for (let at = 1; at <= boundaries; at += 1) {
      const h = await fixture();
      let read = 0;
      let closeStarted = false;
      let closing: Promise<void> | undefined;
      let inspectionsAfterClose = 0;
      h.hooks.afterReply = (name, data) => {
        if (name === "bfa_p5_voice_inspect" && closeStarted) inspectionsAfterClose += 1;
        return data;
      };
      h.clock.onRead = () => {
        read += 1;
        if (read === at)
          queueMicrotask(() => {
            closeStarted = true;
            closing = h.lease.close();
          });
      };
      await h.lease.revalidate();
      await closing;
      expect(closeStarted, `clock boundary ${at}`).toBe(true);
      expect(inspectionsAfterClose, `clock boundary ${at}`).toBe(0);
      expect(h.lease.snapshot().state).toBe("closed");
    }
  });

  it("withholds an already committed marker after concurrent base revalidation invalidates the lease", async () => {
    const h = await fixture();
    const pause = deferred<unknown>();
    let committed: unknown;
    h.hooks.afterReply = (name, data) => {
      if (name !== "bfa_p5_capacity_mark") return data;
      committed = data;
      return pause.promise;
    };
    const marking = h.lease.markCapacity();
    await vi.waitFor(() => expect(committed).toBeDefined());
    h.authenticate.mockResolvedValueOnce(null);
    expect(await h.lease.revalidate()).toBe(false);
    pause.resolve(committed);
    expect(await marking).toBeNull();
    expect(await h.lease.markCapacity()).toBeNull();
    expect(h.lease.markerSnapshot()?.state).toBe("unconfirmed");
    await h.lease.close();
    expect(h.held).toMatchObject({ slot: true, cumulative: 1, closed: true });
  });

  it("retains exact marker and cleanup evidence if same-owner session version changes during the reply", async () => {
    const h = await fixture();
    h.hooks.afterReply = (name, data) => {
      if (name === "bfa_p5_capacity_mark") h.fence.version += 1;
      return data;
    };
    expect(await h.lease.markCapacity()).toBeNull();
    const evidence = h.lease.markerSnapshot()!;
    expect(evidence).toMatchObject({ state: "unconfirmed", acknowledgment: "marked" });
    expect(evidence.operationId).toBe(h.held.operationId);
    h.authenticate.mockRejectedValue(new Error("fictional Auth unavailable"));
    h.clock.now = -1;
    await h.lease.close();
    const close = h.calls.find((c) => c.name === "bfa_p5_capacity_close")!;
    expect(close.args).toEqual({ p_cleanup_id: evidence.cleanupId, p_claim: evidence.claim });
    expect(h.lease.markerSnapshot()).toEqual(evidence);
    expect(await h.lease.markCapacity()).toBeNull();
    expect(h.held).toMatchObject({ slot: true, cumulative: 1, closed: true });
  });

  it("does not report local success when approval shortens beneath the committed proof ceiling", async () => {
    const h = await fixture();
    h.hooks.afterReply = (name, data) => {
      if (name === "bfa_p5_capacity_mark") h.current.approval.expiresAt = START + 500;
      return data;
    };
    expect(await h.lease.markCapacity()).toBeNull();
    expect(h.lease.markerSnapshot()).toMatchObject({
      state: "unconfirmed",
      acknowledgment: "marked",
    });
    expect(h.held.operationId).toBe(h.lease.markerSnapshot()!.operationId);
    await h.lease.close();
  });

  it("keeps a lost committed response ambiguous without remarking or substituting cleanup identity", async () => {
    const h = await fixture();
    h.hooks.afterReply = (name, data) => {
      if (name === "bfa_p5_capacity_mark")
        throw new Error("fictional reply discarded after modeled commit");
      return data;
    };
    expect(await h.lease.markCapacity()).toBeNull();
    const evidence = h.lease.markerSnapshot()!;
    expect(evidence).toMatchObject({ state: "unconfirmed", acknowledgment: null });
    expect(evidence.operationId).toBe(h.held.operationId);
    expect(await h.lease.markCapacity()).toBeNull();
    await h.lease.close();
    expect(h.calls.filter((c) => c.name === "bfa_p5_capacity_mark")).toHaveLength(1);
    expect(h.held).toMatchObject({ slot: true, cumulative: 1, closed: true });
    expect(h.lease.markerSnapshot()).toEqual(evidence);
  });
});
