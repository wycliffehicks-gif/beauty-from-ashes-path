// Conversation preview — S1–S8 screens with a deterministic fake service.
//
// DEVELOPER PREVIEW ONLY. Fictional responses, session-only simulated
// saving, no AI or microphone connection. Unlinked from participant
// navigation. See docs/pilot/conversation/p2-preview-checkpoint.md.

import { useState } from "react";
import { Link } from "@tanstack/react-router";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { getJourneyDayById } from "@/content/journey";
import {
  hasMeaningfulProgress,
  useJourneyProgress,
} from "@/lib/journey/progress";
import { CONVERSATION_TEACHING_RECORDS } from "@/lib/ai/conversation/content/teaching";
import {
  useConversationPreview,
  type ConversationPreviewStore,
  type PreviewMessage,
  type PreviewState,
  type PreviewThread,
} from "@/lib/ai/conversation/preview/store";

export function ConversationPreview() {
  const { state, store } = useConversationPreview();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6">
      <p
        role="status"
        className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-center text-sm font-medium text-foreground"
      >
        Developer preview · fictional responses · session-only simulated saving
      </p>
      {!state.hydrated ? null : !state.introAcknowledged ? (
        <IntroScreen onContinue={() => store.acknowledgeIntro()} />
      ) : state.activeThreadId ? (
        <ThreadScreen state={state} store={store} />
      ) : (
        <StartScreen state={state} store={store} />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// S1 — first-entry introduction

function IntroScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <section aria-labelledby="preview-intro-heading" className="space-y-4">
      <h1 id="preview-intro-heading" className="font-serif text-2xl">
        Conversation preview — please read first
      </h1>
      <div className="space-y-3 text-foreground">
        <p>
          This is a developer preview of a possible conversation feature. It is
          not connected to any AI service, and nothing here understands what
          you write — replies are pre-written fictional examples.
        </p>
        <p>
          There is no microphone or audio connection. The voice controls only
          demonstrate the states a real feature would show.
        </p>
        <p>
          Saving is simulated and session-only: everything you do here
          disappears when you refresh or close this page. Please use fictional
          test text only — do not write anything genuinely personal or
          sensitive here.
        </p>
        <p>
          Your journey, your answers and your private writing are not part of
          this preview and are not changed by it.
        </p>
      </div>
      <Button type="button" onClick={onContinue} className="w-full sm:w-auto">
        Continue
      </Button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// S1/S6 — start screen: continue journey, saved list, new conversation

function StartScreen({
  state,
  store,
}: {
  state: PreviewState;
  store: ConversationPreviewStore;
}) {
  const { progress } = useJourneyProgress();
  const locator = hasMeaningfulProgress(progress) ? progress.locator : null;
  const resumeDay = locator ? getJourneyDayById(locator.dayId) : null;
  const saved = state.threads.filter((t) => t.savedSnapshot !== null);

  return (
    <section aria-labelledby="preview-start-heading" className="space-y-6">
      <h1 id="preview-start-heading" className="font-serif text-2xl">
        Conversation preview
      </h1>

      {resumeDay ? (
        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Your journey: Day {resumeDay.day} · {resumeDay.title} —{" "}
            {progress.completedDays.includes(resumeDay.id)
              ? "completed"
              : "in progress"}
          </p>
          <Link
            to="/day/$day"
            params={{ day: String(resumeDay.day) }}
            search={{ resume: true }}
            className="mt-2 inline-block font-medium text-primary underline"
          >
            Continue your journey
          </Link>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          You have not started the journey yet in this browser.
        </p>
      )}

      <Button
        type="button"
        onClick={() => store.requestSwitch({ kind: "new" })}
        className="w-full sm:w-auto"
      >
        Start conversation
      </Button>

      {saved.length > 0 ? (
        <div className="space-y-3">
          <h2 className="font-serif text-lg">Saved conversations (this session only)</h2>
          <ul className="space-y-3">
            {saved.map((thread) => (
              <SavedRow key={thread.id} thread={thread} store={store} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function SavedRow({
  thread,
  store,
}: {
  thread: PreviewThread;
  store: ConversationPreviewStore;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(thread.title);
  const [renameError, setRenameError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li className="rounded-md border border-border bg-card p-3">
      {renaming ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const result = store.renameThread(thread.id, name);
            if (result.ok) {
              setRenaming(false);
              setRenameError(false);
            } else {
              setRenameError(true);
            }
          }}
        >
          <label className="sr-only" htmlFor={`rename-${thread.id}`}>Rename conversation</label>
          <input
            id={`rename-${thread.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
          <Button type="submit" size="sm">Save name</Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setRenaming(false);
              setName(thread.title);
              setRenameError(false);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <p className="font-medium text-foreground">{thread.title}</p>
      )}
      {renameError ? (
        <p role="alert" className="mt-1 text-sm text-destructive">
          Name not saved (simulated failure). Nothing changed.
        </p>
      ) : null}
      <p className="mt-1 text-sm text-muted-foreground">
        {thread.savedSnapshot!.messages.length} messages
        {thread.savedAt
          ? ` · saved ${new Date(thread.savedAt).toLocaleTimeString()}`
          : ""}
        {thread.dirty ? " · has unsaved changes" : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => store.requestSwitch({ kind: "open", threadId: thread.id })}
        >
          Open
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setName(thread.title);
            setRenaming(true);
          }}
        >
          Rename
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setConfirmDelete(true)}
        >
          Delete
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this saved conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              “{thread.title}” and its simulated saved copy will be removed from
              this session. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => store.deleteThread(thread.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

// ---------------------------------------------------------------------------
// S2–S5, S7–S8 — active thread screen

function ThreadScreen({
  state,
  store,
}: {
  state: PreviewState;
  store: ConversationPreviewStore;
}) {
  const thread = store.activeThread();
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  if (!thread) return null;

  const status = store.saveStatus(thread);
  const pending = store.hasPendingResponse(thread);
  const draft = store.activeDraft();
  const hasUnsentDraft = draft.trim().length > 0;

  const attemptSave = (): boolean => {
    const result = store.saveActiveThread();
    if (result.ok) {
      setSaveError(null);
      return true;
    }
    setSaveError(
      result.reason === "response-pending"
        ? "A response is still being generated. Stop it or wait, then save."
        : "Not saved (simulated failure). Nothing changed.",
    );
    return false;
  };

  const attemptFinish = (
    decision: "save" | "discard",
    event?: { preventDefault(): void },
  ) => {
    const result = store.finishActiveThread(decision, {
      discardDraft: hasUnsentDraft,
    });
    if (result.ok) {
      setFinishOpen(false);
      setFinishError(null);
      return;
    }
    // Keep the dialog open on failure (AlertDialogAction closes by default).
    event?.preventDefault();
    // Failed save / pending response: dialog, thread and draft all stay.
    setFinishError(
      result.reason === "response-pending"
        ? "A response is still being generated. Stop it or wait, then finish."
        : "Not saved (simulated failure). The conversation is still open.",
    );
  };

  const attemptSwitchSave = (event: { preventDefault(): void }) => {
    const result = store.resolveSwitchDecision("save");
    if (result.ok) {
      setSwitchError(null);
      return;
    }
    // Keep the dialog open on failure (AlertDialogAction closes by default);
    // the pending target, active thread and draft are all preserved.
    event.preventDefault();
    setSwitchError(
      result.reason === "unsent-draft"
        ? "Send or clear your unsent draft before saving and switching, or choose Discard & continue."
        : result.reason === "response-pending"
          ? "A response is still being generated. Stop it or wait, then save."
          : "Not saved (simulated failure). Nothing changed; you are still here.",
    );
  };

  const cancelSwitch = () => {
    store.resolveSwitchDecision("cancel");
    setSwitchError(null);
  };

  return (
    <section aria-labelledby="preview-thread-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 id="preview-thread-heading" className="font-serif text-2xl">
          {thread.title}
        </h1>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {status === "saved"
            ? "Saved"
            : status === "unsaved-changes"
              ? "Unsaved changes"
              : "Not saved"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setBrowsing((b) => !b)}
          aria-expanded={browsing}
        >
          All conversations
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => store.requestSwitch({ kind: "new" })}
        >
          New conversation
        </Button>
      </div>

      {browsing ? (
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-sm text-muted-foreground">
            Browsing does not change the current conversation. Opening another
            conversation with unsaved changes will ask you to Save, Discard or
            Cancel first.
          </p>
          <ul className="mt-2 space-y-2">
            {state.threads
              .filter((t) => t.savedSnapshot !== null && t.id !== thread.id)
              .map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground">{t.title}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const r = store.requestSwitch({ kind: "open", threadId: t.id });
                      if (r.ok) setBrowsing(false);
                    }}
                  >
                    Open
                  </Button>
                </li>
              ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => setBrowsing(false)}
          >
            Continue current conversation
          </Button>
        </div>
      ) : null}

      <PreferenceCard thread={thread} store={store} />
      <VoicePanel state={state} store={store} />

      <ol className="space-y-3" aria-label="Conversation so far">
        {thread.messages.map((m) => (
          <MessageRow key={m.id} message={m} store={store} />
        ))}
      </ol>

      <Composer store={store} pending={pending} />

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={attemptSave} disabled={pending}>
          {status === "not-saved" ? "Save conversation (simulated)" : "Save changes (simulated)"}
        </Button>
        <Button type="button" variant="outline" onClick={() => { setFinishError(null); setFinishOpen(true); }}>
          Finish conversation
        </Button>
      </div>
      {saveError ? (
        <p role="alert" className="text-sm text-destructive">{saveError}</p>
      ) : null}

      <TeachingShare store={store} />
      <ReviewControls state={state} store={store} />

      {/* Finish — AlertDialog: focus trapped, Escape cancels, focus restored. */}
      <AlertDialog open={finishOpen} onOpenChange={setFinishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finish this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasUnsentDraft
                ? "You have unsent text in the composer. Finishing discards that unsent text; only submitted messages can be saved. "
                : ""}
              {status === "not-saved"
                ? "This conversation has never been saved. Saving is simulated and lasts only for this session."
                : status === "unsaved-changes"
                  ? "There are unsaved changes. You can save them (simulated), discard them, or keep working."
                  : "Everything is saved (simulated, this session only)."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {finishError ? (
            <p role="alert" className="text-sm text-destructive">{finishError}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            {status !== "not-saved" ? (
              <AlertDialogAction onClick={(e) => attemptFinish("discard", e)}>
                {hasUnsentDraft ? "Discard unsent text and changes" : "Discard changes"}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction onClick={(e) => attemptFinish("discard", e)}>
                {hasUnsentDraft ? "Discard unsent text and close" : "Close without saving"}
              </AlertDialogAction>
            )}
            <AlertDialogAction onClick={(e) => attemptFinish("save", e)} disabled={pending}>
              Save & finish (simulated)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Switch decision — Save / Discard / Cancel before replacing. */}
      <AlertDialog
        open={state.pendingSwitch !== null}
        onOpenChange={(open) => {
          if (!open) store.resolveSwitchDecision("cancel");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasUnsentDraft
                ? "You have unsent text and possibly unsaved changes. "
                : "You have unsaved changes. "}
              Save them (simulated), discard them, or cancel and stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => store.resolveSwitchDecision("cancel")}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => store.resolveSwitchDecision("discard")}>
              Discard & continue
            </AlertDialogAction>
            <AlertDialogAction onClick={() => store.resolveSwitchDecision("save")} disabled={pending}>
              Save & continue (simulated)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function PreferenceCard({
  thread,
  store,
}: {
  thread: PreviewThread;
  store: ConversationPreviewStore;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3 text-sm">
      <p className="text-foreground">
        Christian reflection (preview only):{" "}
        <strong>{thread.spiritualOn ? "On" : "Off"}</strong>
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2"
        onClick={() => store.setPreviewSpiritual(!thread.spiritualOn)}
      >
        {thread.spiritualOn ? "Turn off for this preview" : "Turn on for this preview"}
      </Button>
      <p className="mt-2 text-muted-foreground">
        Imported once from your setting; changing it here does not change the
        app setting. Turning it off stops any reply being generated.
      </p>
    </div>
  );
}

function MessageRow({
  message,
  store,
}: {
  message: PreviewMessage;
  store: ConversationPreviewStore;
}) {
  const [showSource, setShowSource] = useState(false);
  const isPerson = message.role === "person";
  return (
    <li
      className={
        isPerson
          ? "rounded-md border border-border bg-card p-3"
          : "rounded-md border border-primary/40 bg-muted p-3"
      }
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {isPerson ? "You" : "Beauty from Ashes (fictional preview reply)"}
      </p>
      {message.status === "generating" ? (
        <p className="mt-1 text-sm text-muted-foreground" role="status">
          Writing a fictional reply…
        </p>
      ) : message.status === "stopped" ? (
        <p className="mt-1 text-sm text-muted-foreground">Reply stopped.</p>
      ) : message.status === "not-sent" ? (
        <div className="mt-1">
          <p className="text-sm text-foreground">{message.text}</p>
          <p role="alert" className="mt-1 text-sm text-destructive">
            Not sent (simulated failure). Your text is still in the composer.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => store.retryMessage(message.id)}
          >
            Retry send
          </Button>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-foreground">{message.text}</p>
      )}
      {message.sharedTeaching ? (
        <div className="mt-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowSource((s) => !s)}
            aria-expanded={showSource}
          >
            {showSource ? "Hide source details" : "Source details"}
          </Button>
          {showSource ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Exact teaching from Day {message.sharedTeaching.day} ·{" "}
              {message.sharedTeaching.title} (source key{" "}
              {message.sharedTeaching.sourceKey}). Shared bytes are an
              immutable snapshot; this is simulated behavior, not evidence of
              model grounding.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Composer({
  store,
  pending,
}: {
  store: ConversationPreviewStore;
  pending: boolean;
}) {
  const state = store.getSnapshot();
  const thread = store.activeThread();
  const draft = store.activeDraft();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        store.sendDraft();
      }}
    >
      <label htmlFor="preview-composer" className="block text-sm text-foreground">
        Your message (use fictional test text)
      </label>
      <textarea
        id="preview-composer"
        value={draft}
        onChange={(e) => store.setDraft(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground"
        placeholder="Type a fictional message…"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || draft.trim().length === 0}>
          Send
        </Button>
        {pending ? (
          <Button type="button" variant="outline" onClick={() => store.stopResponse()}>
            Stop response
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => store.startTalking()}
            disabled={state.voice !== "off" && state.voice !== "disconnected"}
          >
            Talk (simulated)
          </Button>
        )}
      </div>
      {pending ? (
        <p className="text-sm text-muted-foreground" role="status">
          A fictional reply is being written. Send and Save are paused until it
          finishes or you stop it.
        </p>
      ) : null}
      {thread && thread.messages.some((m) => m.status === "not-sent") ? null : null}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Voice state simulator (S4) — labelled simulation only, no real audio

function VoicePanel({
  state,
  store,
}: {
  state: PreviewState;
  store: ConversationPreviewStore;
}) {
  if (state.voice === "off") return null;
  const label =
    state.voice === "connecting"
      ? "Connecting"
      : state.voice === "listening"
        ? "Listening"
        : state.voice === "speaking"
          ? "Speaking"
          : state.voice === "paused"
            ? "Paused"
            : "Disconnected";
  return (
    <div className="rounded-md border border-border bg-card p-3" role="status">
      <h2 className="font-serif text-lg">Voice — state simulator only</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        No microphone, recording or audio connection exists in this preview.
        These controls only demonstrate the states the real feature would show.
      </p>
      <p className="mt-2 text-sm font-medium text-foreground">
        State: {label}
        {state.voiceMuted && state.voice !== "paused" ? " · muted" : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {state.voice === "listening" || state.voice === "speaking" ? (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => store.pauseVoice()}>
              Pause
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => store.setVoiceMuted(!state.voiceMuted)}
            >
              {state.voiceMuted ? "Unmute microphone (simulated)" : "Mute microphone (simulated)"}
            </Button>
          </>
        ) : null}
        {state.voice === "connecting" ? (
          <Button type="button" size="sm" variant="outline" onClick={() => store.pauseVoice()}>
            Pause
          </Button>
        ) : null}
        {state.voice === "paused" || state.voice === "disconnected" ? (
          <Button type="button" size="sm" variant="outline" onClick={() => store.resumeVoice()}>
            {state.voice === "paused" ? "Resume" : "Reconnect (simulated)"}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={() => store.finishTalking()}>
          Finish talking
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exact teaching sharing (P1 source records only)

function TeachingShare({ store }: { store: ConversationPreviewStore }) {
  const state = store.getSnapshot();
  const [picking, setPicking] = useState(false);
  const record = state.sharePreview;

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <h2 className="font-serif text-lg">Explore journey teaching in conversation</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Only a day’s exact Understand teaching can be shared. Your answers,
        notes and private writing are never included.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2"
        onClick={() => setPicking((p) => !p)}
        aria-expanded={picking}
      >
        Choose teaching to share
      </Button>
      {picking ? (
        <ul className="mt-2 space-y-1">
          {CONVERSATION_TEACHING_RECORDS.map((r) => (
            <li key={r.key}>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPicking(false);
                  store.previewShareTeaching(r.key);
                }}
              >
                Day {r.day} · {r.title}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Exact-share preview — AlertDialog: focus trapped, Escape = Cancel. */}
      <AlertDialog
        open={record !== null}
        onOpenChange={(open) => {
          if (!open) store.cancelShareTeaching();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Include this in the conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              {record
                ? `Day ${record.day} · ${record.title} — the exact teaching passage below, nothing else.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {record ? (
            <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-muted p-3">
              <p className="font-medium text-foreground">{record.understandHeading}</p>
              {record.understandBody.map((para, i) => (
                <p key={i} className="mt-2 text-sm text-foreground">{para}</p>
              ))}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => store.cancelShareTeaching()}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => store.confirmShareTeaching()}>
              Send selected content
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review controls — explicitly separated from participant controls

function ReviewControls({
  state,
  store,
}: {
  state: PreviewState;
  store: ConversationPreviewStore;
}) {
  return (
    <div className="rounded-md border border-dashed border-border p-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        Review controls — not part of the participant experience
      </h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => store.setSimulateSendFailure(!state.simulateSendFailure)}
        >
          Simulate send failure: {state.simulateSendFailure ? "on" : "off"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => store.setSimulateSaveFailure(!state.simulateSaveFailure)}
        >
          Simulate save failure: {state.simulateSaveFailure ? "on" : "off"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => store.simulateDisconnect()}
          disabled={state.voice === "off"}
        >
          Simulate voice disconnection
        </Button>
      </div>
    </div>
  );
}
