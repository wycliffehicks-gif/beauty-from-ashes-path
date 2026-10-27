// P5 developer preparation. Injected ports only: no microphone, provider,
// credentials, network or application route is opened by this module.
// This coordinates asynchronous resources around the existing MOCK segment
// and transcript model. It does not assemble context or authorize a provider.
import { MockVoiceLifecycle } from "./mock-voice";

export interface VoiceCloseable {
  close(): Promise<void>;
}
export interface VoiceAdmission extends VoiceCloseable {
  /** Server authority must be checked again immediately before connection. */
  revalidate(): Promise<boolean>;
}
export interface VoiceCapture extends VoiceCloseable {
  /** A successful resolution confirms the requested input state. */
  setMuted(muted: boolean): Promise<void>;
}
export interface VoicePlayback extends VoiceCloseable {
  /** Stops current playback AND clears queued output; does not close the session. */
  stop(): Promise<void>;
}
export interface VoiceAttempt {
  readonly threadId: string;
  readonly generation: number;
  readonly signal: AbortSignal;
}
export type VoiceCaptureResult =
  | { kind: "granted"; capture: VoiceCapture }
  | { kind: "denied" | "dismissed" | "unavailable"; capture?: VoiceCapture };
export interface VoiceLifecyclePorts {
  /** No paid connection may be opened by admission. No default implementation. */
  admit(attempt: VoiceAttempt): Promise<VoiceAdmission>;
  /** Returned capture must initially suppress input. No retained private audio. */
  acquireCapture(attempt: VoiceAttempt): Promise<VoiceCaptureResult>;
  /** Return independently closeable resources, even when completion is late. */
  connect(
    attempt: VoiceAttempt,
    admission: VoiceAdmission,
    capture: VoiceCapture,
  ): Promise<{
    connection: VoiceCloseable;
    playback: VoicePlayback;
  }>;
  /** Synchronous cancellation of the shared service's pending thread work. */
  cancelPending(threadId: string, reason: string): void;
}

export type VoiceLifecycleState =
  | "idle"
  | "starting"
  | "active"
  | "stopping"
  | "paused"
  | "ended"
  | "failed";
export type VoiceResourceName = "admission" | "capture" | "connection" | "playback";
export type VoiceResourceState = "absent" | "open" | "closing" | "closed" | "unknown";
export interface VoiceLifecycleSnapshot {
  readonly state: VoiceLifecycleState;
  readonly threadId: string | null;
  readonly generation: number;
  readonly muted: boolean;
  readonly acquisitionPending: boolean;
  /** Model input is suppressed while capture state is still being confirmed. */
  readonly inputChangePending: boolean;
  readonly cancellationUnconfirmed: boolean;
  /** No pending acquisition/input change, failed cancellation or unclosed resource remains. */
  readonly cleanupComplete: boolean;
  readonly resources: Readonly<Record<VoiceResourceName, VoiceResourceState>>;
  readonly privatePracticeAvailable: boolean;
  readonly error: string | null;
}
type Resource = { handle: VoiceCloseable; state: VoiceResourceState };
type Attempt = VoiceAttempt & {
  abort: AbortController;
  pending: boolean;
  stopping: boolean;
  target: "paused" | "ended" | "failed";
  resources: Partial<Record<VoiceResourceName, Resource>>;
  cleanup?: Promise<void>;
  pauseToken?: number;
  mutePending: boolean;
  cancellationUnconfirmed: boolean;
  cancellationReason?: string;
};

/** Explicit start/resume only. Successful close promises are adapter evidence,
 * not proof of device behavior or stopped provider billing. Live adapters and
 * their separate approval/identity/accounting checks remain unimplemented. */
export class VoiceLifecycleController {
  readonly model: MockVoiceLifecycle;
  private state: VoiceLifecycleState = "idle";
  private attempt: Attempt | null = null;
  private generation = 0;
  private error: string | null = null;

  constructor(
    private readonly ports: VoiceLifecyclePorts,
    model?: MockVoiceLifecycle,
  ) {
    this.model = model ?? new MockVoiceLifecycle("p5");
  }

  snapshot(): VoiceLifecycleSnapshot {
    const a = this.attempt;
    const resources = Object.fromEntries(
      (["admission", "capture", "connection", "playback"] as const).map((name) => [
        name,
        a?.resources[name]?.state ?? "absent",
      ]),
    ) as Record<VoiceResourceName, VoiceResourceState>;
    return {
      state: this.state,
      threadId: a?.threadId ?? null,
      generation: this.generation,
      muted: this.model.muted,
      acquisitionPending: a?.pending ?? false,
      inputChangePending: a?.mutePending ?? false,
      cancellationUnconfirmed: a?.cancellationUnconfirmed ?? false,
      cleanupComplete: !a || this.closed(a),
      resources,
      privatePracticeAvailable: this.state === "paused" && !!a && this.closed(a),
      error: this.error,
    };
  }

  private closed(a: Attempt): boolean {
    return (
      !a.pending &&
      !a.mutePending &&
      !a.cancellationUnconfirmed &&
      Object.values(a.resources).every((r) => r.state === "closed")
    );
  }
  private current(a: Attempt): boolean {
    return this.attempt === a && !a.stopping;
  }
  private attach(a: Attempt, name: VoiceResourceName, handle: VoiceCloseable) {
    a.resources[name] = { handle, state: "open" };
  }

  /** Calling this method is the deliberate gesture. Arrival/recovery never calls it. */
  async start(threadId: string): Promise<boolean> {
    if (
      !threadId.trim() ||
      this.state === "active" ||
      this.state === "starting" ||
      this.state === "stopping" ||
      this.state === "paused" ||
      (this.attempt && !this.closed(this.attempt))
    )
      return false;
    return this.begin(threadId);
  }

  async resume(): Promise<boolean> {
    if (this.state !== "paused" || !this.attempt || !this.closed(this.attempt)) return false;
    return this.begin(this.attempt.threadId);
  }

  private async begin(threadId: string): Promise<boolean> {
    const abort = new AbortController();
    const a: Attempt = {
      threadId,
      generation: ++this.generation,
      signal: abort.signal,
      abort,
      pending: true,
      stopping: false,
      target: "failed",
      resources: {},
      mutePending: false,
      cancellationUnconfirmed: false,
    };
    this.attempt = a;
    this.state = "starting";
    this.error = null;
    try {
      const admission = await this.ports.admit(a);
      this.attach(a, "admission", admission);
      if (!this.current(a)) return false;
      if (!(await admission.revalidate())) throw new Error("admission-denied");
      if (!this.current(a)) return false;
      const permission = await this.ports.acquireCapture(a);
      if (permission.capture) this.attach(a, "capture", permission.capture);
      if (!this.current(a)) return false;
      if (permission.kind !== "granted") {
        this.error = `microphone-${permission.kind}`;
        return false;
      }
      if (!(await admission.revalidate())) throw new Error("admission-denied");
      if (!this.current(a)) return false;
      const connected = await this.ports.connect(a, admission, permission.capture);
      this.attach(a, "connection", connected.connection);
      this.attach(a, "playback", connected.playback);
      if (!this.current(a)) return false;
      if (!(await admission.revalidate())) throw new Error("admission-denied");
      if (!this.current(a)) return false;
      try {
        await permission.capture.setMuted(false);
      } finally {
        // Even a rejected late operation could have partially enabled input.
        if (!this.current(a) && a.resources.capture?.state === "closed")
          a.resources.capture.state = "open";
      }
      if (!this.current(a)) return false;
      // Input activation is asynchronous too: its completion must not revive
      // an admission or thread incarnation invalidated while it was pending.
      if (!(await admission.revalidate())) throw new Error("admission-denied");
      if (!this.current(a)) return false;
      this.model.start(threadId);
      this.state = "active";
      return true;
    } catch {
      if (!a.stopping) this.error = "voice-start-failed";
      return false;
    } finally {
      a.pending = false;
      if (this.state !== "active" || !this.current(a)) {
        a.stopping = true;
        a.abort.abort();
        await this.cleanup(a);
      }
    }
  }

  private cancel(a: Attempt, reason: string): boolean {
    this.model.stopAnswer();
    try {
      this.ports.cancelPending(a.threadId, reason);
      a.cancellationUnconfirmed = false;
      a.cancellationReason = undefined;
      if (this.error === "work-cancellation-failed") this.error = null;
      return true;
    } catch {
      a.cancellationUnconfirmed = true;
      a.cancellationReason = reason;
      this.error = "work-cancellation-failed";
      return false;
    }
  }

  private async stop(target: "paused" | "ended", reason: string): Promise<VoiceLifecycleSnapshot> {
    const a = this.attempt;
    if (!a) return this.snapshot();
    a.target = target;
    a.stopping = true;
    a.abort.abort();
    this.state = "stopping";
    // A failed Stop answer also shuts resources down, but must not silently
    // retry cancellation. Keep the failed fence until explicit Retry shutdown.
    if (!a.cancellationUnconfirmed) this.cancel(a, reason);
    if (this.model.state === "active" || this.model.state === "pause-failed")
      a.pauseToken = this.model.requestPause();
    await this.cleanup(a);
    return this.snapshot();
  }

  pause() {
    return this.stop("paused", "pause");
  }
  finishTalking() {
    return this.stop("ended", "finish-talking");
  }
  typeInstead() {
    return this.stop("ended", "type-instead");
  }

  /** A different thread cannot acquire resources until the previous one closes. */
  async switchThread(threadId: string): Promise<boolean> {
    if (this.attempt?.threadId === threadId) return true;
    await this.stop("ended", "thread-switch");
    // Switching never opens capture; start remains an explicit separate action.
    return !this.attempt || this.closed(this.attempt);
  }

  /** Retry only failed cancellation/close operations; never acquire resources. */
  async retryShutdown(): Promise<VoiceLifecycleSnapshot> {
    const a = this.attempt;
    if (!a?.stopping) return this.snapshot();
    for (const r of Object.values(a.resources)) if (r.state === "unknown") r.state = "open";
    this.state = "stopping";
    if (a.cancellationUnconfirmed) this.cancel(a, a.cancellationReason ?? "shutdown-retry");
    if (this.model.state === "pause-failed") a.pauseToken = this.model.requestPause();
    await this.cleanup(a);
    return this.snapshot();
  }

  private async cleanup(a: Attempt): Promise<void> {
    if (a.cleanup) {
      await a.cleanup;
      return this.cleanupIfNeeded(a);
    }
    a.cleanup = (async () => {
      // New handles may arrive while a close is pending. Close those too.
      while (Object.values(a.resources).some((r) => r.state === "open")) {
        const open = Object.values(a.resources).filter((r) => r.state === "open");
        await Promise.all(
          open.map(async (r) => {
            r.state = "closing";
            try {
              await r.handle.close();
              r.state = "closed";
            } catch {
              r.state = "unknown";
            }
          }),
        );
      }
    })();
    await a.cleanup;
    a.cleanup = undefined;
    this.finishCleanup(a);
  }

  private async cleanupIfNeeded(a: Attempt) {
    if (Object.values(a.resources).some((r) => r.state === "open")) await this.cleanup(a);
    else this.finishCleanup(a);
  }

  private finishCleanup(a: Attempt) {
    if (this.attempt !== a) return;
    if (
      a.cancellationUnconfirmed ||
      Object.values(a.resources).some((r) => r.state === "unknown")
    ) {
      this.state = "failed";
      this.error = a.cancellationUnconfirmed ? "work-cancellation-failed" : "shutdown-unconfirmed";
      if (a.pauseToken !== undefined) this.model.failShutdown(a.pauseToken);
    } else if (!this.closed(a)) this.state = "stopping";
    else {
      this.state = a.target;
      if (this.error === "shutdown-unconfirmed" || this.error === "work-cancellation-failed")
        this.error = null;
      if (a.target === "paused" && a.pauseToken !== undefined)
        this.model.confirmShutdown(a.pauseToken);
      else this.model.end(a.target);
    }
  }

  async setMuted(muted: boolean): Promise<boolean> {
    const a = this.attempt;
    if (!a || this.state !== "active" || a.mutePending || !this.current(a)) return false;
    const capture = a.resources.capture?.handle as VoiceCapture | undefined;
    const admission = a.resources.admission?.handle as VoiceAdmission | undefined;
    if (!capture || !admission) return false;
    a.mutePending = true;
    // Suppress model input while the actual input state is changing.
    this.model.setMuted(true);
    try {
      if (!muted && !(await admission.revalidate())) throw new Error("admission-denied");
      if (!this.current(a)) return false;
      await capture.setMuted(muted);
      if (!this.current(a)) return false;
      // A record or admission can be invalidated during asynchronous unmute.
      // Recheck before accepting input, just as for initial activation.
      if (!muted && !(await admission.revalidate())) throw new Error("admission-denied");
      if (!this.current(a)) return false;
      this.model.setMuted(muted);
      return true;
    } catch {
      if (this.current(a)) {
        this.error = "mute-state-unconfirmed";
        await this.stop("ended", "mute-failed");
      }
      return false;
    } finally {
      a.mutePending = false;
      if (a.stopping) {
        if (a.resources.capture?.state === "closed") a.resources.capture.state = "open";
        await this.cleanup(a);
      }
    }
  }

  async stopAnswer(
    reason: "stop-answer" | "interruption" | "preference-off" = "stop-answer",
  ): Promise<boolean> {
    const a = this.attempt;
    if (!a || this.state !== "active" || !this.current(a)) return false;
    if (!this.cancel(a, reason)) {
      await this.stop("ended", "work-cancellation-failed");
      return false;
    }
    const playback = a.resources.playback?.handle as VoicePlayback | undefined;
    try {
      await playback?.stop();
      return this.current(a);
    } catch {
      if (this.current(a)) {
        this.error = "playback-stop-unconfirmed";
        await this.stop("ended", "playback-stop-failed");
      }
      return false;
    }
  }

  /** Network events can close resources, never acquire or resume them. */
  connectionLost(origin: VoiceAttempt): Promise<VoiceLifecycleSnapshot> {
    const a = this.attempt;
    // A previous connection's delayed event must not close a resumed session.
    if (
      !a ||
      !this.current(a) ||
      a.signal !== origin.signal ||
      a.generation !== origin.generation ||
      a.threadId !== origin.threadId
    ) {
      return Promise.resolve(this.snapshot());
    }
    return this.stop("paused", "connection-lost");
  }
  networkRecovered(): void {
    this.model.networkRecovered();
  }
}
