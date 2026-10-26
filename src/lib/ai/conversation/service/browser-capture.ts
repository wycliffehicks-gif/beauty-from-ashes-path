// P5 preparation only. Nothing acquires a device on import or construction.
// The caller must invoke acquisition from a deliberate, admitted voice start.
// No recording, storage, transcription, transport or provider calls occur here.
import type { VoiceAttempt, VoiceCapture, VoiceCaptureResult } from "./voice-lifecycle";

export interface BrowserVoiceCapture extends VoiceCapture {
  /** Owned by this attempt; future transport wiring must not clone its tracks. */
  readonly stream: MediaStream;
}

export interface BrowserCaptureEnvironment {
  readonly isSecureContext: boolean;
  readonly mediaDevices?: Pick<MediaDevices, "getUserMedia">;
}

/** Closure means this stream's tracks ended, not that other tabs/devices stopped.
 * W3C Media Capture and Streams: https://www.w3.org/TR/mediacapture-streams/
 * Disabling input is distinct from stopping tracks. stop() synchronously sets
 * readyState to ended; its success does not require an 'ended' event. */
function captureFor(stream: MediaStream): BrowserVoiceCapture {
  let closed = false;
  // Removing a track from a MediaStream does not stop the underlying track.
  // Keep every owned handle even if a future transport removes it from the stream.
  const ownedTracks = new Set(stream.getTracks());
  const currentTracks = () => {
    const current = new Set(stream.getTracks());
    for (const track of current) ownedTracks.add(track);
    return current;
  };
  return {
    stream,
    async setMuted(muted) {
      if (closed) throw new Error("capture-closed");
      const current = currentTracks();
      const tracks = [...current];
      const audio = tracks.filter((track) => track.kind === "audio");
      const available = audio.length > 0 && audio.every((track) => track.readyState === "live");
      let failed = false;
      for (const track of ownedTracks) {
        const enabled = available && current.has(track) && track.kind === "audio" && !muted;
        try {
          track.enabled = enabled;
          if (track.enabled !== enabled) failed = true;
        } catch {
          failed = true;
        }
      }
      if (!available) throw new Error("capture-unavailable");
      if (failed) throw new Error("capture-input-state-unconfirmed");
    },
    async close() {
      // Retain failed handles: the controller may explicitly retry shutdown.
      let failed = false;
      currentTracks();
      for (const track of ownedTracks) {
        try {
          track.enabled = false;
        } catch {
          /* Still attempt actual stop. */
        }
        try {
          track.stop();
        } catch {
          failed = true;
        }
        if (track.readyState !== "ended") failed = true;
      }
      if (failed) throw new Error("capture-shutdown-unconfirmed");
      closed = true;
    },
  };
}

/** Explicit environment injection keeps SSR/imports inert and tests offline.
 * Do not race getUserMedia against abort/timeout: the browser permission prompt
 * can remain pending. Returning early would lose a stream granted later.
 * The lifecycle controller waits for the result and closes stale acquisitions. */
export function createBrowserCapturePort(environment: BrowserCaptureEnvironment) {
  return async (attempt: VoiceAttempt): Promise<VoiceCaptureResult> => {
    if (attempt.signal.aborted || !environment.isSecureContext || !environment.mediaDevices) {
      return { kind: "unavailable" };
    }
    let stream: MediaStream;
    try {
      stream = await environment.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (error) {
      const name = error && typeof error === "object" && "name" in error ? error.name : "";
      // Browsers do not reliably distinguish a dismissed prompt from denial.
      return {
        kind: name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable",
      };
    }
    const capture = captureFor(stream);
    try {
      await capture.setMuted(true);
      return { kind: "granted", capture };
    } catch {
      // Even a malformed/ended stream remains owned until cleanup confirms it.
      return { kind: "unavailable", capture };
    }
  };
}
