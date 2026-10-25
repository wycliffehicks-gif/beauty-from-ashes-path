// P2 conversation-preview store/controller tests.
//
// All behavior is SIMULATED: fictional replies, session-only in-memory saving,
// voice state simulation. These tests prove application state behavior only —
// never model quality, real persistence, or real audio.

import { beforeEach, describe, expect, it } from "vitest";

import { CONVERSATION_TEACHING_RECORDS } from "../content/teaching";
import { FICTIONAL_FALLBACK_REPLY } from "../preview/fake-service";
import {
  ConversationPreviewStore,
  getServerPreviewSnapshot,
} from "../preview/store";

/** Synchronous scheduler: jobs complete on the next flush() call. */
function makeHarness(spiritualPref = false) {
  const queue: Array<() => void> = [];
  const store = new ConversationPreviewStore({
    schedule: (fn) => {
      queue.push(fn);
      return queue.length;
    },
    readSpiritualPreference: () => spiritualPref,
    nowIso: () => "2026-10-25T12:00:00.000Z",
  });
  // Simulate browser hydration (tests run in node, so init manually).
  (store as unknown as { ensureBrowserInit(): void }).ensureBrowserInit =
    () => {};
  store.subscribe(() => {}); // triggers ensureBrowserInit (no-op in node)
  (store as unknown as { state: object }).state = {
    ...store.getSnapshot(),
    hydrated: true,
  };
  (store as unknown as { importedSpiritualOn: boolean }).importedSpiritualOn =
    spiritualPref;
  return {
    store,
    flush: () => {
      while (queue.length > 0) queue.shift()!();
    },
  };
}

describe("conversation preview store", () => {
  let harness: ReturnType<typeof makeHarness>;

  beforeEach(() => {
    harness = makeHarness();
  });

  it("server snapshot is stable, frozen and empty", () => {
    const a = getServerPreviewSnapshot();
    const b = getServerPreviewSnapshot();
    expect(a).toBe(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(a.threads).toHaveLength(0);
    expect(a.activeThreadId).toBeNull();
    expect(a.hydrated).toBe(false);
  });

  it("first entry requires the introduction before a thread exists", () => {
    const { store } = harness;
    expect(store.getSnapshot().introAcknowledged).toBe(false);
    store.acknowledgeIntro();
    expect(store.getSnapshot().introAcknowledged).toBe(true);
  });

  it("imports the spiritual preference once; preview toggles never touch the source", () => {
    const on = makeHarness(true);
    const thread = on.store.createThread();
    expect(thread.spiritualOn).toBe(true);
    on.store.setPreviewSpiritual(false);
    expect(on.store.activeThread()?.spiritualOn).toBe(false);
    // A second store still reads the source preference — unchanged by preview.
    const again = makeHarness(true);
    expect(again.store.createThread().spiritualOn).toBe(true);
  });

  it("sends a draft and completes a deterministic fictional reply", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("I miss my mum");
    expect(store.sendDraft().ok).toBe(true);
    let thread = store.activeThread()!;
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[1].status).toBe("generating");
    expect(store.getSnapshot().draft).toBe("");
    flush();
    thread = store.activeThread()!;
    expect(thread.messages[1].status).toBe("sent");
    expect(thread.messages[1].text).toContain("miss her");
  });

  it("default reply honestly states it is fictional, not understanding", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("xyzzy arbitrary freeform");
    store.sendDraft();
    flush();
    expect(store.activeThread()!.messages[1].text).toBe(FICTIONAL_FALLBACK_REPLY);
    expect(FICTIONAL_FALLBACK_REPLY).toMatch(/fictional preview/i);
  });

  it("failed send retains the input and shows Not sent; retry is deliberate", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setSimulateSendFailure(true);
    store.setDraft("keep this text");
    expect(store.sendDraft().ok).toBe(false);
    const thread = store.activeThread()!;
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0].status).toBe("not-sent");
    expect(store.getSnapshot().draft).toBe("keep this text"); // retained
    flush();
    expect(store.activeThread()!.messages).toHaveLength(1); // no invented reply
    store.setSimulateSendFailure(false);
    expect(store.retryMessage(thread.messages[0].id).ok).toBe(true);
    flush();
    const after = store.activeThread()!;
    expect(after.messages[0].status).toBe("sent");
    expect(after.messages[1].status).toBe("sent");
  });

  it("Stop response cancels the pending job; the stale completion never lands", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("hello");
    store.sendDraft();
    store.stopResponse();
    const thread = store.activeThread()!;
    expect(thread.messages[1].status).toBe("stopped");
    flush(); // the scheduled completion must be dropped
    expect(store.activeThread()!.messages[1].status).toBe("stopped");
    expect(store.activeThread()!.messages[1].text).toBe("");
  });

  it("turning Christian reflection off cancels a pending simulated reply", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("tell me about church");
    store.sendDraft();
    store.setPreviewSpiritual(false);
    expect(store.activeThread()!.messages[1].status).toBe("stopped");
    flush();
    expect(store.activeThread()!.messages[1].status).toBe("stopped");
  });

  it("simulated save success stores an immutable snapshot; later turns show Unsaved changes", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("first");
    store.sendDraft();
    flush();
    expect(store.saveStatus(store.activeThread()!)).toBe("not-saved");
    expect(store.saveActiveThread().ok).toBe(true);
    const saved = store.activeThread()!;
    expect(store.saveStatus(saved)).toBe("saved");
    expect(Object.isFrozen(saved.savedSnapshot)).toBe(true);
    expect(Object.isFrozen(saved.savedSnapshot!.messages)).toBe(true);
    // Later turns create unsaved changes.
    store.setDraft("second");
    store.sendDraft();
    flush();
    expect(store.saveStatus(store.activeThread()!)).toBe("unsaved-changes");
    // The saved snapshot is a separate copy, unchanged by later turns.
    expect(store.activeThread()!.savedSnapshot!.messages).toHaveLength(2);
    expect(store.activeThread()!.messages).toHaveLength(4);
  });

  it("simulated save failure changes nothing and reports failure", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("first");
    store.sendDraft();
    flush();
    store.setSimulateSaveFailure(true);
    expect(store.saveActiveThread().ok).toBe(false);
    expect(store.saveStatus(store.activeThread()!)).toBe("not-saved");
    expect(store.activeThread()!.savedSnapshot).toBeNull();
    // Finish-with-save also refuses to close on a failed save.
    expect(store.finishActiveThread("save").ok).toBe(false);
    expect(store.activeThread()).not.toBeNull();
  });

  it("discard restores the last saved snapshot exactly; cancel preserves the draft", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("saved turn");
    store.sendDraft();
    flush();
    store.saveActiveThread("My thread");
    store.setDraft("unsaved turn");
    store.sendDraft();
    flush();
    expect(store.activeThread()!.messages).toHaveLength(4);
    store.discardActiveChanges();
    const thread = store.activeThread()!;
    expect(thread.messages).toHaveLength(2);
    expect(thread.title).toBe("My thread");
    expect(store.saveStatus(thread)).toBe("saved");
    // Cancel preserves active state.
    store.setDraft("draft kept");
    store.resolveSwitchDecision("cancel");
    expect(store.getSnapshot().draft).toBe("draft kept");
    expect(store.activeThread()!.messages).toHaveLength(2);
  });

  it("switching away with unsaved changes requires a decision", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("unsaved");
    store.sendDraft();
    flush();
    const result = store.requestSwitch({ kind: "new" });
    expect(result).toEqual({ ok: false, reason: "needs-decision" });
    store.resolveSwitchDecision("save");
    expect(store.saveStatus(store.activeThread()!)).toBe("saved");
    expect(store.requestSwitch({ kind: "new" }).ok).toBe(true);
  });

  it("finish without saving a new thread removes it; a saved thread keeps its snapshot", () => {
    const { store, flush } = harness;
    // New unsaved thread: finish-discard removes it entirely.
    store.createThread();
    store.setDraft("ephemeral");
    store.sendDraft();
    flush();
    expect(store.finishActiveThread("discard").ok).toBe(true);
    expect(store.getSnapshot().threads).toHaveLength(0);
    expect(store.getSnapshot().activeThreadId).toBeNull();
    // Saved thread with new turns: discard keeps the saved copy.
    store.createThread();
    store.setDraft("saved");
    store.sendDraft();
    flush();
    store.saveActiveThread("Kept");
    store.setDraft("new turn");
    store.sendDraft();
    flush();
    expect(store.finishActiveThread("discard").ok).toBe(true);
    const kept = store.getSnapshot().threads[0];
    expect(kept.title).toBe("Kept");
    expect(kept.savedSnapshot!.messages).toHaveLength(2);
    expect(kept.messages).toHaveLength(2); // unsaved turns dropped
  });

  it("reopening a saved thread never starts voice and shows Unsaved changes after new turns", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("saved");
    store.sendDraft();
    flush();
    store.saveActiveThread("Return visit");
    const id = store.activeThread()!.id;
    store.finishActiveThread("keep");
    store.state; // noop
    (store as unknown as { state: object }).state = {
      ...store.getSnapshot(),
      activeThreadId: null,
    };
    expect(store.requestSwitch({ kind: "open", threadId: id }).ok).toBe(true);
    expect(store.getSnapshot().voice).toBe("off");
    store.setDraft("follow-up");
    store.sendDraft();
    flush();
    expect(store.saveStatus(store.activeThread()!)).toBe("unsaved-changes");
  });

  it("delete removes the thread and cancels its pending jobs", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("in flight");
    store.sendDraft();
    const id = store.activeThread()!.id;
    store.deleteThread(id);
    expect(store.getSnapshot().threads).toHaveLength(0);
    expect(store.getSnapshot().activeThreadId).toBeNull();
    flush(); // stale job completion must not resurrect anything
    expect(store.getSnapshot().threads).toHaveLength(0);
  });

  it("clear-all resets the store and cancels pending jobs", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("pending");
    store.sendDraft();
    store.handleAppClear();
    const state = store.getSnapshot();
    expect(state.threads).toHaveLength(0);
    expect(state.activeThreadId).toBeNull();
    expect(state.draft).toBe("");
    expect(state.voice).toBe("off");
    expect(state.introAcknowledged).toBe(false);
    flush();
    expect(store.getSnapshot().threads).toHaveLength(0);
  });

  it("shares exact teaching bytes only after confirmation; cancel shares nothing", () => {
    const { store } = harness;
    store.createThread();
    const record = CONVERSATION_TEACHING_RECORDS[0];
    store.previewShareTeaching(record.key);
    expect(store.getSnapshot().sharePreview?.key).toBe(record.key);
    store.cancelShareTeaching();
    expect(store.activeThread()!.messages).toHaveLength(0); // cancel = not shared
    store.previewShareTeaching(record.key);
    expect(store.confirmShareTeaching().ok).toBe(true);
    const message = store.activeThread()!.messages[0];
    expect(message.sharedTeaching?.sourceKey).toBe(record.key);
    expect(message.sharedTeaching?.body).toEqual(record.understandBody);
    expect(message.text).toBe(
      [record.understandHeading, ...record.understandBody].join("\n\n"),
    );
    expect(Object.isFrozen(message.sharedTeaching)).toBe(true);
  });

  it("voice simulator: explicit states, mute distinct from pause, resume explicit", () => {
    const { store, flush } = harness;
    store.createThread();
    expect(store.getSnapshot().voice).toBe("off");
    store.startTalking();
    expect(store.getSnapshot().voice).toBe("connecting");
    flush();
    expect(store.getSnapshot().voice).toBe("listening");
    store.setVoiceMuted(true);
    expect(store.getSnapshot().voiceMuted).toBe(true);
    expect(store.getSnapshot().voice).toBe("listening"); // mute ≠ pause
    store.pauseVoice();
    expect(store.getSnapshot().voice).toBe("paused");
    store.setVoiceMuted(false); // ignored while paused
    expect(store.getSnapshot().voiceMuted).toBe(true);
    store.resumeVoice();
    expect(store.getSnapshot().voice).toBe("connecting");
    flush();
    expect(store.getSnapshot().voice).toBe("listening");
    store.finishTalking();
    expect(store.getSnapshot().voice).toBe("off");
  });

  it("simulated disconnection preserves the thread and offers reconnect", () => {
    const { store, flush } = harness;
    store.createThread();
    store.startTalking();
    flush();
    store.simulateDisconnect();
    expect(store.getSnapshot().voice).toBe("disconnected");
    expect(store.activeThread()).not.toBeNull();
    store.resumeVoice();
    flush();
    expect(store.getSnapshot().voice).toBe("listening");
  });

  it("no mediaDevices, speech or WebRTC APIs are referenced by the preview modules", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const file of ["store.ts", "fake-service.ts"]) {
      const text = readFileSync(
        join(__dirname, "..", "preview", file),
        "utf8",
      );
      expect(text).not.toMatch(/mediaDevices|getUserMedia|SpeechRecognition|speechSynthesis|RTCPeerConnection|MediaRecorder/);
    }
  });
});
