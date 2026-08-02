import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JourneyScreen } from "@/components/JourneyScreen";
import { getFirstJourneyDay, FIRST_JOURNEY_FINAL_DAY } from "@/content/first-journey";
import {
  screenKey as keyForScreen,
  screenLabel,
  screensFor,
  type InfoNote,
  type JourneyDayContent,
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
  buildReflection,
  reflectionToText,
  type BuiltReflection,
} from "@/lib/journey/reflection-engine";
import { answersSnapshot, restoreReflection } from "@/lib/journey/reflection-restore";
import { resolveVisibleIndex } from "@/lib/journey/screen-access";
import { toggleSelection } from "@/lib/journey/selection";
import {
  mergeStableStepAnswers,
  optionIdsFor,
  optionIndexesForOptions,
} from "@/lib/journey/answers";
import { resolveResumeIndex } from "@/lib/journey/resume";

const SAFE_SCREEN_KEY = /^[A-Za-z0-9._-]{1,64}$/;

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
    <JourneyScreen label="Day">
      <div className="space-y-4">
        <h1 className="font-serif text-2xl text-foreground">This day isn’t here</h1>
        <p className="text-muted-foreground">
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
      if (idx > 0) goTo(idx, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayId]);

  // Quiet autosave of the exact screen, plus the high-water screen reached.
  // Neither completes a day.
  useEffect(() => {
    if (!answersLoaded) return;
    saveLocator({ dayId, step: stepKeys[i], index: i });
    if (i > reached) {
      setReached(i);
      saveReached(dayId, i);
    }
    // If the URL asked for a screen that has not been earned, correct the
    // address bar so reload and Back stay consistent with what is shown.
    if (requested !== i) goTo(i, { replace: true });
  }, [dayId, stepKeys, i, answersLoaded, reached, requested, goTo]);

  /**
   * Reflection readiness has exactly one owner: the screen key it belongs to.
   * There is no separate reset effect to race with the child, so Continue can
   * never be stranded disabled.
   */
  const [readyForKey, setReadyForKey] = useState<string | null>(null);
  const currentKey = stepKeys[i];
  const reflectionReady = readyForKey === currentKey;
  const onReflectionReady = useCallback(
    (key: string) => setReadyForKey(key),
    [],
  );

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
    goTo(next);
  };

  const goPrev = () => {
    if (i <= 0) return;
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
      onAnswer={recordStepAnswers}
      nextDay={nextDay}
      onHome={() => navigate({ to: "/" })}
      reflectionReady={reflectionReady}
      onReflectionReady={() => onReflectionReady(currentKey)}
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
  onAnswer,
  nextDay,
  onHome,
  reflectionReady,
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
  onAnswer: (stepKey: string, optionIds: string[]) => void;
  nextDay: number | null;
  onHome: () => void;
  reflectionReady: boolean;
  onReflectionReady: () => void;
  savedReflection: { text?: string; snapshot?: string };
  onReflectionSaved: (text: string, snapshot: string) => void;
}) {
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

function ArriveScreen({ content }: { content: JourneyDayContent }) {
  return (
    <div className="space-y-5">
      <p className="eyebrow">Arrive</p>
      <h1 className="font-serif text-3xl leading-tight text-foreground sm:text-4xl">
        {content.title}
      </h1>
      <p className="text-lg text-foreground">{content.arrive.lead}</p>
      {content.arrive.body.map((p) => (
        <p key={p} className="text-base text-foreground">
          {p}
        </p>
      ))}
      {content.arrive.settle && content.arrive.settle.length > 0 && (
        <div className="surface-card space-y-3">
          <p className="eyebrow">A place to settle</p>
          <ol className="space-y-2 text-base text-foreground">
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
      <h1 className="font-serif text-2xl leading-tight text-foreground sm:text-3xl">
        {content.understand.heading}
      </h1>
      {content.understand.body.map((p) => (
        <p key={p} className="text-base text-foreground">
          {p}
        </p>
      ))}
      <InfoNotes notes={content.understand.info} />
    </div>
  );
}

function InfoNotes({ notes }: { notes?: InfoNote[] }) {
  if (!notes || notes.length === 0) return null;
  return (
    <div className="space-y-2">
      {notes.map((n) => (
        <details key={n.term} className="surface-card">
          <summary className="min-h-[44px] cursor-pointer list-none py-2 font-serif text-base text-[color:var(--navy)]">
            {n.term}
          </summary>
          <p className="pb-1 text-base text-foreground">{n.explanation}</p>
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
}: {
  question: Question;
  stepKey: string;
  answers: string[];
  onAnswer: (stepKey: string, optionIds: string[]) => void;
  onNext: () => void;
  label: string;
  progress: { current: number; total: number };
  onBack?: () => void;
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

  return (
    <JourneyScreen
      label={label}
      progress={progress}
      onBack={onBack}
      backLabel="← Back"
      onContinue={onNext}
      continueLabel={selected.length > 0 ? "Continue" : "Continue without answering"}
    >
      <div className="space-y-5">
        <p className="eyebrow">{question.eyebrow}</p>
        <h1 className="font-serif text-2xl leading-tight text-foreground sm:text-3xl">
          {question.prompt}
        </h1>
        {question.hint && (
          <p className="text-base text-muted-foreground">{question.hint}</p>
        )}
        <ul className="space-y-2" role="list">
          {question.options.map((option, idx) => {
            const isOn = selected.includes(idx);
            return (
              <li key={option.id}>
                <button
                  type="button"
                  aria-pressed={isOn}
                  onClick={() => toggle(idx)}
                  className={`flex min-h-[52px] w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-base transition-colors ${
                    isOn
                      ? "border-[color:var(--gold)] bg-[color:var(--champagne)]/35 text-foreground"
                      : "border-border bg-card text-foreground hover:border-[color:var(--gold)]"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-1 h-3 w-3 shrink-0 rounded-full border ${
                      isOn
                        ? "border-[color:var(--gold)] bg-[color:var(--gold)]"
                        : "border-border"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block">{option.label}</span>
                    {option.note && (
                      <span className="mt-0.5 block text-sm text-muted-foreground">
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
      <h1 className="font-serif text-2xl leading-tight text-foreground sm:text-3xl">
        {echo.heading}
      </h1>
      {lines.map((line) => (
        <p key={line} className="text-base text-foreground">
          {line}
        </p>
      ))}
      {echo.closing && (
        <p className="text-base text-muted-foreground">{echo.closing}</p>
      )}
    </div>
  );
}

function PractiseScreen({ content }: { content: JourneyDayContent }) {
  const [prefs, , prefsHydrated] = usePrefs();
  const [open, setOpen] = useState<"reflection" | "spiritual" | null>(null);
  // Nothing spiritual appears until the stored preference has actually been
  // read, so someone who chose to leave it off never briefly sees the Christian
  // panel, Scripture, prayer or companion wording. The nonreligious practice is
  // complete on its own and always shown.
  const showSpiritual = prefsHydrated && prefs.showSpiritual;

  return (
    <div className="space-y-5">
      <p className="eyebrow">Practise</p>
      <h1 className="font-serif text-2xl leading-tight text-foreground sm:text-3xl">
        {content.practise.heading}
      </h1>
      <p className="text-base text-foreground">{content.practise.intro}</p>
      {showSpiritual && (
        <p className="text-base text-muted-foreground">{content.practise.either}</p>
      )}
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
      <h2 className="font-serif text-xl leading-snug text-[color:var(--navy)]">
        {path.title}
      </h2>
      <p className="text-base text-foreground">{path.summary}</p>
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
              <p className="font-serif text-base leading-relaxed text-foreground">
                {path.scripture.body}
              </p>
              <cite className="mt-2 block text-sm not-italic text-muted-foreground">
                {path.scripture.reference}
              </cite>
              <p className="mt-2 text-sm text-muted-foreground">
                {path.scripture.note}
              </p>
            </blockquote>
          )}
          <ol className="space-y-2 text-base text-foreground">
            {path.steps.map((s, idx) => (
              <li key={s} className="flex gap-3">
                <span
                  aria-hidden
                  className="shrink-0 text-sm text-[color:var(--gold)]"
                >
                  {idx + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted-foreground">{path.notRequired}</p>
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
 */
function ReflectionScreen({
  content,
  answers,
  answersLoaded,
  onReady,
}: {
  content: JourneyDayContent;
  answers: string[];
  answersLoaded: boolean;
  onReady: () => void;
}) {
  const [built, setBuilt] = useState<BuiltReflection | null>(null);

  useEffect(() => {
    if (!answersLoaded) return;
    const next = buildReflection(content, answers);
    setBuilt(next);
    // Saved locally only, so this exact screen restores on reload or resume.
    saveDayReflection(dayIdFor(content.day), reflectionToText(next));
    onReady();
  }, [content, answers, answersLoaded, onReady]);

  return (
    <div className="space-y-5">
      <p className="eyebrow">Your Reflection</p>
      <h1 className="font-serif text-2xl leading-tight text-foreground sm:text-3xl">
        A reflection drawn from today
      </h1>
      <p className="text-base text-foreground">{content.reflection.intro}</p>

      <div role="status" aria-live="polite">
        {!built ? (
          <p className="text-base text-muted-foreground">
            Preparing your reflection…
          </p>
        ) : (
          <div className="space-y-4">
            {built.sections.map((section) => (
              <section key={section.id} className="surface-card space-y-2">
                <h2 className="font-serif text-lg text-[color:var(--navy)]">
                  {section.title}
                </h2>
                {section.paragraphs.map((p) => (
                  <p key={p} className="text-base text-foreground">
                    {p}
                  </p>
                ))}
              </section>
            ))}
            <p className="text-base text-muted-foreground">{built.closing}</p>
          </div>
        )}
      </div>
    </div>
  );
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
      <p className="eyebrow">Carry Forward</p>
      <h1 className="font-serif text-2xl leading-tight text-foreground sm:text-3xl">
        {content.close.heading}
      </h1>
      {content.close.body.map((p) => (
        <p key={p} className="text-base text-foreground">
          {p}
        </p>
      ))}
      <div className="surface-card">
        <p className="eyebrow">Carry forward</p>
        <p className="mt-2 text-base text-foreground">{content.close.carryForward}</p>
      </div>
      <div className="space-y-3 pt-2">
        {nextDay ? (
          <Link
            to="/day/$day"
            params={{ day: String(nextDay) }}
            className="btn-primary-journey w-full"
          >
            Continue to Day {nextDay}
          </Link>
        ) : null}
        <button type="button" onClick={onHome} className="btn-quiet w-full">
          Return to Your Journey
        </button>
      </div>
    </div>
  );
}
