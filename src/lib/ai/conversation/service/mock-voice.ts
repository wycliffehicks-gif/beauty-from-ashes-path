// Conversation P3a — MOCK voice lifecycle (O10–O13 application evidence).
//
// No browser media, speech, WebRTC or audio API is used or referenced. This
// is a deterministic state machine with explicit session identities and a
// segment ledger, so tests can prove event ORDERING and state truthfulness.
// It cannot prove real capture shutdown, playback, or billing termination.

export type VoiceSessionState =
  | "idle"
  | "active"
  | "pausing"
  | "paused"
  | "pause-failed";

export type SegmentState = "generated" | "queued" | "played" | "cancelled";

export interface VoiceSegment {
  readonly id: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly text: string;
  readonly devotional: boolean;
  state: SegmentState;
}

export type FragmentState = "provisional" | "obsolete" | "final" | "rejected";

export interface TranscriptFragment {
  readonly id: string;
  readonly sessionId: string | null;
  readonly text: string;
  state: FragmentState;
  readonly reason?: string;
}

export interface VoiceLogEntry {
  readonly seq: number;
  readonly type: string;
  readonly sessionId: string | null;
  readonly detail?: string;
}

export const PRIVATE_PRACTICE_FIXTURE =
  "Fixture practice (reviewed test text): with the microphone off, you might say one sentence aloud just for yourself. Nothing is captured or asked for afterwards.";

export class MockVoiceLifecycle {
  sessionId: string | null = null;
  state: VoiceSessionState = "idle";
  capture: "open" | "closed" = "closed";
  transport: "open" | "closed" = "closed";
  muted = false;
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

  /** Deliberate start/resume: ALWAYS a new session identity. */
  start(): string {
    this.sessionId = this.id("session");
    this.state = "active";
    this.capture = "open";
    this.transport = "open";
    this.muted = false;
    this.record("session-start");
    return this.sessionId;
  }

  /** Mute suppresses input only; session and playback are unaffected. */
  setMuted(muted: boolean) {
    if (this.state !== "active") return;
    this.muted = muted;
    this.record(muted ? "mute" : "unmute");
  }

  addFragment(text: string): TranscriptFragment {
    let state: FragmentState = "provisional";
    let reason: string | undefined;
    if (this.state !== "active") {
      state = "rejected";
      reason = `session-${this.state}`;
    } else if (this.muted) {
      state = "rejected";
      reason = "muted";
    }
    const f: TranscriptFragment = { id: this.id("frag"), sessionId: this.sessionId, text, state, reason };
    this.fragments.push(f);
    this.record(state === "rejected" ? "fragment-rejected" : "fragment-provisional", reason);
    return f;
  }

  /** Final corrected transcript: provisional fragments become obsolete. */
  finalizeTranscript(text: string): string | null {
    if (this.state !== "active") {
      this.record("final-rejected", `session-${this.state}`);
      return null;
    }
    for (const f of this.fragments) {
      if (f.sessionId === this.sessionId && f.state === "provisional") f.state = "obsolete";
    }
    this.fragments.push({ id: this.id("frag"), sessionId: this.sessionId, text, state: "final" });
    this.record("transcript-final");
    return text;
  }

  /** A generated answer is split into queued segments for the session. */
  queueAnswer(turnId: string, texts: readonly string[], devotional: boolean) {
    if (this.state !== "active" || !this.sessionId) {
      this.record("queue-rejected", `session-${this.state}`);
      return;
    }
    for (const text of texts) {
      const seg: VoiceSegment = {
        id: this.id("seg"),
        sessionId: this.sessionId,
        turnId,
        text,
        devotional,
        state: "generated",
      };
      this.segments.push(seg);
      this.record("segment-generated", seg.id);
      seg.state = "queued";
      this.record("segment-queued", seg.id);
    }
  }

  /** Only an explicitly played segment counts as heard. */
  playNext(): VoiceSegment | null {
    if (this.state !== "active") return null;
    const seg = this.segments.find(
      (s) => s.state === "queued" && s.sessionId === this.sessionId,
    );
    if (!seg) return null;
    seg.state = "played";
    this.record("segment-played", seg.id);
    return seg;
  }

  hasQueued(): boolean {
    return this.segments.some((s) => s.state === "queued");
  }

  private cancelQueued(filter: (s: VoiceSegment) => boolean, why: string) {
    for (const s of this.segments) {
      if (s.state === "queued" && filter(s)) {
        s.state = "cancelled";
        this.record("segment-cancelled", `${s.id}:${why}`);
      }
    }
  }

  /** Stop answer cancels queued output; the session stays. */
  stopAnswer() {
    this.cancelQueued(() => true, "stop");
  }

  /** Preference off: stop pending output before any further delivery. */
  preferenceOff() {
    this.cancelQueued(() => true, "preference-off");
  }

  /**
   * Pause: invalidate queued output, request mock shutdown. Not complete
   * until confirmShutdown(token) is called with the current token.
   */
  requestPause(): number {
    if (this.state !== "active" && this.state !== "pause-failed") return this.shutdownToken;
    this.cancelQueued(() => true, "pause");
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
    // Capture/transport state is UNKNOWN; we report it as still open.
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

  /** Full reset (delete/clear/finish): every queued segment cancelled. */
  end(reason: string) {
    this.cancelQueued(() => true, reason);
    this.capture = "closed";
    this.transport = "closed";
    this.state = "idle";
    this.record("session-ended", reason);
    this.sessionId = null;
    this.shutdownToken += 1;
  }

  /** Remove every segment for turns of a deleted thread. */
  purgeTurns(turnIds: ReadonlySet<string>) {
    for (let i = this.segments.length - 1; i >= 0; i -= 1) {
      if (turnIds.has(this.segments[i].turnId)) this.segments.splice(i, 1);
    }
  }
}
