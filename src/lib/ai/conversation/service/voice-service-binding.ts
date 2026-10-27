// P5 offline integration preparation. No route imports this module. Resources
// and admission are injected; construction opens nothing. This coordinates
// existing service lifecycle methods, never context, grants or provider calls.
import { ConversationService } from "./service";
import {
  VoiceLifecycleController,
  type VoiceAttempt,
  type VoiceLifecyclePorts,
  type VoiceLifecycleSnapshot,
} from "./voice-lifecycle";

export type VoiceServicePorts = Omit<VoiceLifecyclePorts, "cancelPending">;
type ThreadBinding = {
  readonly storeId: string;
  readonly identity: NonNullable<ReturnType<ConversationService["getThreadLifecycleBinding"]>>;
};

const coordinatedServices = new WeakSet<ConversationService>();

/** One coordinator per service, sharing its exact segment/transcript model.
 *
 * Call the lifecycle methods here when integrating asynchronous voice. Direct
 * calls to the service's legacy mock voice/lifecycle methods do not close real
 * resources. The incarnation fence also rejects late startup after an external
 * delete/clear; reconcile() explicitly closes a now-invalid active binding.
 * This is not an authenticated server adapter or a live voice implementation.
 */
export class ConversationVoiceBinding {
  private readonly controller: VoiceLifecycleController;
  private binding: ThreadBinding | null = null;
  private attemptBinding: ThreadBinding | null = null;
  private pendingCancellation: { binding: ThreadBinding; reason: string } | null = null;
  private intent = 0;
  private disposed = false;

  constructor(
    private readonly service: ConversationService,
    ports: VoiceServicePorts,
  ) {
    if (coordinatedServices.has(service)) throw new Error("voice-service-already-bound");
    coordinatedServices.add(service);
    this.controller = new VoiceLifecycleController(
      {
        ...ports,
        admit: async (attempt) => {
          const binding = this.attemptBinding;
          if (
            !binding ||
            !this.current(binding) ||
            this.pendingCancellation ||
            binding.identity.threadId !== attempt.threadId
          )
            throw new Error("voice-thread-unavailable");
          const admission = await ports.admit(attempt);
          // Always return the acquired handle, even after invalidation, so the
          // controller owns its cleanup. Never throw away a late lease.
          return {
            close: () => admission.close(),
            revalidate: async () =>
              this.current(binding) &&
              !this.pendingCancellation &&
              (await admission.revalidate()) &&
              this.current(binding) &&
              !this.pendingCancellation,
          };
        },
        cancelPending: (threadId, reason) => {
          const binding = this.attemptBinding;
          if (!binding || binding.identity.threadId !== threadId)
            throw new Error("voice-thread-mismatch");
          // Never prefix-strip an internal ID or cancel a recreated record.
          // delete/clear already fenced the original record synchronously.
          if (this.pendingCancellation?.binding === binding)
            throw new Error("selected-work-cancellation-unconfirmed");
          // After a successful switch the old attempt is fully cleaned and
          // already fenced. Do not cancel new work on that unselected record.
          if (this.binding === binding && binding.identity.isCurrent())
            service.cancelThread(binding.storeId, reason);
        },
      },
      service.voice,
    );
  }

  private current(binding: ThreadBinding): boolean {
    return !this.disposed && this.binding === binding && binding.identity.isCurrent();
  }

  private resourcesClosed(): boolean {
    return this.controller.snapshot().cleanupComplete && !this.pendingCancellation;
  }

  /** Synchronous fence for typed work when there is no active voice attempt.
   * An unexpected failure is retained, never silently retried by another action. */
  private cancelSelected(reason: string): boolean {
    if (this.pendingCancellation || this.controller.snapshot().cancellationUnconfirmed)
      return false;
    const binding = this.binding;
    if (!binding || !this.current(binding)) return false;
    this.service.voice.stopAnswer();
    try {
      this.service.cancelThread(binding.storeId, reason);
      return true;
    } catch {
      this.pendingCancellation = { binding, reason };
      this.service.voice.end("work-cancellation-failed");
      return false;
    }
  }

  private async closeSelected(
    target: "paused" | "ended",
    reason: string,
  ): Promise<VoiceLifecycleSnapshot> {
    // The selected thread may differ from the retained, fully closed attempt.
    // Fence its typed work too, but never pause/resume the old voice session.
    if (this.binding !== this.attemptBinding) {
      this.cancelSelected(reason);
      await this.controller.finishTalking();
    } else if (target === "paused") {
      await this.controller.pause();
    } else if (reason === "type-instead") {
      await this.controller.typeInstead();
    } else {
      await this.controller.finishTalking();
    }
    return this.snapshot();
  }

  snapshot(): VoiceLifecycleSnapshot & {
    readonly storeId: string | null;
    /** Selected record; inherited threadId describes the retained resource attempt. */
    readonly selectedThreadId: string | null;
    readonly threadCurrent: boolean;
  } {
    const snapshot = this.controller.snapshot();
    return {
      ...snapshot,
      storeId: this.binding?.storeId ?? null,
      selectedThreadId: this.binding?.identity.threadId ?? null,
      threadCurrent: !!this.binding && this.current(this.binding),
      cleanupComplete: snapshot.cleanupComplete && !this.pendingCancellation,
      cancellationUnconfirmed: snapshot.cancellationUnconfirmed || !!this.pendingCancellation,
      privatePracticeAvailable:
        snapshot.privatePracticeAvailable &&
        !this.pendingCancellation &&
        this.binding === this.attemptBinding &&
        !!this.binding &&
        this.current(this.binding),
      state: this.pendingCancellation ? "failed" : snapshot.state,
      error: this.pendingCancellation ? "work-cancellation-failed" : snapshot.error,
    };
  }

  /** Deliberate start, only for an existing thread and after earlier cleanup. */
  async start(storeId: string): Promise<boolean> {
    if (
      this.disposed ||
      !this.resourcesClosed() ||
      !["idle", "ended", "failed"].includes(this.controller.snapshot().state)
    )
      return false;
    const identity = this.service.getThreadLifecycleBinding(storeId);
    if (!identity) return false;
    this.intent += 1;
    this.binding = { storeId, identity };
    this.attemptBinding = this.binding;
    return this.controller.start(identity.threadId);
  }

  async resume(): Promise<boolean> {
    if (
      !this.binding ||
      this.binding !== this.attemptBinding ||
      !this.current(this.binding) ||
      this.pendingCancellation
    ) {
      await this.reconcile();
      return false;
    }
    this.intent += 1;
    return this.controller.resume();
  }

  pause() {
    if (this.disposed) return Promise.resolve(this.snapshot());
    this.intent += 1;
    return this.closeSelected("paused", "pause");
  }

  finishTalking() {
    if (this.disposed) return Promise.resolve(this.snapshot());
    this.intent += 1;
    return this.closeSelected("ended", "finish-talking");
  }

  typeInstead() {
    if (this.disposed) return Promise.resolve(this.snapshot());
    this.intent += 1;
    return this.closeSelected("ended", "type-instead");
  }

  async stopAnswer(reason: "stop-answer" | "interruption" = "stop-answer"): Promise<boolean> {
    if (this.disposed || !this.binding || !this.current(this.binding)) return false;
    if (this.binding === this.attemptBinding && this.controller.snapshot().state === "active")
      return this.controller.stopAnswer(reason);
    const cancelled = this.cancelSelected(reason);
    if (!cancelled && this.pendingCancellation) await this.controller.finishTalking();
    return cancelled;
  }

  async setMuted(muted: boolean): Promise<boolean> {
    if (
      !this.binding ||
      this.binding !== this.attemptBinding ||
      !this.current(this.binding) ||
      this.pendingCancellation
    ) {
      await this.reconcile();
      return false;
    }
    return this.controller.setMuted(muted);
  }

  /** Apply the service setting synchronously; OFF closes capture/connection too. */
  async setPreference(on: boolean): Promise<boolean> {
    const binding = this.binding;
    if (!binding || !this.current(binding)) return false;
    this.intent += 1;
    const closing = !on ? this.closeSelected("ended", "preference-off") : null;
    this.service.setPreference(binding.storeId, on);
    if (closing) await closing;
    return this.current(binding) && (on || this.resourcesClosed());
  }

  /** No automatic Start on switching. A later user intent wins an async race. */
  async switchThread(storeId: string): Promise<boolean> {
    if (this.disposed) return false;
    const identity = this.service.getThreadLifecycleBinding(storeId);
    if (!identity) return false;
    const intent = ++this.intent;
    if (this.binding?.storeId === storeId && this.current(this.binding)) return true;
    await this.closeSelected("ended", "thread-switch");
    if (this.disposed || intent !== this.intent || !identity.isCurrent() || !this.resourcesClosed())
      return false;
    if (!this.service.openThread(storeId)) return false;
    this.binding = { storeId, identity };
    return true;
  }

  /** Delete is not postponed by unresolved browser/provider shutdown. */
  async deleteThread(): Promise<VoiceLifecycleSnapshot> {
    if (this.disposed) return this.snapshot();
    const binding = this.binding;
    this.intent += 1;
    const closing = this.closeSelected("ended", "delete");
    if (binding?.identity.isCurrent()) this.service.deleteThread(binding.storeId);
    return closing;
  }

  /** Discard removes content immediately, while retaining shutdown uncertainty. */
  async discardThread(): Promise<VoiceLifecycleSnapshot> {
    if (this.disposed) return this.snapshot();
    const binding = this.binding;
    this.intent += 1;
    const closing = this.closeSelected("ended", "discard");
    if (binding?.identity.isCurrent()) this.service.discardThread(binding.storeId);
    return closing;
  }

  async clearAll(): Promise<VoiceLifecycleSnapshot> {
    if (this.disposed) return this.snapshot();
    this.intent += 1;
    const closing = this.closeSelected("ended", "clear");
    this.service.clearAll();
    return closing;
  }

  async retryShutdown(): Promise<VoiceLifecycleSnapshot> {
    if (this.disposed) return this.snapshot();
    this.intent += 1;
    const pending = this.pendingCancellation;
    if (pending) {
      try {
        if (pending.binding.identity.isCurrent())
          this.service.cancelThread(pending.binding.storeId, pending.reason);
        this.pendingCancellation = null;
      } catch {
        // Keep the same hold. A new user request is required for another retry.
      }
    }
    await this.controller.retryShutdown();
    return this.snapshot();
  }

  /** Reconcile external service deletion without touching a replacement record. */
  async reconcile(): Promise<VoiceLifecycleSnapshot> {
    if (this.disposed) return this.snapshot();
    if (this.binding && !this.current(this.binding)) {
      this.intent += 1;
      await this.controller.finishTalking();
    }
    return this.snapshot();
  }

  async connectionLost(origin: VoiceAttempt): Promise<VoiceLifecycleSnapshot> {
    if (this.disposed) return this.snapshot();
    await this.controller.connectionLost(origin);
    return this.snapshot();
  }

  networkRecovered(): void {
    if (this.disposed) return;
    this.controller.networkRecovered();
  }

  /** Release ownership only after confirmed cleanup; failures remain retryable. */
  async dispose(): Promise<boolean> {
    if (this.disposed) return true;
    const intent = ++this.intent;
    await this.closeSelected("ended", "dispose");
    if (intent !== this.intent || !this.resourcesClosed()) return false;
    this.disposed = true;
    coordinatedServices.delete(this.service);
    return true;
  }
}
