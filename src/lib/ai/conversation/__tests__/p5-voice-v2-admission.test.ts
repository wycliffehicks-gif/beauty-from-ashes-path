import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createVoiceV2Admission,
  type VoiceV2AdmissionPorts,
} from "../service/voice-v2-admission.server";
import { ConversationService } from "../service/service";
import { seal, fingerprint, type Envelope } from "../staging/seal.server";
import type { VoiceV2CleanupRegistration } from "../service/voice-v2-cleanup-rpc.server";
import type { VoiceV2ProofRegistration } from "../service/voice-v2-proof-rpc.server";
import type { VoiceAdmissionClaim } from "../service/voice-admission.server";

const OWNER = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";
const INCARNATION = "33333333-3333-4333-8333-333333333333";
const ATTEMPT = "44444444-4444-4444-8444-444444444444";
const APPROVAL = "55555555-5555-4555-8555-555555555555";
const SESSION = "66666666-6666-4666-8666-666666666666";
const OTHER = "77777777-7777-4777-8777-777777777777";
const NOW = 1_800_000_000_000;
const SECRET = "fictional-v2-admission-local-crypto-secret";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function fixture() {
  const state = { now: NOW };
  const service = new ConversationService({ verifiedOwnerId: OWNER });
  service.ensureThread(THREAD, false);
  service.recordNotSent(THREAD, "fictional-unsent", "private writing must stay private");
  const envelope: Envelope = {
    owner: OWNER,
    thread: THREAD,
    revision: 7,
    expires: NOW + 90_000,
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
  const identity = { ownerId: OWNER, sessionId: SESSION, expiresAt: NOW + 120_000 };
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
    allowlist: { ownerId: OWNER, admitted: true, expiresAt: NOW + 110_000 },
    authority: {
      ...owned,
      fingerprint: await fingerprint(token),
      issuedAt: NOW - 1000,
      expiresAt: NOW + 90_000,
      revoked: false,
    },
    approval: {
      ...owned,
      id: APPROVAL,
      digest: "a".repeat(64),
      scope: "developer-voice-session",
      attemptId: ATTEMPT,
      expiresAt: NOW + 100_000,
      revoked: false,
    },
  };
  const hooks = new Map<string, () => void | Promise<void>>();
  const overrides = new Map<string, unknown>();
  const events: string[] = [];
  const counts: Record<string, number> = {};
  const cleanup: VoiceV2CleanupRegistration[] = [];
  const proofs: VoiceV2ProofRegistration[] = [];
  const claims: VoiceV2ProofRegistration[] = [];
  const inspections: VoiceV2ProofRegistration[] = [];
  const closes: { cleanupId: string; claim: VoiceAdmissionClaim }[] = [];
  const returned: unknown[] = [];
  async function reply(name: string, value: unknown) {
    const key = `${name}:${(counts[name] = (counts[name] ?? 0) + 1)}`;
    events.push(key);
    const copy = structuredClone(value);
    returned.push(copy);
    await hooks.get(key)?.();
    return overrides.has(key) ? overrides.get(key) : copy;
  }
  const ports: VoiceV2AdmissionPorts = {
    maxProofAgeMs: 10_000,
    now: vi.fn(() => state.now),
    authenticate: vi.fn(() => reply("auth", identity)),
    readParent: vi.fn(() => reply("parent", parent)),
    readCurrent: vi.fn((query) => reply("current", { protocol: 2, request: query, current })),
    registerCleanup: vi.fn((registration) => {
      cleanup.push(registration);
      const {
        verifiedAt: _verifiedAt,
        authExpiresAt: _authExpiresAt,
        ...association
      } = registration;
      return reply("cleanup", {
        protocol: 2,
        ...association,
        effectiveExpiresAt: registration.claim.expiresAt,
        closedAt: null,
        expiredAt: null,
        invalidatedAt: null,
      });
    }),
    registerProof: vi.fn((proof) => {
      proofs.push(proof);
      return reply("proof", proof);
    }),
    claim: vi.fn((proof) => {
      claims.push(proof);
      return reply("claim", { protocol: 2, proof, status: "claimed" });
    }),
    inspect: vi.fn((proof) => {
      inspections.push(proof);
      return reply("inspect", { protocol: 2, proof, status: "claimed" });
    }),
    close: vi.fn((cleanupId, claim) => {
      closes.push({ cleanupId, claim });
      return reply("close", { claim, state: "closed" });
    }),
  };
  return {
    state,
    envelope,
    token,
    request,
    identity,
    parent,
    current,
    hooks,
    overrides,
    events,
    cleanup,
    proofs,
    claims,
    inspections,
    closes,
    returned,
    ports,
    create: () => createVoiceV2Admission(ports),
  };
}
function setPath(raw: object, path: string, value: unknown) {
  const keys = path.split(".");
  let target = raw as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
  target[keys.at(-1)!] = value;
}

describe("inactive request-owned v2 admission with real local crypto and fictional ports", () => {
  beforeEach(() => {
    vi.stubEnv("BFA_P3B_STATE_SECRET", SECRET);
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("retains immutable ownership before writes, full v2 proof ACKs and one combined claim plus initial inspect", async () => {
    const f = await fixture();
    const handle = f.create();
    expect(f.events).toEqual([]);
    expect(handle.snapshot()).toMatchObject({
      protocol: 2,
      state: "idle",
      ownership: null,
      operations: [],
    });
    f.hooks.set("cleanup:1", () => {
      expect(handle.snapshot()).toMatchObject({
        state: "pending",
        ownership: { claim: f.cleanup[0].claim, cleanupId: f.cleanup[0].cleanupId },
        cleanupWriteAttempted: true,
        cleanupRequest: f.cleanup[0],
        cleanupAcknowledgment: null,
      });
    });
    expect(await handle.admit(f.request)).toBe(true);
    const snapshot = handle.snapshot();
    expect(snapshot.state).toBe("active");
    expect(snapshot.ownership!.claim.expiresAt).toBe(NOW + 90_000);
    expect(snapshot.effectiveExpiresAt).toBe(NOW + 90_000);
    expect(f.cleanup).toHaveLength(1);
    expect(f.claims).toHaveLength(1);
    expect(f.inspections).toHaveLength(1);
    expect(f.proofs.map((p) => p.operation)).toEqual(["claim", "inspect"]);
    expect(new Set(f.proofs.map((p) => p.receiptId)).size).toBe(2);
    for (const operation of snapshot.operations) {
      expect(operation).toMatchObject({
        state: "observed",
        registrationAttempted: true,
        registrationAcknowledgment: operation.request,
        consumptionAttempted: true,
        acknowledgment: { protocol: 2, proof: operation.request, status: "claimed" },
      });
      expect(operation.request.expiresAt).toBe(NOW + 10_000);
      expect(operation.request.effectiveExpiresAt).toBe(NOW + 90_000);
      for (const value of [
        operation,
        operation.request,
        operation.request.claim,
        operation.request.claim.binding,
        operation.acknowledgment,
        operation.registrationAcknowledgment,
      ])
        expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.operations)).toBe(true);
    const text = JSON.stringify(snapshot);
    for (const hidden of [f.token, SECRET, "private writing", "activeAuthority", 'authority":{'])
      expect(text).not.toContain(hidden);
    expect(f.closes).toEqual([]);
    const count = f.events.length;
    expect(await handle.admit(f.request)).toBe(false);
    expect(f.events).toHaveLength(count);
    expect(await handle.close()).toBe(true);
    expect(handle.snapshot()).toMatchObject({
      state: "closed",
      closeAcknowledgment: { claim: snapshot.ownership!.claim, state: "closed" },
    });
  });

  it("new deliberate inspect after 40 seconds uses a fresh proof while preserving the 90-second immutable claim", async () => {
    const f = await fixture();
    const handle = f.create();
    expect(await handle.admit(f.request)).toBe(true);
    const owned = handle.snapshot().ownership;
    f.state.now = NOW + 40_000;
    expect(await handle.revalidate()).toBe(true);
    expect(handle.snapshot().ownership).toEqual(owned);
    expect(f.proofs[2]).toMatchObject({
      operation: "inspect",
      verifiedAt: NOW + 40_000,
      expiresAt: NOW + 50_000,
      effectiveExpiresAt: NOW + 90_000,
    });
    expect(handle.snapshot().effectiveExpiresAt).toBe(NOW + 90_000);
    expect(f.claims).toHaveLength(1);
  });

  it("retains a shorter cleanup ceiling without rewriting the original claim or growing on later evidence", async () => {
    const f = await fixture();
    const handle = f.create();
    f.hooks.set("cleanup:1", () => {
      const q = f.cleanup[0];
      const { verifiedAt: _v, authExpiresAt: _a, ...association } = q;
      f.overrides.set("cleanup:1", {
        protocol: 2,
        ...association,
        effectiveExpiresAt: NOW + 60_000,
        closedAt: null,
        expiredAt: null,
        invalidatedAt: null,
      });
    });
    expect(await handle.admit(f.request)).toBe(true);
    expect(handle.snapshot().ownership!.claim.expiresAt).toBe(NOW + 90_000);
    expect(handle.snapshot().effectiveExpiresAt).toBe(NOW + 60_000);
    expect(f.proofs.every((p) => p.effectiveExpiresAt === NOW + 60_000)).toBe(true);
    f.identity.expiresAt = NOW + 200_000;
    f.current.allowlist.expiresAt = NOW + 200_000;
    expect(await handle.revalidate()).toBe(true);
    expect(handle.snapshot().effectiveExpiresAt).toBe(NOW + 60_000);
  });

  it("retains shorter Auth/allowlist/approval observations across later growing verifications", async () => {
    const f = await fixture();
    f.identity.expiresAt = NOW + 80_000;
    f.current.allowlist.expiresAt = NOW + 70_000;
    f.current.approval.expiresAt = NOW + 60_000;
    const handle = f.create();
    expect(await handle.admit(f.request)).toBe(true);
    f.identity.expiresAt = NOW + 150_000;
    f.current.allowlist.expiresAt = NOW + 150_000;
    f.current.approval.expiresAt = NOW + 150_000;
    expect(await handle.revalidate()).toBe(true);
    expect(handle.snapshot().ownership!.claim.expiresAt).toBe(NOW + 60_000);
    expect(handle.snapshot().effectiveExpiresAt).toBe(NOW + 60_000);
    expect(f.proofs[2].identityExpiresAt).toBe(NOW + 80_000);
  });

  it.each([0, -1, 1.5, 30_001, Number.NaN, Number.POSITIVE_INFINITY, undefined])(
    "requires valid explicit proof TTL %s",
    async (maxProofAgeMs) => {
      const f = await fixture();
      expect(() =>
        createVoiceV2Admission({ ...f.ports, maxProofAgeMs } as VoiceV2AdmissionPorts),
      ).toThrow("voice-v2-admission-unavailable");
      expect(f.events).toEqual([]);
    },
  );
  it.each([
    "now",
    "authenticate",
    "readParent",
    "readCurrent",
    "registerCleanup",
    "registerProof",
    "claim",
    "inspect",
    "close",
  ] as const)("requires trusted captured method %s", async (name) => {
    const f = await fixture();
    expect(() =>
      createVoiceV2Admission({ ...f.ports, [name]: null } as unknown as VoiceV2AdmissionPorts),
    ).toThrow();
    expect(f.events).toEqual([]);
  });
  it("captures method receivers/config once without accepting replacement ports", async () => {
    const f = await fixture();
    const original = f.ports.registerProof;
    f.ports.registerProof = function (proof) {
      expect(this).toBe(f.ports);
      return original.call(this, proof);
    };
    const handle = f.create();
    Object.assign(f.ports, {
      maxProofAgeMs: 30_000,
      registerProof: () => {
        throw new Error("replacement");
      },
      close: () => {
        throw new Error("replacement");
      },
    });
    expect(await handle.admit(f.request)).toBe(true);
    expect(f.proofs[0].expiresAt).toBe(NOW + 10_000);
    expect(await handle.close()).toBe(true);
  });

  it.each([
    { protocol: 2 },
    { claimId: OTHER },
    { cleanupId: OTHER },
    { ownerId: OWNER },
    { verifiedAt: NOW },
    { threadId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
    { threadRevision: -1 },
    { activeAuthority: "" },
  ])("rejects caller authority/malformed input %j before Auth", async (change) => {
    const f = await fixture();
    const handle = f.create();
    expect(await handle.admit({ ...f.request, ...change })).toBe(false);
    expect(handle.snapshot()).toMatchObject({ state: "invalid", ownership: null });
    expect(f.events).toEqual([]);
    expect(await handle.admit(f.request)).toBe(false);
  });
  it("rejects accessors and extra JS arguments without invoking them", async () => {
    const f = await fixture();
    const getter = vi.fn(() => f.token);
    const raw = { ...f.request };
    Object.defineProperty(raw, "activeAuthority", { enumerable: true, get: getter });
    expect(await f.create().admit(raw)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    const handle = f.create();
    expect(await Reflect.apply(handle.admit, handle, [f.request, true])).toBe(false);
    expect(f.events).toEqual([]);
  });

  it.each(["wrong-key", "tampered-seal", "different-valid-seal"])(
    "actual crypto failure %s creates no ownership/write",
    async (mode) => {
      const f = await fixture();
      if (mode === "wrong-key") vi.stubEnv("BFA_P3B_STATE_SECRET", "different-fictional-key");
      if (mode === "tampered-seal") f.request.activeAuthority = `${f.token.slice(0, -3)}aaa`;
      if (mode === "different-valid-seal") f.request.activeAuthority = await seal(f.envelope);
      const handle = f.create();
      expect(await handle.admit(f.request)).toBe(false);
      expect(handle.snapshot().ownership).toBeNull();
      expect(f.cleanup).toEqual([]);
      expect(f.proofs).toEqual([]);
    },
  );

  it.each(["owner", "session", "parent", "fingerprint", "approval", "issuance"])(
    "pins original %s across cleanup wait",
    async (change) => {
      const f = await fixture();
      f.hooks.set("cleanup:1", () => {
        if (change === "owner") f.identity.ownerId = OTHER;
        if (change === "session") f.identity.sessionId = OTHER;
        if (change === "parent") f.parent.parentVersion++;
        if (change === "fingerprint") f.current.authority.fingerprint = "b".repeat(64);
        if (change === "approval") f.current.approval.digest = "b".repeat(64);
        if (change === "issuance") f.current.authority.issuedAt--;
      });
      const handle = f.create();
      expect(await handle.admit(f.request)).toBe(false);
      expect(handle.snapshot()).toMatchObject({
        state: "invalid",
        cleanupWriteAttempted: true,
        cleanupAcknowledgment: { protocol: 2 },
      });
      expect(f.proofs).toEqual([]);
      expect(f.closes).toEqual([]);
      expect(await handle.close()).toBe(true);
      expect(f.closes[0]).toEqual({ cleanupId: f.cleanup[0].cleanupId, claim: f.cleanup[0].claim });
    },
  );

  it.each(["cleanup:1", "proof:1", "claim:1", "inspect:1"])(
    "retains exact uncertain ownership on lost %s without implicit cleanup, retry or new identity",
    async (stage) => {
      const f = await fixture();
      f.hooks.set(stage, () => {
        throw new Error(`${f.token} ${SECRET}`);
      });
      const handle = f.create();
      expect(await handle.admit(f.request)).toBe(false);
      const before = handle.snapshot();
      expect(before.state).toBe("invalid");
      expect(before.ownership).not.toBeNull();
      expect(f.closes).toEqual([]);
      const count = f.events.length;
      expect(await handle.admit(f.request)).toBe(false);
      expect(await handle.revalidate()).toBe(false);
      expect(f.events).toHaveLength(count);
      if (stage !== "cleanup:1") expect(before.operations.at(-1)?.state).toBe("unconfirmed");
      expect(await handle.close()).toBe(true);
      expect(handle.snapshot().ownership).toEqual(before.ownership);
    },
  );

  it.each(["claimId", "binding.approvalDigest", "expiresAt"])(
    "rejects changed cleanup full claim %s",
    async (path) => {
      const f = await fixture();
      f.hooks.set("cleanup:1", () => {
        const q = f.cleanup[0];
        const claim = structuredClone(q.claim);
        setPath(
          claim,
          path,
          path === "expiresAt" ? claim.expiresAt + 1 : path === "claimId" ? OTHER : "b".repeat(64),
        );
        const { verifiedAt: _v, authExpiresAt: _a, ...association } = q;
        f.overrides.set("cleanup:1", {
          protocol: 2,
          ...association,
          claim,
          effectiveExpiresAt: q.claim.expiresAt,
          closedAt: null,
          expiredAt: null,
          invalidatedAt: null,
        });
      });
      const handle = f.create();
      expect(await handle.admit(f.request)).toBe(false);
      expect(handle.snapshot().cleanupAcknowledgment).toBeNull();
      expect(f.proofs).toEqual([]);
    },
  );

  it.each([
    "protocol",
    "receiptId",
    "operation",
    "cleanupId",
    "authSessionId",
    "parentVersion",
    "authorityFingerprint",
    "identityExpiresAt",
    "verifiedAt",
    "expiresAt",
    "effectiveExpiresAt",
    "claim.claimId",
    "claim.binding.approvalDigest",
  ])("requires exact full proof registration ACK field %s", async (path) => {
    const f = await fixture();
    f.hooks.set("proof:1", () => {
      const p = structuredClone(f.proofs[0]);
      const value = path
        .split(".")
        .reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], p);
      setPath(
        p,
        path,
        typeof value === "number"
          ? value + 1
          : path === "operation"
            ? "inspect"
            : path.includes("Fingerprint") || path.includes("Digest")
              ? "b".repeat(64)
              : OTHER,
      );
      f.overrides.set("proof:1", p);
    });
    const handle = f.create();
    expect(await handle.admit(f.request)).toBe(false);
    expect(handle.snapshot().operations[0]).toMatchObject({
      registrationAttempted: true,
      registrationAcknowledgment: null,
      consumptionAttempted: false,
      state: "unconfirmed",
    });
    expect(f.claims).toEqual([]);
  });

  it.each(["claim:1", "inspect:1"])(
    "requires full v2 consumption acknowledgment at %s",
    async (stage) => {
      for (const mode of ["null", "legacy", "mixed", "wrong-proof", "denied", "closed"]) {
        const f = await fixture();
        f.hooks.set(stage, () => {
          const p = stage === "claim:1" ? f.claims[0] : f.inspections[0];
          f.overrides.set(
            stage,
            mode === "null"
              ? null
              : mode === "legacy"
                ? { claim: p.claim, state: "claimed" }
                : {
                    protocol: mode === "mixed" ? 1 : 2,
                    proof: mode === "wrong-proof" ? { ...p, verifiedAt: p.verifiedAt + 1 } : p,
                    status: mode === "denied" ? "denied" : mode === "closed" ? "closed" : "claimed",
                  },
          );
        });
        const handle = f.create();
        expect(await handle.admit(f.request)).toBe(false);
        expect(handle.snapshot().state).toBe("invalid");
        expect(f.closes).toEqual([]);
      }
    },
  );

  it.each(["proof:1", "claim:1", "inspect:1"])(
    "shorter policy during %s cannot renew/rewrite that proof",
    async (stage) => {
      const f = await fixture();
      f.hooks.set(stage, () => {
        f.current.allowlist.expiresAt = NOW + 50_000;
      });
      const handle = f.create();
      expect(await handle.admit(f.request)).toBe(false);
      const snapshot = handle.snapshot();
      expect(snapshot.effectiveExpiresAt).toBe(NOW + 50_000);
      expect(snapshot.ownership!.claim.expiresAt).toBe(NOW + 90_000);
      expect(snapshot.operations.at(-1)!.request.effectiveExpiresAt).toBe(NOW + 90_000);
      if (stage === "proof:1") expect(f.claims).toEqual([]);
      expect(f.closes).toEqual([]);
    },
  );

  it.each(["cleanup:1", "proof:1", "claim:1", "inspect:1"])(
    "late exact %s ACK remains evidence but never fresh success",
    async (stage) => {
      const f = await fixture();
      f.hooks.set(stage, () => {
        f.state.now = NOW + (stage === "cleanup:1" ? 30_000 : 10_000);
      });
      const handle = f.create();
      expect(await handle.admit(f.request)).toBe(false);
      expect(handle.snapshot().state).toBe("invalid");
      expect(handle.snapshot().ownership!.claim.expiresAt).toBe(NOW + 90_000);
      if (stage === "cleanup:1") expect(handle.snapshot().cleanupAcknowledgment).not.toBeNull();
      else if (stage === "proof:1")
        expect(handle.snapshot().operations[0].registrationAcknowledgment).not.toBeNull();
      else expect(handle.snapshot().operations.at(-1)!.acknowledgment).not.toBeNull();
      expect(f.closes).toEqual([]);
      expect(await handle.close()).toBe(true);
    },
  );

  it.each([NOW - 1, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "clock failure %s prevents consumption but leaves exact cleanup available",
    async (time) => {
      const f = await fixture();
      f.hooks.set("proof:1", () => {
        f.state.now = time;
      });
      const handle = f.create();
      expect(await handle.admit(f.request)).toBe(false);
      expect(f.claims).toEqual([]);
      expect(await handle.close()).toBe(true);
      expect(f.closes).toHaveLength(1);
    },
  );

  it("captures conservative proof time before Auth and does not refresh it across registration waits", async () => {
    const f = await fixture();
    f.hooks.set("cleanup:1", () => {
      f.state.now += 1000;
    });
    f.hooks.set("proof:1", () => {
      f.state.now += 3000;
    });
    const handle = f.create();
    expect(await handle.admit(f.request)).toBe(true);
    expect(f.proofs[0]).toMatchObject({ verifiedAt: NOW + 1000, expiresAt: NOW + 11_000 });
    expect(f.claims[0]).toEqual(f.proofs[0]);
    expect(handle.snapshot().ownership!.claim.expiresAt).toBe(NOW + 90_000);
  });

  it("closes before initial Auth finishes without allocating or writing and never reopens", async () => {
    const f = await fixture();
    const entered = deferred();
    const release = deferred();
    f.hooks.set("auth:1", async () => {
      entered.resolve();
      await release.promise;
    });
    const handle = f.create();
    const pending = handle.admit(f.request);
    await entered.promise;
    expect(await handle.close()).toBe(true);
    expect(handle.snapshot()).toMatchObject({ state: "closed", ownership: null });
    release.resolve();
    expect(await pending).toBe(false);
    expect(f.cleanup).toEqual([]);
    expect(f.closes).toEqual([]);
    expect(handle.snapshot().state).toBe("closed");
  });

  it("explicit close coalesces concurrent attempts and retries only the identical owned cleanup after uncertain failure", async () => {
    const f = await fixture();
    const handle = f.create();
    expect(await handle.admit(f.request)).toBe(true);
    const entered = deferred();
    const release = deferred();
    f.hooks.set("close:1", async () => {
      entered.resolve();
      await release.promise;
      throw new Error("lost");
    });
    const first = handle.close();
    expect(handle.snapshot().state).toBe("closing");
    const second = handle.close();
    expect(second).toBe(first);
    await entered.promise;
    release.resolve();
    expect(await first).toBe(false);
    expect(handle.snapshot().state).toBe("close-unconfirmed");
    f.identity.sessionId = OTHER;
    f.state.now = Number.NaN;
    expect(await handle.close()).toBe(true);
    expect(f.closes).toHaveLength(2);
    expect(f.closes[1]).toEqual(f.closes[0]);
    expect(await handle.revalidate()).toBe(false);
    expect(await handle.close()).toBe(true);
    expect(f.closes).toHaveLength(2);
  });

  it("rejects getter ACKs without invoking them while preserving ownership", async () => {
    const f = await fixture();
    const getter = vi.fn(() => NOW + 90_000);
    f.hooks.set("proof:1", () => {
      const p = { ...f.proofs[0] };
      Object.defineProperty(p, "effectiveExpiresAt", { enumerable: true, get: getter });
      f.overrides.set("proof:1", p);
    });
    const handle = f.create();
    expect(await handle.admit(f.request)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(handle.snapshot().ownership).not.toBeNull();
    expect(f.claims).toEqual([]);
  });
});
