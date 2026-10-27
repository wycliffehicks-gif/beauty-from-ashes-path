import { describe, expect, it, vi } from "vitest";
import { ConversationService, type TurnOutcome } from "../service/service";
import type {
  ConversationProviderRequest,
  ConversationProviderResponse,
} from "../service/provider";
import { ConversationVoiceBinding, type VoiceServicePorts } from "../service/voice-service-binding";
import type {
  VoiceAdmission,
  VoiceAttempt,
  VoiceCapture,
  VoiceCaptureResult,
  VoicePlayback,
} from "../service/voice-lifecycle";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

function resources(attempt: VoiceAttempt) {
  return {
    attempt,
    admission: {
      close: vi.fn(async () => {}),
      revalidate: vi.fn(async () => true),
    } satisfies VoiceAdmission,
    capture: {
      close: vi.fn(async () => {}),
      setMuted: vi.fn(async (_muted: boolean) => {}),
    } satisfies VoiceCapture,
    connection: { close: vi.fn(async () => {}) },
    playback: { close: vi.fn(async () => {}), stop: vi.fn(async () => {}) } satisfies VoicePlayback,
  };
}

async function harness() {
  const jobs: {
    request: ConversationProviderRequest;
    signal: AbortSignal;
    response: ReturnType<typeof deferred<ConversationProviderResponse>>;
  }[] = [];
  const service = new ConversationService({
    provider: {
      generate(request, signal) {
        const response = deferred<ConversationProviderResponse>();
        jobs.push({ request, signal, response });
        // Deliberately ignore AbortSignal to exercise the actual service fence.
        return response.promise;
      },
    },
  });
  await service.ready();
  service.ensureThread("a", true);
  service.ensureThread("b", false);
  const attempts: ReturnType<typeof resources>[] = [];
  const ports: VoiceServicePorts = {
    admit: vi.fn(async (attempt) => {
      const entry = resources(attempt);
      attempts.push(entry);
      return entry.admission;
    }),
    acquireCapture: vi.fn(async (attempt) => ({
      kind: "granted" as const,
      capture: attempts.find((entry) => entry.attempt === attempt)!.capture,
    })),
    connect: vi.fn(async (attempt) => {
      const entry = attempts.find((entry) => entry.attempt === attempt)!;
      return { connection: entry.connection, playback: entry.playback };
    }),
  };
  const binding = new ConversationVoiceBinding(service, ports);
  let sequence = 0;
  function submit(storeId: string, text = "SYNTHETIC_USER_REPORT", spoken = true) {
    const turnId = service.admitUserMessage(
      storeId,
      `message-${++sequence}`,
      text,
      spoken ? service.voice.origin() : null,
    );
    const apply = vi.fn((_outcome: TurnOutcome) => {});
    const result = service.runTurn(storeId, turnId, { accept: () => true, apply });
    return { turnId, apply, result };
  }
  return { service, binding, ports, jobs, attempts, submit };
}

async function until(predicate: () => boolean) {
  await vi.waitFor(() => expect(predicate()).toBe(true), { interval: 1, timeout: 2000 });
}

function assertClosed(entry: ReturnType<typeof resources>) {
  expect(entry.admission.close).toHaveBeenCalled();
  expect(entry.capture.close).toHaveBeenCalled();
  expect(entry.connection.close).toHaveBeenCalled();
  expect(entry.playback.close).toHaveBeenCalled();
}

describe("P5 offline shared-service voice binding", () => {
  for (const state of ["starting", "paused", "ended", "selected-only"] as const) {
    it(`Stop answer synchronously fences selected typed work while ${state}`, async () => {
      const h = await harness();
      const permission = deferred<VoiceCaptureResult>();
      let starting: Promise<boolean> | undefined;
      if (state === "selected-only") {
        await h.binding.switchThread("a");
      } else if (state === "starting") {
        vi.mocked(h.ports.acquireCapture).mockImplementationOnce(() => permission.promise);
        starting = h.binding.start("a");
        await until(() => vi.mocked(h.ports.acquireCapture).mock.calls.length === 1);
      } else {
        await h.binding.start("a");
        if (state === "paused") await h.binding.pause();
        else await h.binding.typeInstead();
      }
      const turn = h.submit("a", "TYPED_PENDING_REPORT", false);
      await until(() => h.jobs.length === 1);
      const stopping = h.binding.stopAnswer();
      expect(h.jobs[0].signal.aborted).toBe(true);
      expect(await stopping).toBe(true);
      h.jobs[0].response.resolve({ text: "LATE_TYPED_REPLY", sourceIds: [], interpretation: null });
      expect(await turn.result).toBe("stale");
      expect(turn.apply).not.toHaveBeenCalled();
      if (starting) {
        permission.resolve({ kind: "granted", capture: h.attempts[0].capture });
        expect(await starting).toBe(true);
      }
    });
  }

  it("retains a failed typed Stop while paused without private-practice assurance or automatic retry", async () => {
    const h = await harness();
    await h.binding.start("a");
    await h.binding.pause();
    const turn = h.submit("a", "TYPED_PENDING", false);
    await until(() => h.jobs.length === 1);
    const cancel = vi.spyOn(h.service, "cancelThread").mockImplementationOnce(() => {
      throw new Error("fence-failed");
    });
    expect(await h.binding.stopAnswer()).toBe(false);
    expect(h.binding.snapshot()).toMatchObject({
      cancellationUnconfirmed: true,
      cleanupComplete: false,
      privatePracticeAvailable: false,
    });
    expect(h.service.voice.privatePracticeAvailable()).toBe(false);
    expect(await h.binding.start("b")).toBe(false);
    expect(await h.binding.switchThread("b")).toBe(false);
    expect(cancel).toHaveBeenCalledOnce();
    await h.binding.retryShutdown();
    expect(h.jobs[0].signal.aborted).toBe(true);
    expect(h.binding.snapshot().cleanupComplete).toBe(true);
    h.jobs[0].response.resolve({ text: "LATE_TYPED", sourceIds: [], interpretation: null });
    expect(await turn.result).toBe("stale");
  });

  it("can switch twice and stop or delete selected typed work before starting its voice", async () => {
    const h = await harness();
    h.service.ensureThread("c", false);
    await h.binding.start("a");
    expect(await h.binding.switchThread("b")).toBe(true);
    expect(h.binding.snapshot()).toMatchObject({
      storeId: "b",
      selectedThreadId: "bfa-thread-b",
      threadId: "bfa-thread-a",
    });
    const old = h.submit("a", "NEW_UNSELECTED_A", false);
    const selected = h.submit("b", "SELECTED_B", false);
    await until(() => h.jobs.length === 2);
    expect(await h.binding.stopAnswer()).toBe(true);
    expect(h.jobs[0].signal.aborted).toBe(false);
    expect(h.jobs[1].signal.aborted).toBe(true);
    expect(await h.binding.switchThread("c")).toBe(true);
    await h.binding.pause();
    expect(await h.binding.resume()).toBe(false);
    expect(h.binding.snapshot().privatePracticeAvailable).toBe(false);
    expect(h.ports.admit).toHaveBeenCalledOnce();
    await h.binding.deleteThread();
    expect(h.service.hasThread("c")).toBe(false);
    expect(h.binding.snapshot().cleanupComplete).toBe(true);
    h.jobs[0].response.resolve({
      text: "Unselected current work.",
      sourceIds: [],
      interpretation: null,
    });
    h.jobs[1].response.resolve({
      text: "Cancelled selected work.",
      sourceIds: [],
      interpretation: null,
    });
    expect(await old.result).toBe("committed");
    expect(await selected.result).toBe("stale");
    expect(await h.binding.dispose()).toBe(true);
  });

  it("a newer same-store selection defeats a pending switch to another thread", async () => {
    const h = await harness();
    await h.binding.start("a");
    const close = deferred<void>();
    h.attempts[0].capture.close.mockImplementationOnce(() => close.promise);
    const switching = h.binding.switchThread("b");
    expect(await h.binding.switchThread("a")).toBe(true);
    close.resolve();
    expect(await switching).toBe(false);
    expect(h.binding.snapshot().storeId).toBe("a");
  });

  it("every returned lifecycle snapshot retains selected-thread cancellation uncertainty", async () => {
    const h = await harness();
    await h.binding.start("a");
    const oldAttempt = h.attempts[0].attempt;
    await h.binding.switchThread("b");
    const turn = h.submit("b", "SELECTED_TYPED_PENDING", false);
    await until(() => h.jobs.length === 1);
    const cancel = vi.spyOn(h.service, "cancelThread").mockImplementationOnce(() => {
      throw new Error("fence-failed");
    });
    expect(await h.binding.stopAnswer()).toBe(false);
    for (const result of [
      await h.binding.reconcile(),
      await h.binding.connectionLost(oldAttempt),
      await h.binding.pause(),
      await h.binding.finishTalking(),
      await h.binding.typeInstead(),
    ]) {
      expect(result).toMatchObject({
        cancellationUnconfirmed: true,
        cleanupComplete: false,
        privatePracticeAvailable: false,
      });
    }
    expect(cancel).toHaveBeenCalledOnce();
    expect(h.jobs[0].signal.aborted).toBe(false);
    await h.binding.retryShutdown();
    expect(h.jobs[0].signal.aborted).toBe(true);
    h.jobs[0].response.resolve({
      text: "LATE_SELECTED_REPLY",
      sourceIds: [],
      interpretation: null,
    });
    expect(await turn.result).toBe("stale");
  });

  for (const action of ["delete", "clear"] as const) {
    it(`external ${action} during final input enabling cannot activate a recreated thread`, async () => {
      const h = await harness();
      const unmute = deferred<void>();
      const original = vi.mocked(h.ports.admit).getMockImplementation()!;
      vi.mocked(h.ports.admit).mockImplementationOnce(async (attempt) => {
        const admission = await original(attempt);
        h.attempts[0].capture.setMuted.mockImplementationOnce(() => unmute.promise);
        return admission;
      });
      const starting = h.binding.start("a");
      await until(() => h.attempts[0]?.capture.setMuted.mock.calls.length === 1);
      if (action === "delete") h.service.deleteThread("a");
      else h.service.clearAll();
      h.service.ensureThread("a", false);
      unmute.resolve();
      expect(await starting).toBe(false);
      expect(h.service.voice.sessionId).toBeNull();
      expect(h.binding.snapshot()).toMatchObject({ threadCurrent: false, cleanupComplete: true });
      assertClosed(h.attempts[0]);
    });
  }

  it("is inert, rejects unknown threads and prevents two coordinators for one service", async () => {
    const h = await harness();
    h.binding.networkRecovered();
    expect(await h.binding.start("missing")).toBe(false);
    expect(h.ports.admit).not.toHaveBeenCalled();
    expect(h.jobs).toEqual([]);
    expect(() => new ConversationVoiceBinding(h.service, h.ports)).toThrow("already-bound");
  });

  it("shares the exact service model and queues only its committed answer", async () => {
    const h = await harness();
    expect(await h.binding.start("a")).toBe(true);
    expect(h.service.voice.threadId).toBe(h.binding.snapshot().threadId);
    const turn = h.submit("a");
    await until(() => h.jobs.length === 1);
    h.jobs[0].response.resolve({
      text: "Committed first. Committed second.",
      sourceIds: [],
      interpretation: null,
    });
    expect(await turn.result).toBe("committed");
    expect(h.service.voice.segments.map((segment) => segment.turnId)).toEqual([
      turn.turnId,
      turn.turnId,
    ]);
    h.service.voice.playNext();
    await h.binding.stopAnswer();
    expect(h.service.voice.playedTextForTurn(turn.turnId)).toEqual({
      text: "Committed first.",
      unheard: true,
    });
    expect(h.attempts[0].playback.stop).toHaveBeenCalledOnce();
    expect(h.attempts[0].capture.close).not.toHaveBeenCalled();
  });

  it("maps exact store IDs, fences the pending turn and excludes late replies from later context", async () => {
    const h = await harness();
    const storeId = "bfa-thread-a";
    h.service.ensureThread(storeId, false);
    await h.binding.start(storeId);
    expect(h.binding.snapshot().threadId).toBe("bfa-thread-bfa-thread-a");
    const stopped = h.submit(storeId, "ORIGINAL_REPORT");
    const other = h.submit("a", "OTHER_THREAD_REPORT", false);
    await until(() => h.jobs.length === 2);
    await h.binding.stopAnswer();
    expect(h.jobs[0].signal.aborted).toBe(true);
    expect(h.jobs[1].signal.aborted).toBe(false);
    h.jobs[0].response.resolve({
      text: "LATE_REPLY_MUST_NOT_ENTER_CONTEXT",
      sourceIds: [],
      interpretation: null,
    });
    h.jobs[1].response.resolve({ text: "OTHER_THREAD_REPLY", sourceIds: [], interpretation: null });
    expect(await stopped.result).toBe("stale");
    expect(stopped.apply).not.toHaveBeenCalled();
    expect(await other.result).toBe("committed");
    const next = h.submit(storeId, "FOLLOW_UP");
    await until(() => h.jobs.length === 3);
    const context = JSON.stringify(h.jobs[2].request);
    expect(context).toContain("ORIGINAL_REPORT");
    expect(context).not.toContain("LATE_REPLY_MUST_NOT_ENTER_CONTEXT");
    expect(context).not.toContain("OTHER_THREAD");
    h.jobs[2].response.resolve({ text: "Fresh reply.", sourceIds: [], interpretation: null });
    expect(await next.result).toBe("committed");
  });

  for (const action of [
    "pause",
    "finish",
    "type",
    "preference-off",
    "switch",
    "delete",
    "clear",
    "discard",
  ] as const) {
    it(`${action} fences a real pending service turn and closes injected resources`, async () => {
      const h = await harness();
      await h.binding.start("a");
      const turn = h.submit("a");
      await until(() => h.jobs.length === 1);
      switch (action) {
        case "pause":
          await h.binding.pause();
          break;
        case "finish":
          await h.binding.finishTalking();
          break;
        case "type":
          await h.binding.typeInstead();
          break;
        case "preference-off":
          await h.binding.setPreference(false);
          break;
        case "switch":
          expect(await h.binding.switchThread("b")).toBe(true);
          break;
        case "delete":
          await h.binding.deleteThread();
          break;
        case "clear":
          await h.binding.clearAll();
          break;
        case "discard":
          await h.binding.discardThread();
          break;
      }
      expect(h.jobs[0].signal.aborted).toBe(true);
      h.jobs[0].response.resolve({ text: "LATE_REPLY", sourceIds: [], interpretation: null });
      expect(await turn.result).toBe("stale");
      expect(turn.apply).not.toHaveBeenCalled();
      expect(h.service.voice.segments).toEqual([]);
      assertClosed(h.attempts[0]);
      expect(h.binding.snapshot().cleanupComplete).toBe(true);
      expect(h.binding.snapshot().privatePracticeAvailable).toBe(action === "pause");
      if (action === "delete" || action === "clear") expect(h.service.hasThread("a")).toBe(false);
      if (action === "preference-off") expect(h.service.inspect("a")!.preferenceOn).toBe(false);
      if (action === "switch") {
        expect(h.binding.snapshot().storeId).toBe("b");
        expect(h.ports.admit).toHaveBeenCalledOnce();
      }
    });
  }

  for (const action of ["delete", "clear"] as const) {
    for (const stage of ["admission", "capture", "connection", "unmute"] as const) {
      it(`${action} purges synchronously during pending ${stage} and cleans every late handle`, async () => {
        const h = await harness();
        const wait = deferred<void>();
        if (stage === "admission") {
          const original = vi.mocked(h.ports.admit).getMockImplementation()!;
          vi.mocked(h.ports.admit).mockImplementationOnce(async (attempt) => {
            const admission = await original(attempt);
            await wait.promise;
            return admission;
          });
        } else if (stage === "capture") {
          const original = vi.mocked(h.ports.acquireCapture).getMockImplementation()!;
          vi.mocked(h.ports.acquireCapture).mockImplementationOnce(async (attempt) => {
            const capture = await original(attempt);
            await wait.promise;
            return capture;
          });
        } else if (stage === "connection") {
          const original = vi.mocked(h.ports.connect).getMockImplementation()!;
          vi.mocked(h.ports.connect).mockImplementationOnce(async (...args) => {
            const connection = await original(...args);
            await wait.promise;
            return connection;
          });
        } else {
          const original = vi.mocked(h.ports.admit).getMockImplementation()!;
          vi.mocked(h.ports.admit).mockImplementationOnce(async (attempt) => {
            const admission = await original(attempt);
            h.attempts[0].capture.setMuted.mockImplementationOnce(() => wait.promise);
            return admission;
          });
        }
        const starting = h.binding.start("a");
        await until(() =>
          stage === "admission"
            ? h.attempts.length === 1
            : stage === "capture"
              ? vi.mocked(h.ports.acquireCapture).mock.calls.length === 1
              : stage === "connection"
                ? vi.mocked(h.ports.connect).mock.calls.length === 1
                : h.attempts[0]?.capture.setMuted.mock.calls.length === 1,
        );
        const closing = action === "delete" ? h.binding.deleteThread() : h.binding.clearAll();
        expect(h.service.hasThread("a")).toBe(false);
        expect(h.service.voice.fragments).toEqual([]);
        expect(h.binding.snapshot().privatePracticeAvailable).toBe(false);
        expect(await h.binding.start("b")).toBe(false);
        await closing;
        expect(h.binding.snapshot().cleanupComplete).toBe(false);
        wait.resolve();
        expect(await starting).toBe(false);
        expect(h.binding.snapshot().cleanupComplete).toBe(true);
        expect(h.attempts[0].admission.close).toHaveBeenCalled();
        if (stage !== "admission") expect(h.attempts[0].capture.close).toHaveBeenCalled();
        if (stage === "connection" || stage === "unmute") {
          expect(h.attempts[0].connection.close).toHaveBeenCalled();
          expect(h.attempts[0].playback.close).toHaveBeenCalled();
        }
      });
    }
  }

  for (const action of ["delete", "clear"] as const) {
    it(`external ${action} and same-ID recreation invalidate the old admission without cancelling the new record`, async () => {
      const h = await harness();
      const permission = deferred<VoiceCaptureResult>();
      vi.mocked(h.ports.acquireCapture).mockImplementationOnce(() => permission.promise);
      const identity = h.service.getThreadLifecycleBinding("a")!;
      const starting = h.binding.start("a");
      await until(
        () => h.attempts.length === 1 && vi.mocked(h.ports.acquireCapture).mock.calls.length === 1,
      );
      if (action === "delete") h.service.deleteThread("a");
      else h.service.clearAll();
      h.service.ensureThread("a", false);
      expect(identity.isCurrent()).toBe(false);
      expect(h.service.getThreadLifecycleBinding("a")!.isCurrent()).toBe(true);
      const newTurn = h.submit("a", "RECREATED_THREAD_REPORT", false);
      await until(() => h.jobs.length === 1);
      permission.resolve({ kind: "granted", capture: h.attempts[0].capture });
      expect(await starting).toBe(false);
      expect(h.ports.connect).not.toHaveBeenCalled();
      await h.binding.reconcile();
      expect(h.jobs[0].signal.aborted).toBe(false);
      h.jobs[0].response.resolve({
        text: "New record reply.",
        sourceIds: [],
        interpretation: null,
      });
      expect(await newTurn.result).toBe("committed");
      expect(h.binding.snapshot().threadCurrent).toBe(false);
      expect(await h.binding.start("a")).toBe(true);
    });
  }

  it("keeps a failed close bound to the old thread until explicit cleanup retry", async () => {
    const h = await harness();
    await h.binding.start("a");
    h.attempts[0].capture.close.mockRejectedValueOnce(new Error("device-close-failed"));
    expect(await h.binding.switchThread("b")).toBe(false);
    expect(h.binding.snapshot()).toMatchObject({
      storeId: "a",
      state: "failed",
      cleanupComplete: false,
      privatePracticeAvailable: false,
    });
    expect(await h.binding.start("b")).toBe(false);
    expect(await h.binding.dispose()).toBe(false);
    expect(() => new ConversationVoiceBinding(h.service, h.ports)).toThrow("already-bound");
    await h.binding.retryShutdown();
    expect(await h.binding.switchThread("b")).toBe(true);
    expect(h.ports.admit).toHaveBeenCalledOnce();
    expect(await h.binding.start("b")).toBe(true);
    expect(h.attempts[1].attempt.threadId).toBe(h.service.inspect("b")!.threadId);
  });

  it("retains a failed service cancellation and retries it against the same pending turn", async () => {
    const h = await harness();
    await h.binding.start("a");
    const turn = h.submit("a");
    await until(() => h.jobs.length === 1);
    const cancel = vi.spyOn(h.service, "cancelThread").mockImplementationOnce(() => {
      throw new Error("fence-failed");
    });
    await h.binding.pause();
    expect(h.jobs[0].signal.aborted).toBe(false);
    expect(await h.binding.stopAnswer()).toBe(false);
    expect(h.jobs[0].signal.aborted).toBe(false);
    expect(cancel).toHaveBeenCalledOnce();
    expect(h.binding.snapshot()).toMatchObject({
      cancellationUnconfirmed: true,
      cleanupComplete: false,
      privatePracticeAvailable: false,
    });
    expect(await h.binding.start("b")).toBe(false);
    expect(await h.binding.switchThread("b")).toBe(false);
    expect(await h.binding.dispose()).toBe(false);
    expect(h.binding.snapshot().storeId).toBe("a");
    await h.binding.retryShutdown();
    expect(h.jobs[0].signal.aborted).toBe(true);
    h.jobs[0].response.resolve({ text: "LATE_AFTER_RETRY", sourceIds: [], interpretation: null });
    expect(await turn.result).toBe("stale");
    expect(turn.apply).not.toHaveBeenCalled();
    expect(h.binding.snapshot().cleanupComplete).toBe(true);
  });

  it("does not release coordinator ownership while unmute completion remains pending", async () => {
    const h = await harness();
    await h.binding.start("a");
    await h.binding.setMuted(true);
    const unmute = deferred<void>();
    h.attempts[0].capture.setMuted.mockImplementationOnce(() => unmute.promise);
    const changing = h.binding.setMuted(false);
    await until(() => h.attempts[0].capture.setMuted.mock.calls.length === 3);
    expect(await h.binding.dispose()).toBe(false);
    expect(await h.binding.switchThread("b")).toBe(false);
    expect(h.binding.snapshot().storeId).toBe("a");
    expect(() => new ConversationVoiceBinding(h.service, h.ports)).toThrow("already-bound");
    unmute.resolve();
    expect(await changing).toBe(false);
    expect(await h.binding.dispose()).toBe(true);
    expect(() => new ConversationVoiceBinding(h.service, h.ports)).not.toThrow();
  });

  it("a newer switch wins over pending disposal and retains coordinator ownership", async () => {
    const h = await harness();
    await h.binding.start("a");
    const close = deferred<void>();
    h.attempts[0].capture.close.mockImplementationOnce(() => close.promise);
    const disposing = h.binding.dispose();
    const switching = h.binding.switchThread("b");
    close.resolve();
    expect(await disposing).toBe(false);
    expect(await switching).toBe(true);
    expect(h.binding.snapshot()).toMatchObject({ storeId: "b", threadCurrent: true });
    expect(() => new ConversationVoiceBinding(h.service, h.ports)).toThrow("already-bound");
    expect(await h.binding.start("b")).toBe(true);
  });

  it("clear wins over pending switch and does not open a recreated target", async () => {
    const h = await harness();
    await h.binding.start("a");
    const close = deferred<void>();
    h.attempts[0].capture.close.mockImplementationOnce(() => close.promise);
    const switching = h.binding.switchThread("b");
    const clearing = h.binding.clearAll();
    expect(h.service.hasThread("a")).toBe(false);
    h.service.ensureThread("b", false);
    close.resolve();
    expect(await switching).toBe(false);
    await clearing;
    expect(h.binding.snapshot().storeId).toBe("a");
    expect(h.service.trace.some((row) => row.type === "thread-opened")).toBe(false);
  });

  it("old connection events and old replies cannot affect the explicit resumed session", async () => {
    const h = await harness();
    await h.binding.start("a");
    const oldAttempt = h.attempts[0].attempt;
    const turn = h.submit("a");
    await until(() => h.jobs.length === 1);
    await h.binding.pause();
    h.binding.networkRecovered();
    expect(h.attempts).toHaveLength(1);
    expect(await h.binding.resume()).toBe(true);
    const sessionId = h.service.voice.sessionId;
    await h.binding.connectionLost(oldAttempt);
    expect(h.binding.snapshot().state).toBe("active");
    h.jobs[0].response.resolve({ text: "OLD_SESSION_REPLY", sourceIds: [], interpretation: null });
    expect(await turn.result).toBe("stale");
    expect(h.service.voice.sessionId).toBe(sessionId);
    expect(h.service.voice.segments).toEqual([]);
    expect(h.attempts[1].capture.close).not.toHaveBeenCalled();
  });

  for (const action of ["delete", "clear"] as const) {
    it(`external ${action} during active unmute closes the old session without cancelling a recreated record`, async () => {
      const h = await harness();
      await h.binding.start("a");
      await h.binding.setMuted(true);
      const input = deferred<void>();
      h.attempts[0].capture.setMuted.mockImplementationOnce(() => input.promise);
      const changing = h.binding.setMuted(false);
      await until(() => h.attempts[0].capture.setMuted.mock.calls.length === 3);
      if (action === "delete") h.service.deleteThread("a");
      else h.service.clearAll();
      h.service.ensureThread("a", true);
      const cancel = vi.spyOn(h.service, "cancelThread");
      input.resolve();
      expect(await changing).toBe(false);
      expect(h.binding.snapshot()).toMatchObject({
        state: "ended",
        inputChangePending: false,
        cleanupComplete: true,
        threadCurrent: false,
      });
      assertClosed(h.attempts[0]);
      expect(cancel).not.toHaveBeenCalled();
      expect(h.service.hasThread("a")).toBe(true);
      expect(h.ports.connect).toHaveBeenCalledTimes(1);
    });
  }

  it("a disposed coordinator cannot modify the new owner's service or voice session", async () => {
    const h = await harness();
    await h.binding.start("a");
    expect(await h.binding.dispose()).toBe(true);
    const next = new ConversationVoiceBinding(h.service, h.ports);
    await next.start("b");
    const before = next.snapshot();
    await h.binding.clearAll();
    await h.binding.deleteThread();
    await h.binding.discardThread();
    await h.binding.pause();
    await h.binding.finishTalking();
    await h.binding.typeInstead();
    await h.binding.stopAnswer();
    await h.binding.setPreference(false);
    await h.binding.setMuted(false);
    await h.binding.retryShutdown();
    await h.binding.connectionLost(h.attempts[0].attempt);
    h.binding.networkRecovered();
    expect(await h.binding.dispose()).toBe(true);
    expect(h.service.hasThread("a")).toBe(true);
    expect(next.snapshot()).toEqual(before);
    expect(h.attempts[1].capture.close).not.toHaveBeenCalled();
  });
});
