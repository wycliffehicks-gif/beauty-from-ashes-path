import { describe, expect, it, vi } from "vitest";
import {
  VoiceLifecycleController,
  type VoiceAdmission,
  type VoiceCapture,
  type VoiceCaptureResult,
  type VoiceLifecyclePorts,
  type VoicePlayback,
} from "../service/voice-lifecycle";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness(overrides: Partial<VoiceLifecyclePorts> = {}) {
  const admission: VoiceAdmission = {
    close: vi.fn(async () => {}),
    revalidate: vi.fn(async () => true),
  };
  const capture: VoiceCapture = { close: vi.fn(async () => {}), setMuted: vi.fn(async () => {}) };
  const connection = { close: vi.fn(async () => {}) };
  const playback: VoicePlayback = { close: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
  const ports: VoiceLifecyclePorts = {
    admit: vi.fn(async () => admission),
    acquireCapture: vi.fn(async () => ({ kind: "granted" as const, capture })),
    connect: vi.fn(async () => ({ connection, playback })),
    cancelPending: vi.fn(),
    ...overrides,
  };
  const controller = new VoiceLifecycleController(ports);
  return { controller, ports, admission, capture, connection, playback };
}
async function until(predicate: () => boolean) {
  for (let i = 0; i < 50 && !predicate(); i++) await Promise.resolve();
  expect(predicate()).toBe(true);
}
function closedSnapshot(controller: VoiceLifecycleController) {
  expect(
    Object.values(controller.snapshot().resources).every((x) => x === "closed" || x === "absent"),
  ).toBe(true);
  expect(controller.snapshot().acquisitionPending).toBe(false);
}

describe("P5 injected asynchronous voice lifecycle — no device or provider", () => {
  it("ignores a loss event caused by deliberate close during and after Finish talking", async () => {
    const h = harness();
    await h.controller.start("thread");
    const origin = vi.mocked(h.ports.connect).mock.calls[0][0];
    vi.mocked(h.connection.close).mockImplementationOnce(async () => {
      expect((await h.controller.connectionLost(origin)).state).toBe("stopping");
    });
    expect((await h.controller.finishTalking()).state).toBe("ended");
    expect((await h.controller.connectionLost(origin)).state).toBe("ended");
    expect(await h.controller.resume()).toBe(false);
    expect(h.controller.snapshot().privatePracticeAvailable).toBe(false);
  });

  it("ignores a previous transport loss event after explicit Resume", async () => {
    const h = harness();
    await h.controller.start("thread");
    const old = vi.mocked(h.ports.connect).mock.calls[0][0];
    await h.controller.pause();
    await h.controller.resume();
    const current = h.controller.snapshot();
    expect((await h.controller.connectionLost(old)).state).toBe("active");
    expect(h.controller.snapshot()).toEqual(current);
    expect(h.connection.close).toHaveBeenCalledTimes(1);
    const live = vi.mocked(h.ports.connect).mock.calls[1][0];
    expect((await h.controller.connectionLost(live)).state).toBe("paused");
  });

  it("does no admission, capture or connection on construction or network recovery", () => {
    const h = harness();
    h.controller.networkRecovered();
    expect(h.controller.snapshot().state).toBe("idle");
    expect(h.ports.admit).not.toHaveBeenCalled();
    expect(h.ports.acquireCapture).not.toHaveBeenCalled();
    expect(h.ports.connect).not.toHaveBeenCalled();
  });

  it("requires explicit start, fresh revalidation and initially muted capture before connecting", async () => {
    const h = harness();
    expect(await h.controller.start("thread-1")).toBe(true);
    expect(h.admission.revalidate).toHaveBeenCalledTimes(4);
    expect(h.ports.connect).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "thread-1" }),
      h.admission,
      h.capture,
    );
    expect(h.capture.setMuted).toHaveBeenCalledWith(false);
    expect(h.controller.snapshot().state).toBe("active");
    expect(await h.controller.start("thread-2")).toBe(false);
  });

  for (const kind of ["denied", "dismissed", "unavailable"] as const) {
    it(`${kind} microphone leaves no connection and releases admission`, async () => {
      const h = harness({ acquireCapture: vi.fn(async () => ({ kind })) });
      expect(await h.controller.start("thread-1")).toBe(false);
      expect(h.ports.connect).not.toHaveBeenCalled();
      expect(h.admission.close).toHaveBeenCalledTimes(1);
      expect(h.controller.snapshot().error).toBe(`microphone-${kind}`);
      closedSnapshot(h.controller);
    });
  }

  it("cleans a partially acquired capture returned with an unavailable result", async () => {
    const h = harness();
    h.ports.acquireCapture = vi.fn(async () => ({
      kind: "unavailable" as const,
      capture: h.capture,
    }));
    expect(await h.controller.start("thread")).toBe(false);
    expect(h.capture.close).toHaveBeenCalledTimes(1);
    expect(h.ports.connect).not.toHaveBeenCalled();
  });

  it("rejects a revoked admission before acquiring capture", async () => {
    const h = harness();
    vi.mocked(h.admission.revalidate).mockResolvedValue(false);
    expect(await h.controller.start("thread")).toBe(false);
    expect(h.ports.acquireCapture).not.toHaveBeenCalled();
    expect(h.ports.connect).not.toHaveBeenCalled();
    closedSnapshot(h.controller);
  });

  it("rejects expiry after permission and before connection", async () => {
    const h = harness();
    vi.mocked(h.admission.revalidate).mockResolvedValueOnce(true).mockResolvedValue(false);
    expect(await h.controller.start("thread")).toBe(false);
    expect(h.ports.connect).not.toHaveBeenCalled();
    expect(h.capture.close).toHaveBeenCalledTimes(1);
    closedSnapshot(h.controller);
  });

  it("cleans all resources if admission expires during connection", async () => {
    const h = harness();
    vi.mocked(h.admission.revalidate)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    expect(await h.controller.start("thread")).toBe(false);
    expect(h.capture.setMuted).not.toHaveBeenCalled();
    expect(h.connection.close).toHaveBeenCalledTimes(1);
    expect(h.playback.close).toHaveBeenCalledTimes(1);
    closedSnapshot(h.controller);
  });

  it("rejects admission invalidated while initial unmute is pending and closes every resource", async () => {
    const h = harness();
    const input = deferred<void>();
    let allowed = true;
    vi.mocked(h.admission.revalidate).mockImplementation(async () => allowed);
    vi.mocked(h.capture.setMuted).mockReturnValueOnce(input.promise);
    const start = h.controller.start("thread");
    await until(() => vi.mocked(h.capture.setMuted).mock.calls.length === 1);
    allowed = false;
    input.resolve();
    expect(await start).toBe(false);
    expect(h.controller.model.sessionId).toBe(null);
    expect(h.controller.snapshot()).toMatchObject({
      state: "failed",
      cleanupComplete: true,
      privatePracticeAvailable: false,
    });
    for (const resource of [h.admission, h.capture, h.connection, h.playback])
      expect(resource.close).toHaveBeenCalledOnce();
    expect(h.ports.admit).toHaveBeenCalledOnce();
    expect(h.ports.acquireCapture).toHaveBeenCalledOnce();
    expect(h.ports.connect).toHaveBeenCalledOnce();
    closedSnapshot(h.controller);
  });

  it("pause while permission is pending remains uncertain and cleans the late capture", async () => {
    const permission = deferred<VoiceCaptureResult>();
    const h = harness({ acquireCapture: vi.fn(() => permission.promise) });
    const start = h.controller.start("thread");
    await until(() => vi.mocked(h.ports.acquireCapture).mock.calls.length === 1);
    const paused = await h.controller.pause();
    expect(paused.state).toBe("stopping");
    expect(paused.privatePracticeAvailable).toBe(false);
    expect(paused.acquisitionPending).toBe(true);
    h.controller.networkRecovered();
    expect(await h.controller.resume()).toBe(false);
    permission.resolve({ kind: "granted", capture: h.capture });
    expect(await start).toBe(false);
    expect(h.capture.close).toHaveBeenCalledTimes(1);
    expect(h.ports.connect).not.toHaveBeenCalled();
    expect(h.controller.snapshot().state).toBe("paused");
    expect(h.controller.snapshot().privatePracticeAvailable).toBe(true);
  });

  it("retains a late capture whose close fails and retries cleanup only on request", async () => {
    const permission = deferred<VoiceCaptureResult>();
    const h = harness({ acquireCapture: vi.fn(() => permission.promise) });
    vi.mocked(h.capture.close).mockRejectedValueOnce(new Error("device"));
    const start = h.controller.start("thread");
    await until(() => vi.mocked(h.ports.acquireCapture).mock.calls.length === 1);
    await h.controller.pause();
    permission.resolve({ kind: "granted", capture: h.capture });
    await start;
    expect(h.controller.snapshot().state).toBe("failed");
    expect(h.controller.snapshot().resources.capture).toBe("unknown");
    expect(h.controller.snapshot().privatePracticeAvailable).toBe(false);
    expect(h.capture.close).toHaveBeenCalledTimes(1);
    expect(await h.controller.start("another")).toBe(false);
    await h.controller.retryShutdown();
    expect(h.capture.close).toHaveBeenCalledTimes(2);
    expect(h.ports.admit).toHaveBeenCalledTimes(1);
    expect(h.controller.snapshot().privatePracticeAvailable).toBe(true);
  });

  it("cleans late admission without requesting permission or connecting", async () => {
    const pending = deferred<VoiceAdmission>();
    const h = harness({ admit: vi.fn(() => pending.promise) });
    const start = h.controller.start("thread");
    await h.controller.finishTalking();
    pending.resolve(h.admission);
    expect(await start).toBe(false);
    expect(h.admission.close).toHaveBeenCalledTimes(1);
    expect(h.ports.acquireCapture).not.toHaveBeenCalled();
    expect(h.controller.snapshot().state).toBe("ended");
  });

  it("cleans both late connection resources and never activates the obsolete session", async () => {
    const pending = deferred<{ connection: { close(): Promise<void> }; playback: VoicePlayback }>();
    const h = harness({ connect: vi.fn(() => pending.promise) });
    const start = h.controller.start("thread");
    await until(() => vi.mocked(h.ports.connect).mock.calls.length === 1);
    await h.controller.pause();
    pending.resolve({ connection: h.connection, playback: h.playback });
    await start;
    expect(h.connection.close).toHaveBeenCalledTimes(1);
    expect(h.playback.close).toHaveBeenCalledTimes(1);
    expect(h.capture.setMuted).not.toHaveBeenCalled();
    expect(h.controller.model.sessionId).toBe(null);
    closedSnapshot(h.controller);
  });

  it("mute changes only input; Stop answer stops playback and clears stale queued segments", async () => {
    const h = harness();
    await h.controller.start("thread");
    const origin = h.controller.model.origin();
    h.controller.model.queueAnswer("turn", ["first", "second"], false, origin);
    expect(await h.controller.setMuted(true)).toBe(true);
    expect(h.controller.model.muted).toBe(true);
    expect(h.connection.close).not.toHaveBeenCalled();
    expect(h.playback.stop).not.toHaveBeenCalled();
    expect(await h.controller.stopAnswer()).toBe(true);
    expect(h.playback.stop).toHaveBeenCalledTimes(1);
    expect(h.controller.model.playNext()).toBe(null);
    expect(h.controller.model.queueAnswer("late", ["stale"], false, origin)).toBe(false);
    expect(h.controller.snapshot().state).toBe("active");
    expect(h.connection.close).not.toHaveBeenCalled();
  });

  it("Pause confirms all four independent resources before private practice", async () => {
    const h = harness();
    await h.controller.start("thread");
    const connectionClose = deferred<void>();
    vi.mocked(h.connection.close).mockReturnValue(connectionClose.promise);
    const pause = h.controller.pause();
    await until(() => h.controller.snapshot().resources.connection === "closing");
    expect(h.controller.snapshot().privatePracticeAvailable).toBe(false);
    expect(h.controller.model.addFragment("private content", h.controller.model.origin())).toBe(
      false,
    );
    connectionClose.resolve();
    await pause;
    for (const r of [h.admission, h.capture, h.connection, h.playback])
      expect(r.close).toHaveBeenCalledTimes(1);
    expect(h.controller.snapshot().privatePracticeAvailable).toBe(true);
    expect(h.controller.model.privatePracticeAvailable()).toBe(true);
  });

  for (const resource of ["admission", "capture", "connection", "playback"] as const) {
    it(`a failed ${resource} close blocks private assurance and fresh session`, async () => {
      const h = harness();
      await h.controller.start("thread");
      vi.mocked(h[resource].close).mockRejectedValueOnce(new Error("unconfirmed"));
      await h.controller.pause();
      expect(h.controller.snapshot().state).toBe("failed");
      expect(h.controller.snapshot().privatePracticeAvailable).toBe(false);
      expect(await h.controller.resume()).toBe(false);
      await h.controller.retryShutdown();
      expect(h.controller.snapshot().state).toBe("paused");
      expect(h.controller.snapshot().error).toBe(null);
      expect(h.controller.snapshot().privatePracticeAvailable).toBe(true);
      expect(h.ports.connect).toHaveBeenCalledTimes(1);
    });
  }

  it("network recovery never reconnects; explicit Resume uses a fresh admission and session", async () => {
    const h = harness();
    await h.controller.start("thread");
    const oldOrigin = h.controller.model.origin();
    await h.controller.connectionLost(vi.mocked(h.ports.connect).mock.calls[0][0]);
    h.controller.networkRecovered();
    expect(h.ports.connect).toHaveBeenCalledTimes(1);
    expect(await h.controller.resume()).toBe(true);
    expect(h.ports.admit).toHaveBeenCalledTimes(2);
    expect(h.controller.model.sessionId).not.toBe(oldOrigin.sessionId);
    expect(h.controller.model.addFragment("late private input", oldOrigin)).toBe(false);
  });

  it("Type instead closes resources and keeps the current thread identity", async () => {
    const h = harness();
    await h.controller.start("thread");
    await h.controller.typeInstead();
    expect(h.controller.snapshot().state).toBe("ended");
    expect(h.controller.snapshot().threadId).toBe("thread");
    closedSnapshot(h.controller);
    expect(h.controller.snapshot().privatePracticeAvailable).toBe(false);
  });

  it("switching during acquisition cleans the old thread and does not auto-start another", async () => {
    const permission = deferred<VoiceCaptureResult>();
    const h = harness({ acquireCapture: vi.fn(() => permission.promise) });
    const start = h.controller.start("old");
    await until(() => vi.mocked(h.ports.acquireCapture).mock.calls.length === 1);
    expect(await h.controller.switchThread("new")).toBe(false);
    expect(await h.controller.start("new")).toBe(false);
    permission.resolve({ kind: "granted", capture: h.capture });
    await start;
    expect(h.ports.connect).not.toHaveBeenCalled();
    expect(h.controller.snapshot().state).toBe("ended");
  });

  it("faith-off and interruption invalidate old output without retracting played segments", async () => {
    const h = harness();
    await h.controller.start("thread");
    const origin = h.controller.model.origin();
    h.controller.model.queueAnswer("turn", ["heard", "unheard"], true, origin);
    h.controller.model.playNext();
    await h.controller.stopAnswer("preference-off");
    expect(h.controller.model.playedTextForTurn("turn")).toEqual({ text: "heard", unheard: true });
    expect(h.controller.model.queueAnswer("late", ["obsolete"], true, origin)).toBe(false);
    expect(h.ports.cancelPending).toHaveBeenCalledWith("thread", "preference-off");
    await h.controller.stopAnswer("interruption");
    expect(h.playback.stop).toHaveBeenCalledTimes(2);
  });

  it("playback stop failure closes the whole session and keeps failure explicit", async () => {
    const h = harness();
    await h.controller.start("thread");
    vi.mocked(h.playback.stop).mockRejectedValue(new Error("device"));
    expect(await h.controller.stopAnswer()).toBe(false);
    expect(h.controller.snapshot().error).toBe("playback-stop-unconfirmed");
    expect(h.controller.snapshot().state).toBe("ended");
    closedSnapshot(h.controller);
  });

  it("pending-work cancellation failure returns false and still closes every resource", async () => {
    const h = harness({
      cancelPending: vi.fn(() => {
        throw new Error("service");
      }),
    });
    await h.controller.start("thread");
    expect(await h.controller.stopAnswer()).toBe(false);
    expect(h.controller.snapshot().error).toBe("work-cancellation-failed");
    expect(h.controller.snapshot().state).toBe("failed");
    expect(h.controller.snapshot().cancellationUnconfirmed).toBe(true);
    expect(h.ports.cancelPending).toHaveBeenCalledTimes(1);
    expect(await h.controller.start("another-thread")).toBe(false);
    closedSnapshot(h.controller);
    for (const r of [h.admission, h.capture, h.connection, h.playback])
      expect(r.close).toHaveBeenCalledTimes(1);
  });

  it("does not assure private practice or resume until failed Pause cancellation is retried", async () => {
    const h = harness();
    vi.mocked(h.ports.cancelPending).mockImplementationOnce(() => {
      throw new Error("service");
    });
    await h.controller.start("thread");
    const paused = await h.controller.pause();
    expect(paused).toMatchObject({
      state: "failed",
      cancellationUnconfirmed: true,
      cleanupComplete: false,
      privatePracticeAvailable: false,
      error: "work-cancellation-failed",
    });
    expect(h.controller.model.privatePracticeAvailable()).toBe(false);
    expect(await h.controller.resume()).toBe(false);
    expect(await h.controller.start("another-thread")).toBe(false);
    expect(h.ports.cancelPending).toHaveBeenCalledTimes(1);
    const retried = await h.controller.retryShutdown();
    expect(retried).toMatchObject({
      state: "paused",
      cancellationUnconfirmed: false,
      cleanupComplete: true,
      privatePracticeAvailable: true,
      error: null,
    });
    expect(h.controller.model.privatePracticeAvailable()).toBe(true);
    expect(h.ports.cancelPending).toHaveBeenLastCalledWith("thread", "pause");
    expect(h.ports.cancelPending).toHaveBeenCalledTimes(2);
    for (const r of [h.admission, h.capture, h.connection, h.playback])
      expect(r.close).toHaveBeenCalledTimes(1);
    expect(h.ports.admit).toHaveBeenCalledTimes(1);
    expect(h.ports.acquireCapture).toHaveBeenCalledTimes(1);
    expect(h.ports.connect).toHaveBeenCalledTimes(1);
  });

  it("Stop answer failure does not silently retry cancellation and retains its ended target", async () => {
    const h = harness();
    vi.mocked(h.ports.cancelPending).mockImplementationOnce(() => {
      throw new Error("service");
    });
    await h.controller.start("thread");
    expect(await h.controller.stopAnswer()).toBe(false);
    expect(h.ports.cancelPending).toHaveBeenCalledTimes(1);
    expect(h.controller.snapshot().state).toBe("failed");
    expect(h.playback.stop).not.toHaveBeenCalled();
    expect(await h.controller.resume()).toBe(false);
    expect(await h.controller.start("another-thread")).toBe(false);
    const retried = await h.controller.retryShutdown();
    expect(retried).toMatchObject({
      state: "ended",
      cancellationUnconfirmed: false,
      privatePracticeAvailable: false,
      error: null,
    });
    expect(h.ports.cancelPending).toHaveBeenLastCalledWith("thread", "stop-answer");
    expect(h.ports.cancelPending).toHaveBeenCalledTimes(2);
    expect(h.ports.connect).toHaveBeenCalledTimes(1);
    expect(h.capture.close).toHaveBeenCalledTimes(1);
  });

  it("retries only unresolved cancellation and closure while preserving the failed fence", async () => {
    const h = harness();
    vi.mocked(h.ports.cancelPending)
      .mockImplementationOnce(() => {
        throw new Error("service");
      })
      .mockImplementationOnce(() => {
        throw new Error("service still unavailable");
      });
    vi.mocked(h.capture.close).mockRejectedValueOnce(new Error("capture"));
    await h.controller.start("thread");
    await h.controller.pause();
    expect(h.controller.snapshot().resources.capture).toBe("unknown");
    const firstRetry = await h.controller.retryShutdown();
    expect(firstRetry.resources.capture).toBe("closed");
    expect(firstRetry).toMatchObject({
      state: "failed",
      cancellationUnconfirmed: true,
      privatePracticeAvailable: false,
      error: "work-cancellation-failed",
    });
    expect(await h.controller.start("another-thread")).toBe(false);
    const secondRetry = await h.controller.retryShutdown();
    expect(secondRetry).toMatchObject({
      state: "paused",
      cancellationUnconfirmed: false,
      privatePracticeAvailable: true,
      error: null,
    });
    expect(h.capture.close).toHaveBeenCalledTimes(2);
    for (const r of [h.admission, h.connection, h.playback])
      expect(r.close).toHaveBeenCalledTimes(1);
    expect(h.ports.cancelPending).toHaveBeenCalledTimes(3);
    expect(h.ports.connect).toHaveBeenCalledTimes(1);
  });

  it("a late unmute cannot confirm Pause until it settles and closure is reconfirmed", async () => {
    const h = harness();
    await h.controller.start("thread");
    await h.controller.setMuted(true);
    const unmute = deferred<void>();
    vi.mocked(h.capture.setMuted).mockReturnValueOnce(unmute.promise);
    const changing = h.controller.setMuted(false);
    await until(() => vi.mocked(h.capture.setMuted).mock.calls.length === 3);
    await h.controller.pause();
    expect(h.controller.snapshot().state).toBe("stopping");
    expect(h.controller.snapshot().privatePracticeAvailable).toBe(false);
    unmute.resolve();
    expect(await changing).toBe(false);
    expect(h.capture.close).toHaveBeenCalledTimes(2);
    expect(h.controller.snapshot().privatePracticeAvailable).toBe(true);
  });

  it("late initial input enabling is followed by another capture close", async () => {
    const h = harness();
    const enabling = deferred<void>();
    vi.mocked(h.capture.setMuted).mockReturnValueOnce(enabling.promise);
    const start = h.controller.start("thread");
    await until(() => vi.mocked(h.capture.setMuted).mock.calls.length === 1);
    await h.controller.pause();
    expect(h.controller.snapshot().privatePracticeAvailable).toBe(false);
    enabling.resolve();
    expect(await start).toBe(false);
    expect(h.capture.close).toHaveBeenCalledTimes(2);
    expect(h.controller.snapshot().privatePracticeAvailable).toBe(true);
  });

  it("a rejected late input-enabling operation also requires closure to be reconfirmed", async () => {
    const h = harness();
    const enabling = deferred<void>();
    vi.mocked(h.capture.setMuted).mockReturnValueOnce(enabling.promise);
    const start = h.controller.start("thread");
    await until(() => vi.mocked(h.capture.setMuted).mock.calls.length === 1);
    await h.controller.pause();
    enabling.reject(new Error("partly changed input"));
    expect(await start).toBe(false);
    expect(h.capture.close).toHaveBeenCalledTimes(2);
    expect(h.controller.snapshot().privatePracticeAvailable).toBe(true);
  });
});
