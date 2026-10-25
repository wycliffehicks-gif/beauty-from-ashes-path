// P3a repair regressions: the REAL async ConversationPreviewStore wired to the
// REAL ConversationService (mock provider, fixture resolver). Async work is
// awaited through store events / service.ready() and explicit deferred
// provider gates, not just drained timers. Application-boundary evidence
// only — never model quality, identity, persistence or real audio.

import { describe, expect, it } from "vitest";

import { buildTeachingSourceRecords } from "../content/index";
import {
  CONVERSATION_POLICY_BLOCK,
  CONVERSATION_POLICY_BLOCK_SHA256,
  CONVERSATION_POLICY_IDENTITY,
} from "../policy";
import { createSourceRegistry, sha256Hex, WEB_CLASSIC_PSA034_018_TEST_FIXTURE } from "../sources";
import { GrantIssuer } from "../service/grant-issuer";
import {
  createMockProvider,
  deterministicMockReply,
  type MockProviderOptions,
  type MockProviderRequest,
} from "../service/mock-provider";
import { ConversationService } from "../service/service";
import { sha256HexSync } from "../service/sha256-sync";
import { ConversationPreviewStore } from "../preview/store";

const WEB_KEY = WEB_CLASSIC_PSA034_018_TEST_FIXTURE.sourceKey;
const RESTRICT = "Please don't give me prayer or Bible advice right now. I don't want to make this into a lesson.";

async function harness(opts: { spiritual?: boolean; provider?: MockProviderOptions; scripture?: boolean } = {}) {
  const queue: Array<() => void> = [];
  const dispatched: MockProviderRequest[] = [];
  const service = new ConversationService({
    provider: createMockProvider({ delayMs: 0, ...opts.provider, onDispatch: (r) => dispatched.push(r) }),
    registryRecords: opts.scripture
      ? async () => [...(await buildTeachingSourceRecords()), WEB_CLASSIC_PSA034_018_TEST_FIXTURE]
      : undefined,
    allowTestSources: opts.scripture === true,
    passageSourceKeys: opts.scripture ? [WEB_KEY] : [],
  });
  await service.ready();
  const store = new ConversationPreviewStore({
    schedule: (fn) => {
      queue.push(fn);
      return queue.length;
    },
    readSpiritualPreference: () => opts.spiritual ?? false,
    nowIso: () => "2026-10-25T12:00:00.000Z",
    service,
  });
  (store as unknown as { ensureBrowserInit(): void }).ensureBrowserInit = () => {};
  (store as unknown as { state: object }).state = { ...store.getSnapshot(), hydrated: true };
  (store as unknown as { importedSpiritualOn: boolean }).importedSpiritualOn = opts.spiritual ?? false;
  const flush = () => {
    while (queue.length) queue.shift()!();
  };
  /** Await the terminal store event: no generating placeholder remains. */
  const settle = async () => {
    for (let i = 0; i < 200; i += 1) {
      flush();
      const t = store.activeThread();
      if (!t || !t.messages.some((m) => m.status === "generating")) {
        await new Promise((r) => setTimeout(r, 0));
        flush();
        return;
      }
      await new Promise((r) => setTimeout(r, 1));
    }
    throw new Error("store never settled");
  };
  const send = async (text: string) => {
    store.setDraft(text);
    const r = store.sendDraft();
    await settle();
    return r;
  };
  return { store, service, dispatched, flush, settle, send };
}

/** Dump every runtime cache of the service (Maps/Sets included). */
function dumpService(service: ConversationService): string {
  return JSON.stringify(service, (_k, v) => {
    if (v instanceof Map) return [...v.entries()];
    if (v instanceof Set) return [...v.values()];
    if (v instanceof AbortController) return "controller";
    return v;
  });
}

const userTurns = (service: ConversationService, storeId: string) =>
  service.inspect(storeId)!.events.filter((e) => e.role === "user" && e.turnId).map((e) => e.turnId!);

describe("A. admission ticket, cancellation and persisted meaning", () => {
  it("send → Stop before the scheduled run → flush: ZERO provider calls", async () => {
    const h = await harness();
    h.store.createThread();
    h.store.setDraft("hello");
    expect(h.store.sendDraft().ok).toBe(true);
    h.store.stopResponse();
    await h.settle();
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 1));
    expect(h.dispatched).toHaveLength(0);
    expect(h.service.trace.some((t) => t.type === "turn-committed")).toBe(false);
  });

  it("preference off during pending work: zero dispatch, stopped, voice off", async () => {
    const h = await harness({ spiritual: true });
    h.store.createThread();
    h.store.setDraft("hello");
    h.store.sendDraft();
    h.store.setPreviewSpiritual(false);
    await h.settle();
    expect(h.dispatched).toHaveLength(0);
    expect(h.store.activeThread()!.messages.at(-1)!.status).toBe("stopped");
  });

  it("a restriction submitted with a FAILED reply stays in later context", async () => {
    let fail = true;
    const h = await harness({
      spiritual: true,
      provider: {
        respond: (req) => {
          if (fail) throw new Error("boom");
          return deterministicMockReply(req);
        },
      },
    });
    h.store.createThread();
    await h.send(RESTRICT);
    expect(h.store.activeThread()!.messages.at(-1)!.status).toBe("not-answered");
    fail = false;
    await h.send("hello again");
    const ctx = h.dispatched.at(-1)!.context;
    expect([...ctx.restrictions].sort()).toEqual(["no-advice", "no-bible", "no-prayer"]);
    expect(ctx.spiritual.prayerPermitted).toBe(false);
  });

  it("a correction submitted then Stopped before dispatch persists with provenance", async () => {
    const h = await harness();
    h.store.createThread();
    await h.send("I came home yesterday and couldn't talk to anyone.");
    h.store.setDraft("I was tired, not angry.");
    h.store.sendDraft();
    h.store.stopResponse();
    await h.settle();
    await h.send("What have I told you about yesterday?");
    const eff = h.dispatched.at(-1)!.effective;
    expect(eff.map((e) => e.kind)).toContain("user-correction");
    expect(eff.some((e) => e.text.includes("Perhaps you were angry"))).toBe(false);
    const corr = h.service.inspect(h.store.activeThread()!.id)!.derived.find((d) => d.kind === "user-correction")!;
    expect(corr.evidenceSha256).toBe(sha256HexSync("I was tired, not angry."));
    expect(corr.supersedesItemId).not.toBeNull();
  });

  it("never-sent drafts and Not sent messages contribute nothing", async () => {
    const h = await harness({ spiritual: true });
    h.store.createThread();
    h.store.setSimulateSendFailure(true);
    h.store.setDraft(RESTRICT);
    expect(h.store.sendDraft().ok).toBe(false);
    h.store.setSimulateSendFailure(false);
    h.store.setDraft("Please don't write me a prayer."); // typed, never sent
    h.store.setDraft("");
    await h.send("hello");
    expect(h.dispatched.at(-1)!.context.restrictions).toEqual([]);
    expect(JSON.stringify(h.dispatched.at(-1))).not.toContain("Bible advice");
  });

  it("atomic commit: a synchronous subscriber Save captures the exact committed service state", async () => {
    const h = await harness();
    const t = h.store.createThread();
    let saved = false;
    const unsub = h.store.subscribe(() => {
      const a = h.store.activeThread();
      if (!saved && a && a.messages.some((m) => m.role === "assistant" && m.status === "sent")) {
        saved = true;
        expect(h.store.saveActiveThread().ok).toBe(true);
      }
    });
    await h.send("I came home yesterday and couldn't talk to anyone.");
    unsub();
    expect(saved).toBe(true);
    const ins = h.service.inspect(t.id)!;
    // Saved snapshot == live state at commit: user + assistant + report + interpretation.
    expect(ins.saved).toEqual({ eventCount: ins.events.length, derivedCount: ins.derived.length });
    expect(ins.events.map((e) => e.role)).toEqual(["user", "assistant"]);
    expect(ins.derived.map((d) => d.kind).sort()).toEqual(["ai-interpretation", "user-report"]);
    expect(h.store.saveStatus(h.store.activeThread()!)).toBe("saved");
  });
});

describe("B. exact voice ownership", () => {
  it("first and second voice answers are queued for their OWN turns", async () => {
    const h = await harness();
    const t = h.store.createThread();
    h.store.startTalking();
    h.flush();
    expect(h.store.getSnapshot().voice).toBe("listening");
    await h.send("hello");
    const [t1] = userTurns(h.service, t.id);
    expect(h.service.voice.segments.length).toBeGreaterThan(0);
    expect(new Set(h.service.voice.segments.map((s) => s.turnId))).toEqual(new Set([t1]));
    while (h.service.voice.playNext());
    await h.send("again");
    const [, t2] = userTurns(h.service, t.id);
    const second = h.service.voice.segments.filter((s) => s.turnId === t2);
    expect(second.length).toBeGreaterThan(0);
    expect(h.service.voice.segments.filter((s) => s.turnId === t1).every((s) => s.state === "played")).toBe(true);
  });

  it("Stop during a voice turn: late output never queues", async () => {
    let release = null as (() => void) | null;
    const h = await harness({ provider: { ignoreAbort: true, schedule: (fn) => { release = fn; return 0; } } });
    h.store.createThread();
    h.store.startTalking();
    h.flush();
    h.store.setDraft("hello");
    h.store.sendDraft();
    h.flush();
    while (!release) await new Promise((r) => setTimeout(r, 1));
    h.store.stopResponse();
    release!();
    await h.settle();
    expect(h.service.voice.segments).toHaveLength(0);
  });

  it("switch to new thread / existing thread / delete end the old voice session", async () => {
    const h = await harness();
    const a = h.store.createThread();
    await h.send("hello");
    h.store.saveActiveThread();
    h.store.startTalking();
    h.flush();
    expect(h.service.voice.threadId).toBe(h.service.threadIdFor(a.id));
    expect(h.store.requestSwitch({ kind: "new" }).ok).toBe(true);
    expect(h.service.voice.state).toBe("idle");
    expect(h.store.getSnapshot().voice).toBe("off");
    h.store.startTalking();
    h.flush();
    expect(h.store.requestSwitch({ kind: "open", threadId: a.id }).ok).toBe(true);
    expect(h.service.voice.state).toBe("idle");
    h.store.startTalking();
    h.flush();
    h.store.deleteThread(a.id);
    expect([h.service.voice.state, h.service.voice.capture, h.service.voice.transport]).toEqual(["idle", "closed", "closed"]);
  });

  it("preference off ends the service voice session, matching the UI", async () => {
    const h = await harness({ spiritual: true });
    h.store.createThread();
    h.store.startTalking();
    h.flush();
    h.store.setPreviewSpiritual(false);
    expect(h.store.getSnapshot().voice).toBe("off");
    expect(h.service.voice.state).toBe("idle");
  });
});

describe("discard / delete / clear: all-cache canaries", () => {
  for (const action of ["discard", "delete", "clear"] as const) {
    it(`${action} removes canary text from every service cache`, async () => {
      const h = await harness();
      const t = h.store.createThread();
      await h.send("hello");
      h.store.saveActiveThread();
      h.store.startTalking();
      h.flush();
      await h.send("CANARY_" + action.toUpperCase());
      h.store.feedProvisionalFragment("FRAG_CANARY");
      expect(dumpService(h.service)).toContain("CANARY_");
      if (action === "discard") h.store.discardActiveChanges();
      if (action === "delete") h.store.deleteThread(t.id);
      if (action === "clear") h.store.handleAppClear();
      const dump = dumpService(h.service);
      expect(dump).not.toContain("CANARY_");
      expect(dump).not.toContain("FRAG_CANARY");
    });
  }
});

describe("both stores preserved on refused actions", () => {
  it("failed save, dialog cancel and unsent-draft refusal leave UI and service unchanged", async () => {
    const h = await harness();
    const a = h.store.createThread();
    await h.send("hello");
    h.store.saveActiveThread();
    await h.send("second");
    const snapUi = () => JSON.stringify(h.store.activeThread());
    const snapSvc = () => JSON.stringify(h.service.inspect(a.id));
    const ui0 = snapUi();
    const svc0 = snapSvc();
    h.store.setSimulateSaveFailure(true);
    expect(h.store.saveActiveThread().ok).toBe(false);
    expect([snapUi(), snapSvc()]).toEqual([ui0, svc0]);
    expect(h.store.requestSwitch({ kind: "new" }).ok).toBe(false);
    expect(h.store.resolveSwitchDecision("save").ok).toBe(false);
    expect([snapUi(), snapSvc()]).toEqual([ui0, svc0]);
    expect(h.store.resolveSwitchDecision("cancel").ok).toBe(true);
    h.store.setSimulateSaveFailure(false);
    h.store.setDraft("UNSENT");
    const ui1 = snapUi();
    h.store.requestSwitch({ kind: "new" });
    expect(h.store.resolveSwitchDecision("save")).toEqual({ ok: false, reason: "unsent-draft" });
    expect([snapUi(), snapSvc(), h.store.activeDraft()]).toEqual([ui1, svc0, "UNSENT"]);
  });

  it("retry a failed message once; the newer draft is retained", async () => {
    const h = await harness();
    const t = h.store.createThread();
    h.store.setSimulateSendFailure(true);
    h.store.setDraft("A text");
    h.store.sendDraft();
    h.store.setSimulateSendFailure(false);
    h.store.setDraft("B newer");
    const failed = h.store.activeThread()!.messages.find((m) => m.status === "not-sent")!;
    expect(h.store.retryMessage(failed.id).ok).toBe(true);
    await h.settle();
    expect(h.dispatched).toHaveLength(1);
    expect(h.dispatched[0].context.message).toBe("A text");
    expect(h.store.activeDraft()).toBe("B newer");
    const ev = h.service.inspect(t.id)!.events.filter((e) => e.role === "user");
    expect(ev.map((e) => e.status)).toEqual(["retried", "delivered"]);
  });
});

describe("C. grant / source / request integrity", () => {
  it("prayer revision never inherits a passage grant; passage follow-up pins it", async () => {
    const h = await harness({ scripture: true });
    const t = h.store.createThread();
    await h.send("Please quote Psalm 34:18 exactly and tell me which translation you're using.");
    await h.send("Could you make that prayer simpler?");
    const req = h.dispatched.at(-1)!;
    expect(req.context.spiritual.prayerPermitted).toBe(false);
    expect(req.context.spiritual.scripturePermitted).toBe(false);
    expect(h.service.trace.find((x) => x.type === "follow-up-grant-refused")?.detail).toBe("follow-up-kind-mismatch");
    // A fresh passage request then a passage-specific follow-up pins the source.
    await h.send("Please quote Psalm 34:18 exactly and tell me which translation you're using.");
    await h.send("Could you show that same passage again?");
    const grants = h.service.inspect(t.id)!.grants.filter((g) => g.committed);
    const last = grants.at(-1)!;
    expect(last.parentGrantId).toBe(grants.at(-2)!.grantId);
    expect(last.sources).toEqual([WEB_KEY]);
    expect(h.dispatched.at(-1)!.context.sources.map((s) => s.excerpt.sourceKey)).toContain(WEB_KEY);
  });

  it("a preference change between parent and follow-up revokes the old permission", async () => {
    const h = await harness();
    h.store.createThread();
    await h.send("Please write a short Christian prayer for patience today.");
    h.store.setPreviewSpiritual(true);
    h.store.setPreviewSpiritual(false);
    await h.send("Could you make that prayer simpler?");
    expect(h.dispatched.at(-1)!.context.spiritual.prayerPermitted).toBe(false);
    expect(h.service.trace.find((x) => x.type === "follow-up-grant-refused")?.detail).toBe("revision-mismatch");
  });

  it("source metadata drift (same bytes, different translation/review) is rejected", async () => {
    const reg = await createSourceRegistry([...(await buildTeachingSourceRecords()), WEB_CLASSIC_PSA034_018_TEST_FIXTURE]);
    const drift = {
      ...WEB_CLASSIC_PSA034_018_TEST_FIXTURE,
      origin: { ...WEB_CLASSIC_PSA034_018_TEST_FIXTURE.origin, translation: "Another translation" },
    };
    const reg2 = await createSourceRegistry([...(await buildTeachingSourceRecords()), drift]);
    if (!reg.ok || !reg2.ok) throw new Error("registry");
    const issuer = new GrantIssuer("x");
    const binding = {
      ownerId: "o", threadId: "th", turnId: "tu", messageEventId: "e", messageSha256: "a".repeat(64),
      preferenceRevision: 0, restrictionRevision: 0,
    };
    const g = (await issuer.issueOriginal(binding, "passage", [WEB_KEY], reg.registry, true))!;
    expect((await issuer.validate(g, binding, reg.registry, true)).ok).toBe(true);
    const r = await issuer.validate(g, binding, reg2.registry, true);
    expect(r.ok ? "ok" : r.failure).toBe("sources-changed");
    expect(g.sources[0]).toMatchObject({ kind: WEB_CLASSIC_PSA034_018_TEST_FIXTURE.kind, testOnly: true });
    expect(g.sources[0].originJson).toContain("translation");
  });

  it("follow-up against a parent from an older restriction revision is refused", async () => {
    const reg = await createSourceRegistry(await buildTeachingSourceRecords());
    if (!reg.ok) throw new Error("registry");
    const issuer = new GrantIssuer("y");
    const b = { ownerId: "o", threadId: "th", turnId: "t1", messageEventId: "e1", messageSha256: "a".repeat(64), preferenceRevision: 0, restrictionRevision: 0 };
    const p = (await issuer.issueOriginal(b, "prayer", [], reg.registry, false))!;
    const r = await issuer.issueFollowUp({ ...b, turnId: "t2", messageEventId: "e2", restrictionRevision: 1 }, p.grantId, "t1", "prayer", reg.registry, false);
    expect(r.ok ? "ok" : r.failure).toBe("revision-mismatch");
  });

  it("provider request carries the exact approved policy body and is deeply frozen/detached", async () => {
    const h = await harness();
    h.store.createThread();
    await h.send("hello");
    const req = h.dispatched[0];
    expect(req.policyIdentity).toBe(CONVERSATION_POLICY_IDENTITY);
    expect(req.policyBody).toBe(CONVERSATION_POLICY_BLOCK);
    expect(new TextEncoder().encode(req.policyBody).length).toBe(4043);
    expect(await sha256Hex(req.policyBody)).toBe(CONVERSATION_POLICY_BLOCK_SHA256);
    const deep = (o: unknown): boolean =>
      !o || typeof o !== "object" || (Object.isFrozen(o) && Object.values(o).every(deep));
    expect(deep(req)).toBe(true);
    expect(() => {
      (req.context as unknown as { restrictions: string[] }).restrictions.push("x");
    }).toThrow();
    expect(() => {
      (req.revisions as { preference: number }).preference = 99;
    }).toThrow();
  });
});

describe("D. mock provider settlement", () => {
  const req = {} as MockProviderRequest;
  it("pre-aborted request rejects immediately and is never dispatched", async () => {
    let dispatched = 0;
    const p = createMockProvider({ onDispatch: () => { dispatched += 1; } });
    const c = new AbortController();
    c.abort();
    await expect(p.generate(req, c.signal)).rejects.toThrow("aborted");
    expect(dispatched).toBe(0);
  });

  it("a throwing responder rejects through the promise", async () => {
    const p = createMockProvider({ delayMs: 0, respond: () => { throw new Error("responder-broke"); } });
    await expect(p.generate(req, new AbortController().signal)).rejects.toThrow("responder-broke");
  });

  it("abort mid-flight settles exactly once, even if the timer fires later", async () => {
    let fire = null as (() => void) | null;
    let outcomes = 0;
    const p = createMockProvider({ schedule: (fn) => { fire = fn; return 0; }, respond: () => ({ text: "x", sourceIds: [], interpretation: null }) });
    const c = new AbortController();
    const pr = p.generate(req, c.signal).then(() => { outcomes += 1; }, () => { outcomes += 1; });
    c.abort();
    fire!();
    await pr;
    await new Promise((r) => setTimeout(r, 1));
    expect(outcomes).toBe(1);
  });
});

describe("sync hash", () => {
  it("matches Web Crypto SHA-256", async () => {
    for (const t of ["", "abc", "I was tired, not angry.", "é 漢字 🌱", "x".repeat(1000)]) {
      expect(sha256HexSync(t)).toBe(await sha256Hex(t));
    }
  });
});

describe("E. voice UI follow-up: practice offer, interrupt, transcript choice", () => {
  it("private practice offer is current only for the same confirmed-paused session", async () => {
    const h = await harness();
    h.store.createThread();
    h.store.startTalking();
    h.flush();
    h.store.pauseVoice();
    h.flush();
    expect(h.store.getSnapshot().voice).toBe("paused");
    const offered = h.service.voice.sessionId;
    expect(h.store.isPrivatePracticeOfferCurrent(offered)).toBe(true);
    // Resume: new session, capture reopens — the old offer is stale.
    h.store.resumeVoice();
    h.flush();
    expect(h.store.isPrivatePracticeOfferCurrent(offered)).toBe(false);
    expect(h.store.isPrivatePracticeOfferCurrent(h.service.voice.sessionId)).toBe(false);
    // Finish: session ended entirely.
    h.store.finishTalking();
    expect(h.store.isPrivatePracticeOfferCurrent(offered)).toBe(false);
  });

  it("offer is never current when shutdown failed or capture is open", async () => {
    const h = await harness();
    h.store.createThread();
    h.store.startTalking();
    h.flush();
    const listeningSession = h.service.voice.sessionId;
    expect(h.store.isPrivatePracticeOfferCurrent(listeningSession)).toBe(false);
    h.store.setSimulateShutdownFailure(true);
    h.store.pauseVoice();
    h.flush();
    expect(h.store.getSnapshot().voice).toBe("pause-failed");
    expect(h.store.isPrivatePracticeOfferCurrent(h.service.voice.sessionId)).toBe(false);
  });

  it("Interrupt reply while Speaking cancels queued output and keeps the session listening", async () => {
    const h = await harness();
    h.store.createThread();
    h.store.startTalking();
    h.flush();
    await h.send("hello");
    expect(h.store.getSnapshot().voice).toBe("speaking");
    expect(h.service.voice.hasQueued()).toBe(true);
    const session = h.service.voice.sessionId;
    h.store.stopResponse();
    expect(h.store.getSnapshot().voice).toBe("listening");
    expect(h.service.voice.hasQueued()).toBe(false);
    expect(h.service.voice.sessionId).toBe(session);
    expect(h.service.voice.capture).toBe("open");
    expect(h.service.voice.segments.every((s) => s.state !== "queued")).toBe(true);
  });

  it("a finalized transcript never overwrites typed text; Cancel preserves it exactly", async () => {
    const h = await harness();
    h.store.createThread();
    h.store.startTalking();
    h.flush();
    h.store.setDraft("my typed draft");
    h.store.finalizeTranscript("I am not angry with her; I am tired.");
    expect(h.store.activeDraft()).toBe("my typed draft");
    expect(h.store.getSnapshot().pendingTranscript).toBe("I am not angry with her; I am tired.");
    expect(h.store.resolveTranscriptChoice("cancel").ok).toBe(true);
    expect(h.store.activeDraft()).toBe("my typed draft");
    expect(h.store.getSnapshot().pendingTranscript).toBeNull();
    expect(h.dispatched).toHaveLength(0);
  });

  it("Append and Replace are explicit; an empty composer takes the transcript directly", async () => {
    const h = await harness();
    h.store.createThread();
    h.store.startTalking();
    h.flush();
    h.store.finalizeTranscript("first transcript");
    expect(h.store.activeDraft()).toBe("first transcript");
    expect(h.store.getSnapshot().pendingTranscript).toBeNull();
    h.store.finalizeTranscript("second transcript");
    expect(h.store.getSnapshot().pendingTranscript).toBe("second transcript");
    expect(h.store.resolveTranscriptChoice("append").ok).toBe(true);
    expect(h.store.activeDraft()).toBe("first transcript\nsecond transcript");
    h.store.finalizeTranscript("third");
    expect(h.store.resolveTranscriptChoice("replace").ok).toBe(true);
    expect(h.store.activeDraft()).toBe("third");
    expect(h.dispatched).toHaveLength(0);
  });

  it("a pending transcript choice is dropped on thread switch", async () => {
    const h = await harness();
    h.store.createThread();
    h.store.startTalking();
    h.flush();
    h.store.setDraft("typed");
    h.store.finalizeTranscript("spoken final");
    expect(h.store.getSnapshot().pendingTranscript).toBe("spoken final");
    const r = h.store.requestSwitch({ kind: "new" });
    if (!r.ok) h.store.resolveSwitchDecision("discard");
    expect(h.store.getSnapshot().pendingTranscript).toBeNull();
  });
});
