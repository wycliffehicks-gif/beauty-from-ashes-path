// Conversation preview — S1–S8 developer preview UI.
//
// Everything on this screen is SIMULATED: fictional deterministic responses,
// session-only in-memory saving, and a voice STATE SIMULATOR with no
// microphone, audio, speech or network connection of any kind. The persistent
// banner says so. This route is not linked from participant navigation.

import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";

import { getJourneyDayById } from "@/content/journey";
import { hasMeaningfulProgress, useJourneyProgress } from "@/lib/journey/progress";
import { CONVERSATION_TEACHING_RECORDS } from "@/lib/ai/conversation/content/teaching";
import {
  useConversationPreview,
  type PreviewMessage,
  type PreviewThread,
  type VoiceSimState,
} from "@/lib/ai/conversation/preview/store";

const VOICE_LABELS: Record<VoiceSimState, string> = {
  off: "Voice off",
  connecting: "Connecting",
  listening: "Listening",
  speaking: "Speaking",
  paused: "Paused",
  disconnected: "Disconnected",
};

export function ConversationPreview() {
  const { state, store } = useConversationPreview();
  const active = state.threads.find((t) => t.id === state.activeThreadId) ?? null;

  if (!state.hydrated) {
    return (
      <div className="container-page flex min-h-[60dvh] items-center justify-center" role="status">
        <p className="bfa-copy-support text-muted-foreground">One moment…</p>
      </div>
    );
  }

  return (
    <div className="journey-page">
      <div className="container-page flex min-h-[100dvh] flex-col">
        <header className="grid grid-cols-2 items-center gap-2 bfa-top-safe pb-2">
          <Link to="/" aria-label="Home — Your Journey" className="journey-chrome-btn journey-chrome-btn-labelled justify-self-start">
            <span className="min-w-0 [overflow-wrap:anywhere]">Home</span>
          </Link>
          <span aria-hidden />
        </header>

        <main className="flex-1 space-y-6 pb-10">
          <PreviewBanner />

          {!state.introAcknowledged ? (
            <IntroScreen store={store} draft={state.draft} />
          ) : active ? (
            <ThreadScreen store={store} state={state} thread={active} />
          ) : (
            <StartScreen store={store} state={state} />
          )}

          <ReviewControls store={store} state={state} />
        </main>
      </div>
    </div>
  );
}

type Store = ReturnType<typeof useConversationPreview>["store"];
type State = ReturnType<typeof useConversationPreview>["state"];

function PreviewBanner() {
  return (
    <p
      role="note"
      className="rounded-lg border border-[color:var(--bfa-interactive-gold)] bg-card px-4 py-2 text-center text-sm font-medium text-foreground"
    >
      Developer preview · fictional responses · session-only simulated saving
    </p>
  );
}

// ---------------------------------------------------------------------------
// S2 — one-time introduction (truthful about the CURRENT preview behavior)

function IntroScreen({ store, draft }: { store: Store; draft: string }) {
  return (
    <section aria-labelledby="conv-intro-heading" className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h1 id="conv-intro-heading" className="bfa-h2 font-serif text-foreground">
        Before the first message
      </h1>
      <div className="bfa-copy space-y-3 text-foreground">
        <p>
          This is a developer preview of a planned conversation feature. There is
          no AI service and no microphone connected: every reply is a fictional,
          pre-written response, and the voice controls only simulate states.
        </p>
        <p>
          Nothing here is permanently saved. Conversations you &ldquo;save&rdquo; and any
          unsaved draft disappear when you refresh or close this page. Please use
          fictional test text, not genuine personal writing.
        </p>
        <p>
          The real journey is untouched: this preview never changes your progress,
          your answers, or your private writing.
        </p>
      </div>
      {draft.trim().length > 0 && (
        <p className="bfa-copy-support text-muted-foreground">
          Your typed opening is kept in the composer until you choose Send.
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn-primary-journey flex-1" onClick={() => store.acknowledgeIntro()}>
          Continue
        </button>
        <Link to="/" className="btn-quiet flex-1 text-center">
          Return to Home
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// S1 — start

function StartScreen({ store, state }: { store: Store; state: State }) {
  const saved = state.threads.filter((t) => t.savedSnapshot !== null);
  return (
    <div className="space-y-6">
      <section aria-labelledby="conv-start-heading" className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h1 id="conv-start-heading" className="bfa-h1 font-serif text-foreground">
          What&rsquo;s on your mind?
        </h1>
        <p className="bfa-copy-support text-muted-foreground">
          Begin with a question, a feeling, or something you want to understand.
          Replies in this preview are fictional.
        </p>
        <Composer store={store} draft={state.draft} autoFocus={false} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="btn-primary-journey flex-1"
            onClick={() => {
              store.createThread();
            }}
          >
            Start conversation
          </button>
          <button
            type="button"
            className="btn-quiet flex-1"
            onClick={() => {
              store.createThread();
              store.startTalking();
            }}
          >
            Talk (simulated)
          </button>
        </div>
      </section>

      <JourneyContinueCard />

      <section aria-labelledby="conv-saved-heading" className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 id="conv-saved-heading" className="bfa-h3 font-serif text-foreground">
          Saved conversations
        </h2>
        {saved.length === 0 ? (
          <p className="bfa-copy-support text-muted-foreground">
            None yet. Simulated saves last only until you refresh or close this page.
          </p>
        ) : (
          <ul className="space-y-2">
            {saved.map((t) => (
              <SavedRow key={t.id} store={store} thread={t} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function JourneyContinueCard() {
  const { progress, hydrated } = useJourneyProgress();
  const resume = hydrated && hasMeaningfulProgress(progress) ? progress.locator : null;
  const resumeDay = resume ? getJourneyDayById(resume.dayId) : undefined;

  return (
    <section aria-labelledby="conv-journey-heading" className="space-y-3 rounded-xl border border-[color:var(--bfa-interactive-gold)] bg-card p-5">
      <h2 id="conv-journey-heading" className="bfa-h3 font-serif text-foreground">
        Continue your journey
      </h2>
      {resume && resumeDay ? (
        <>
          <p className="bfa-copy-support text-muted-foreground">
            Day {resumeDay.day} · {resumeDay.title} — in progress
          </p>
          <Link
            to="/day/$day"
            params={{ day: String(resumeDay.day) }}
            search={{ resume: true }}
            className="btn-primary-journey inline-flex"
          >
            Continue
          </Link>
        </>
      ) : (
        <>
          <p className="bfa-copy-support text-muted-foreground">
            Your ten-day journey is untouched by this preview.
          </p>
          <Link to="/" className="btn-quiet inline-flex">
            Open Your Journey
          </Link>
        </>
      )}
    </section>
  );
}

function SavedRow({ store, thread }: { store: Store; thread: PreviewThread }) {
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState(thread.title);

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="bfa-h3 min-w-0 flex-1 font-serif text-foreground [overflow-wrap:anywhere]">
          {thread.title}
        </span>
        <span className="bfa-copy-meta text-muted-foreground">
          Saved {thread.savedSnapshot ? new Date(thread.createdAt).toLocaleDateString() : ""}
        </span>
      </div>
      {renaming ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            store.renameThread(thread.id, title);
            setRenaming(false);
          }}
        >
          <label className="sr-only" htmlFor={`rename-${thread.id}>Rename conversation</label>
          <input
            id={`rename-${thread.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />
          <button type="submit" className="btn-quiet">Save name</button>
          <button type="button" className="btn-quiet" onClick={() => setRenaming(false)}>
            Cancel
          </button>
        </form>
      ) : confirming ? (
        <div role="alertdialog" aria-label={`Delete ${thread.title}`} className="mt-2 space-y-2">
          <p className="bfa-copy-support text-muted-foreground">
            Delete &ldquo;{thread.title}&rdquo;? This removes the preview&rsquo;s saved copy held
            in this session. It says nothing about any other records — this preview
            stores nothing outside this page.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-quiet"
              onClick={() => {
                store.deleteThread(thread.id);
                setConfirming(false);
              }}
            >
              Delete
            </button>
            <button type="button" className="btn-quiet" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn-quiet" onClick={() => store.requestSwitch({ kind: "open", threadId: thread.id })}>
            Open
          </button>
          <button type="button" className="btn-quiet" onClick={() => setRenaming(true)}>
            Rename
          </button>
          <button type="button" className="btn-quiet" onClick={() => setConfirming(true)}>
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// S3 — typed conversation

function ThreadScreen({ store, state, thread }: { store: Store; state: State; thread: PreviewThread }) {
  const saveStatus = store.saveStatus(thread);
  const [finishOpen, setFinishOpen] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);

  const statusLabel =
    saveStatus === "not-saved" ? "Not saved" : saveStatus === "saved" ? "Saved" : "Unsaved changes";

  useEffect(() => {
    if (saveError) statusRef.current?.focus();
  }, [saveError]);

  return (
    <div className="space-y-4">
      <section aria-labelledby="conv-thread-heading" className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 id="conv-thread-heading" className="bfa-h2 font-serif text-foreground [overflow-wrap:anywhere]">
            {thread.title}
          </h1>
          <p className="bfa-copy-meta text-muted-foreground" role="status" aria-live="polite">
            {statusLabel}
          </p>
        </div>

        <PreferencesRow store={store} thread={thread} />

        {state.voice !== "off" && <VoicePanel store={store} state={state} />}

        <ol aria-label="Conversation" className="space-y-3">
          {thread.messages.map((m) => (
            <MessageRow key={m.id} store={store} message={m} />
          ))}
        </ol>

        {state.sharePreview && <SharePreview store={store} state={state} />}

        <Composer store={store} draft={state.draft} autoFocus />

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="btn-primary-journey flex-1"
            onClick={() => store.sendDraft()}
            disabled={state.draft.trim().length === 0}
          >
            Send
          </button>
          {thread.messages.some((m) => m.status === "generating") && (
            <button type="button" className="btn-quiet flex-1" onClick={() => store.stopResponse()}>
              Stop response
            </button>
          )}
          {state.voice === "off" ? (
            <button type="button" className="btn-quiet flex-1" onClick={() => store.startTalking()}>
              Talk (simulated)
            </button>
          ) : (
            <button type="button" className="btn-quiet flex-1" onClick={() => store.finishTalking()}>
              Finish talking
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
          <button
            type="button"
            className="btn-quiet flex-1"
            onClick={() => {
              const ok = store.saveActiveThread();
              setSaveError(!ok);
            }}
          >
            {saveStatus === "not-saved" ? "Save conversation (simulated)" : "Save changes (simulated)"}
          </button>
          <button type="button" className="btn-quiet flex-1" onClick={() => setFinishOpen(true)}>
            Finish conversation
          </button>
        </div>
        {saveError && (
          <p
            ref={statusRef}
            tabIndex={-1}
            role="alert"
            className="bfa-copy-support rounded-md border border-destructive px-3 py-2 text-foreground"
          >
            Simulated save failure — nothing was saved. Your conversation is unchanged.
          </p>
        )}
      </section>

      <ShareTeachingPanel store={store} />

      {finishOpen && (
        <FinishDialog
          store={store}
          thread={thread}
          saveStatus={saveStatus}
          onClose={() => setFinishOpen(false)}
        />
      )}
    </div>
  );
}

function PreferencesRow({ store, thread }: { store: Store; thread: PreviewThread }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
      <span className="bfa-copy-support text-muted-foreground">
        Christian reflection (preview only):{" "}
        <strong className="text-foreground">{thread.spiritualOn ? "On" : "Off"}</strong>
      </span>
      <button
        type="button"
        className="btn-quiet"
        aria-pressed={thread.spiritualOn}
        onClick={() => store.setPreviewSpiritual(!thread.spiritualOn)}
      >
        Turn {thread.spiritualOn ? "off" : "on"} for this preview
      </button>
      <span className="bfa-copy-meta text-muted-foreground">
        Imported once from your setting; changing it here does not change the app setting.
      </span>
    </div>
  );
}

function MessageRow({ store, message }: { store: Store; message: PreviewMessage }) {
  const isPerson = message.role === "person";
  return (
    <li
      className={`rounded-lg border px-4 py-3 ${
        isPerson ? "border-border bg-background" : "border-[color:var(--bfa-interactive-gold)] bg-card"
      }`}
    >
      <p className="bfa-copy-meta text-muted-foreground">
        {isPerson ? "You" : "Beauty from Ashes (fictional preview reply)"}
      </p>
      {message.status === "generating" ? (
        <p className="bfa-copy mt-1 text-muted-foreground" role="status">
          Preparing a fictional reply…
        </p>
      ) : message.status === "stopped" ? (
        <p className="bfa-copy mt-1 text-muted-foreground">Response stopped.</p>
      ) : message.status === "not-sent" ? (
        <div className="mt-1 space-y-2">
          <p className="bfa-copy text-foreground">{message.text}</p>
          <p role="alert" className="bfa-copy-support text-foreground">
            Not sent.{" "}
            <button type="button" className="underline" onClick={() => store.retryMessage(message.id)}>
              Retry
            </button>
          </p>
        </div>
      ) : (
        <p className="bfa-copy mt-1 whitespace-pre-wrap text-foreground">{message.text}</p>
      )}
      {message.sharedTeaching && (
        <details className="mt-2 rounded-md border border-border p-2">
          <summary className="bfa-copy-support cursor-pointer text-foreground">
            Sources — Day {message.sharedTeaching.day} · {message.sharedTeaching.title} (exact teaching shared)
          </summary>
          <div className="bfa-copy-support mt-2 space-y-2 text-muted-foreground">
            <p>
              <strong className="text-foreground">{message.sharedTeaching.heading}</strong>
            </p>
            {message.sharedTeaching.body.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
            <p className="bfa-copy-meta">
              Simulated source card — the exact bytes shared from the day&rsquo;s Understand
              teaching. This is not evidence of model grounding.
            </p>
          </div>
        </details>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// S7 — exact teaching share preview

function ShareTeachingPanel({ store }: { store: Store }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="conv-share-heading" className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 id="conv-share-heading" className="bfa-h3 font-serif text-foreground">
        Explore journey teaching in conversation
      </h2>
      <p className="bfa-copy-support text-muted-foreground">
        Only a day&rsquo;s exact Understand teaching can be shared. Your answers, notes and
        private writing are never included.
      </p>
      {!open ? (
        <button type="button" className="btn-quiet" onClick={() => setOpen(true)}>
          Choose teaching to share
        </button>
      ) : (
        <ul className="space-y-2">
          {CONVERSATION_TEACHING_RECORDS.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                className="day-row w-full"
                onClick={() => {
                  store.previewShareTeaching(r.key);
                  setOpen(false);
                }}
              >
                <span className="bfa-h3 block font-serif text-foreground">
                  Day {r.day} · {r.title}
                </span>
                <span className="bfa-copy-support day-row-theme mt-1 block text-muted-foreground">
                  {r.understandHeading}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SharePreview({ store, state }: { store: Store; state: State }) {
  const record = state.sharePreview;
  if (!record) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-preview-heading"
      className="space-y-3 rounded-xl border border-[color:var(--bfa-interactive-gold)] bg-card p-5"
    >
      <h2 id="share-preview-heading" className="bfa-h3 font-serif text-foreground">
        Include this in the conversation?
      </h2>
      <p className="bfa-copy-support text-muted-foreground">
        Day {record.day} · {record.title} — the exact teaching passage below, nothing else.
      </p>
      <div className="bfa-copy space-y-2 rounded-lg border border-border bg-background p-4 text-foreground">
        <p>
          <strong>{record.understandHeading}</strong>
        </p>
        {record.understandBody.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn-primary-journey flex-1" onClick={() => store.confirmShareTeaching()}>
          Send selected content
        </button>
        <button type="button" className="btn-quiet flex-1" onClick={() => store.cancelShareTeaching()}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// S4 — voice state simulator (no real audio of any kind)

function VoicePanel({ store, state }: { store: Store; state: State }) {
  return (
    <section
      aria-labelledby="voice-sim-heading"
      className="space-y-3 rounded-lg border border-border bg-background p-4"
    >
      <h2 id="voice-sim-heading" className="bfa-h3 font-serif text-foreground">
        Voice — state simulator only
      </h2>
      <p className="bfa-copy-support text-muted-foreground">
        No microphone, recording or audio connection exists in this preview. These
        controls only demonstrate the states the real feature would show.
      </p>
      <p role="status" aria-live="polite" className="bfa-copy font-medium text-foreground">
        State: {VOICE_LABELS[state.voice]}
        {state.voiceMuted ? " · microphone muted (simulated)" : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {(state.voice === "listening" || state.voice === "speaking") && (
          <>
            <button type="button" className="btn-quiet" onClick={() => store.pauseVoice()}>
              Pause
            </button>
            <button
              type="button"
              className="btn-quiet"
              aria-pressed={state.voiceMuted}
              onClick={() => store.setVoiceMuted(!state.voiceMuted)}
            >
              {state.voiceMuted ? "Unmute microphone (simulated)" : "Mute microphone (simulated)"}
            </button>
          </>
        )}
        {(state.voice === "paused" || state.voice === "disconnected") && (
          <button type="button" className="btn-primary-journey" onClick={() => store.resumeVoice()}>
            Resume talking (simulated)
          </button>
        )}
        {state.voice === "disconnected" && (
          <p className="bfa-copy-support text-muted-foreground">
            Simulated disconnection — the thread is preserved; you can reconnect or keep typing.
          </p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// S8 — finish

function FinishDialog({
  store,
  thread,
  saveStatus,
  onClose,
}: {
  store: Store;
  thread: PreviewThread;
  saveStatus: "not-saved" | "saved" | "unsaved-changes";
  onClose: () => void;
}) {
  const [saveFailed, setSaveFailed] = useState(false);
  const closeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closeRef.current?.querySelector("button")?.focus();
  }, []);

  return (
    <div
      ref={closeRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="finish-heading"
      className="space-y-3 rounded-xl border border-[color:var(--bfa-interactive-gold)] bg-card p-5"
    >
      <h2 id="finish-heading" className="bfa-h3 font-serif text-foreground">
        Finish this conversation?
      </h2>
      <p className="bfa-copy-support text-muted-foreground">
        {saveStatus === "not-saved"
          ? "This conversation has not been saved. Saving is simulated and lasts only until you refresh or close this page."
          : saveStatus === "unsaved-changes"
            ? "There are unsaved changes. Finishing without saving keeps the last saved version."
            : "Everything is saved (in this session only)."}
      </p>
      {saveFailed && (
        <p role="alert" className="bfa-copy-support rounded-md border border-destructive px-3 py-2 text-foreground">
          Simulated save failure — the conversation is still open and unchanged.
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        {saveStatus !== "saved" && (
          <button
            type="button"
            className="btn-primary-journey flex-1"
            onClick={() => {
              const ok = store.finishActiveThread("save");
              setSaveFailed(!ok);
              if (ok) onClose();
            }}
          >
            {saveStatus === "not-saved" ? "Save conversation (simulated)" : "Save changes (simulated)"}
          </button>
        )}
        <button
          type="button"
          className="btn-quiet flex-1"
          onClick={() => {
            store.finishActiveThread("discard");
            onClose();
          }}
        >
          {saveStatus === "not-saved" ? "Finish without saving" : "Finish without saving changes"}
        </button>
        <button type="button" className="btn-quiet flex-1" onClick={onClose}>
          Keep talking
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review controls — explicitly separated from intended participant controls

function ReviewControls({ store, state }: { store: Store; state: State }) {
  return (
    <section
      aria-labelledby="review-controls-heading"
      className="space-y-3 rounded-xl border border-dashed border-border p-4"
    >
      <h2 id="review-controls-heading" className="bfa-copy-meta font-medium text-muted-foreground">
        Review controls — not part of the participant experience
      </h2>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-quiet"
          aria-pressed={state.simulateSendFailure}
          onClick={() => store.setSimulateSendFailure(!state.simulateSendFailure)}
        >
          Simulate send failure: {state.simulateSendFailure ? "on" : "off"}
        </button>
        <button
          type="button"
          className="btn-quiet"
          aria-pressed={state.simulateSaveFailure}
          onClick={() => store.setSimulateSaveFailure(!state.simulateSaveFailure)}
        >
          Simulate save failure: {state.simulateSaveFailure ? "on" : "off"}
        </button>
        <button type="button" className="btn-quiet" onClick={() => store.simulateDisconnect()}>
          Simulate voice disconnection
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared composer

function Composer({ store, draft, autoFocus }: { store: Store; draft: string; autoFocus: boolean }) {
  return (
    <div>
      <label htmlFor="conv-composer" className="bfa-copy-support block text-muted-foreground">
        Your message (use fictional test text)
      </label>
      <textarea
        id="conv-composer"
        rows={3}
        value={draft}
        autoFocus={autoFocus}
        onChange={(e) => store.setDraft(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
        placeholder="Type a fictional message…"
      />
    </div>
  );
}
