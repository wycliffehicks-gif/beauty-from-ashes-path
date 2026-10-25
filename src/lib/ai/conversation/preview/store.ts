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
  /** Set by the last SUCCESSFUL simulated save; shown as the saved date. */
  savedAt: string | null;
  messages: PreviewMessage[];
  /** Immutable copy made by the last SUCCESSFUL simulated save. */
  savedSnapshot: ThreadSnapshot | null;
  /** True when current messages differ from the saved snapshot. */
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

export type StoreFailureReason =
  | "no-thread"
  | "empty-message"
  | "response-pending"
  | "send-failed"
  | "save-failed"
  | "unsent-draft"
  | "needs-decision"
  | "unknown-thread";

export type StoreResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: StoreFailureReason };

const OK: StoreResult = { ok: true };

export interface PreviewState {
  readonly hydrated: boolean;
  readonly introAcknowledged: boolean;
  readonly threads: readonly PreviewThread[];
  readonly activeThreadId: string | null;
  /** Composer text, retained across same-session navigation. */
  readonly draft: string;
  /** The thread the current draft belongs to (drafts are thread-scoped). */
  readonly draftThreadId: string | null;
  readonly voice: VoiceSimState;
  readonly voiceMuted: boolean;
  /** Teaching record currently shown in the exact-share preview, if any. */
  readonly sharePreview: ConversationTeachingRecord | null;
  /** A switch request waiting on a Save/Discard/Cancel decision. */
  readonly pendingSwitch: { readonly kind: "new" } | { readonly kind: "open"; readonly threadId: string } | null;
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
  draftThreadId: null,
  voice: "off",
  voiceMuted: false,
  sharePreview: null,
  pendingSwitch: null,
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
  /** Store epoch at scheduling time; clear-all bumps the epoch so old
   *  callbacks can never resurrect into a post-clear store. */
  readonly epoch: number;
  readonly assistantMessageId: string;
}

export class ConversationPreviewStore {
  private state: PreviewState = EMPTY_STATE;
  private readonly listeners = new Set<Listener>();
  private readonly pendingJobs = new Map<string, PendingJob>();
  /** Globally monotonic across clear-all: IDs are never reused. */
  private counter = 0;
  /** Bumped by clear-all; captured by every scheduled callback. */
  private epoch = 0;
  /** Bumped whenever a simulated voice session ends; invalidates timers. */
  private voiceSession = 0;
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

  /** True while a simulated reply is still being generated for this thread. */
  hasPendingResponse(thread: PreviewThread): boolean {
    return thread.messages.some((m) => m.status === "generating");
  }

  /** The active thread's unsent draft text (drafts are thread-scoped). */
  activeDraft(): string {
    const active = this.activeThread();
    if (!active || this.state.draftThreadId !== active.id) return "";
    return this.state.draft;
  }

  saveStatus(thread: PreviewThread): SaveStatus {
    if (!thread.savedSnapshot) return "not-saved";
    if (thread.dirty) return "unsaved-changes";
    // Unsent composer text is an unsaved change too: "Saved" never claims
    // that unsubmitted text is stored.
    if (this.state.draftThreadId === thread.id && this.state.draft.trim().length > 0) {
      return "unsaved-changes";
    }
    return "saved";
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

  /** Invalidate any pending simulated voice connection timer. */
  private invalidateVoiceTimers() {
    this.voiceSession += 1;
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
      savedAt: null,
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
      draft: "",
      draftThreadId: thread.id,
    };
    this.emit();
    return thread;
  }

  /**
   * Open another thread or start a new one. When the active thread has
   * unsaved changes OR unsent draft text, the caller must resolve
   * Save / Discard / Cancel first: this records the pending switch and
   * returns "needs-decision" without changing anything.
   */
  requestSwitch(next: { kind: "new" } | { kind: "open"; threadId: string }): StoreResult {
    const active = this.activeThread();
    if (active && this.saveStatus(active) !== "saved") {
      this.state = { ...this.state, pendingSwitch: next };
      this.emit();
      return { ok: false, reason: "needs-decision" };
    }
    return this.performSwitch(next);
  }

  private performSwitch(next: { kind: "new" } | { kind: "open"; threadId: string }): StoreResult {
    if (next.kind === "new") {
      this.createThread();
      this.state = { ...this.state, pendingSwitch: null };
      this.emit();
      return OK;
    }
    const target = this.state.threads.find((t) => t.id === next.threadId);
    if (!target) return { ok: false, reason: "unknown-thread" };
    // Reopening never starts a microphone: voice resets to off, timers die.
    this.cancelPendingJobs(target.id, false);
    this.invalidateVoiceTimers();
    this.state = {
      ...this.state,
      activeThreadId: target.id,
      voice: "off",
      voiceMuted: false,
      draft: "",
      draftThreadId: target.id,
      pendingSwitch: null,
    };
    this.emit();
    return OK;
  }

  /**
   * Resolve a pending switch decision. Save performs the simulated save and
   * only switches when it succeeds; Discard restores the saved snapshot and
   * drops the draft; Cancel preserves the active thread and draft exactly.
   */
  resolveSwitchDecision(decision: "save" | "discard" | "cancel"): StoreResult {
    const pending = this.state.pendingSwitch;
    const active = this.activeThread();
    if (!pending || !active) return { ok: false, reason: "no-thread" };
    if (decision === "cancel") {
      this.state = { ...this.state, pendingSwitch: null };
      this.emit();
      return OK;
    }
    if (decision === "save") {
      const saved = this.saveActiveThread();
      if (!saved.ok) return saved; // failed save: stay, dialog stays
    } else {
      this.cancelPendingJobs(active.id, false);
      this.discardActiveChanges();
      this.state = { ...this.state, draft: "" };
    }
    return this.performSwitch(pending);
  }

  setDraft(text: string) {
    const active = this.activeThread();
    this.state = {
      ...this.state,
      draft: text,
      draftThreadId: active ? active.id : this.state.draftThreadId,
    };
    this.emit();
  }

  // --- sending ----------------------------------------------------------------

  /**
   * Send the current draft in the active thread. Refused while a simulated
   * reply is still generating (no queued or silent second send). On simulated
   * failure the input is RETAINED in the composer and the message is marked
   * Not sent; no reply is invented. Deliberate retry only via retryMessage.
   */
  sendDraft(): StoreResult {
    const thread = this.activeThread();
    const text = this.activeDraft().trim();
    if (!thread) return { ok: false, reason: "no-thread" };
    if (text.length === 0) return { ok: false, reason: "empty-message" };
    if (this.hasPendingResponse(thread)) {
      return { ok: false, reason: "response-pending" };
    }

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
      return { ok: false, reason: "send-failed" };
    }

    this.appendExchange(thread, text);
    this.state = { ...this.state, draft: "" };
    this.emit();
    return OK;
  }

  /** Append a person message + generating placeholder and schedule the reply. */
  private appendExchange(thread: PreviewThread, text: string) {
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
    if (this.state.voice === "listening") {
      this.state = { ...this.state, voice: "speaking" };
    }

    const jobId = this.nextId("job");
    const epoch = this.epoch;
    this.pendingJobs.set(jobId, {
      jobId,
      threadId: thread.id,
      generation,
      epoch,
      assistantMessageId: assistantMessage.id,
    });
    const spiritualOn = thread.spiritualOn;
    this.schedule(() => {
      // Explicit identity validation: a callback from before a clear-all (or
      // any cancelled/superseded job) can never write into the store.
      if (epoch !== this.epoch) return;
      this.completeJob(jobId, fictionalReply({ message: text, spiritualOn }));
    }, 400);
  }

  private completeJob(jobId: string, reply: string) {
    const job = this.pendingJobs.get(jobId);
    if (!job) return; // cancelled, stopped, deleted or cleared — drop silently
    if (job.epoch !== this.epoch) return; // pre-clear callback — drop
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

  /**
   * Deliberate retry of a Not sent message. The failed message's OWN text is
   * resent directly; any newer composer draft is preserved untouched.
   */
  retryMessage(messageId: string): StoreResult {
    const thread = this.activeThread();
    if (!thread) return { ok: false, reason: "no-thread" };
    if (this.hasPendingResponse(thread)) {
      return { ok: false, reason: "response-pending" };
    }
    const message = thread.messages.find((m) => m.id === messageId);
    if (!message || message.status !== "not-sent") return { ok: false, reason: "empty-message" };
    // Remove the failed marker and resend its own text through the normal
    // path — without touching the composer's current (possibly newer) draft.
    this.updateThread(thread.id, (t) => ({
      ...t,
      messages: t.messages.filter((m) => m.id !== messageId),
    }));
    if (this.state.simulateSendFailure) {
      const failed: PreviewMessage = {
        id: this.nextId("m"),
        role: "person",
        text: message.text,
        status: "not-sent",
      };
      this.updateThread(thread.id, (t) => ({
        ...t,
        messages: [...t.messages, failed],
        dirty: true,
      }));
      this.emit();
      return { ok: false, reason: "send-failed" };
    }
    this.appendExchange(thread, message.text);
    this.emit();
    return OK;
  }

  // --- saving (explicitly simulated) -------------------------------------------

  /**
   * Simulated save. Success stores an immutable snapshot separate from the
   * active messages; failure (review control) changes nothing and reports
   * failure — no navigation, no Saved label. Refused while a simulated reply
   * is still generating: a live placeholder is never saved as a final reply.
   * Unsent draft text is NOT part of a save (submitted messages only).
   */
  saveActiveThread(title?: string): StoreResult {
    const thread = this.activeThread();
    if (!thread) return { ok: false, reason: "no-thread" };
    if (this.hasPendingResponse(thread)) {
      return { ok: false, reason: "response-pending" };
    }
    if (this.state.simulateSaveFailure) return { ok: false, reason: "save-failed" };
    const snapshot: ThreadSnapshot = Object.freeze({
      title: title ?? thread.title,
      messages: Object.freeze(
        thread.messages.map((m) => Object.freeze({ ...m })),
      ),
    });
    this.updateThread(thread.id, (t) => ({
      ...t,
      title: title ?? t.title,
      savedAt: this.nowIso(),
      savedSnapshot: snapshot,
      dirty: false,
    }));
    this.emit();
    return OK;
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

  /**
   * Rename from the saved list. For a saved thread this is an explicit
   * simulated save of the NAME ONLY: the saved snapshot's title updates on
   * success while unsaved message edits stay unsaved (dirty is preserved).
   * Simulated failure leaves everything unchanged and reports failure.
   */
  renameThread(threadId: string, title: string): StoreResult {
    const clean = title.trim();
    if (clean.length === 0) return { ok: false, reason: "empty-message" };
    const thread = this.state.threads.find((t) => t.id === threadId);
    if (!thread) return { ok: false, reason: "unknown-thread" };
    if (thread.savedSnapshot && this.state.simulateSaveFailure) {
      return { ok: false, reason: "save-failed" };
    }
    const next = clean.slice(0, 120);
    this.updateThread(threadId, (t) => ({
      ...t,
      title: next,
      savedSnapshot: t.savedSnapshot
        ? Object.freeze({ title: next, messages: t.savedSnapshot.messages })
        : t.savedSnapshot,
      // Message edits remain unsaved; renaming is not a message save.
      dirty: t.dirty,
    }));
    this.emit();
    return OK;
  }

  /** Delete a saved thread: cancel its jobs, close its active copy. */
  deleteThread(threadId: string) {
    this.cancelPendingJobs(threadId, false);
    this.invalidateVoiceTimers();
    const wasActive = this.state.activeThreadId === threadId;
    this.state = {
      ...this.state,
      threads: this.state.threads.filter((t) => t.id !== threadId),
      activeThreadId: wasActive ? null : this.state.activeThreadId,
      voice: wasActive ? "off" : this.state.voice,
      voiceMuted: wasActive ? false : this.state.voiceMuted,
      draft: wasActive ? "" : this.state.draft,
      draftThreadId: wasActive ? null : this.state.draftThreadId,
    };
    this.emit();
  }

  /**
   * Finish the active conversation.
   *  - "save": simulated save, then close. A failed save stays open.
   *  - "discard": new thread → removed entirely; saved thread → unsaved turns
   *    dropped, saved snapshot preserved.
   *  - "keep": nothing changes.
   * Unsent draft text is never silently discarded: with a non-empty draft the
   * caller must pass { discardDraft: true } (the UI states the consequence).
   * Finishing always ends the simulated voice state.
   */
  finishActiveThread(
    decision: "save" | "discard" | "keep",
    options?: { readonly discardDraft?: boolean },
  ): StoreResult {
    const thread = this.activeThread();
    if (!thread) return { ok: false, reason: "no-thread" };
    if (decision === "keep") return OK;
    if (this.activeDraft().trim().length > 0 && !options?.discardDraft) {
      return { ok: false, reason: "unsent-draft" };
    }
    if (decision === "save") {
      const saved = this.saveActiveThread();
      if (!saved.ok) return saved; // failed/pending save: stay open
    } else if (thread.savedSnapshot) {
      this.cancelPendingJobs(thread.id, false);
      this.discardActiveChanges();
    } else {
      this.deleteThread(thread.id);
    }
    this.cancelPendingJobs(thread.id, false);
    this.invalidateVoiceTimers();
    this.state = {
      ...this.state,
      activeThreadId: null,
      voice: "off",
      voiceMuted: false,
      draft: "",
      draftThreadId: null,
    };
    this.emit();
    return OK;
  }

  // --- spiritual preference (preview-only) ---------------------------------------

  /**
   * Preview-only toggle; never writes the app's real preference. Turning it
   * OFF cancels any pending simulated generation AND ends any simulated
   * voice session (its timers are invalidated) before the next turn.
   */
  setPreviewSpiritual(on: boolean) {
    const thread = this.activeThread();
    if (!thread) return;
    if (!on) {
      this.cancelPendingJobs(thread.id, true);
      if (this.state.voice !== "off") {
        this.invalidateVoiceTimers();
        this.state = { ...this.state, voice: "off", voiceMuted: false };
      }
    }
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
  confirmShareTeaching(): StoreResult {
    const thread = this.activeThread();
    const record = this.state.sharePreview;
    if (!thread || !record) return { ok: false, reason: "no-thread" };
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
    return OK;
  }

  // --- voice state simulator (NO real audio) --------------------------------------

  /** Deliberate Talk action. Never called automatically. */
  startTalking() {
    if (this.state.voice !== "off" && this.state.voice !== "disconnected") return;
    this.beginVoiceSession();
  }

  private beginVoiceSession() {
    this.invalidateVoiceTimers();
    const session = this.voiceSession;
    const epoch = this.epoch;
    this.state = { ...this.state, voice: "connecting", voiceMuted: false };
    this.emit();
    this.schedule(() => {
      // A stale timer (paused, finished, cleared, deleted, switched or
      // preference-off) must never advance a newer session.
      if (session !== this.voiceSession || epoch !== this.epoch) return;
      if (this.state.voice === "connecting") {
        this.state = { ...this.state, voice: "listening" };
        this.emit();
      }
    }, 300);
  }

  /**
   * Pause stops the simulated capture/playback/connection — including a
   * pending connection, whose timer is invalidated so it cannot advance.
   * The thread stays.
   */
  pauseVoice() {
    if (this.state.voice === "off" || this.state.voice === "paused") return;
    this.invalidateVoiceTimers();
    if (this.state.voice === "listening" || this.state.voice === "speaking") {
      const thread = this.activeThread();
      if (thread) this.cancelPendingJobs(thread.id, true);
    }
    this.state = { ...this.state, voice: "paused" };
    this.emit();
  }

  /** Resume is always an explicit action; never automatic. */
  resumeVoice() {
    if (this.state.voice !== "paused" && this.state.voice !== "disconnected") return;
    this.beginVoiceSession();
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
    this.invalidateVoiceTimers();
    const thread = this.activeThread();
    if (thread) this.cancelPendingJobs(thread.id, true);
    this.state = { ...this.state, voice: "disconnected", voiceMuted: false };
    this.emit();
  }

  /** Finish talking ends the simulated audio; the conversation continues. */
  finishTalking() {
    if (this.state.voice === "off") return;
    this.invalidateVoiceTimers();
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

  /**
   * "bfa-app-clear": cancel every pending job and reset to the empty state.
   * The epoch bumps so any already-scheduled callback from before the clear
   * is dropped by identity validation; IDs stay globally monotonic and are
   * never reused across a clear.
   */
  handleAppClear() {
    this.pendingJobs.clear();
    this.epoch += 1;
    this.invalidateVoiceTimers();
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
