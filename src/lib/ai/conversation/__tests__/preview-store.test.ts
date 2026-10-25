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
    /** Run every queued callback, oldest first (adversarial ordering possible). */
    flush: () => {
      while (queue.length > 0) queue.shift()!();
    },
    /** Run only the OLDEST queued callback, leaving the rest pending. */
    flushOldest: () => {
      queue.shift()?.();
    },
    pendingCount: () => queue.length,
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

  it("retry of a failed message preserves a newer composer draft", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setSimulateSendFailure(true);
    store.setDraft("older failed A");
    store.sendDraft();
    store.setSimulateSendFailure(false);
    store.setDraft("newer draft B");
    const failed = store.activeThread()!.messages[0];
    expect(store.retryMessage(failed.id).ok).toBe(true);
    // Newer draft B is untouched by A's retry.
    expect(store.getSnapshot().draft).toBe("newer draft B");
    flush();
    const thread = store.activeThread()!;
    expect(thread.messages[0].text).toBe("older failed A");
    expect(thread.messages[0].status).toBe("sent");
    expect(store.getSnapshot().draft).toBe("newer draft B");
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

  it("a second Send while a reply is generating is refused and the draft is preserved", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("first");
    expect(store.sendDraft().ok).toBe(true);
    store.setDraft("second");
    const result = store.sendDraft();
    expect(result).toEqual({ ok: false, reason: "response-pending" });
    expect(store.getSnapshot().draft).toBe("second"); // preserved, not queued
    expect(store.activeThread()!.messages).toHaveLength(2); // no silent drop
    flush();
    const thread = store.activeThread()!;
    expect(thread.messages[1].status).toBe("sent"); // first completes normally
    // After completion the second send works.
    expect(store.sendDraft().ok).toBe(true);
    flush();
    expect(store.activeThread()!.messages).toHaveLength(4);
  });

  it("retry while a reply is generating is refused", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setSimulateSendFailure(true);
    store.setDraft("failed one");
    store.sendDraft();
    store.setSimulateSendFailure(false);
    store.setDraft("in flight");
    store.sendDraft();
    flush(); // wait — "in flight" is generating until flush; do not flush
    // Re-create the pending state: send again without flushing.
    store.setDraft("another");
    store.sendDraft();
    const failed = store.activeThread()!.messages.find((m) => m.status === "not-sent")!;
    expect(store.retryMessage(failed.id)).toEqual({ ok: false, reason: "response-pending" });
  });

  it("save is refused while a reply is generating; no live placeholder is ever saved", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("first");
    store.sendDraft();
    expect(store.saveActiveThread()).toEqual({ ok: false, reason: "response-pending" });
    expect(store.activeThread()!.savedSnapshot).toBeNull();
    // Finish-with-save is equally refused and stays open.
    expect(store.finishActiveThread("save")).toEqual({ ok: false, reason: "response-pending" });
    expect(store.activeThread()).not.toBeNull();
    flush();
    // After completion the save succeeds and the snapshot has the real reply.
    expect(store.saveActiveThread().ok).toBe(true);
    const snapshot = store.activeThread()!.savedSnapshot!;
    expect(snapshot.messages[1].status).toBe("sent");
    expect(snapshot.messages[1].text.length).toBeGreaterThan(0);
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
    expect(saved.savedAt).toBe("2026-10-25T12:00:00.000Z");
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

  it("unsent draft text makes a saved thread show Unsaved changes, never Saved", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("first");
    store.sendDraft();
    flush();
    store.saveActiveThread();
    expect(store.saveStatus(store.activeThread()!)).toBe("saved");
    store.setDraft("typed but not sent");
    expect(store.saveStatus(store.activeThread()!)).toBe("unsaved-changes");
  });

  it("finish never silently discards unsent draft text", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("first");
    store.sendDraft();
    flush();
    store.saveActiveThread();
    store.setDraft("unsent words");
    expect(store.finishActiveThread("discard")).toEqual({ ok: false, reason: "unsent-draft" });
    expect(store.activeThread()).not.toBeNull();
    expect(store.getSnapshot().draft).toBe("unsent words"); // preserved
    // Explicit acknowledgment discards only the draft, keeping saved messages.
    expect(store.finishActiveThread("discard", { discardDraft: true }).ok).toBe(true);
    const kept = store.getSnapshot().threads[0];
    expect(kept.messages).toHaveLength(2);
    expect(kept.savedSnapshot).not.toBeNull();
  });

  it("simulated save failure changes nothing and reports failure", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("first");
    store.sendDraft();
    flush();
    store.setSimulateSaveFailure(true);
    expect(store.saveActiveThread()).toEqual({ ok: false, reason: "save-failed" });
    expect(store.saveStatus(store.activeThread()!)).toBe("not-saved");
    expect(store.activeThread()!.savedSnapshot).toBeNull();
    // Finish-with-save also refuses to close on a failed save.
    expect(store.finishActiveThread("save")).toEqual({ ok: false, reason: "save-failed" });
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
    // Cancel preserves active state (no pending switch recorded here).
    store.setDraft("draft kept");
    store.resolveSwitchDecision("cancel");
    expect(store.getSnapshot().draft).toBe("draft kept");
    expect(store.activeThread()!.messages).toHaveLength(2);
  });

  it("switching away with unsaved changes requires a decision, then completes the switch", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("unsaved");
    store.sendDraft();
    flush();
    const firstId = store.activeThread()!.id;
    const result = store.requestSwitch({ kind: "new" });
    expect(result).toEqual({ ok: false, reason: "needs-decision" });
    expect(store.getSnapshot().pendingSwitch).toEqual({ kind: "new" });
    expect(store.activeThread()!.id).toBe(firstId); // nothing changed yet
    store.resolveSwitchDecision("save");
    // Save succeeded, so the pending switch completed.
    expect(store.getSnapshot().pendingSwitch).toBeNull();
    expect(store.activeThread()!.id).not.toBe(firstId);
    const first = store.getSnapshot().threads.find((t) => t.id === firstId)!;
    expect(store.saveStatus(first)).toBe("saved");
    // A clean thread switches immediately.
    expect(store.requestSwitch({ kind: "new" }).ok).toBe(true);
  });

  it("an unsent draft also guards switching; discard drops only the draft and changes", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("saved");
    store.sendDraft();
    flush();
    store.saveActiveThread("Guarded");
    store.setDraft("unsent draft");
    const result = store.requestSwitch({ kind: "new" });
    expect(result).toEqual({ ok: false, reason: "needs-decision" });
    // Cancel restores exactly: same thread, same draft.
    store.resolveSwitchDecision("cancel");
    expect(store.activeThread()!.title).toBe("Guarded");
    expect(store.getSnapshot().draft).toBe("unsent draft");
    // Discard drops the draft, keeps the saved snapshot, then switches.
    store.requestSwitch({ kind: "new" });
    store.resolveSwitchDecision("discard");
    const guarded = store.getSnapshot().threads.find((t) => t.title === "Guarded")!;
    expect(guarded.messages).toHaveLength(2);
    expect(store.getSnapshot().draft).toBe("");
    expect(store.activeThread()!.id).not.toBe(guarded.id);
  });

  it("a failed save during a switch decision stays put; nothing is lost", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("unsaved");
    store.sendDraft();
    flush();
    const firstId = store.activeThread()!.id;
    store.requestSwitch({ kind: "new" });
    store.setSimulateSaveFailure(true);
    const result = store.resolveSwitchDecision("save");
    expect(result).toEqual({ ok: false, reason: "save-failed" });
    expect(store.activeThread()!.id).toBe(firstId); // stayed
    expect(store.getSnapshot().pendingSwitch).toEqual({ kind: "new" }); // still pending
    store.setSimulateSaveFailure(false);
    expect(store.resolveSwitchDecision("save").ok).toBe(true);
    expect(store.activeThread()!.id).not.toBe(firstId);
  });

  it("save-and-switch is refused while an unsent draft exists; everything is preserved", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("saved turn");
    store.sendDraft();
    flush();
    store.saveActiveThread("Kept");
    store.setDraft("unsent draft");
    const firstId = store.activeThread()!.id;
    store.requestSwitch({ kind: "new" });
    // The controller refuses BEFORE any save/switch mutation.
    const result = store.resolveSwitchDecision("save");
    expect(result).toEqual({ ok: false, reason: "unsent-draft" });
    expect(store.activeThread()!.id).toBe(firstId);
    expect(store.getSnapshot().pendingSwitch).toEqual({ kind: "new" });
    expect(store.getSnapshot().draft).toBe("unsent draft");
    const kept = store.getSnapshot().threads.find((t) => t.id === firstId)!;
    expect(kept.savedSnapshot?.title).toBe("Kept");
    expect(kept.messages).toHaveLength(2);
    // Cancel preserves the exact draft.
    store.resolveSwitchDecision("cancel");
    expect(store.getSnapshot().draft).toBe("unsent draft");
    // Discard explicitly drops the draft and completes the switch.
    store.requestSwitch({ kind: "new" });
    expect(store.resolveSwitchDecision("discard").ok).toBe(true);
    expect(store.activeThread()!.id).not.toBe(firstId);
    expect(store.getSnapshot().draft).toBe("");
    // A clean switch with no draft still succeeds freely.
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
    expect(store.finishActiveThread("save").ok).toBe(true); // closes the thread
    expect(store.getSnapshot().activeThreadId).toBeNull();
    expect(store.requestSwitch({ kind: "open", threadId: id }).ok).toBe(true);
    expect(store.getSnapshot().voice).toBe("off");
    expect(store.getSnapshot().draft).toBe(""); // no unrelated draft carried over
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

  it("adversarial: a pre-clear callback can never fill a post-clear request", () => {
    const { store, flushOldest, pendingCount } = harness;
    // Before clear: send "I miss my mum" (job scheduled, not yet run).
    store.createThread();
    store.setDraft("I miss my mum");
    store.sendDraft();
    expect(pendingCount()).toBe(1);
    // Clear everything, then make a NEW request that reuses nothing.
    store.handleAppClear();
    store.acknowledgeIntro();
    store.createThread();
    store.setDraft("inbox work tomorrow");
    store.sendDraft();
    expect(pendingCount()).toBe(2); // old callback + new callback
    // Run the OLD callback first: it must be dropped by epoch validation.
    flushOldest();
    let thread = store.activeThread()!;
    expect(thread.messages[1].status).toBe("generating"); // untouched
    expect(thread.messages[1].text).toBe("");
    // Run the NEW callback: only it may complete the new request.
    flushOldest();
    thread = store.activeThread()!;
    expect(thread.messages[1].status).toBe("sent");
    expect(thread.messages[1].text).toContain("deadline"); // inbox reply, NOT "miss her"
    expect(thread.messages[1].text).not.toContain("miss her");
  });

  it("rename of a saved thread saves the snapshot title only; failure changes nothing", () => {
    const { store, flush } = harness;
    store.createThread();
    store.setDraft("saved");
    store.sendDraft();
    flush();
    store.saveActiveThread("Old name");
    const id = store.activeThread()!.id;
    // Simulated failure: name unchanged, error reported.
    store.setSimulateSaveFailure(true);
    expect(store.renameThread(id, "New name")).toEqual({ ok: false, reason: "save-failed" });
    expect(store.getSnapshot().threads[0].title).toBe("Old name");
    expect(store.getSnapshot().threads[0].savedSnapshot!.title).toBe("Old name");
    store.setSimulateSaveFailure(false);
    // Success: both working title and saved snapshot title update.
    expect(store.renameThread(id, "New name").ok).toBe(true);
    const renamed = store.getSnapshot().threads[0];
    expect(renamed.title).toBe("New name");
    expect(renamed.savedSnapshot!.title).toBe("New name");
    // A later Discard keeps the renamed title (it was explicitly saved).
    store.setDraft("unsent turn");
    store.sendDraft();
    flush();
    store.discardActiveChanges();
    expect(store.activeThread()!.title).toBe("New name");
    expect(store.activeThread()!.messages).toHaveLength(2);
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

  it("pause while connecting cancels the pending connection timer", () => {
    const { store, flush } = harness;
    store.createThread();
    store.startTalking();
    expect(store.getSnapshot().voice).toBe("connecting");
    store.pauseVoice();
    expect(store.getSnapshot().voice).toBe("paused");
    flush(); // the old connection timer must NOT advance to listening
    expect(store.getSnapshot().voice).toBe("paused");
  });

  it("an old connection timer never advances a newly started session", () => {
    const { store, flushOldest, pendingCount } = harness;
    store.createThread();
    store.startTalking(); // session 1 timer queued
    store.finishTalking(); // invalidates session 1
    store.startTalking(); // session 2 timer queued
    expect(pendingCount()).toBe(2);
    flushOldest(); // stale session-1 timer: dropped
    expect(store.getSnapshot().voice).toBe("connecting");
    flushOldest(); // session-2 timer: advances
    expect(store.getSnapshot().voice).toBe("listening");
  });

  it("turning Christian reflection off while speaking ends the voice session", () => {
    const { store, flush } = harness;
    const on = makeHarness(true);
    on.store.createThread();
    on.store.startTalking();
    on.flush();
    expect(on.store.getSnapshot().voice).toBe("listening");
    on.store.setDraft("church hurt");
    on.store.sendDraft();
    expect(on.store.getSnapshot().voice).toBe("speaking");
    on.store.setPreviewSpiritual(false);
    // Reply stopped AND voice session explicitly ended — not left speaking.
    expect(on.store.activeThread()!.messages[1].status).toBe("stopped");
    expect(on.store.getSnapshot().voice).toBe("off");
    on.flush();
    expect(on.store.getSnapshot().voice).toBe("off");
    expect(on.store.activeThread()!.messages[1].status).toBe("stopped");
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
      const raw = readFileSync(join(__dirname, "..", "preview", file), "utf8");
      // Strip comments so the scan checks CODE, not the boundary notes.
      const code = raw
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("//"))
        .join("\n");
      expect(code).not.toMatch(/mediaDevices|getUserMedia|SpeechRecognition|speechSynthesis|RTCPeerConnection|MediaRecorder/);
    }
  });
});
