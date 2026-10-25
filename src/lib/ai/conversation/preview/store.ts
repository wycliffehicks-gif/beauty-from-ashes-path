// Conversation preview — browser-only in-memory store and controller.
//
// HARD BOUNDARIES (P2):
//  - In-memory ONLY. No localStorage, sessionStorage, database, network or
//    analytics writes for preview data. Refreshing or closing loses everything,
//    and the intro says so plainly.
//  - SSR-safe: the server snapshot is a stable frozen EMPTY state; the browser
//    store is created lazily after hydration. No personal active state ever
//    lives in an SSR module singleton.
//  - The existing spiritual preference is imported ONCE at browser init;
//    preview toggles never write back to the app's real preference store.
//  - "bfa-app-clear" (dispatched by clearJourney()) resets this store and
//    cancels every pending simulated job.
//  - No microphone, speech, WebRTC or mediaDevices access anywhere. The voice
//    panel is an explicitly labelled STATE SIMULATOR.

import { useSyncExternalStore } from "react";

import { readPrefs } from "@/lib/prefs";
import { APP_CLEAR_EVENT } from "@/lib/journey/progress";
import {
  CONVERSATION_TEACHING_RECORDS,
  type ConversationTeachingRecord,
} from "../content/teaching";
import { fictionalReply } from "./fake-service";

// ---------------------------------------------------------------------------
// Types

export type PreviewMessageStatus = "sent" | "not-sent" | "generating" | "stopped";

/** An immutable snapshot of the exact shared teaching bytes. */
export interface SharedTeachingSnapshot {
  readonly sourceKey: string;
  readonly day: number;
  readonly title: string;
  readonly heading: string;
  readonly body: readonly string[];
}

export interface PreviewMessage {
  readonly id: string;
  readonly role: "person" | "assistant";
  readonly text: string;
  readonly status: PreviewMessageStatus;
  /** Present only on messages that deliberately shared exact teaching. */
  readonly sharedTeaching?: SharedTeachingSnapshot;
}

interface ThreadSnapshot {
  readonly title: string;
  readonly messages: readonly PreviewMessage[];
}

export interface PreviewThread {
  readonly id: string;
  title: string;
  readonly createdAt: string;
  messages: PreviewMessage[];
  /** Immutable copy made by the last SUCCESSFUL simulated save. */
  savedSnapshot: ThreadSnapshot | null;
  /** True when current messages/title differ from the saved snapshot. */
  dirty: boolean;
  /** Imported once from the app preference; preview-only afterwards. */
  spiritualOn: boolean;
  /** Monotonic generation counter; bumping invalidates every pending job. */
  generation: number;
}

export type VoiceSimState =
  | "off"
  | "connecting"
  | "listening"
  | "speaking"
  | "paused"
  | "disconnected";

export type SaveStatus = "not-saved" | "saved" | "unsaved-changes";

export interface PreviewState {
  readonly hydrated: boolean;
  readonly introAcknowledged: boolean;
  readonly threads: readonly PreviewThread[];
  readonly activeThreadId: string | null;
  /** Composer text, retained across same-session navigation. */
  readonly draft: string;
  readonly voice: VoiceSimState;
  readonly voiceMuted: boolean;
  /** Teaching record currently shown in the exact-share preview, if any. */
  readonly sharePreview: ConversationTeachingRecord | null;
  /** Review controls (explicitly not participant controls). */
  readonly simulateSendFailure: boolean;
  readonly simulateSaveFailure: boolean;
}

const EMPTY_STATE: PreviewState = Object.freeze({
  hydrated: false,
  introAcknowledged: false,
  threads: Object.freeze([]) as readonly PreviewThread[],
  activeThreadId: null,
  draft: "",
  voice: "off",
  voiceMuted: false,
  sharePreview: null,
  simulateSendFailure: false,
  simulateSaveFailure: false,
});

/** Stable frozen server snapshot — never carries personal state. */
export function getServerPreviewSnapshot(): PreviewState {
  return EMPTY_STATE;
}

// ---------------------------------------------------------------------------
// Store

type Scheduler = (fn: () => void, ms: number) => unknown;
type Listener = () => void;

export interface PreviewStoreOptions {
  /** Injectable scheduler so tests run synchronously. */
  readonly schedule?: Scheduler;
  /** Injectable preference reader (defaults to the real prefs store). */
  readonly readSpiritualPreference?: () => boolean;
  /** Injectable clock for deterministic tests. */
  readonly nowIso?: () => string;
}

interface PendingJob {
  readonly jobId: string;
  readonly threadId: string;
  readonly generation: number;
  readonly assistantMessageId: string;
}

export class ConversationPreviewStore {
  private state: PreviewState = EMPTY_STATE;
  private readonly listeners = new Set<Listener>();
  private readonly pendingJobs = new Map<string, PendingJob>();
  private counter = 0;
  private readonly schedule: Scheduler;
  private readonly readSpiritualPreference: () => boolean;
  private readonly nowIso: () => string;
  private clearListener: (() => void) | null = null;

  constructor(options: PreviewStoreOptions = {}) {
    this.schedule =
      options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    this.readSpiritualPreference =
      options.readSpiritualPreference ?? (() => readPrefs().showSpiritual);
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
  }

  // --- subscription -------------------------------------------------------

  subscribe = (listener: Listener): (() => void) => {
    this.ensureBrowserInit();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): PreviewState => {
    this.ensureBrowserInit();
    return this.state;
  };

  private emit() {
    this.state = { ...this.state };
    for (const listener of this.listeners) listener();
  }

  /** Browser-only initialization: import the app preference exactly once. */
  private ensureBrowserInit() {
    if (typeof window === "undefined" || this.state.hydrated) return;
    this.state = {
      ...this.state,
      hydrated: true,
      threads: [],
      // Imported ONCE. Later preview toggles never touch the real store.
      // (The imported value seeds each NEW thread; see createThread.)
    };
    this.importedSpiritualOn = this.readSpiritualPreference();
    if (!this.clearListener) {
      const onClear = () => this.handleAppClear();
      window.addEventListener(APP_CLEAR_EVENT, onClear);
      this.clearListener = () =>
        window.removeEventListener(APP_CLEAR_EVENT, onClear);
    }
  }

  private importedSpiritualOn = false;

  // --- helpers --------------------------------------------------------------

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  activeThread(): PreviewThread | null {
    const id = this.state.activeThreadId;
    return this.state.threads.find((t) => t.id === id) ?? null;
  }

  saveStatus(thread: PreviewThread): SaveStatus {
    if (!thread.savedSnapshot) return "not-saved";
    return thread.dirty ? "unsaved-changes" : "saved";
  }

  private updateThread(id: string, fn: (t: PreviewThread) => PreviewThread) {
    this.state = {
      ...this.state,
      threads: this.state.threads.map((t) => (t.id === id ? fn(t) : t)),
    };
  }

  /** Cancel every pending job for a thread and invalidate their generation. */
  private cancelPendingJobs(threadId: string, markStopped: boolean) {
    for (const [jobId, job] of this.pendingJobs) {
      if (job.threadId !== threadId) continue;
      this.pendingJobs.delete(jobId);
      if (markStopped) {
        this.updateThread(threadId, (t) => ({
          ...t,
          messages: t.messages.map((m) =>
            m.id === job.assistantMessageId && m.status === "generating"
              ? { ...m, status: "stopped" as const, text: "" }
              : m,
          ),
        }));
      }
    }
    this.updateThread(threadId, (t) => ({ ...t, generation: t.generation + 1 }));
  }

  // --- introduction ---------------------------------------------------------

  acknowledgeIntro() {
    this.state = { ...this.state, introAcknowledged: true };
    this.emit();
  }

  // --- threads ----------------------------------------------------------------

  createThread(): PreviewThread {
    const thread: PreviewThread = {
      id: this.nextId("thread"),
      title: "Untitled conversation",
      createdAt: this.nowIso(),
      messages: [],
      savedSnapshot: null,
      dirty: false,
      spiritualOn: this.importedSpiritualOn,
      generation: 0,
    };
    this.state = {
      ...this.state,
      threads: [...this.state.threads, thread],
      activeThreadId: thread.id,
    };
    this.emit();
    return thread;
  }

  /**
   * Open another thread or start a new one. When the active thread has
   * unsaved changes, the caller must resolve Save / Discard / Cancel first;
   * this returns "needs-decision" and changes nothing.
   */
  requestSwitch(next: { kind: "new" } | { kind: "open"; threadId: string }):
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: "needs-decision" | "unknown-thread" } {
    const active = this.activeThread();
    if (active && this.saveStatus(active) !== "saved") {
      return { ok: false, reason: "needs-decision" };
    }
    if (next.kind === "new") {
      this.createThread();
      return { ok: true };
    }
    const target = this.state.threads.find((t) => t.id === next.threadId);
    if (!target) return { ok: false, reason: "unknown-thread" };
    // Reopening never starts a microphone: voice resets to off.
    this.cancelPendingJobs(target.id, false);
    this.state = {
      ...this.state,
      activeThreadId: target.id,
      voice: "off",
      voiceMuted: false,
    };
    this.emit();
    return { ok: true };
  }

  /** Resolve a pending switch decision. */
  resolveSwitchDecision(decision: "save" | "discard" | "cancel") {
    const active = this.activeThread();
    if (!active) return;
    if (decision === "cancel") return; // active draft/thread preserved
    if (decision === "save") this.saveActiveThread();
    else this.discardActiveChanges();
  }

  setDraft(text: string) {
    this.state = { ...this.state, draft: text };
    this.emit();
  }

  // --- sending ----------------------------------------------------------------

  /**
   * Send the current draft in the active thread. On simulated failure the
   * input is RETAINED in the composer and the message is marked Not sent;
   * no reply is invented. Deliberate retry only via retryMessage.
   */
  sendDraft(): { readonly ok: boolean } {
    const thread = this.activeThread();
    const text = this.state.draft.trim();
    if (!thread || text.length === 0) return { ok: false };

    if (this.state.simulateSendFailure) {
      const failed: PreviewMessage = {
        id: this.nextId("m"),
        role: "person",
        text,
        status: "not-sent",
      };
      this.updateThread(thread.id, (t) => ({
        ...t,
        messages: [...t.messages, failed],
        dirty: true,
      }));
      // Draft retained: the composer keeps the text for a deliberate retry.
      this.emit();
      return { ok: false };
    }

    const personMessage: PreviewMessage = {
      id: this.nextId("m"),
      role: "person",
      text,
      status: "sent",
    };
    const assistantMessage: PreviewMessage = {
      id: this.nextId("m"),
      role: "assistant",
      text: "",
      status: "generating",
    };
    const generation = thread.generation + 1;
    this.updateThread(thread.id, (t) => ({
      ...t,
      messages: [...t.messages, personMessage, assistantMessage],
      dirty: true,
      generation,
    }));
    this.state = { ...this.state, draft: "" };
    if (this.state.voice === "listening") {
      this.state = { ...this.state, voice: "speaking" };
    }

    const jobId = this.nextId("job");
    this.pendingJobs.set(jobId, {
      jobId,
      threadId: thread.id,
      generation,
      assistantMessageId: assistantMessage.id,
    });
    const spiritualOn = thread.spiritualOn;
    this.schedule(() => {
      this.completeJob(jobId, fictionalReply({ message: text, spiritualOn }));
    }, 400);
    this.emit();
    return { ok: true };
  }

  private completeJob(jobId: string, reply: string) {
    const job = this.pendingJobs.get(jobId);
    if (!job) return; // cancelled, stopped, deleted or cleared — drop silently
    this.pendingJobs.delete(jobId);
    const thread = this.state.threads.find((t) => t.id === job.threadId);
    if (!thread || thread.generation !== job.generation) return; // stale
    this.updateThread(job.threadId, (t) => ({
      ...t,
      messages: t.messages.map((m) =>
        m.id === job.assistantMessageId
          ? { ...m, text: reply, status: "sent" as const }
          : m,
      ),
    }));
    if (this.state.voice === "speaking") {
      this.state = { ...this.state, voice: "listening" };
    }
    this.emit();
  }

  /** Stop the in-progress simulated response for the active thread. */
  stopResponse() {
    const thread = this.activeThread();
    if (!thread) return;
    this.cancelPendingJobs(thread.id, true);
    if (this.state.voice === "speaking") {
      this.state = { ...this.state, voice: "listening" };
    }
    this.emit();
  }

  /** Deliberate retry of a Not sent message. */
  retryMessage(messageId: string): { readonly ok: boolean } {
    const thread = this.activeThread();
    if (!thread) return { ok: false };
    const message = thread.messages.find((m) => m.id === messageId);
    if (!message || message.status !== "not-sent") return { ok: false };
    // Remove the failed marker and resend the same text through the normal path.
    this.updateThread(thread.id, (t) => ({
      ...t,
      messages: t.messages.filter((m) => m.id !== messageId),
    }));
    this.state = { ...this.state, draft: message.text };
    return this.sendDraft();
  }

  // --- saving (explicitly simulated) -------------------------------------------

  /**
   * Simulated save. Success stores an immutable snapshot separate from the
   * active messages; failure (review control) changes nothing and reports
   * failure — no navigation, no Saved label.
   */
  saveActiveThread(title?: string): { readonly ok: boolean } {
    const thread = this.activeThread();
    if (!thread) return { ok: false };
    if (this.state.simulateSaveFailure) return { ok: false };
    const snapshot: ThreadSnapshot = Object.freeze({
      title: title ?? thread.title,
      messages: Object.freeze(
        thread.messages.map((m) => Object.freeze({ ...m })),
      ),
    });
    this.updateThread(thread.id, (t) => ({
      ...t,
      title: title ?? t.title,
      savedSnapshot: snapshot,
      dirty: false,
    }));
    this.emit();
    return { ok: true };
  }

  /** Discard unsaved changes: restore the last saved snapshot exactly. */
  discardActiveChanges() {
    const thread = this.activeThread();
    if (!thread || !thread.savedSnapshot) return;
    const snapshot = thread.savedSnapshot;
    this.updateThread(thread.id, (t) => ({
      ...t,
      title: snapshot.title,
      messages: snapshot.messages.map((m) => ({ ...m })),
      dirty: false,
    }));
    this.emit();
  }

  renameActiveThread(title: string) {
    const thread = this.activeThread();
    const clean = title.trim();
    if (!thread || clean.length === 0) return;
    this.updateThread(thread.id, (t) => ({
      ...t,
      title: clean.slice(0, 120),
      dirty: true,
    }));
    this.emit();
  }

  renameThread(threadId: string, title: string) {
    const clean = title.trim();
    if (clean.length === 0) return;
    this.updateThread(threadId, (t) => ({
      ...t,
      title: clean.slice(0, 120),
      dirty: t.savedSnapshot !== null || t.dirty,
    }));
    this.emit();
  }

  /** Delete a saved thread: cancel its jobs, close its active copy. */
  deleteThread(threadId: string) {
    this.cancelPendingJobs(threadId, false);
    this.state = {
      ...this.state,
      threads: this.state.threads.filter((t) => t.id !== threadId),
      activeThreadId:
        this.state.activeThreadId === threadId ? null : this.state.activeThreadId,
      voice: this.state.activeThreadId === threadId ? "off" : this.state.voice,
    };
    this.emit();
  }

  /**
   * Finish the active conversation.
   *  - "save": simulated save, then close.
   *  - "discard": new thread → removed entirely; saved thread → unsaved turns
   *    dropped, saved snapshot preserved.
   *  - "keep": nothing changes.
   * Finishing always ends the simulated voice state.
   */
  finishActiveThread(decision: "save" | "discard" | "keep"): { readonly ok: boolean } {
    const thread = this.activeThread();
    if (!thread) return { ok: false };
    if (decision === "keep") return { ok: true };
    if (decision === "save") {
      if (!this.saveActiveThread()) return { ok: false }; // failed save: stay
    } else if (thread.savedSnapshot) {
      this.discardActiveChanges();
    } else {
      this.deleteThread(thread.id);
    }
    this.cancelPendingJobs(thread.id, false);
    this.state = {
      ...this.state,
      activeThreadId: null,
      voice: "off",
      voiceMuted: false,
      draft: "",
    };
    this.emit();
    return { ok: true };
  }

  // --- spiritual preference (preview-only) ---------------------------------------

  /**
   * Preview-only toggle; never writes the app's real preference. Turning it
   * OFF cancels any pending simulated generation before the next turn.
   */
  setPreviewSpiritual(on: boolean) {
    const thread = this.activeThread();
    if (!thread) return;
    if (!on) this.cancelPendingJobs(thread.id, true);
    this.updateThread(thread.id, (t) => ({ ...t, spiritualOn: on }));
    this.emit();
  }

  // --- exact teaching sharing ----------------------------------------------------

  /** Open the exact-share preview for a day's Understand teaching. */
  previewShareTeaching(sourceKey: string) {
    const record =
      CONVERSATION_TEACHING_RECORDS.find((r) => r.key === sourceKey) ?? null;
    this.state = { ...this.state, sharePreview: record };
    this.emit();
  }

  /** Cancel means NOT shared: nothing is added to the thread. */
  cancelShareTeaching() {
    this.state = { ...this.state, sharePreview: null };
    this.emit();
  }

  /** Share snapshots the exact same bytes into the thread, immutably. */
  confirmShareTeaching(): { readonly ok: boolean } {
    const thread = this.activeThread();
    const record = this.state.sharePreview;
    if (!thread || !record) return { ok: false };
    const snapshot: SharedTeachingSnapshot = Object.freeze({
      sourceKey: record.key,
      day: record.day,
      title: record.title,
      heading: record.understandHeading,
      body: Object.freeze([...record.understandBody]),
    });
    const message: PreviewMessage = {
      id: this.nextId("m"),
      role: "person",
      text: [record.understandHeading, ...record.understandBody].join("\n\n"),
      status: "sent",
      sharedTeaching: snapshot,
    };
    this.updateThread(thread.id, (t) => ({
      ...t,
      messages: [...t.messages, message],
      dirty: true,
    }));
    this.state = { ...this.state, sharePreview: null };
    this.emit();
    return { ok: true };
  }

  // --- voice state simulator (NO real audio) --------------------------------------

  /** Deliberate Talk action. Never called automatically. */
  startTalking() {
    if (this.state.voice !== "off" && this.state.voice !== "disconnected") return;
    this.state = { ...this.state, voice: "connecting", voiceMuted: false };
    this.emit();
    this.schedule(() => {
      if (this.state.voice === "connecting") {
        this.state = { ...this.state, voice: "listening" };
        this.emit();
      }
    }, 300);
  }

  /** Pause stops the simulated capture/playback/connection. Thread stays. */
  pauseVoice() {
    if (this.state.voice === "listening" || this.state.voice === "speaking") {
      const thread = this.activeThread();
      if (thread) this.cancelPendingJobs(thread.id, true);
      this.state = { ...this.state, voice: "paused" };
      this.emit();
    }
  }

  /** Resume is always an explicit action; never automatic. */
  resumeVoice() {
    if (this.state.voice !== "paused" && this.state.voice !== "disconnected") return;
    this.state = { ...this.state, voice: "connecting" };
    this.emit();
    this.schedule(() => {
      if (this.state.voice === "connecting") {
        this.state = { ...this.state, voice: "listening" };
        this.emit();
      }
    }, 300);
  }

  /** Mute is distinct from pause: the simulated connection stays open. */
  setVoiceMuted(muted: boolean) {
    if (this.state.voice === "off" || this.state.voice === "paused") return;
    this.state = { ...this.state, voiceMuted: muted };
    this.emit();
  }

  /** Review control: simulate a dropped connection. */
  simulateDisconnect() {
    if (this.state.voice === "off") return;
    const thread = this.activeThread();
    if (thread) this.cancelPendingJobs(thread.id, true);
    this.state = { ...this.state, voice: "disconnected", voiceMuted: false };
    this.emit();
  }

  /** Finish talking ends the simulated audio; the conversation continues. */
  finishTalking() {
    if (this.state.voice === "off") return;
    this.state = { ...this.state, voice: "off", voiceMuted: false };
    this.emit();
  }

  // --- review controls ------------------------------------------------------------

  setSimulateSendFailure(on: boolean) {
    this.state = { ...this.state, simulateSendFailure: on };
    this.emit();
  }

  setSimulateSaveFailure(on: boolean) {
    this.state = { ...this.state, simulateSaveFailure: on };
    this.emit();
  }

  // --- clear all -------------------------------------------------------------------

  /** "bfa-app-clear": cancel every pending job and reset to the empty state. */
  handleAppClear() {
    this.pendingJobs.clear();
    this.counter = 0;
    this.importedSpiritualOn = false;
    this.state = { ...EMPTY_STATE, hydrated: true };
    this.emit();
  }
}

// ---------------------------------------------------------------------------
// Browser singleton + React binding

let browserStore: ConversationPreviewStore | null = null;

function getBrowserStore(): ConversationPreviewStore {
  if (!browserStore) browserStore = new ConversationPreviewStore();
  return browserStore;
}

const SERVER_SNAPSHOT = getServerPreviewSnapshot();

/**
 * SSR-safe binding: the server (and first client render) see the stable empty
 * snapshot; the browser store initializes after hydration.
 */
export function useConversationPreview(): {
  state: PreviewState;
  store: ConversationPreviewStore;
} {
  const store = getBrowserStore();
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => SERVER_SNAPSHOT,
  );
  return { state, store };
}

/** Test-only: reset the browser singleton between tests. */
export function resetConversationPreviewStoreForTests() {
  browserStore = null;
}
