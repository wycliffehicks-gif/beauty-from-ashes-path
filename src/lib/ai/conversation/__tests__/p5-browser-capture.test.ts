import { describe, expect, it, vi } from "vitest";
import { createBrowserCapturePort, type BrowserVoiceCapture } from "../service/browser-capture";
import type { VoiceAttempt, VoiceCaptureResult } from "../service/voice-lifecycle";

function attempt(signal = new AbortController().signal): VoiceAttempt {
  return { threadId: "fictional-thread", generation: 1, signal };
}
function track(kind = "audio") {
  const state = { enabled: true, readyState: "live" as MediaStreamTrackState, failStop: false };
  const stop = vi.fn(() => {
    if (state.failStop) throw new Error("device-specific detail");
    state.readyState = "ended";
  });
  return {
    state,
    stop,
    value: {
      kind,
      get enabled() {
        return state.enabled;
      },
      set enabled(v: boolean) {
        state.enabled = v;
      },
      get readyState() {
        return state.readyState;
      },
      stop,
    } as unknown as MediaStreamTrack,
  };
}
function stream(tracks: MediaStreamTrack[]) {
  return { getTracks: () => tracks } as MediaStream;
}
function capture(result: VoiceCaptureResult): BrowserVoiceCapture {
  if (!result.capture) throw new Error("expected owned capture");
  return result.capture as BrowserVoiceCapture;
}
function environment(value: MediaStream) {
  const getUserMedia = vi.fn(async () => value);
  return { isSecureContext: true, mediaDevices: { getUserMedia }, getUserMedia };
}

describe("P5 browser capture adapter with fake media only", () => {
  it("does not request devices until invoked, then requests audio without video", async () => {
    const audio = track();
    const env = environment(stream([audio.value]));
    const acquire = createBrowserCapturePort(env);
    expect(env.getUserMedia).not.toHaveBeenCalled();
    const result = await acquire(attempt());
    expect(env.getUserMedia).toHaveBeenCalledExactlyOnceWith({ audio: true, video: false });
    expect(result.kind).toBe("granted");
    expect(audio.state.enabled).toBe(false);
  });

  it("rejects insecure, missing-device and already-aborted starts without a prompt", async () => {
    const env = environment(stream([track().value]));
    expect(await createBrowserCapturePort({ ...env, isSecureContext: false })(attempt())).toEqual({
      kind: "unavailable",
    });
    expect(await createBrowserCapturePort({ isSecureContext: true })(attempt())).toEqual({
      kind: "unavailable",
    });
    const abort = new AbortController();
    abort.abort();
    expect(await createBrowserCapturePort(env)(attempt(abort.signal))).toEqual({
      kind: "unavailable",
    });
    expect(env.getUserMedia).not.toHaveBeenCalled();
  });

  it("mute suppresses input without stopping tracks; close stops every owned track", async () => {
    const audio = track();
    const video = track("video");
    const owned = capture(
      await createBrowserCapturePort(environment(stream([audio.value, video.value])))(attempt()),
    );
    await owned.setMuted(false);
    expect(audio.state.enabled).toBe(true);
    expect(video.state.enabled).toBe(false);
    await owned.setMuted(true);
    expect(audio.state.enabled).toBe(false);
    expect(audio.stop).not.toHaveBeenCalled();
    await owned.close();
    expect(audio.stop).toHaveBeenCalledOnce();
    expect(video.stop).toHaveBeenCalledOnce();
    await expect(owned.setMuted(false)).rejects.toThrow("capture-closed");
  });

  it("keeps a permission request pending after abort and returns its late stream for cleanup", async () => {
    let resolve!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((r) => {
          resolve = r;
        }),
    );
    const abort = new AbortController();
    let settled = false;
    const pending = createBrowserCapturePort({
      isSecureContext: true,
      mediaDevices: { getUserMedia },
    })(attempt(abort.signal));
    pending.then(() => {
      settled = true;
    });
    abort.abort();
    await Promise.resolve();
    expect(settled).toBe(false);
    const audio = track();
    resolve(stream([audio.value]));
    const owned = capture(await pending);
    expect(audio.state.enabled).toBe(false);
    await owned.close();
    expect(audio.state.readyState).toBe("ended");
  });

  it.each(["NotAllowedError", "SecurityError"])(
    "reports %s without retaining browser error details",
    async (name) => {
      const getUserMedia = vi.fn(async () => {
        throw { name, message: "private device identifier" };
      });
      expect(
        await createBrowserCapturePort({ isSecureContext: true, mediaDevices: { getUserMedia } })(
          attempt(),
        ),
      ).toEqual({ kind: "denied" });
    },
  );

  it.each(["NotFoundError", "NotReadableError", "AbortError"])(
    "reports %s as unavailable without retry",
    async (name) => {
      const getUserMedia = vi.fn(async () => {
        throw { name };
      });
      expect(
        await createBrowserCapturePort({ isSecureContext: true, mediaDevices: { getUserMedia } })(
          attempt(),
        ),
      ).toEqual({ kind: "unavailable" });
      expect(getUserMedia).toHaveBeenCalledOnce();
    },
  );

  it("retains an unusable stream for lifecycle cleanup instead of losing ownership", async () => {
    const video = track("video");
    const result = await createBrowserCapturePort(environment(stream([video.value])))(attempt());
    expect(result.kind).toBe("unavailable");
    await capture(result).close();
    expect(video.state.readyState).toBe("ended");
  });

  it("retains streams when initial input suppression fails", async () => {
    const audio = track();
    Object.defineProperty(audio.value, "enabled", {
      get: () => true,
      set: () => {
        throw new Error("failed");
      },
    });
    const result = await createBrowserCapturePort(environment(stream([audio.value])))(attempt());
    expect(result.kind).toBe("unavailable");
    await capture(result).close();
    expect(audio.state.readyState).toBe("ended");
  });

  it("attempts every stop after a failure and permits explicit cleanup retry", async () => {
    const first = track();
    const second = track();
    first.state.failStop = true;
    const owned = capture(
      await createBrowserCapturePort(environment(stream([first.value, second.value])))(attempt()),
    );
    await expect(owned.close()).rejects.toThrow("capture-shutdown-unconfirmed");
    expect(second.state.readyState).toBe("ended");
    first.state.failStop = false;
    await owned.close();
    expect(first.state.readyState).toBe("ended");
  });

  it("does not confirm shutdown merely because stop returned", async () => {
    const audio = track();
    audio.stop.mockImplementation(() => {});
    const owned = capture(
      await createBrowserCapturePort(environment(stream([audio.value])))(attempt()),
    );
    await expect(owned.close()).rejects.toThrow("capture-shutdown-unconfirmed");
  });

  it("stops tracks added to the owned stream after acquisition", async () => {
    const first = track();
    const tracks = [first.value];
    const owned = capture(await createBrowserCapturePort(environment(stream(tracks)))(attempt()));
    const extra = track();
    tracks.push(extra.value);
    await owned.close();
    expect(extra.state.readyState).toBe("ended");
  });

  it("refuses to unmute an ended microphone track", async () => {
    const audio = track();
    const owned = capture(
      await createBrowserCapturePort(environment(stream([audio.value])))(attempt()),
    );
    audio.state.readyState = "ended";
    await expect(owned.setMuted(false)).rejects.toThrow("capture-unavailable");
  });

  it("stops original tracks even after removal from the public stream", async () => {
    const audio = track();
    const tracks = [audio.value];
    const owned = capture(await createBrowserCapturePort(environment(stream(tracks)))(attempt()));
    await owned.setMuted(false);
    tracks.splice(0);
    await owned.close();
    expect(audio.state.readyState).toBe("ended");
  });

  it("retains removed failed-stop handles across cleanup retries", async () => {
    const audio = track();
    const tracks = [audio.value];
    audio.state.failStop = true;
    const owned = capture(await createBrowserCapturePort(environment(stream(tracks)))(attempt()));
    tracks.splice(0);
    await expect(owned.close()).rejects.toThrow("capture-shutdown-unconfirmed");
    audio.state.failStop = false;
    await owned.close();
    expect(audio.state.readyState).toBe("ended");
  });

  it("suppresses removed original tracks while enabling the current microphone", async () => {
    const first = track();
    const tracks = [first.value];
    const owned = capture(await createBrowserCapturePort(environment(stream(tracks)))(attempt()));
    await owned.setMuted(false);
    const next = track();
    tracks.splice(0, 1, next.value);
    await owned.setMuted(false);
    expect(first.state.enabled).toBe(false);
    expect(next.state.enabled).toBe(true);
    await owned.close();
    expect(first.state.readyState).toBe("ended");
    expect(next.state.readyState).toBe("ended");
  });
});
