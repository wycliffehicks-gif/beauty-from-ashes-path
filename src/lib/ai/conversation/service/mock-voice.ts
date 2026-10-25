// Conversation P3a — MOCK voice lifecycle (O10–O13 application evidence).
//
// No browser media, speech, WebRTC or audio API is used or referenced. This
// is a deterministic state machine with explicit session identities, thread
// ownership, an output generation and a segment ledger, so tests can prove
// event ORDERING and state truthfulness. It cannot prove real capture
// shutdown, playback, or billing termination.
//
// Every answer/fragment/transcript carries an ORIGIN captured when the work
// began (session ID + output generation + thread). Stale origins are
// rejected before anything is recorded or played; Resume creates a new
// session and never reauthorizes old work. Rejected input text is never
// retained.

export type VoiceSessionState = "idle" | "active" | "pausing" | "paused" | "pause-failed";

export type SegmentState = "generated" | "queued" | "played" | "cancelled";

export interface VoiceOrigin {
  readonly sessionId: string | null;
  readonly outputGeneration: number;
  readonly threadId: string | null;
}

export interface VoiceSegment {
  readonly id: string;
  readonly sessionId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly text: string;
  readonly devotional: boolean;
  state: SegmentState;
}

export type FragmentState = "provisional" | "obsolete" | "final";

export interface TranscriptFragment {
  readonly id: string;
  readonly sessionId: string;
  readonly threadId: string;
  readonly text: string;
  state: FragmentState;
}

export interface VoiceLogEntry {
  readonly seq: number;
  readonly type: string;
  readonly sessionId: string | null;
  /** IDs/reasons only — never user or reply text. */
  readonly detail?: string;
}

export const PRIVATE_PRACTICE_FIXTURE =
  "Fixture practice (reviewed test text): with the microphone off, you might say one sentence aloud just for yourself. Nothing is captured or asked for afterwards.";

export class MockVoiceLifecycle {
  sessionId: string | null = null;
  threadId: string | null = null;
  state: VoiceSessionState = "idle";
  capture: "open" | "closed" = "closed";
  transport: "open" | "closed" = "closed";
  muted = false;
  /** Bumped by Stop answer, preference off, pause and end. */
  outputGeneration = 0;
  readonly segments: VoiceSegment[] = [];
  readonly fragments: TranscriptFragment[] = [];
  readonly log: VoiceLogEntry[] = [];
  private seq = 0;
  private counter = 0;
  private shutdownToken = 0;

  constructor(private readonly prefix = "v") {}

  private record(type: string, detail?: string) {
    this.seq += 1;
    this.log.push({ seq: this.seq, type, sessionId: this.sessionId, detail });
  }

  private id(kind: string) {
    this.counter += 1;
    return `${this.prefix}-${kind}-${this.counter}`;
  }

  /** Origin to capture when work (a turn, a listening interval) begins. */
  origin(): VoiceOrigin {
    return { sessionId: this.sessionId, outputGeneration: this.outputGeneration, threadId: this.threadId };
  }

  private originCurrent(o: VoiceOrigin): boolean {
    return (
      this.state === "active" &&
      o.sessionId !== null &&
      o.sessionId === this.sessionId &&
      o.threadId === this.threadId &&
      o.outputGeneration === this.outputGeneration
    );
  }

  /** Deliberate start/resume: ALWAYS a new session identity. */
  start(threadId: string): string {
    if (this.state !== "idle") this.end("restart");
    this.sessionId = this.id("session");
    this.threadId = threadId;
    this.state = "active";
    this.capture = "open";
    this.transport = "open";
    this.muted = false;
    this.outputGeneration += 1;
    this.record("session-start", threadId);
    return this.sessionId;
  }

  /** Mute suppresses input only; session and playback are unaffected. */
  setMuted(muted: boolean) {
    if (this.state !== "active") return;
    this.muted = muted;
    this.record(muted ? "mute" : "unmute");
  }

  private inputAllowed(o: VoiceOrigin): string | null {
    if (this.state !== "active") return `session-${this.state}`;
    if (o.sessionId !== this.sessionId || o.threadId !== this.threadId) return "stale-session";
    if (this.muted || this.capture !== "open") return "capture-suppressed";
    return null;
  }

  /** Provisional fragment. Rejected input is logged WITHOUT its text. */
  addFragment(text: string, o: VoiceOrigin): boolean {
    const why = this.inputAllowed(o);
    if (why) {
      this.record("fragment-rejected", why);
      return false;
    }
    this.fragments.push({ id: this.id("frag"), sessionId: this.sessionId!, threadId: this.threadId!, text, state: "provisional" });
    this.record("fragment-provisional");
    return true;
  }

  /** Final corrected transcript: provisional fragments become obsolete. */
  finalizeTranscript(text: string, o: VoiceOrigin): string | null {
    const why = this.inputAllowed(o);
    if (why) {
      this.record("final-rejected", why);
      return null;
    }
    for (const f of this.fragments) {
      if (f.sessionId === this.sessionId && f.state === "provisional") f.state = "obsolete";
    }
    this.fragments.push({ id: this.id("frag"), sessionId: this.sessionId!, threadId: this.threadId!, text, state: "final" });
    this.record("transcript-final");
    return text;
  }

  /** Queue an ACCEPTED, COMMITTED answer for its exact turn and origin. */
  queueAnswer(turnId: string, texts: readonly string[], devotional: boolean, o: VoiceOrigin): boolean {
    if (!this.originCurrent(o)) {
      this.record("queue-rejected-stale", turnId);
      return false;
    }
    for (const text of texts) {
      const seg: VoiceSegment = {
        id: this.id("seg"),
        sessionId: this.sessionId!,
        threadId: this.threadId!,
        turnId,
        text,
        devotional,
        state: "generated",
      };
      this.segments.push(seg);
      this.record("segment-generated", `${seg.id}:${turnId}`);
      seg.state = "queued";
      this.record("segment-queued", seg.id);
    }
    return true;
  }

  /** Only an explicitly played segment of the CURRENT session counts as heard. */
  playNext(): VoiceSegment | null {
    if (this.state !== "active") return null;
    const seg = this.segments.find((s) => s.state === "queued" && s.sessionId === this.sessionId);
    if (!seg) return null;
    seg.state = "played";
    this.record("segment-played", seg.id);
    return seg;
  }

  hasQueued(): boolean {
    return this.segments.some((s) => s.state === "queued");
  }

  private cancelQueued(why: string) {
    this.outputGeneration += 1;
    for (const s of this.segments) {
      if (s.state === "queued" || s.state === "generated") {
        s.state = "cancelled";
        this.record("segment-cancelled", `${s.id}:${why}`);
      }
    }
  }

  /** Stop answer cancels queued output and invalidates in-flight answers. */
  stopAnswer() {
    this.cancelQueued("stop");
  }

  /** Preference off: stop pending output before any further delivery. */
  preferenceOff() {
    this.cancelQueued("preference-off");
  }

  /** Pause: invalidate output, request mock shutdown (not yet complete). */
  requestPause(): number {
    if (this.state !== "active" && this.state !== "pause-failed") return this.shutdownToken;
    this.cancelQueued("pause");
    this.state = "pausing";
    this.shutdownToken += 1;
    this.record("shutdown-requested");
    return this.shutdownToken;
  }

  confirmShutdown(token: number): boolean {
    if (token !== this.shutdownToken || this.state !== "pausing") {
      this.record("shutdown-confirm-stale");
      return false;
    }
    this.capture = "closed";
    this.transport = "closed";
    this.state = "paused";
    this.record("shutdown-confirmed");
    return true;
  }

  failShutdown(token: number): boolean {
    if (token !== this.shutdownToken || this.state !== "pausing") return false;
    // Capture/transport state is UNKNOWN; reported as still open.
    this.state = "pause-failed";
    this.record("shutdown-failed");
    return true;
  }

  /** Network recovery NEVER auto-resumes. */
  networkRecovered() {
    this.record("network-recovered-ignored", this.state);
  }

  /** Private spoken practice only after CONFIRMED capture+transport closure. */
  privatePracticeAvailable(): boolean {
    return this.state === "paused" && this.capture === "closed" && this.transport === "closed";
  }

  /** Text actually heard for a turn (played segments only). */
  playedTextForTurn(turnId: string): { text: string; unheard: boolean } | null {
    const segs = this.segments.filter((s) => s.turnId === turnId);
    if (segs.length === 0) return null;
    return {
      text: segs.filter((s) => s.state === "played").map((s) => s.text).join(" "),
      unheard: segs.some((s) => s.state !== "played"),
    };
  }

  /** End the session (finish/delete/clear/switch/preference-off). */
  end(reason: string) {
    if (this.state === "idle" && this.sessionId === null) return;
    this.cancelQueued(reason);
    const ended = this.sessionId;
    // Fragments are input of this session: provisional/obsolete ones are
    // never context and are dropped on end.
    for (let i = this.fragments.length - 1; i >= 0; i -= 1) {
      if (this.fragments[i].sessionId === ended && this.fragments[i].state !== "final") this.fragments.splice(i, 1);
    }
    this.capture = "closed";
    this.transport = "closed";
    this.state = "idle";
    this.muted = false;
    this.record("session-ended", reason);
    this.sessionId = null;
    this.threadId = null;
    this.shutdownToken += 1;
  }

  /** Remove every segment/fragment owned by a thread (delete/clear). */
  purgeThread(threadId: string) {
    if (this.threadId === threadId) this.end("purge");
    for (let i = this.segments.length - 1; i >= 0; i -= 1) {
      if (this.segments[i].threadId === threadId) this.segments.splice(i, 1);
    }
    for (let i = this.fragments.length - 1; i >= 0; i -= 1) {
      if (this.fragments[i].threadId === threadId) this.fragments.splice(i, 1);
    }
  }

  /** Remove segments for discarded turns. */
  purgeTurns(turnIds: ReadonlySet<string>) {
    for (let i = this.segments.length - 1; i >= 0; i -= 1) {
      if (turnIds.has(this.segments[i].turnId)) this.segments.splice(i, 1);
    }
  }

  purgeAll() {
    this.end("clear");
    this.segments.length = 0;
    this.fragments.length = 0;
  }
}
