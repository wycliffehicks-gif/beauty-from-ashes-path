import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { JourneyScreen } from "@/components/JourneyScreen";
import { DayMotif } from "@/components/VisualMotifs";

import { getFirstJourneyDay, FIRST_JOURNEY_FINAL_DAY } from "@/content/first-journey";
import {
  screenKey as keyForScreen,
  screenLabel,
  screensFor,
  type InfoNote,
  type JourneyDayContent,
  type MotifKey,
  type PracticePath,
  type Question,
  type ScreenKey,
} from "@/content/journey-types";
import { dayIdFor } from "@/content/journey";
import { usePrefs } from "@/lib/prefs";
import {
  markDayComplete,
  readProgress,
  saveDayAnswers,
  saveDayReflection,
  saveLocator,
  saveReached,
} from "@/lib/journey/progress";
import {
  answerKeyFor,
  type BuiltReflection,
} from "@/lib/journey/reflection-engine";
import {
  answersSnapshot,
  resolveReflection,
} from "@/lib/journey/reflection-restore";
import { resolveVisibleIndex } from "@/lib/journey/screen-access";
import { toggleSelection } from "@/lib/journey/selection";
import {
  mergeStableStepAnswers,
  optionIdsFor,
  optionIndexesForOptions,
} from "@/lib/journey/answers";
import { resolveResumeIndex } from "@/lib/journey/resume";

const SAFE_SCREEN_KEY = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Layout-phase effect in the browser, plain effect on the server, so a screen
 * can report its state before paint without an SSR warning.
 */
const useBeforePaintEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;


export const Route = createFileRoute("/day/$day")({
  /**
   * `s` is a stable screen key, so device/browser Back moves exactly one
   * in-day screen. It is never answer data. The old URL-addressable close
   * state (`?step=close`) is deliberately ignored: a day may only be opened at
   * Close, or completed, through real forward movement inside the day.
   */
  validateSearch: (search: Record<string, unknown>): { s?: string; resume?: true } => {
    const out: { s?: string; resume?: true } = {};
    if (typeof search.s === "string" && SAFE_SCREEN_KEY.test(search.s)) out.s = search.s;
    if (search.resume === true || search.resume === "true") out.resume = true;
    return out;
  },
  head: ({ params }) => {
    const d = getFirstJourneyDay(Number(params.day));
    const title = d
      ? `Day ${d.day}: ${d.title} — Beauty from Ashes`
      : "Day — Beauty from Ashes";
    const desc = d?.theme ?? "A gentle daily reflection.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: DayFlow,
});

function DayFlow() {
  const { day } = Route.useParams();
  const dayNum = Number(day);
  const content = getFirstJourneyDay(dayNum);

  if (!content) return <DayNotHere />;
  return <DayFlowFor key={content.day} content={content} />;
}

function DayNotHere() {
  return (
    <JourneyScreen label="Day" focusKey="day:not-here">
      <div className="space-y-4">
        <h1 className="bfa-h1 font-serif text-foreground">This day isn’t here</h1>
        <p className="bfa-copy text-muted-foreground">
          Nothing is lost. Please choose a day from Your Journey.
        </p>
        <Link to="/" className="btn-primary-journey mt-2 inline-flex">
          Back to Your Journey
        </Link>
      </div>
    </JourneyScreen>
  );
}

function DayFlowFor({ content }: { content: JourneyDayContent }) {
  const navigate = useNavigate();
  const router = useRouter();
  const search = Route.useSearch();

  const screens = useMemo(() => screensFor(content), [content]);
  const stepKeys = useMemo(() => screens.map(keyForScreen), [screens]);
  const kinds = useMemo(() => screens.map((s) => s.kind), [screens]);
  const closeIdx = screens.length - 1;
  const dayId = dayIdFor(content.day);

  // The requested screen comes from the URL only, so server render, first client
  // render, reload and device Back all agree. An unknown key opens the day at
  // its beginning rather than stranding anyone.
  const urlIdx = search.s ? stepKeys.indexOf(search.s) : -1;
  const requested = urlIdx >= 0 ? urlIdx : 0;

  const [dayAnswers, setDayAnswers] = useState<string[]>([]);
  const [answersLoaded, setAnswersLoaded] = useState(false);
  /** Proof of real movement: stored high-water screen plus this visit's own. */
  const [reached, setReached] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [savedReflection, setSavedReflection] = useState<{
    text?: string;
    snapshot?: string;
  }>({});

  // A crafted ?s=reflection or ?s=close is never proof that the screen was
  // reached. Until storage has been read, only the opening screen is shown for
  // gated screens, so nothing can be completed before the clamp applies.
  const i = answersLoaded
    ? resolveVisibleIndex({ kinds, requested, reached, completed })
    : resolveVisibleIndex({ kinds, requested, reached: 0, completed: false });

  /**
   * True while an EARNED resume navigation has been requested but the URL has
   * not yet resolved to its final screen. While this is true the in-day focus
   * key is withheld, so a temporary opening screen can never be announced and
   * then replaced by the real target.
   */
  const [resumePending, setResumePending] = useState(false);

  const restoredForRef = useRef<string | null>(null);
  /** History index when this day was first rendered, for a truthful Back. */
  const historyIndex = useHistoryIndex();
  const entryHistoryIndex = useRef<number | null>(null);
  if (entryHistoryIndex.current === null) entryHistoryIndex.current = historyIndex;

  const goTo = useCallback(
    (index: number, opts: { replace?: boolean } = {}) => {
      const key = stepKeys[index];
      const sameScreen = search.s === key;
      navigate({
        to: "/day/$day",
        params: { day: String(content.day) },
        search: { s: key },
        // Never push a duplicate entry for the screen already on display.
        replace: opts.replace ?? sameScreen,
      });
      if (typeof window !== "undefined") window.scrollTo(0, 0);
    },
    [navigate, content.day, stepKeys, search.s],
  );

  // Load recorded answers, reached position, completion and any saved
  // reflection, and restore the exact saved screen when asked. Resume replaces
  // the current entry, so no synthetic history stack is built.
  useEffect(() => {
    if (restoredForRef.current === dayId) return;
    restoredForRef.current = dayId;

    const progress = readProgress();
    setDayAnswers(progress.answers[dayId] ?? []);
    setReached(progress.reached[dayId] ?? 0);
    setCompleted(progress.completedDays.includes(dayId));
    setSavedReflection({
      text: progress.reflections[dayId],
      snapshot: progress.reflectionSnapshots[dayId],
    });
    setAnswersLoaded(true);

    if (search.resume && urlIdx < 0) {
      const idx = resolveResumeIndex({
        stepKeys,
        dayId,
        locator: progress.locator,
        requested: true,
      });
      // Only a real earned resume target defers announcement. With nothing to
      // resume to, the state settles immediately so Arrive is still announced.
      if (idx > 0) {
        setResumePending(true);
        goTo(idx, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayId]);

  // The resume navigation has landed: the URL now names a real screen.
  useEffect(() => {
    if (resumePending && urlIdx >= 0) setResumePending(false);
  }, [resumePending, urlIdx]);

  // Quiet autosave of the exact screen actually being shown. This effect never
  // creates trust: a URL render can no longer raise the high-water mark, so a
  // crafted address can neither open nor become a reached screen.
  useEffect(() => {
    if (!answersLoaded) return;
    saveLocator({ dayId, step: stepKeys[i], index: i });
    // If the URL asked for a screen that has not been earned, correct the
    // address bar so reload and Back stay consistent with what is shown.
    if (requested !== i) goTo(i, { replace: true });
  }, [dayId, stepKeys, i, answersLoaded, requested, goTo]);

  /**
   * Focus/announcement may only happen once the storage read, the resume
   * decision and any URL correction have all settled. Until then no in-day
   * focus key exists, so a temporary opening screen is never announced.
   */
  const focusSettled = answersLoaded && !resumePending && requested === i;

  /**
   * Reflection readiness is keyed to BOTH the reflection screen and the current
   * coded answers, so it cannot survive leaving the screen, a browser Forward,
   * or an answer change: the token simply stops matching. The reflection child
   * also reports "preparing" in the layout phase, before paint, on every mount.
   */
  const [readyToken, setReadyToken] = useState<string | null>(null);
  const currentKey = stepKeys[i];
  const reflectionToken = `${currentKey}|${answersSnapshot(dayAnswers)}`;
  const reflectionReady = readyToken === reflectionToken;
  const onReflectionPreparing = useCallback(() => setReadyToken(null), []);
  const onReflectionReady = useCallback((token: string) => setReadyToken(token), []);


  const recordStepAnswers = (stepKey: string, optionIds: string[]) => {
    setDayAnswers((cur) => {
      const next = mergeStableStepAnswers(cur, stepKey, optionIds);
      saveDayAnswers(dayId, next);
      return next;
    });
  };

  const goNext = () => {
    const next = Math.min(closeIdx, i + 1);
    if (next === i) return;
    // Completion is recorded only by a real forward transition into Close from
    // a ready reflection reached through valid journey state.
    if (screens[next]?.kind === "close") {
      if (screens[i]?.kind === "reflection" && !reflectionReady) return;
      setCompleted(true);
      markDayComplete(dayId);
    }
    // A valid in-app forward action is what EARNS the next screen, so the
    // trusted high-water mark is raised BEFORE navigating. Were this done after
    // navigation, the clamp would send the person straight back.
    if (next > reached) {
      setReached(next);
      saveReached(dayId, next);
    }
    setReadyToken(null);
    goTo(next);
  };

  const goPrev = () => {
    if (i <= 0) return;
    setReadyToken(null);
    // Derived from the real history index, so mixed visible Back and
    // browser/Android Back or Forward can never leave a stale depth counter.
    const depth = historyIndex - (entryHistoryIndex.current ?? historyIndex);
    if (depth > 0) {
      router.history.back();
      if (typeof window !== "undefined") window.scrollTo(0, 0);
      return;
    }
    goTo(i - 1, { replace: true });
  };


  const screen = screens[i];
  const label = `Day ${content.day} · ${screenLabel(content, screen)}`;
  const nextDay = content.day < FIRST_JOURNEY_FINAL_DAY ? content.day + 1 : null;

  return (
    <ScreenBody
      key={keyForScreen(screen)}
      content={content}
      screen={screen}
      label={label}
      progress={{ current: i, total: screens.length }}
      onBack={i > 0 ? goPrev : undefined}
      onNext={goNext}
      answers={dayAnswers}
      answersLoaded={answersLoaded}
      focusSettled={focusSettled}
      onAnswer={recordStepAnswers}
      nextDay={nextDay}
      onHome={() => navigate({ to: "/" })}
      reflectionReady={reflectionReady}
      reflectionToken={reflectionToken}
      onReflectionPreparing={onReflectionPreparing}
      onReflectionReady={onReflectionReady}

      savedReflection={savedReflection}
      onReflectionSaved={(text, snapshot) =>
        setSavedReflection({ text, snapshot })
      }
    />
  );
}

/**
 * The router's own history position. Used only to know whether this visit has
 * pushed in-day entries, so the visible Back matches the device Back exactly.
 */
function useHistoryIndex(): number {
  const router = useRouter();
  return useRouterState({
    select: (s) =>
      (s.location.state as { __TSR_index?: number } | undefined)?.__TSR_index ??
      router.history.length - 1,
  });
}

function ScreenBody({
  content,
  screen,
  label,
  progress,
  onBack,
  onNext,
  answers,
  answersLoaded,
  focusSettled,
  onAnswer,
  nextDay,
  onHome,
  reflectionReady,
  reflectionToken,
  onReflectionPreparing,
  onReflectionReady,
  savedReflection,
  onReflectionSaved,
}: {
  content: JourneyDayContent;
  screen: ScreenKey;
  label: string;
  progress: { current: number; total: number };
  onBack?: () => void;
  onNext: () => void;
  answers: string[];
  answersLoaded: boolean;
  /** True once storage, resume and URL correction have settled. */
  focusSettled: boolean;
  onAnswer: (stepKey: string, optionIds: string[]) => void;
  nextDay: number | null;
  onHome: () => void;
  reflectionReady: boolean;
  reflectionToken: string;
  onReflectionPreparing: () => void;
  onReflectionReady: (token: string) => void;
  savedReflection: { text?: string; snapshot?: string };
  onReflectionSaved: (text: string, snapshot: string) => void;

}) {
  // Screen identity for single-page focus management. Every screen, including
  // the reflection, reports its identity so transition tracking stays true; the
  // reflection then focuses its own heading once its response is ready.
  // No identity is supplied while the screen shown could still be a temporary
  // one, so nothing is ever announced twice.
  const screenFocusKey = focusSettled
    ? `${content.day}:${keyForScreen(screen)}`
    : undefined;
  const manageFocus = screen.kind !== "reflection";


  const shell = (
    node: React.ReactNode,
    nav: {
      onContinue?: () => void;
      continueLabel?: string;
      continueDisabled?: boolean;
      continueHint?: string;
      footer?: React.ReactNode;
    } = {},
  ) => (
    <JourneyScreen
      label={label}
      progress={progress}
      onBack={onBack}
      backLabel="← Back"
      onContinue={nav.onContinue}
      continueLabel={nav.continueLabel}
      continueDisabled={nav.continueDisabled}
      continueHint={nav.continueHint}
      footer={nav.footer}
      focusKey={screenFocusKey}
      manageFocus={manageFocus}
    >

      {node}
    </JourneyScreen>
  );


  switch (screen.kind) {
    case "arrive":
      return shell(<ArriveScreen content={content} />, { onContinue: onNext });

    case "understand":
      return shell(<UnderstandScreen content={content} />, { onContinue: onNext });

    case "question":
    case "step": {
      const question =
        screen.kind === "step"
          ? content.step
          : content.questions.find((q) => q.id === screen.questionId);
      if (!question) return shell(<p>—</p>, { onContinue: onNext });
      return (
        <QuestionScreenShell
          question={question}
          stepKey={answerKeyFor(content, question.id)}
          answers={answers}
          onAnswer={onAnswer}
          onNext={onNext}
          label={label}
          progress={progress}
          onBack={onBack}
          motif={content.motif}
          focusKey={screenFocusKey}
        />

      );

    }

    case "echo": {
      const question = content.questions.find((q) => q.id === screen.questionId);
      if (!question?.echo) return shell(<p>—</p>, { onContinue: onNext });
      return shell(
        <EchoScreen content={content} question={question} answers={answers} />,
        { onContinue: onNext },
      );
    }

    case "practise":
      return shell(<PractiseScreen content={content} />, { onContinue: onNext });

    case "reflection":
      return shell(
        <ReflectionScreen
          content={content}
          answers={answers}
          answersLoaded={answersLoaded}
          token={reflectionToken}
          onPreparing={onReflectionPreparing}
          onReady={onReflectionReady}
          savedReflection={savedReflection}
          onSaved={onReflectionSaved}
        />,

        {
          onContinue: onNext,
          continueDisabled: !reflectionReady,
          continueHint: reflectionReady
            ? undefined
            : "Your reflection is being prepared. Continue becomes available in a moment.",
        },
      );

    case "close":
      return shell(
        <CloseScreen content={content} nextDay={nextDay} onHome={onHome} />,
      );
  }
}

/* ---------------------------------------------------------------- screens */

/**
 * Every Arrive screen states, in plain language, why the day exists. It is part
 * of the existing Arrive screen: no new screen, no change to screen order or
 * progress indices.
 */
export const ARRIVE_PURPOSE_HEADING = "Why this day matters";

function ArriveScreen({ content }: { content: JourneyDayContent }) {
  return (
    <div className="space-y-5">
      <DayMotif motif={content.motif} treatment="arrival" />
      <p className="eyebrow">Arrive</p>



      <h1 className="bfa-h1 font-serif text-foreground">{content.title}</h1>
      <p className="bfa-copy-lead text-foreground">{content.arrive.lead}</p>
      <section
        data-testid="arrive-purpose"
        aria-labelledby={`arrive-purpose-${content.day}`}
        className="surface-card space-y-2"
      >
        <h2
          id={`arrive-purpose-${content.day}`}
          className="bfa-heading bfa-h3 font-serif text-foreground"
        >
          {ARRIVE_PURPOSE_HEADING}
        </h2>
        <p className="bfa-copy text-foreground">{content.arrive.purpose}</p>
      </section>

      {content.arrive.body.map((p) => (
        <p key={p} className="bfa-copy text-foreground">
          {p}
        </p>
      ))}
      {content.arrive.settle && content.arrive.settle.length > 0 && (
        <div className="surface-card space-y-3">
          <p className="eyebrow">A place to settle</p>
          <ol className="bfa-copy space-y-2 text-foreground">
            {content.arrive.settle.map((s) => (
              <li key={s} className="flex gap-3">
                <span aria-hidden className="text-[color:var(--gold)]">
                  ·
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function UnderstandScreen({ content }: { content: JourneyDayContent }) {
  return (
    <div className="space-y-5">
      <p className="eyebrow">{content.understand.label ?? "Understand"}</p>
      <h1 className="bfa-h1 font-serif text-foreground">
        {content.understand.heading}
      </h1>
      <DayMotif motif={content.motif} treatment="quiet" />
      {content.understand.body.map((p) => (
        <p key={p} className="bfa-copy text-foreground">
          {p}
        </p>
      ))}
      <InfoNotes notes={content.understand.info} />
    </div>
  );
}

/**
 * Renders body copy, turning the exact phrase "Support & Safety" into one real
 * link to /support without changing the sentence. No banner, no repeated alarm
 * icon: the sentence itself simply becomes actionable where the day already
 * mentions it.
 */
const SUPPORT_PHRASE = "Support & Safety";

function SupportText({ text }: { text: string }) {
  if (!text.includes(SUPPORT_PHRASE)) return <>{text}</>;
  const parts = text.split(SUPPORT_PHRASE);
  return (
    <>
      {parts.map((part, idx) => (
        <span key={idx}>
          {part}
          {idx < parts.length - 1 && (
            <Link
              to="/support"
              className="inline-link text-primary underline underline-offset-4"
            >
              {SUPPORT_PHRASE}
            </Link>
          )}
        </span>
      ))}
    </>
  );
}

function InfoNotes({ notes }: { notes?: InfoNote[] }) {
  if (!notes || notes.length === 0) return null;
  return (
    <div className="space-y-2">
      {notes.map((n) => (
        <details key={n.term} className="surface-card">
          <summary className="bfa-heading bfa-h3 min-h-[48px] cursor-pointer list-none py-2 font-serif">
            {n.term}
          </summary>
          <p className="bfa-copy pb-1 text-foreground">
            <SupportText text={n.explanation} />
          </p>
        </details>
      ))}
    </div>
  );
}

function QuestionScreenShell({
  question,
  stepKey,
  answers,
  onAnswer,
  onNext,
  label,
  progress,
  onBack,
  motif,
  focusKey,
}: {
  question: Question;
  stepKey: string;
  answers: string[];
  onAnswer: (stepKey: string, optionIds: string[]) => void;
  onNext: () => void;
  label: string;
  progress: { current: number; total: number };
  onBack?: () => void;
  /** Presentation only: which day geometry the quiet divider draws. */
  motif: MotifKey;
  /** Stable screen identity, so a screen change moves focus to the question. */
  focusKey?: string;
}) {

  const [selected, setSelected] = useState<number[]>(() =>
    optionIndexesForOptions(answers, stepKey, question.options),
  );

  // Restore previously recorded choices once they arrive from storage.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    const prior = optionIndexesForOptions(answers, stepKey, question.options);
    if (prior.length > 0) {
      restoredRef.current = true;
      setSelected(prior);
    }
  }, [answers, stepKey, question.options]);

  const toggle = (idx: number) => {
    restoredRef.current = true;
    const next = toggleSelection(question, selected, idx);
    setSelected(next);
    onAnswer(
      stepKey,
      next.map((n) => question.options[n]!.id),
    );
  };

  const body = (
    <div className="space-y-5">
      <p className="eyebrow">{question.eyebrow}</p>
      <h1 className="bfa-h1 font-serif text-foreground">
        {question.prompt}
      </h1>
      {question.hint && (
        <p className="bfa-copy text-muted-foreground">{question.hint}</p>
      )}
      <DayMotif motif={motif} treatment="quiet" />
      <ul className="space-y-2" role="list">
        {question.options.map((option, idx) => {
          const isOn = selected.includes(idx);
          return (
            <li key={option.id}>
              <button
                type="button"
                aria-pressed={isOn}
                onClick={() => toggle(idx)}
                className="bfa-journey-choice"
              >
                <span
                  aria-hidden
                  className="bfa-journey-choice-dot"
                />
                <span className="min-w-0">
                  <span className="block">{option.label}</span>
                  {option.note && (
                    <span
                      className="bfa-journey-choice-note"
                    >
                      {option.note}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <InfoNotes notes={question.info} />
    </div>
  );

  return (
    <JourneyScreen
      label={label}
      progress={progress}
      onBack={onBack}
      backLabel="← Back"
      onContinue={onNext}
      continueLabel={selected.length > 0 ? "Continue" : "Continue without answering"}
      focusKey={focusKey}
    >
      {body}
    </JourneyScreen>

  );
}


function EchoScreen({
  content,
  question,
  answers,
}: {
  content: JourneyDayContent;
  question: Question;
  answers: string[];
}) {
  const echo = question.echo!;
  const chosen = optionIdsFor(answers, answerKeyFor(content, question.id), question.options)
    .map((id) => echo.byOption[id])
    .filter((line): line is string => Boolean(line));
  const lines = chosen.length > 0 ? chosen : [echo.unanswered];

  return (
    <div className="space-y-5">
      <p className="eyebrow">Explore</p>
      <h1 className="bfa-h1 font-serif text-foreground">
        {echo.heading}
      </h1>
      <DayMotif motif={content.motif} treatment="quiet" />
      {lines.map((line) => (
        <p key={line} className="bfa-copy text-foreground">
          {line}
        </p>
      ))}
      {echo.closing && (
        <p className="bfa-copy text-muted-foreground">{echo.closing}</p>
      )}
    </div>
  );
}

/**
 * When Scripture and spiritual reflection are switched off, the day offers one
 * practice, so the copy must promise exactly one — never "either" of two.
 */
export const PRACTICE_SINGLE_HEADING = "A practice for today";
export const PRACTICE_SINGLE_INTRO =
  "You may open this practice, read without doing it, stop at any point, or continue without opening it.";

/**
 * Day 1 only, and only when the preference has been read and is off: one quiet,
 * nonblocking mention that the Christian option exists, so nobody has to guess
 * where it lives. It never appears again on a later day, and it applies no
 * pressure — the Reflection Practice is complete on its own.
 */
export const SPIRITUAL_INVITATION_TEXT =
  "The Reflection Practice above is complete on its own. If you would like optional Christian Scripture and prayer alongside it, you can turn that on in Settings at any time.";
export const SPIRITUAL_INVITATION_LINK_LABEL = "Open Settings";

function PractiseScreen({ content }: { content: JourneyDayContent }) {
  const [prefs, , prefsHydrated] = usePrefs();
  const [open, setOpen] = useState<"reflection" | "spiritual" | null>(null);
  // Nothing spiritual appears until the stored preference has actually been
  // read, so someone who chose to leave it off never briefly sees the Christian
  // panel, Scripture, prayer or companion wording. The nonreligious practice is
  // complete on its own and always shown.
  const showSpiritual = prefsHydrated && prefs.showSpiritual;
  const showSpiritualInvitation = content.day === 1 && prefsHydrated && !prefs.showSpiritual;

  return (
    <div className="space-y-5">
      <p className="eyebrow">Practise</p>
      <h1 className="bfa-h1 font-serif text-foreground">
        {showSpiritual ? content.practise.heading : PRACTICE_SINGLE_HEADING}
      </h1>
      <p className="bfa-copy text-foreground">
        {showSpiritual ? content.practise.intro : PRACTICE_SINGLE_INTRO}
      </p>
      {showSpiritual && (
        <p className="bfa-copy text-muted-foreground">{content.practise.either}</p>
      )}
      <DayMotif motif={content.motif} treatment="quiet" />
      <PracticePanel
        path={content.practise.reflection}
        isOpen={open === "reflection"}
        onToggle={() => setOpen(open === "reflection" ? null : "reflection")}
      />
      {showSpiritual && (
        <PracticePanel
          path={content.practise.spiritual}
          isOpen={open === "spiritual"}
          onToggle={() => setOpen(open === "spiritual" ? null : "spiritual")}
        />
      )}
      {showSpiritualInvitation && (
        <aside
          data-testid="spiritual-invitation"
          className="rounded-xl border border-border bg-card p-4"
        >
          <p className="bfa-copy-support text-muted-foreground">
            {SPIRITUAL_INVITATION_TEXT}
          </p>
          <Link
            to="/settings"
            className="btn-quiet mt-3 inline-flex min-h-[44px] w-full sm:w-auto"
          >
            {SPIRITUAL_INVITATION_LINK_LABEL}
          </Link>
        </aside>
      )}
    </div>
  );
}


function PracticePanel({
  path,
  isOpen,
  onToggle,
}: {
  path: PracticePath;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="surface-card space-y-3">
      <h2 className="bfa-heading bfa-h2 font-serif">
        {path.title}
      </h2>
      <p className="bfa-copy text-foreground">{path.summary}</p>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? "Hide the steps" : "Show me how"} — ${path.title}`}
        className="btn-quiet min-h-[44px] w-full"
      >
        {isOpen ? "Hide the steps" : "Show me how"}
      </button>
      {isOpen && (
        <div className="space-y-3 pt-1">
          {path.scripture && (
            <blockquote className="rounded-xl border-l-2 border-[color:var(--gold)] bg-[color:var(--champagne)]/25 px-4 py-3">
              <p className="bfa-copy font-serif text-foreground">
                {path.scripture.body}
              </p>
              <cite className="bfa-copy-support mt-2 block not-italic text-muted-foreground">
                {path.scripture.reference}
              </cite>
              <p className="bfa-copy-support mt-2 text-muted-foreground">
                {path.scripture.note}
              </p>
            </blockquote>
          )}
          <ol className="bfa-copy space-y-2 text-foreground">
            {path.steps.map((s, idx) => (
              <li key={s} className="flex gap-3">
                <span
                  aria-hidden
                  className="shrink-0 text-[color:var(--bfa-interactive-gold)]"
                >
                  {idx + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <p className="bfa-copy-support text-muted-foreground">{path.notRequired}</p>
        </div>
      )}
    </section>
  );
}

/**
 * The personalized reflection appears automatically. There is no reveal
 * control, no AI/curated/model label, and nothing new is claimed: the response
 * is assembled on this device from founder-approved content for this day and
 * the structured selections already gathered. Fully unanswered paths receive
 * their approved substantive fallbacks.
 *
 * A previously saved response is restored word for word when it can be proven
 * to belong to this day and to the same coded selections. If the selections
 * changed, or the association cannot be proven, it is rebuilt on this device and
 * the saved copy is replaced. No network call, no model, no free text.
 */
function ReflectionScreen({
  content,
  answers,
  answersLoaded,
  token,
  onPreparing,
  onReady,
  savedReflection,
  onSaved,
}: {
  content: JourneyDayContent;
  answers: string[];
  answersLoaded: boolean;
  /** Reflection screen plus current coded answers; readiness belongs to it. */
  token: string;
  onPreparing: () => void;
  onReady: (token: string) => void;
  savedReflection: { text?: string; snapshot?: string };
  onSaved: (text: string, snapshot: string) => void;
}) {
  const [state, setState] = useState<{ token: string; built: BuiltReflection } | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // Before paint on every mount — including browser Back and Forward — and
  // whenever the answers change, this screen reports that it is preparing, so a
  // stale readiness can never briefly enable Continue.
  useBeforePaintEffect(() => {
    setState(null);
    onPreparing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!answersLoaded) return;
    const dayId = dayIdFor(content.day);
    // The proof carries the snapshot format, the current approved reflection
    // content for this day, and the coded answers. A saved reflection from an
    // older wording (or with no proof at all) therefore cannot be restored: it
    // is rebuilt deterministically and the stored copy is replaced.
    const resolved = resolveReflection(content, answers, savedReflection);
    setState({ token, built: resolved.built });
    if (resolved.replaceSaved) {
      saveDayReflection(dayId, resolved.text, resolved.snapshot);
      onSaved(resolved.text, resolved.snapshot);
    }
    onReady(token);
    // savedReflection is read once per screen entry; rebuilding on our own save
    // would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, token, answersLoaded]);


  // Only a response built for the current answers may be shown.
  const built = state && state.token === token ? state.built : null;

  // Once the reflection is present it is ordinary structured content, so the
  // heading takes focus rather than the whole thing being announced at once.
  useEffect(() => {
    if (built) headingRef.current?.focus();
  }, [built]);

  return (
    <div className="space-y-5">
      <p className="eyebrow">Your Reflection</p>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="bfa-h1 font-serif text-foreground outline-none"
      >
        A reflection drawn from today
      </h1>
      {/* When a saved response is restored, its own opening words are shown, not
          the current day's generic intro. While preparing, the neutral current
          intro stands in and nothing is claimed to be exact. */}
      <p className="bfa-copy text-foreground">
        {built ? built.intro : content.reflection.intro}
      </p>
      <DayMotif motif={content.motif} treatment="quiet" />


      {!built ? (
        <p role="status" aria-live="polite" className="bfa-copy text-muted-foreground">
          Preparing your reflection…
        </p>
      ) : (
        <div className="space-y-4">
          {built.sections.map((section) => (
            <section key={section.id} className="surface-card space-y-2">
              <h2 className="bfa-heading bfa-h3 font-serif">
                {section.title}
              </h2>
              {section.paragraphs.map((p) => (
                <p key={p} className="bfa-copy text-foreground">
                  {p}
                </p>
              ))}
            </section>
          ))}
          <p className="bfa-copy text-muted-foreground">{built.closing}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Chrome-level pacing note on every daily close. It sets no task and makes no
 * claim: one day at a time is enough.
 */
export const CLOSE_CONTAINMENT_NOTE =
  "One day at a time is enough. There is no need to continue now.";

/**
 * Quiet secondary label on a daily close. It offers the next day as clearly
 * optional and never urges going straight on; Day 10 has no next day, so there
 * is no label and no action at all.
 */
export function closeNextDayLabel(nextDay: number | null): string | null {
  return nextDay ? `Open Day ${nextDay} when you’re ready` : null;
}


function CloseScreen({

  content,
  nextDay,
  onHome,
}: {
  content: JourneyDayContent;
  nextDay: number | null;
  onHome: () => void;
}) {
  return (
    <div className="space-y-5">
      <DayMotif motif={content.motif} treatment="closing" />
      <p className="eyebrow">Carry Forward</p>
      <h1 className="bfa-h1 font-serif text-foreground">
        {content.close.heading}
      </h1>
      {content.close.body.map((p) => (
        <p key={p} className="bfa-copy text-foreground">
          <SupportText text={p} />
        </p>
      ))}
      <div className="surface-card">
        <p className="eyebrow">Carry forward</p>
        <p className="bfa-copy mt-2 text-foreground">{content.close.carryForward}</p>
      </div>
      {/* Containment, not binge pressure: returning to Your Journey is the
          primary, expected ending. The next day remains available, but as a
          quieter secondary choice, and nothing suggests going straight on. */}
      <div className="space-y-3 pt-2">
        <button
          type="button"
          onClick={onHome}
          className="btn-primary-journey w-full"
          data-testid="close-return-home"
        >
          Return to Your Journey
        </button>
        {nextDay ? (
          <Link
            to="/day/$day"
            params={{ day: String(nextDay) }}
            className="btn-quiet block w-full text-center"
            data-testid="close-next-day"
          >
            {closeNextDayLabel(nextDay)}
          </Link>
        ) : null}

        <p className="bfa-copy-support pt-1 text-center text-muted-foreground">
          {CLOSE_CONTAINMENT_NOTE}
        </p>
      </div>

    </div>
  );
}
