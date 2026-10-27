import { describe, expect, it, vi } from "vitest";
import { ConversationService } from "../service/service";
import { ConversationVoiceBinding, type VoiceServicePorts } from "../service/voice-service-binding";
import type { VoiceAdmission, VoiceCaptureResult } from "../service/voice-lifecycle";
import {
  deriveVoiceControls,
  type VoiceControlAction,
  type VoiceControlsSnapshot,
  type VoiceControlsView,
} from "../service/voice-controls";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

async function setup() {
  const generate = vi.fn(async () => {
    throw new Error("fixture-must-not-call-provider");
  });
  const service = new ConversationService({ provider: { generate } });
  await service.ready();
  service.ensureThread("a", true);
  service.ensureThread("b", false);
  const admission = { revalidate: vi.fn(async () => true), close: vi.fn(async () => {}) };
  const capture = { setMuted: vi.fn(async (_muted: boolean) => {}), close: vi.fn(async () => {}) };
  const connection = { close: vi.fn(async () => {}) };
  const playback = { close: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
  const ports: VoiceServicePorts = {
    admit: vi.fn(async () => admission),
    acquireCapture: vi.fn(async () => ({ kind: "granted" as const, capture })),
    connect: vi.fn(async () => ({ connection, playback })),
  };
  const binding = new ConversationVoiceBinding(service, ports);
  return { service, generate, binding, ports, admission, capture, connection, playback };
}

function action(view: VoiceControlsView, name: VoiceControlAction) {
  const item = view.actions.find((item) => item.action === name);
  expect(item, `${name} should be visible`).toBeDefined();
  return item!;
}

function noPrivateAssurance(view: VoiceControlsView) {
  expect(view.detail).not.toContain("Private practice is available");
  expect(view.status).not.toBe("Voice paused.");
  expect(action(view, "resume").disabled).toBe(true);
}

describe("P5 inactive voice-controls presentation", () => {
  it("requires a current selected conversation and never invokes ports while deriving display", async () => {
    const h = await setup();
    const initial = deriveVoiceControls(h.binding.snapshot());
    expect(initial.status).toBe("Choose a conversation.");
    expect(action(initial, "start").disabled).toBe(true);
    expect(action(initial, "stop-answer").disabled).toBe(true);
    await h.binding.switchThread("a");
    const selected = deriveVoiceControls(h.binding.snapshot());
    expect(selected.status).toBe("Ready for voice.");
    expect(action(selected, "start").disabled).toBe(false);
    expect(action(selected, "stop-answer").disabled).toBe(false);
    expect(h.ports.admit).not.toHaveBeenCalled();
    expect(h.ports.acquireCapture).not.toHaveBeenCalled();
    expect(h.ports.connect).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("keeps shutdown controls available during pending setup and only permits Resume after closure", async () => {
    const h = await setup();
    const waiting = deferred<VoiceAdmission>();
    vi.mocked(h.ports.admit).mockReturnValueOnce(waiting.promise);
    const starting = h.binding.start("a");
    const view = deriveVoiceControls(h.binding.snapshot(), ["start"]);
    expect(view.status).toBe("Starting voice…");
    expect(action(view, "start").disabled).toBe(true);
    for (const name of ["stop-answer", "pause", "finish-talking", "type-instead"] as const)
      expect(action(view, name).disabled).toBe(false);
    await h.binding.pause();
    const closing = deriveVoiceControls(h.binding.snapshot(), ["start"]);
    expect(closing.status).toBe("Closing voice…");
    noPrivateAssurance(closing);
    expect(action(closing, "start").disabled).toBe(true);
    waiting.resolve(h.admission);
    expect(await starting).toBe(false);
    const paused = deriveVoiceControls(h.binding.snapshot());
    expect(paused.status).toBe("Voice paused.");
    expect(paused.detail).toContain("Private practice is available");
    expect(action(paused, "resume").disabled).toBe(false);
    expect(action(paused, "start").disabled).toBe(true);
    expect(h.ports.acquireCapture).not.toHaveBeenCalled();
  });

  for (const muted of [true, false]) {
    it(`uses authoritative pending input for ${muted ? "Mute" : "Unmute"}, even without host metadata`, async () => {
      const h = await setup();
      await h.binding.start("a");
      if (!muted) await h.binding.setMuted(true);
      const waiting = deferred<void>();
      h.capture.setMuted.mockReturnValueOnce(waiting.promise);
      const changing = h.binding.setMuted(muted);
      const view = deriveVoiceControls(h.binding.snapshot());
      expect(h.binding.snapshot().inputChangePending).toBe(true);
      expect(view.status).toBe("Changing microphone input…");
      expect(view.detail).toContain("not confirmed");
      expect(view.status).not.toContain("input muted");
      expect(view.actions.find((item) => ["mute", "unmute"].includes(item.action))?.disabled).toBe(
        true,
      );
      for (const name of ["stop-answer", "pause", "finish-talking", "type-instead"] as const)
        expect(action(view, name).disabled).toBe(false);
      noPrivateAssurance(view);
      waiting.resolve();
      expect(await changing).toBe(true);
      const settled = deriveVoiceControls(h.binding.snapshot());
      expect(settled.status).toBe(muted ? "Voice active · input muted." : "Voice active.");
      expect(action(settled, muted ? "unmute" : "mute").disabled).toBe(false);
      expect(action(settled, "start").disabled).toBe(true);
    });
  }

  it("does not reconstruct closure from closed resource handles while an input operation is unresolved", async () => {
    const h = await setup();
    await h.binding.start("a");
    const waiting = deferred<void>();
    h.capture.setMuted.mockReturnValueOnce(waiting.promise);
    const changing = h.binding.setMuted(true);
    await h.binding.pause();
    const snapshot = h.binding.snapshot();
    expect(Object.values(snapshot.resources).every((state) => state === "closed")).toBe(true);
    expect(snapshot.inputChangePending).toBe(true);
    expect(snapshot.cleanupComplete).toBe(false);
    const view = deriveVoiceControls(snapshot);
    expect(view.status).toBe("Closing voice…");
    expect(action(view, "start").disabled).toBe(true);
    noPrivateAssurance(view);
    waiting.resolve();
    await changing;
    expect(deriveVoiceControls(h.binding.snapshot()).status).toBe("Voice paused.");
  });

  it("offers explicit Retry after failed resource close and keeps uncertainty visible during retry", async () => {
    const h = await setup();
    await h.binding.start("a");
    h.capture.close.mockRejectedValueOnce(new Error("fictional-close-failure"));
    await h.binding.pause();
    const failed = deriveVoiceControls(h.binding.snapshot());
    expect(failed.status).toBe("Voice shutdown is unconfirmed.");
    expect(action(failed, "retry-shutdown").disabled).toBe(false);
    expect(action(failed, "start").disabled).toBe(true);
    noPrivateAssurance(failed);
    const waiting = deferred<void>();
    h.capture.close.mockReturnValueOnce(waiting.promise);
    const retry = h.binding.retryShutdown();
    const retrying = deriveVoiceControls(h.binding.snapshot(), ["retry-shutdown"]);
    expect(retrying.status).toBe("Retrying shutdown…");
    expect(action(retrying, "retry-shutdown").disabled).toBe(true);
    noPrivateAssurance(retrying);
    waiting.resolve();
    await retry;
    const recovered = deriveVoiceControls(h.binding.snapshot());
    expect(recovered.status).toBe("Voice paused.");
    expect(recovered.actions.some((item) => item.action === "retry-shutdown")).toBe(false);
  });

  it("does not offer another Stop or Resume when cancellation failed despite every handle closing", async () => {
    const h = await setup();
    await h.binding.start("a");
    vi.spyOn(h.service, "cancelThread").mockImplementationOnce(() => {
      throw new Error("fictional-cancellation-failure");
    });
    await h.binding.pause();
    const snapshot = h.binding.snapshot();
    expect(Object.values(snapshot.resources).every((state) => state === "closed")).toBe(true);
    expect(snapshot.cancellationUnconfirmed).toBe(true);
    const failed = deriveVoiceControls(snapshot);
    expect(failed.status).toBe("Work cancellation is unconfirmed.");
    expect(action(failed, "stop-answer").disabled).toBe(true);
    expect(action(failed, "retry-shutdown").disabled).toBe(false);
    expect(action(failed, "start").disabled).toBe(true);
    noPrivateAssurance(failed);
    await h.binding.retryShutdown();
    expect(deriveVoiceControls(h.binding.snapshot()).status).toBe("Voice paused.");
  });

  it("keeps selected typed Stop usable after switching away from the retained closed voice attempt", async () => {
    const h = await setup();
    await h.binding.start("a");
    await h.binding.switchThread("b");
    const snapshot = h.binding.snapshot();
    expect(snapshot.threadId).not.toBe(snapshot.selectedThreadId);
    const view = deriveVoiceControls(snapshot);
    expect(view.status).toBe("Ready for voice.");
    expect(action(view, "start").disabled).toBe(false);
    expect(action(view, "stop-answer").disabled).toBe(false);
    expect(action(view, "pause").disabled).toBe(true);
    expect(view.actions.find((item) => ["mute", "unmute"].includes(item.action))?.disabled).toBe(
      true,
    );
    noPrivateAssurance(view);
  });

  it("only offers safe closure after external deletion and same-ID recreation", async () => {
    const h = await setup();
    await h.binding.start("a");
    h.service.deleteThread("a");
    h.service.ensureThread("a", true);
    const view = deriveVoiceControls(h.binding.snapshot());
    expect(view.status).toBe("Voice session needs to close.");
    for (const name of ["start", "resume", "stop-answer", "pause"] as const)
      expect(action(view, name).disabled).toBe(true);
    for (const name of ["finish-talking", "type-instead"] as const)
      expect(action(view, name).disabled).toBe(false);
    noPrivateAssurance(view);
    await h.binding.reconcile();
    const ended = deriveVoiceControls(h.binding.snapshot());
    expect(ended.status).toBe("Choose a conversation.");
    expect(action(ended, "start").disabled).toBe(true);
  });

  for (const kind of ["denied", "dismissed", "unavailable"] as const) {
    it(`distinguishes ${kind} setup with confirmed cleanup from uncertain shutdown`, async () => {
      const h = await setup();
      vi.mocked(h.ports.acquireCapture).mockResolvedValueOnce({
        kind,
      } satisfies VoiceCaptureResult);
      expect(await h.binding.start("a")).toBe(false);
      expect(h.binding.snapshot().cleanupComplete).toBe(true);
      const view = deriveVoiceControls(h.binding.snapshot());
      expect(view.status).toBe("Voice could not continue.");
      expect(view.detail).toContain(kind);
      expect(view.detail).toContain("Voice resources are closed.");
      expect(action(view, "start").disabled).toBe(false);
      expect(view.actions.some((item) => item.action === "retry-shutdown")).toBe(false);
      noPrivateAssurance(view);
    });
  }

  it("host promise metadata prevents duplicates without hiding confirmed closure or enabling acquisition", async () => {
    const h = await setup();
    await h.binding.start("a");
    await h.binding.typeInstead();
    const pending = deriveVoiceControls(h.binding.snapshot(), ["type-instead"]);
    expect(pending.status).toBe("Voice session closed.");
    expect(action(pending, "type-instead").disabled).toBe(true);
    expect(action(pending, "start").disabled).toBe(true);
    expect(action(pending, "stop-answer").disabled).toBe(false);
    const settled = deriveVoiceControls(h.binding.snapshot());
    expect(settled.status).toBe("Voice finished.");
    expect(action(settled, "start").disabled).toBe(false);
    expect(action(settled, "stop-answer").disabled).toBe(false);
  });

  it("explains an input failure after successful cleanup instead of presenting an ordinary Finish", async () => {
    const h = await setup();
    await h.binding.start("a");
    h.capture.setMuted.mockRejectedValueOnce(new Error("fictional-input-failure"));
    expect(await h.binding.setMuted(true)).toBe(false);
    expect(h.binding.snapshot().state).toBe("ended");
    expect(h.binding.snapshot().cleanupComplete).toBe(true);
    const view = deriveVoiceControls(h.binding.snapshot());
    expect(view.status).toBe("Voice could not continue.");
    expect(view.detail).toContain("Voice resources are closed.");
    expect(view.detail).not.toContain("mute-state-unconfirmed");
    expect(action(view, "start").disabled).toBe(false);
    expect(view.actions.some((item) => item.action === "retry-shutdown")).toBe(false);
  });

  it("never enables acquisition while a resource is unknown even if closure metadata conflicts", async () => {
    const h = await setup();
    await h.binding.start("a");
    await h.binding.finishTalking();
    const snapshot = h.binding.snapshot();
    const view = deriveVoiceControls({
      ...snapshot,
      resources: { ...snapshot.resources, capture: "unknown" },
    });
    expect(view.status).toBe("Voice shutdown is unconfirmed.");
    expect(action(view, "start").disabled).toBe(true);
    expect(action(view, "retry-shutdown").disabled).toBe(false);
    noPrivateAssurance(view);
  });

  it("does not call Stop a closed voice session while playback cancellation is pending", async () => {
    const h = await setup();
    await h.binding.start("a");
    const waiting = deferred<void>();
    h.playback.stop.mockReturnValueOnce(waiting.promise);
    const stopping = h.binding.stopAnswer();
    const view = deriveVoiceControls(h.binding.snapshot(), ["stop-answer"]);
    expect(view.status).toBe("Stopping answer…");
    expect(view.detail).toContain("Voice remains connected");
    expect(action(view, "stop-answer").disabled).toBe(true);
    expect(action(view, "mute").disabled).toBe(false);
    expect(action(view, "pause").disabled).toBe(false);
    expect(action(view, "finish-talking").disabled).toBe(false);
    noPrivateAssurance(view);
    expect(await h.binding.setMuted(true)).toBe(true);
    expect(h.ports.acquireCapture).toHaveBeenCalledTimes(1);
    expect(h.ports.connect).toHaveBeenCalledTimes(1);
    expect(
      action(deriveVoiceControls(h.binding.snapshot(), ["stop-answer"]), "unmute").disabled,
    ).toBe(false);
    waiting.resolve();
    expect(await stopping).toBe(true);
    expect(deriveVoiceControls(h.binding.snapshot()).status).toBe("Voice active · input muted.");
  });

  it("requires every authority signal for private-practice assurance and Resume", async () => {
    const h = await setup();
    await h.binding.start("a");
    await h.binding.pause();
    const paused = h.binding.snapshot();
    const changes: Partial<VoiceControlsSnapshot>[] = [
      { cleanupComplete: false },
      { cancellationUnconfirmed: true },
      { inputChangePending: true },
      { acquisitionPending: true },
      { privatePracticeAvailable: false },
      { threadCurrent: false },
      { selectedThreadId: "unrelated-current-thread" },
    ];
    for (const change of changes) noPrivateAssurance(deriveVoiceControls({ ...paused, ...change }));
  });

  it("keeps accessible labels distinct and input button identity stable in the view", async () => {
    const h = await setup();
    await h.binding.start("a");
    const before = deriveVoiceControls(h.binding.snapshot());
    expect(new Set(before.actions.map((item) => item.label)).size).toBe(before.actions.length);
    expect(action(before, "mute").label).toBe("Mute");
    const pending = deriveVoiceControls(h.binding.snapshot(), ["mute"]);
    expect(action(pending, "mute").label).toBe("Mute");
    expect(action(pending, "mute").disabled).toBe(true);
    await h.binding.setMuted(true);
    expect(action(deriveVoiceControls(h.binding.snapshot()), "unmute").label).toBe("Unmute");
  });
});
