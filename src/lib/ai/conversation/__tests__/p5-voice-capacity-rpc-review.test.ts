// Independent composition of the real RPC adapters with a narrow transport
// model. This is not SQL, Auth, provider evidence, or a concurrency guarantee.
import { describe, expect, it } from "vitest";
import type { VoiceAdmissionClaim } from "../service/voice-admission.server";
import type { VoiceOperationProof } from "../service/voice-store-adapter.server";
import { createVoiceRpcStore, type VoiceRpcName } from "../service/voice-rpc-store.server";
import {
  createVoiceCapacityRpcPorts,
  type VoiceCapacityObservation,
  type VoiceCapacityRpcName,
} from "../service/voice-capacity-rpc.server";

type Name = VoiceRpcName | VoiceCapacityRpcName;
type Args = Readonly<Record<string, unknown>>;

function harness() {
  const now = Date.now();
  const claim: VoiceAdmissionClaim = {
    claimId: crypto.randomUUID(),
    binding: {
      ownerId: crypto.randomUUID(),
      threadId: crypto.randomUUID(),
      threadIncarnation: crypto.randomUUID(),
      threadRevision: 0,
      attemptId: crypto.randomUUID(),
      approvalId: crypto.randomUUID(),
      approvalDigest: "b".repeat(64),
      scope: "developer-voice-session",
    },
    expiresAt: now + 60_000,
  };
  const cleanupId = crypto.randomUUID(),
    operationId = crypto.randomUUID(),
    sessionId = crypto.randomUUID();
  const calls: { name: Name; args: Args }[] = [];
  const proofs = new Map<string, { operation: "claim" | "inspect"; consumed: boolean }>();
  const evidence = new Map<string, string>();
  const state = {
    held: 0,
    slotHeld: false,
    closed: false,
    operationId: null as string | null,
    terminal: false,
  };
  const hooks: { afterReply?: (name: Name, data: unknown) => unknown } = {};
  const ack = (value: string) => ({ claim: structuredClone(claim), state: value });
  function consume(args: Args, kind: "claim" | "inspect") {
    const p = proofs.get(args.p_receipt_id as string);
    if (!p || p.operation !== kind || p.consumed) return false;
    p.consumed = true;
    return true;
  }
  const client = {
    async rpc(name: Name, args: Args) {
      calls.push({ name, args });
      let data: unknown;
      if (name === "bfa_p5_voice_register_cleanup") {
        data = { cleanupId: args.p_cleanup_id, claim: args.p_claim };
      } else if (name === "bfa_p5_voice_register_proof") {
        const p = args.p_proof as VoiceOperationProof;
        proofs.set(p.receiptId, { operation: p.operation, consumed: false });
        data = {
          receiptId: p.receiptId,
          operation: p.operation,
          claim: p.claim,
          expiresAt: p.expiresAt,
          effectiveExpiresAt: p.effectiveExpiresAt,
        };
      } else if (name === "bfa_p5_capacity_claim") {
        if (consume(args, "claim") && !state.closed) {
          state.held = 1;
          state.slotHeld = true;
          data = ack("claimed");
        } else data = ack(state.closed ? "closed" : "denied");
      } else if (name === "bfa_p5_voice_inspect") {
        data = ack(consume(args, "inspect") && !state.closed ? "claimed" : "denied");
      } else if (name === "bfa_p5_capacity_mark") {
        const fresh = consume(args, "inspect");
        if (state.closed) data = ack("closed");
        else if (!fresh) data = ack("denied");
        else if (state.operationId)
          data = ack(state.operationId === args.p_operation_id ? "already-marked" : "denied");
        else {
          state.operationId = args.p_operation_id as string;
          data = ack("marked");
        }
      } else if (name === "bfa_p5_capacity_close") {
        state.closed = true;
        if (!state.operationId) state.slotHeld = false;
        data = ack("closed");
      } else {
        const observation = args.p_observation as VoiceCapacityObservation;
        if (args.p_cleanup_id !== cleanupId || observation.operationId !== state.operationId)
          data = ack("denied");
        else if (evidence.has(observation.evidenceId))
          data = ack(
            evidence.get(observation.evidenceId) === JSON.stringify(observation)
              ? "duplicate-evidence"
              : "quarantined",
          );
        else {
          evidence.set(observation.evidenceId, JSON.stringify(observation));
          if (observation.kind === "unknown")
            data = ack(state.terminal ? "late-evidence" : "uncertain");
          else if (observation.kind === "created") data = ack("creation-observed");
          else {
            state.slotHeld = false;
            state.closed = true;
            state.terminal = true;
            data = ack("terminal-recorded");
          }
        }
      }
      // The modeled mutation above precedes this optionally discarded reply.
      return { data: hooks.afterReply ? hooks.afterReply(name, data) : data, error: null };
    },
  };
  const store = createVoiceRpcStore(client),
    capacity = createVoiceCapacityRpcPorts(client);
  async function proof(operation: "claim" | "inspect") {
    const p: VoiceOperationProof = {
      receiptId: crypto.randomUUID(),
      operation,
      claim,
      cleanupId,
      ownerSessionId: sessionId,
      sessionVersion: 0,
      authorityFingerprint: "c".repeat(64),
      identityExpiresAt: claim.expiresAt,
      verifiedAt: now,
      expiresAt: now + 10_000,
      effectiveExpiresAt: claim.expiresAt,
    };
    expect(await store.registerProof(p)).not.toBeNull();
    return p;
  }
  async function admit() {
    await store.registerCleanup({ cleanupId, claim });
    const p = await proof("claim");
    expect(await store.claim(p.receiptId, claim)).toEqual({ claim, state: "claimed" });
  }
  async function mark() {
    const p = await proof("inspect");
    return capacity.mark({ receiptId: p.receiptId, claim, operationId, expectedPoolVersion: 1 });
  }
  function reconcile(observation: VoiceCapacityObservation) {
    return capacity.reconcile({ cleanupId, claim, observation });
  }
  return {
    claim,
    cleanupId,
    operationId,
    calls,
    state,
    hooks,
    store,
    capacity,
    proof,
    admit,
    mark,
    reconcile,
  };
}

describe("independent capacity adapter composition with modeled transport", () => {
  it("does not execute an invalid observation's kind getter before its shape is rejected", async () => {
    const h = harness();
    let reads = 0;
    const observation: VoiceCapacityObservation = {
      evidenceId: crypto.randomUUID(),
      operationId: h.operationId,
      kind: "unknown",
      sessionId: null,
    };
    Object.defineProperty(observation, "kind", {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("fictional private getter must remain unread");
      },
    });
    await expect(h.reconcile(observation)).rejects.toThrow("voice-capacity-rpc-unavailable");
    expect(reads).toBe(0);
    expect(h.calls).toHaveLength(0);
  });

  it("does not reuse the base inspection's consumed receipt as a capacity mark proof", async () => {
    const h = harness();
    await h.admit();
    const inspected = await h.proof("inspect");
    expect(await h.store.inspect(inspected.receiptId, h.claim)).toEqual({
      claim: h.claim,
      state: "claimed",
    });
    expect(
      await h.capacity.mark({
        receiptId: inspected.receiptId,
        claim: h.claim,
        operationId: h.operationId,
        expectedPoolVersion: 1,
      }),
    ).toEqual({ claim: h.claim, state: "denied" });
    expect(h.state.operationId).toBeNull();
    expect(await h.mark()).toEqual({ claim: h.claim, state: "marked" });
    expect(h.state).toMatchObject({ held: 1, slotHeld: true, operationId: h.operationId });
    const markCalls = h.calls.filter((c) => c.name === "bfa_p5_capacity_mark");
    expect(markCalls).toHaveLength(2);
    expect(markCalls[0]!.args.p_receipt_id).not.toBe(markCalls[1]!.args.p_receipt_id);
  });

  it("preserves the legitimate closed result when exact cleanup precedes mark", async () => {
    const h = harness();
    await h.admit();
    const p = await h.proof("inspect");
    expect(await h.store.close(h.cleanupId, h.claim)).toEqual({ claim: h.claim, state: "closed" });
    expect(
      await h.capacity.mark({
        receiptId: p.receiptId,
        claim: h.claim,
        operationId: h.operationId,
        expectedPoolVersion: 1,
      }),
    ).toEqual({ claim: h.claim, state: "closed" });
    expect(h.state).toEqual({
      held: 1,
      slotHeld: false,
      closed: true,
      operationId: null,
      terminal: false,
    });
  });

  it("retains a marked slot through cleanup and uncertainty until whole-operation terminal evidence", async () => {
    const h = harness();
    await h.admit();
    expect((await h.mark()).state).toBe("marked");
    await h.store.close(h.cleanupId, h.claim);
    expect(h.state.slotHeld).toBe(true);
    expect(
      (
        await h.reconcile({
          evidenceId: crypto.randomUUID(),
          operationId: h.operationId,
          kind: "unknown",
          sessionId: null,
        })
      ).state,
    ).toBe("uncertain");
    expect(h.state.slotHeld).toBe(true);
    expect(
      (
        await h.reconcile({
          evidenceId: crypto.randomUUID(),
          operationId: h.operationId,
          kind: "ended",
          sessionId: "fixture-session",
        })
      ).state,
    ).toBe("terminal-recorded");
    expect(h.state).toMatchObject({
      held: 1,
      slotHeld: false,
      closed: true,
      operationId: h.operationId,
    });
    expect(h.calls.every((c) => c.name.startsWith("bfa_p5_"))).toBe(true);
  });

  it("retains exact cleanup and the committed marker after a lost reply without automatically remarking", async () => {
    const h = harness();
    await h.admit();
    h.hooks.afterReply = (name, data) => {
      if (name === "bfa_p5_capacity_mark")
        throw new Error("fictional reply lost after marker commit");
      return data;
    };
    await expect(h.mark()).rejects.toThrow("voice-capacity-rpc-unavailable");
    expect(h.calls.filter((c) => c.name === "bfa_p5_capacity_mark")).toHaveLength(1);
    expect(h.state.operationId).toBe(h.operationId);
    await h.store.close(h.cleanupId, h.claim);
    expect(h.state).toMatchObject({
      held: 1,
      slotHeld: true,
      closed: true,
      operationId: h.operationId,
    });
    const close = h.calls.find((c) => c.name === "bfa_p5_capacity_close")!;
    expect(close.args).toEqual({ p_cleanup_id: h.cleanupId, p_claim: h.claim });
    expect(
      (
        await h.reconcile({
          evidenceId: crypto.randomUUID(),
          operationId: h.operationId,
          kind: "unknown",
          sessionId: null,
        })
      ).state,
    ).toBe("uncertain");
    expect(h.calls.filter((c) => c.name === "bfa_p5_capacity_mark")).toHaveLength(1);
  });

  it("cannot substitute a capacity marker acknowledgment for the existing base inspection result", async () => {
    const h = harness();
    await h.admit();
    const marked = await h.mark();
    h.hooks.afterReply = (name, data) => (name === "bfa_p5_voice_inspect" ? marked : data);
    const p = await h.proof("inspect");
    await expect(h.store.inspect(p.receiptId, h.claim)).rejects.toThrow("voice-rpc-unavailable");
    expect(Object.keys(marked).sort()).toEqual(["claim", "state"]);
    expect(marked).not.toHaveProperty("operationId");
    expect(marked).not.toHaveProperty("dispatch");
    expect(h.calls.filter((c) => c.name === "bfa_p5_capacity_mark")).toHaveLength(1);
    await h.store.close(h.cleanupId, h.claim);
    expect(h.state.slotHeld).toBe(true);
  });

  it("keeps committed terminal evidence after reply failure and classifies exact deliberate replay as duplicate", async () => {
    const h = harness();
    await h.admit();
    await h.mark();
    const observation: VoiceCapacityObservation = {
      evidenceId: crypto.randomUUID(),
      operationId: h.operationId,
      kind: "not-created",
      sessionId: null,
    };
    h.hooks.afterReply = (name, data) => {
      if (name === "bfa_p5_capacity_reconcile")
        throw new Error("fictional terminal acknowledgment lost");
      return data;
    };
    await expect(h.reconcile(observation)).rejects.toThrow("voice-capacity-rpc-unavailable");
    expect(h.state).toMatchObject({ slotHeld: false, held: 1, terminal: true });
    expect(h.calls.filter((c) => c.name === "bfa_p5_capacity_reconcile")).toHaveLength(1);
    h.hooks.afterReply = undefined;
    expect((await h.reconcile(observation)).state).toBe("duplicate-evidence");
    const calls = h.calls.filter((c) => c.name === "bfa_p5_capacity_reconcile");
    expect(calls).toHaveLength(2);
    expect(calls[0]!.args).toEqual(calls[1]!.args);
    expect(h.state).toMatchObject({
      slotHeld: false,
      held: 1,
      terminal: true,
      operationId: h.operationId,
    });
  });
});
