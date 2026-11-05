import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createVoiceV2Admission,
  createVoiceV2CapacityAdmission,
  type VoiceV2CapacityAdmissionPorts,
} from "../service/voice-v2-admission.server";
import { ConversationService } from "../service/service";
import { seal, fingerprint, type Envelope } from "../staging/seal.server";
import type { VoiceV2CleanupRegistration } from "../service/voice-v2-cleanup-rpc.server";
import type { VoiceV2ProofRegistration } from "../service/voice-v2-proof-rpc.server";
import type { VoiceV2MarkRequest } from "../service/voice-v2-mark-rpc.server";
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
  const marks: VoiceV2MarkRequest[] = [];
  const ports: VoiceV2CapacityAdmissionPorts = {
    expectedPoolVersion: 7,
    mark: vi.fn((request) => {
      marks.push(request);
      return reply("mark", { protocol: 2, request, status: "marked" });
    }),
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
    counts,
    marks,
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
    create: () => createVoiceV2CapacityAdmission(ports),
  };
}
function setPath(raw: object, path: string, value: unknown) {
  const keys = path.split(".");
  let target = raw as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
  target[keys.at(-1)!] = value;
}

describe("inactive admission-owned protocol-2 capacity marker", () => {
  beforeEach(() => {
    vi.stubEnv("BFA_P3B_STATE_SECRET", SECRET);
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("keeps the base constructor shape and performs no marker work without explicit opt-in", async () => {
    const f = await fixture();
    const handle = createVoiceV2Admission(f.ports);
    expect(Object.keys(handle).sort()).toEqual(["admit", "close", "revalidate", "snapshot"]);
    expect(await handle.admit(f.request)).toBe(true);
    expect(await handle.revalidate()).toBe(true);
    expect(f.marks).toEqual([]);
    expect(await handle.close()).toBe(true);
  });

  it("retains one operation before the first wait and consumes a new inspect proof only through marker", async () => {
    const f = await fixture();
    const handle = f.create();
    expect(handle.markerSnapshot()).toBeNull();
    expect(await handle.admit(f.request)).toBe(true);
    const ownership = handle.snapshot().ownership!;
    const initialProofs = f.proofs.length;
    f.hooks.set(`auth:${f.counts.auth + 1}`, () => {
      expect(handle.markerSnapshot()).toMatchObject({
        protocol: 2,
        ownership,
        expectedPoolVersion: 7,
        state: "pending",
        request: null,
        registrationAttempted: false,
        markAttempted: false,
        acknowledgment: null,
      });
      expect(handle.markerSnapshot()!.operationId).toMatch(/^[0-9a-f-]{36}$/);
    });
    const observation = await handle.markCapacity();
    const snapshot = handle.markerSnapshot()!;
    expect(observation).toEqual({
      protocol: 2,
      status: "marked",
      operationId: snapshot.operationId,
      claim: ownership.claim,
    });
    expect(snapshot).toMatchObject({
      state: "observed",
      registrationAttempted: true,
      markAttempted: true,
      registrationAcknowledgment: snapshot.request!.proof,
      acknowledgment: { protocol: 2, request: snapshot.request, status: "marked" },
    });
    expect(f.proofs).toHaveLength(initialProofs + 1);
    expect(f.claims).toHaveLength(1);
    expect(f.inspections).toHaveLength(1);
    expect(f.marks).toHaveLength(1);
    expect(snapshot.request!.proof).toMatchObject({
      protocol: 2,
      operation: "inspect",
      claim: ownership.claim,
      cleanupId: ownership.cleanupId,
      authSessionId: SESSION,
      parentVersion: 4,
      expiresAt: NOW + 10_000,
      effectiveExpiresAt: NOW + 90_000,
    });
    expect(f.marks[0].proof.receiptId).not.toBe(f.inspections[0].receiptId);
    expect(f.marks[0].operationId).not.toBe(f.marks[0].proof.receiptId);
    expect(handle.snapshot().operations).toHaveLength(2);
    expect(handle.snapshot().ownership).toEqual(ownership);
    const count = f.events.length;
    expect(await handle.markCapacity()).toBeNull();
    expect(f.events).toHaveLength(count);
    expect(handle.markerSnapshot()).toEqual(snapshot);
  });

  it("returns detached frozen content-free observations while preserving original immutable claim", async () => {
    const f = await fixture();
    const handle = f.create();
    expect(await handle.admit(f.request)).toBe(true);
    const observation = await handle.markCapacity();
    const snapshot = handle.markerSnapshot()!;
    for (const value of [
      observation,
      snapshot,
      snapshot.ownership,
      snapshot.ownership.claim,
      snapshot.request,
      snapshot.request!.proof,
      snapshot.request!.proof.claim,
      snapshot.request!.proof.claim.binding,
      snapshot.registrationAcknowledgment,
      snapshot.acknowledgment,
      snapshot.acknowledgment!.request,
      snapshot.acknowledgment!.request.proof,
    ])
      expect(Object.isFrozen(value)).toBe(true);
    const text = JSON.stringify({ observation, snapshot });
    for (const hidden of [f.token, SECRET, "private writing", "activeAuthority", 'authority":{'])
      expect(text).not.toContain(hidden);
    f.current.approval.digest = "b".repeat(64);
    expect(snapshot.request!.proof.claim.binding.approvalDigest).toBe("a".repeat(64));
    expect(snapshot.ownership.claim.expiresAt).toBe(NOW + 90_000);
  });

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    undefined,
    "7",
  ])("requires valid explicit pool version %s", async (expectedPoolVersion) => {
    const f = await fixture();
    expect(() =>
      createVoiceV2CapacityAdmission({
        ...f.ports,
        expectedPoolVersion,
      } as unknown as VoiceV2CapacityAdmissionPorts),
    ).toThrow("voice-v2-admission-unavailable");
    expect(f.events).toEqual([]);
  });
  it("requires protected marker method and captures configuration/receiver once", async () => {
    const f = await fixture();
    expect(() =>
      createVoiceV2CapacityAdmission({
        ...f.ports,
        mark: undefined,
      } as unknown as VoiceV2CapacityAdmissionPorts),
    ).toThrow();
    const original = f.ports.mark;
    f.ports.mark = function (q) {
      expect(this).toBe(f.ports);
      return original.call(this, q);
    };
    const handle = f.create();
    Object.assign(f.ports, {
      expectedPoolVersion: 99,
      mark: () => {
        throw new Error("replacement");
      },
    });
    expect(await handle.admit(f.request)).toBe(true);
    expect(await handle.markCapacity()).not.toBeNull();
    expect(f.marks[0].expectedPoolVersion).toBe(7);
  });

  it("rejects inactive calls and caller-supplied snapshots/operation fields without adopting them", async () => {
    const f = await fixture();
    const handle = f.create();
    expect(await handle.markCapacity()).toBeNull();
    expect(handle.markerSnapshot()).toBeNull();
    expect(f.events).toEqual([]);
    expect(await handle.admit(f.request)).toBe(true);
    const count = f.events.length;
    expect(
      await Reflect.apply(handle.markCapacity, handle, [
        { ...handle.snapshot(), operationId: OTHER },
      ]),
    ).toBeNull();
    expect(handle.markerSnapshot()).toBeNull();
    expect(f.events).toHaveLength(count);
    expect(await handle.markCapacity()).not.toBeNull();
    expect(f.marks[0].operationId).not.toBe(OTHER);
  });

  it("a UUID allocation failure consumes the local attempt before any replacement identity can be allocated", async () => {
    const f = await fixture();
    const handle = f.create();
    expect(await handle.admit(f.request)).toBe(true);
    const random = vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new Error("fictional UUID failure");
    });
    expect(await handle.markCapacity()).toBeNull();
    expect(handle.snapshot().state).toBe("invalid");
    expect(f.marks).toEqual([]);
    expect(await handle.markCapacity()).toBeNull();
    expect(random).toHaveBeenCalledTimes(1);
    expect(f.closes).toEqual([]);
  });

  it("a fresh marker after 40 seconds preserves original lifecycle expiry and uses its own proof age", async () => {
    const f = await fixture();
    const handle = f.create();
    expect(await handle.admit(f.request)).toBe(true);
    const owned = handle.snapshot().ownership;
    f.state.now = NOW + 40_000;
    expect(await handle.markCapacity()).not.toBeNull();
    expect(handle.snapshot().ownership).toEqual(owned);
    expect(handle.markerSnapshot()!.request!.proof).toMatchObject({
      verifiedAt: NOW + 40_000,
      expiresAt: NOW + 50_000,
      effectiveExpiresAt: NOW + 90_000,
    });
    expect(handle.snapshot().effectiveExpiresAt).toBe(NOW + 90_000);
  });

  it("retains earlier shorter ceilings even when Auth and policy grow before the marker", async () => {
    const f = await fixture();
    f.identity.expiresAt = NOW + 60_000;
    f.current.allowlist.expiresAt = NOW + 50_000;
    const handle = f.create();
    expect(await handle.admit(f.request)).toBe(true);
    f.identity.expiresAt = NOW + 120_000;
    f.current.allowlist.expiresAt = NOW + 110_000;
    expect(await handle.markCapacity()).not.toBeNull();
    expect(handle.markerSnapshot()!.request!.proof).toMatchObject({
      identityExpiresAt: NOW + 60_000,
      effectiveExpiresAt: NOW + 50_000,
    });
    expect(handle.snapshot().ownership!.claim.expiresAt).toBe(NOW + 50_000);
  });

  it.each(["owner", "session", "parent", "fingerprint", "approval", "issuance", "crypto-key"])(
    "pins original %s before marker proof creation",
    async (change) => {
      const f = await fixture();
      const handle = f.create();
      expect(await handle.admit(f.request)).toBe(true);
      if (change === "owner") f.identity.ownerId = OTHER;
      if (change === "session") f.identity.sessionId = OTHER;
      if (change === "parent") f.parent.parentVersion++;
      if (change === "fingerprint") f.current.authority.fingerprint = "b".repeat(64);
      if (change === "approval") f.current.approval.digest = "b".repeat(64);
      if (change === "issuance") f.current.authority.issuedAt--;
      if (change === "crypto-key") vi.stubEnv("BFA_P3B_STATE_SECRET", "different-fictional-key");
      expect(await handle.markCapacity()).toBeNull();
      expect(handle.markerSnapshot()).toMatchObject({
        state: "unconfirmed",
        request: null,
        registrationAttempted: false,
        markAttempted: false,
      });
      expect(f.proofs).toHaveLength(2);
      expect(f.marks).toEqual([]);
      expect(f.closes).toEqual([]);
      expect(await handle.close()).toBe(true);
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
  ])("requires exact marker proof registration ACK %s", async (path) => {
    const f = await fixture();
    const handle = f.create();
    expect(await handle.admit(f.request)).toBe(true);
    f.hooks.set("proof:3", () => {
      const proof = structuredClone(f.proofs[2]);
      const value = path
        .split(".")
        .reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], proof);
      setPath(
        proof,
        path,
        typeof value === "number"
          ? value + 1
          : path === "operation"
            ? "claim"
            : path.includes("Fingerprint") || path.includes("Digest")
              ? "b".repeat(64)
              : OTHER,
      );
      f.overrides.set("proof:3", proof);
    });
    expect(await handle.markCapacity()).toBeNull();
    expect(handle.markerSnapshot()).toMatchObject({
      state: "unconfirmed",
      registrationAttempted: true,
      registrationAcknowledgment: null,
      markAttempted: false,
    });
    expect(f.marks).toEqual([]);
    expect(f.inspections).toHaveLength(1);
    expect(f.closes).toEqual([]);
  });

  it.each([
    "protocol",
    "operationId",
    "expectedPoolVersion",
    "proof.protocol",
    "proof.receiptId",
    "proof.operation",
    "proof.cleanupId",
    "proof.authSessionId",
    "proof.parentVersion",
    "proof.authorityFingerprint",
    "proof.verifiedAt",
    "proof.expiresAt",
    "proof.identityExpiresAt",
    "proof.effectiveExpiresAt",
    "proof.claim.claimId",
    "proof.claim.expiresAt",
    "proof.claim.binding.approvalDigest",
  ])("requires exact full marker ACK field %s", async (path) => {
    const f = await fixture();
    const handle = f.create();
    expect(await handle.admit(f.request)).toBe(true);
    f.hooks.set("mark:1", () => {
      const req = structuredClone(f.marks[0]);
      const value = path
        .split(".")
        .reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], req);
      setPath(
        req,
        path,
        typeof value === "number"
          ? value + 1
          : path === "proof.operation"
            ? "claim"
            : path.includes("Fingerprint") || path.includes("Digest")
              ? "b".repeat(64)
              : OTHER,
      );
      f.overrides.set("mark:1", { protocol: 2, request: req, status: "marked" });
    });
    expect(await handle.markCapacity()).toBeNull();
    expect(handle.markerSnapshot()).toMatchObject({
      state: "unconfirmed",
      markAttempted: true,
      acknowledgment: null,
    });
    const count = f.events.length;
    expect(await handle.markCapacity()).toBeNull();
    expect(f.events).toHaveLength(count);
    expect(f.marks).toHaveLength(1);
  });

  it.each(["already-marked", "denied", "quarantined", "closed"])(
    "retains exact %s marker evidence without successful permission or retry",
    async (status) => {
      const f = await fixture();
      const handle = f.create();
      expect(await handle.admit(f.request)).toBe(true);
      f.hooks.set("mark:1", () => {
        f.overrides.set("mark:1", { protocol: 2, request: f.marks[0], status });
      });
      expect(await handle.markCapacity()).toBeNull();
      expect(handle.markerSnapshot()).toMatchObject({
        state: "unconfirmed",
        acknowledgment: { status, request: f.marks[0] },
      });
      expect(handle.snapshot().state).toBe("invalid");
      expect(f.closes).toEqual([]);
      expect(await handle.markCapacity()).toBeNull();
      expect(f.marks).toHaveLength(1);
    },
  );

  it.each(["null", "legacy", "peeled", "extra", "accessor"])(
    "rejects %s reply without exposing raw failure or adopting legacy evidence",
    async (mode) => {
      const f = await fixture();
      const handle = f.create();
      expect(await handle.admit(f.request)).toBe(true);
      const getter = vi.fn(() => "marked");
      f.hooks.set("mark:1", () => {
        const ack = { protocol: 2, request: f.marks[0], status: "marked" };
        if (mode === "accessor")
          Object.defineProperty(ack, "status", { enumerable: true, get: getter });
        f.overrides.set(
          "mark:1",
          mode === "null"
            ? null
            : mode === "legacy"
              ? { claim: f.marks[0].proof.claim, state: "marked" }
              : mode === "peeled"
                ? f.marks[0]
                : mode === "extra"
                  ? { ...ack, providerAllowed: true }
                  : ack,
        );
      });
      expect(await handle.markCapacity()).toBeNull();
      expect(getter).not.toHaveBeenCalled();
      expect(handle.markerSnapshot()!.acknowledgment).toBeNull();
    },
  );

  it.each(["proof:3", "mark:1"])(
    "retains one original operation on lost %s without automatic cleanup, retry or replacement",
    async (stage) => {
      const f = await fixture();
      const handle = f.create();
      expect(await handle.admit(f.request)).toBe(true);
      f.hooks.set(stage, () => {
        throw new Error(`${f.token} ${SECRET} private`);
      });
      expect(await handle.markCapacity()).toBeNull();
      const snapshot = handle.markerSnapshot()!;
      expect(snapshot.state).toBe("unconfirmed");
      expect(snapshot.request).not.toBeNull();
      expect(f.closes).toEqual([]);
      expect(await handle.markCapacity()).toBeNull();
      expect(handle.markerSnapshot()).toEqual(snapshot);
      expect(f.proofs).toHaveLength(3);
      f.identity.sessionId = OTHER;
      f.state.now = Number.NaN;
      expect(await handle.close()).toBe(true);
      expect(handle.markerSnapshot()).toEqual(snapshot);
    },
  );

  it.each(["proof:3", "mark:1"])(
    "later shorter eligibility at %s denies without changing original proof/claim",
    async (stage) => {
      const f = await fixture();
      const handle = f.create();
      expect(await handle.admit(f.request)).toBe(true);
      f.hooks.set(stage, () => {
        f.current.allowlist.expiresAt = NOW + 50_000;
      });
      expect(await handle.markCapacity()).toBeNull();
      const marker = handle.markerSnapshot()!;
      expect(marker.request!.proof.effectiveExpiresAt).toBe(NOW + 90_000);
      expect(handle.snapshot().effectiveExpiresAt).toBe(NOW + 50_000);
      expect(marker.ownership.claim.expiresAt).toBe(NOW + 90_000);
      expect(marker.state).toBe("unconfirmed");
      if (stage === "proof:3") expect(f.marks).toEqual([]);
      else expect(marker.acknowledgment?.status).toBe("marked");
    },
  );

  it.each(["proof:3", "mark:1"])(
    "exact proof deadline reached during %s retains late ACK and denies",
    async (stage) => {
      const f = await fixture();
      const handle = f.create();
      expect(await handle.admit(f.request)).toBe(true);
      f.hooks.set(stage, () => {
        f.state.now = NOW + 10_000;
      });
      expect(await handle.markCapacity()).toBeNull();
      expect(handle.markerSnapshot()!.request!.proof.verifiedAt).toBe(NOW);
      expect(handle.markerSnapshot()!.registrationAcknowledgment).not.toBeNull();
      if (stage === "mark:1")
        expect(handle.markerSnapshot()!.acknowledgment?.status).toBe("marked");
      else expect(f.marks).toEqual([]);
    },
  );

  it("does not refresh the original proof when postregistration verification itself waits past expiry", async () => {
    const f = await fixture();
    const handle = f.create();
    expect(await handle.admit(f.request)).toBe(true);
    f.hooks.set("proof:3", () => {
      f.hooks.set(`auth:${f.counts.auth + 1}`, () => {
        f.state.now = NOW + 10_000;
      });
    });
    expect(await handle.markCapacity()).toBeNull();
    expect(f.marks).toEqual([]);
    expect(f.proofs[2]).toMatchObject({ verifiedAt: NOW, expiresAt: NOW + 10_000 });
  });

  it.each([NOW - 1, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "unsafe/backward clock %s at marker wait denies and preserves cleanup",
    async (time) => {
      const f = await fixture();
      const handle = f.create();
      expect(await handle.admit(f.request)).toBe(true);
      f.hooks.set("mark:1", () => {
        f.state.now = time;
      });
      expect(await handle.markCapacity()).toBeNull();
      expect(handle.markerSnapshot()!.acknowledgment?.status).toBe("marked");
      expect(await handle.close()).toBe(true);
    },
  );

  it.each(["proof:3", "mark:1"])(
    "close synchronously fences pending %s and preserves exact late evidence",
    async (stage) => {
      const f = await fixture();
      const handle = f.create();
      expect(await handle.admit(f.request)).toBe(true);
      const entered = deferred();
      const release = deferred();
      f.hooks.set(stage, async () => {
        entered.resolve();
        await release.promise;
      });
      const pending = handle.markCapacity();
      await entered.promise;
      const before = handle.markerSnapshot()!;
      expect(await handle.markCapacity()).toBeNull();
      expect(await handle.revalidate()).toBe(false);
      const close = handle.close();
      expect(handle.snapshot().state).toBe("closing");
      expect(await close).toBe(true);
      release.resolve();
      expect(await pending).toBeNull();
      expect(handle.snapshot().state).toBe("closed");
      expect(handle.markerSnapshot()!.operationId).toBe(before.operationId);
      expect(handle.markerSnapshot()!.state).toBe("unconfirmed");
      if (stage === "proof:3") {
        expect(handle.markerSnapshot()!.registrationAcknowledgment).not.toBeNull();
        expect(f.marks).toEqual([]);
      } else expect(handle.markerSnapshot()!.acknowledgment?.status).toBe("marked");
      expect(f.inspections).toHaveLength(1);
      expect(f.closes).toHaveLength(1);
    },
  );

  it("busy ordinary revalidation does not start a marker attempt or adopt its consumed inspect proof", async () => {
    const f = await fixture();
    const handle = f.create();
    expect(await handle.admit(f.request)).toBe(true);
    const entered = deferred();
    const release = deferred();
    f.hooks.set("inspect:2", async () => {
      entered.resolve();
      await release.promise;
    });
    const revalidating = handle.revalidate();
    await entered.promise;
    expect(await handle.markCapacity()).toBeNull();
    expect(handle.markerSnapshot()).toBeNull();
    release.resolve();
    expect(await revalidating).toBe(true);
    expect(await handle.markCapacity()).not.toBeNull();
    expect(f.proofs).toHaveLength(4);
    expect(f.marks[0].proof.receiptId).not.toBe(f.inspections[1].receiptId);
  });
});
