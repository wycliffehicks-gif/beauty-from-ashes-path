// Inactive presentation only. This module imports no service implementation,
// acquires no resources and never authorizes a voice or provider session.
import type { ConversationVoiceBinding } from "./voice-service-binding";

export type VoiceControlsSnapshot = ReturnType<ConversationVoiceBinding["snapshot"]>;
export type VoiceControlAction =
  | "start"
  | "mute"
  | "unmute"
  | "stop-answer"
  | "pause"
  | "resume"
  | "finish-talking"
  | "type-instead"
  | "retry-shutdown";

export interface VoiceControl {
  readonly action: VoiceControlAction;
  readonly label: string;
  readonly disabled: boolean;
  readonly pending: boolean;
}

export interface VoiceControlsView {
  readonly status: string;
  readonly detail: string;
  readonly tone: "neutral" | "warning";
  readonly actions: readonly VoiceControl[];
}

/** Derive display from the latest coordinator snapshot. The host publishes a
 * snapshot immediately after invoking an action and again when it settles.
 * pendingActions describes host promises only; it never confirms input state,
 * cancellation or resource closure. In particular, the host must not replace
 * inputChangePending or cleanupComplete with a button's loading state.
 */
export function deriveVoiceControls(
  snapshot: VoiceControlsSnapshot,
  pendingActions: readonly VoiceControlAction[] = [],
): VoiceControlsView {
  const pending = new Set(pendingActions);
  const selected =
    snapshot.threadCurrent && snapshot.storeId !== null && snapshot.selectedThreadId !== null;
  const ownsAttempt = selected && snapshot.threadId === snapshot.selectedThreadId;
  const unknownResource = Object.values(snapshot.resources).includes("unknown");
  const closed =
    snapshot.cleanupComplete &&
    !unknownResource &&
    !snapshot.acquisitionPending &&
    !snapshot.inputChangePending &&
    !snapshot.cancellationUnconfirmed;
  const needsRetry =
    snapshot.cancellationUnconfirmed || unknownResource || (snapshot.state === "failed" && !closed);
  const closing =
    snapshot.state === "stopping" ||
    pending.has("pause") ||
    pending.has("finish-talking") ||
    pending.has("type-instead");
  const changingInput = snapshot.inputChangePending || pending.has("mute") || pending.has("unmute");
  const active = ownsAttempt && snapshot.state === "active" && !needsRetry && !closing;
  const paused =
    ownsAttempt && snapshot.state === "paused" && closed && snapshot.privatePracticeAvailable;
  const noPendingAction = pending.size === 0;
  const canStart =
    selected && closed && ["idle", "ended", "failed"].includes(snapshot.state) && noPendingAction;

  function control(action: VoiceControlAction, label: string, enabled: boolean): VoiceControl {
    return {
      action,
      label,
      disabled: !enabled || pending.has(action),
      pending: pending.has(action),
    };
  }

  // Keep the main controls mounted as their availability changes, so a host
  // does not replace the whole button group during asynchronous operations.
  const muteAction = pending.has("mute")
    ? "mute"
    : pending.has("unmute")
      ? "unmute"
      : snapshot.muted
        ? "unmute"
        : "mute";
  const actions = [
    control("start", "Start voice", canStart),
    control(muteAction, muteAction === "mute" ? "Mute" : "Unmute", active && !changingInput),
    // Stop also fences selected typed work before or after a voice session.
    control(
      "stop-answer",
      "Stop answer",
      selected && !snapshot.cancellationUnconfirmed && !pending.has("retry-shutdown"),
    ),
    control(
      "pause",
      "Pause voice",
      ownsAttempt && ["starting", "active"].includes(snapshot.state) && !needsRetry && !closing,
    ),
    control("resume", "Resume voice", paused && noPendingAction),
    control(
      "finish-talking",
      "Finish talking",
      !closed ||
        snapshot.state === "paused" ||
        (ownsAttempt && ["active", "starting"].includes(snapshot.state)),
    ),
    control("type-instead", "Type instead", selected || !closed),
  ];
  if (needsRetry || pending.has("retry-shutdown"))
    actions.push(control("retry-shutdown", "Retry shutdown", !pending.has("retry-shutdown")));

  let status: string;
  let detail: string;
  let tone: VoiceControlsView["tone"] = "neutral";
  if (snapshot.cancellationUnconfirmed) {
    status = pending.has("retry-shutdown")
      ? "Retrying shutdown…"
      : "Work cancellation is unconfirmed.";
    detail =
      "Pending work may still complete. Voice is unavailable until cancellation and shutdown are confirmed. Use Retry shutdown.";
    tone = "warning";
  } else if (needsRetry || pending.has("retry-shutdown")) {
    status = pending.has("retry-shutdown")
      ? "Retrying shutdown…"
      : "Voice shutdown is unconfirmed.";
    detail =
      "Do not practice privately yet. Use Retry shutdown to try closing the remaining voice resources.";
    tone = "warning";
  } else if (closing && !closed) {
    status = "Closing voice…";
    detail = snapshot.acquisitionPending
      ? "Setup is still pending. Shutdown must be confirmed before private practice or another voice session."
      : "A voice operation is still pending. Shutdown must be confirmed before private practice or another voice session.";
    tone = "warning";
  } else if (!ownsAttempt && !closed && snapshot.state !== "idle") {
    status = "Voice session needs to close.";
    detail =
      "The open voice session is not attached to the current conversation. Finish talking or type instead to close it.";
    tone = "warning";
  } else if (snapshot.state === "starting" || pending.has("start") || pending.has("resume")) {
    status = "Starting voice…";
    detail = "Setup is still pending. You can pause, finish talking or type instead.";
  } else if (changingInput) {
    status = "Changing microphone input…";
    detail =
      "The input change is not confirmed. You can still stop an answer, pause, finish talking or type instead.";
  } else if (closing) {
    status = "Voice session closed.";
    detail = "Finishing your request. Controls update when it completes.";
  } else if (pending.has("stop-answer")) {
    status = "Stopping answer…";
    detail = closed
      ? "Waiting for the stop request to finish."
      : "Voice remains connected. Pause voice or Finish talking closes the session.";
  } else if (active) {
    status = snapshot.muted ? "Voice active · input muted." : "Voice active.";
    detail = snapshot.muted
      ? "Input is muted; the voice session remains connected. Pause voice closes the session."
      : "Mute changes microphone input. Stop answer cancels the current answer. Pause voice closes the session.";
  } else if (paused && noPendingAction) {
    status = "Voice paused.";
    detail =
      "Voice session closed. Private practice is available. Resume voice starts a new session.";
  } else if (!closed) {
    status = "Voice state is unconfirmed.";
    detail =
      "Finish talking or type instead to request shutdown. Wait for confirmation before private practice.";
    tone = "warning";
  } else if (!selected) {
    status = "Choose a conversation.";
    detail = "No current conversation is selected for voice.";
  } else if (snapshot.state === "failed" || snapshot.error !== null) {
    status = "Voice could not continue.";
    const reason =
      snapshot.error === "microphone-denied"
        ? "Microphone permission was denied."
        : snapshot.error === "microphone-dismissed"
          ? "Microphone permission was dismissed."
          : snapshot.error === "microphone-unavailable"
            ? "Microphone input was unavailable."
            : "Voice setup or input could not be confirmed.";
    detail = `${reason} Voice resources are closed. You can try Start voice again or type instead.`;
  } else if (snapshot.state === "ended" && ownsAttempt) {
    status = "Voice finished.";
    detail = "Voice session closed. You can start voice again or continue typing.";
  } else if (snapshot.state === "paused") {
    status = "Voice is not ready to resume.";
    detail = "Finish talking or type instead before starting another voice session.";
  } else {
    status = "Ready for voice.";
    detail = "Start voice when you are ready, or continue typing.";
  }

  return { status, detail, tone, actions };
}
