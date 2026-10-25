// P3a integration: the P2 preview store wired to the shared service with a
// MOCK provider. Async work is drained explicitly; P2 invariants must hold.

import { describe, expect, it } from "vitest";

import { createMockProvider, type MockProviderOptions, type MockProviderRequest } from "../service/mock-provider";
import { ConversationService } from "../service/service";
import { ConversationPreviewStore } from "../preview/store";

function harness(opts: { spiritual?: boolean; provider?: MockProviderOptions } = {}) {
  const queue: Array<() => void> = [];
  const dispatched: MockProviderRequest[] = [];
  const service = new ConversationService({
    provider: createMockProvider({ delayMs: 0, ...opts.provider, onDispatch: (r) => dispatched.push(r) }),
  });
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
  const drain = async () => {
    for (let i = 0; i < 40; i += 1) {
      while (queue.length) queue.shift()!();
      await new Promise((r) => setTimeout(r, 1));
    }
  };
  const send = async (text: string) => {
    store.setDraft(text);
    const r = store.sendDraft();
    await drain();
    return r;
  };
  const flushOnce = () => {
    while (queue.length) queue.shift()!();
  };
  return { store, service, dispatched, drain, send, flushOnce };
}

const lastAssistant = (store: ConversationPreviewStore) =>
  store.activeThread()!.messages.filter((m) => m.role === "assistant").at(-1)!;

describe("P3a store ↔ service integration", () => {
  it("replies come from the mock provider via the service", async () => {
    const h = harness();
    h.store.createThread();
    await h.send("hello");
    expect(lastAssistant(h.store).status).toBe("sent");
    expect(lastAssistant(h.store).text).toContain("Fictional preview reply (mock provider, not AI)");
    expect(h.dispatched).toHaveLength(1);
  });

  it("P2 invariants hold: one send at a time; save refused while pending; draft kept", async () => {
    const h = harness();
    h.store.createThread();
    h.store.setDraft("first");
    expect(h.store.sendDraft().ok).toBe(true);
    h.store.setDraft("second");
    expect(h.store.sendDraft()).toEqual({ ok: false, reason: "response-pending" });
    expect(h.store.saveActiveThread()).toEqual({ ok: false, reason: "response-pending" });
    expect(h.store.activeDraft()).toBe("second");
    await h.drain();
    expect(h.store.activeThread()!.messages.filter((m) => m.status === "generating")).toHaveLength(0);
  });

  it("O02: A1 / new / A2 / reopen A1 — canaries stay in their thread; mic off on reopen", async () => {
    const h = harness();
    const a1 = h.store.createThread();
    await h.send("SYNTHETIC_THREAD_A_ONLY");
    expect(h.store.saveActiveThread().ok).toBe(true);
    expect(h.store.requestSwitch({ kind: "new" }).ok).toBe(true);
    await h.send("What did I say in A1?");
    expect(JSON.stringify(h.dispatched.at(-1))).not.toContain("SYNTHETIC_THREAD_A_ONLY");
    h.store.saveActiveThread();
    h.store.requestSwitch({ kind: "new" });
    await h.send("SYNTHETIC_THREAD_B_ONLY");
    h.store.saveActiveThread();
    h.store.startTalking();
    h.flushOnce();
    expect(h.store.requestSwitch({ kind: "open", threadId: a1.id }).ok).toBe(true);
    expect(h.store.getSnapshot().voice).toBe("off");
    expect(h.service.voice.state).toBe("idle");
    await h.send("continue");
    const json = JSON.stringify(h.dispatched.at(-1));
    expect(json).toContain("SYNTHETIC_THREAD_A_ONLY");
    expect(json).not.toContain("SYNTHETIC_THREAD_B_ONLY");
  });

  it("discard then reopen excludes discarded user/assistant/derived context", async () => {
    const h = harness();
    const t = h.store.createThread();
    await h.send("I came home yesterday and couldn't talk to anyone.");
    h.store.saveActiveThread();
    await h.send("I was tired, not angry.");
    await h.send("SYNTHETIC_DISCARDED_TURN");
    h.store.setDraft("");
    expect(h.store.requestSwitch({ kind: "new" }).ok).toBe(false);
    expect(h.store.resolveSwitchDecision("discard").ok).toBe(true);
    h.store.requestSwitch({ kind: "open", threadId: t.id });
    const ins = h.service.inspect(t.id)!;
    expect(ins.derived.some((d) => d.kind === "user-correction")).toBe(false);
    expect(ins.events.some((e) => e.text === "SYNTHETIC_DISCARDED_TURN")).toBe(false);
    await h.send("again");
    const json = JSON.stringify(h.dispatched.at(-1));
    expect(json).not.toContain("SYNTHETIC_DISCARDED_TURN");
    expect(json).not.toContain("tired, not angry");
    // Store transcript and service events agree after discard.
    const uiPersonTexts = h.store.activeThread()!.messages.filter((m) => m.role === "person").map((m) => m.text);
    const svcUserTexts = h.service.inspect(t.id)!.events.filter((e) => e.role === "user" && e.status === "delivered").map((e) => e.text);
    expect(svcUserTexts).toEqual(uiPersonTexts);
  });

  it("Stop during generation: no late reply, service event not committed", async () => {
    const h = harness();
    const t = h.store.createThread();
    h.store.setDraft("hello");
    h.store.sendDraft();
    h.store.stopResponse();
    await h.drain();
    expect(lastAssistant(h.store).status).toBe("stopped");
    expect(h.service.inspect(t.id)!.events.some((e) => e.role === "assistant")).toBe(false);
  });

  it("preference off during generation cancels; failed update keeps truthful state", async () => {
    const h = harness({ spiritual: true });
    const t = h.store.createThread();
    h.store.setDraft("hello");
    h.store.sendDraft();
    h.store.setSimulatePreferenceFailure(true);
    expect(h.store.setPreviewSpiritual(false)).toEqual({ ok: false, reason: "preference-failed" });
    expect(h.store.activeThread()!.spiritualOn).toBe(true);
    expect(h.service.inspect(t.id)!.preferenceOn).toBe(true);
    await h.drain();
    expect(lastAssistant(h.store).status).toBe("stopped"); // contradictory output stopped
    h.store.setSimulatePreferenceFailure(false);
    expect(h.store.setPreviewSpiritual(false).ok).toBe(true);
    expect(h.service.inspect(t.id)!.preferenceOn).toBe(false);
  });

  it("clear-all during generation: old work never attaches to a new thread", async () => {
    let release: (() => void) | null = null;
    const h = harness({ provider: { ignoreAbort: true, schedule: (fn) => { release = fn; return 0; } } });
    h.store.createThread();
    h.store.setDraft("SYNTHETIC_PRE_CLEAR");
    h.store.sendDraft();
    for (let i = 0; i < 20 && !release; i += 1) {
      h.flushOnce();
      await new Promise((r) => setTimeout(r, 1));
    }
    h.store.handleAppClear();
    h.store.createThread();
    const oldRelease = release!;
    release = null;
    oldRelease();
    await h.drain();
    expect(h.store.activeThread()!.messages).toEqual([]);
    expect(JSON.stringify(h.service.inspect(h.store.activeThread()!.id))).not.toContain("SYNTHETIC_PRE_CLEAR");
  });

  it("a reply claiming saved/deleted/preference-off changes no app state", async () => {
    const h = harness({
      spiritual: true,
      provider: { respond: () => ({ text: "Saved, deleted and turned reflection off.", sourceIds: [], interpretation: null, claims: ["saved", "deleted"] }) },
    });
    h.store.createThread();
    await h.send("hello");
    const thread = h.store.activeThread()!;
    expect(h.store.saveStatus(thread)).toBe("not-saved");
    expect(thread.spiritualOn).toBe(true);
    expect(h.store.getSnapshot().threads).toHaveLength(1);
  });

  it("voice Pause reports complete only after confirmed mock shutdown; failure is honest", async () => {
    const h = harness();
    h.store.createThread();
    h.store.startTalking();
    h.flushOnce();
    expect(h.store.getSnapshot().voice).toBe("listening");
    h.store.pauseVoice();
    expect(h.store.getSnapshot().voice).toBe("pausing");
    h.flushOnce();
    expect(h.store.getSnapshot().voice).toBe("paused");
    expect(h.service.voice.privatePracticeAvailable()).toBe(true);
    h.store.simulateNetworkRecovered();
    expect(h.store.getSnapshot().voice).toBe("paused");
    const before = h.service.voice.log.filter((l) => l.type === "session-start").length;
    h.store.resumeVoice();
    h.flushOnce();
    expect(h.service.voice.log.filter((l) => l.type === "session-start").length).toBe(before + 1);
    h.store.setSimulateShutdownFailure(true);
    h.store.pauseVoice();
    h.flushOnce();
    expect(h.store.getSnapshot().voice).toBe("pause-failed");
    expect(h.service.voice.privatePracticeAvailable()).toBe(false);
  });

  it("voice answers queue as segments; only played ones count as heard", async () => {
    const h = harness();
    h.store.createThread();
    h.store.startTalking();
    h.flushOnce();
    await h.send("hello");
    expect(h.store.getSnapshot().voice).toBe("speaking");
    h.store.playNextVoiceSegment();
    h.store.stopResponse();
    const states = h.service.voice.segments.map((s) => s.state);
    expect(states[0]).toBe("played");
    expect(states.slice(1).every((s) => s === "cancelled")).toBe(true);
  });

  it("final corrected transcript enters the composer only; provisional never does", () => {
    const h = harness();
    h.store.createThread();
    h.store.startTalking();
    h.flushOnce();
    h.store.feedProvisionalFragment("I am angry with her");
    expect(h.store.activeDraft()).toBe("");
    h.store.finalizeTranscript("I am not angry with her; I am tired.");
    expect(h.store.activeDraft()).toBe("I am not angry with her; I am tired.");
  });
});
