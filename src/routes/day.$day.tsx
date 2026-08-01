import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { markDayVisited } from "@/lib/prefs";
import {
  markDayComplete,
  readProgress,
  saveDayAnswers,
  saveDayReflection,
  saveLocator,
} from "@/lib/journey/progress";
import {
  answerKeyFor,
  buildReflection,
  reflectionToText,
  type BuiltReflection,
} from "@/lib/journey/reflection-engine";
import { toggleSelection } from "@/lib/journey/selection";
import {
  mergeStepAnswers,
  optionIndexesFor,
  resolveResumeIndex,
} from "@/lib/journey/resume";

/** Layout effect on the client, a no-op during server rendering. */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export const Route = createFileRoute("/day/$day")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { step?: "close"; resume?: true } => {
    const out: { step?: "close"; resume?: true } = {};
    if (search.step === "close") out.step = "close";
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
  const search = Route.useSearch();

  const screens = useMemo(() => screensFor(content), [content]);
  const stepKeys = useMemo(() => screens.map(keyForScreen), [screens]);
  const closeIdx = screens.length - 1;
  const dayId = dayIdFor(content.day);

  // Server render and first client render are identical: the opening screen,
  // or the closing screen when the URL asks for it. Browser storage is never
  // read during render, so there is no hydration mismatch.
  const [i, setI] = useState(() => (search.step === "close" ? closeIdx : 0));
  const [dayAnswers, setDayAnswers] = useState<string[]>([]);

  /**
   * Resume gate. While pending, autosave is held back so the opening-screen
   * index can never overwrite the stored locator before it is restored.
   */
  const [resumeSettled, setResumeSettled] = useState(!search.resume);
  const restoredForRef = useRef<string | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (restoredForRef.current === dayId) return;
    restoredForRef.current = dayId;

    const progress = readProgress();
    setDayAnswers(progress.answers[dayId] ?? []);

    if (search.step !== "close") {
      const idx = resolveResumeIndex({
        stepKeys,
        dayId,
        locator: progress.locator,
        requested: Boolean(search.resume),
      });
      // Invalid, foreign or stale locator resolves to -1: stay at Arrive.
      if (idx >= 0) setI(idx);
    }
    setResumeSettled(true);
  }, [dayId, stepKeys, search.resume, search.step]);

  // Quiet autosave of the exact screen. Never completes a day.
  useEffect(() => {
    if (!resumeSettled) return;
    saveLocator({ dayId, step: stepKeys[i], index: i });
  }, [dayId, stepKeys, i, resumeSettled]);

  // Completion is recorded only on genuinely reaching the closing screen.
  useEffect(() => {
    if (screens[i]?.kind !== "close") return;
    markDayComplete(dayId);
    markDayVisited(content.day);
  }, [screens, i, dayId, content.day]);

  const recordStepAnswers = (stepKey: string, optionIndexes: number[]) => {
    setDayAnswers((cur) => {
      const next = mergeStepAnswers(cur, stepKey, optionIndexes);
      saveDayAnswers(dayId, next);
      return next;
    });
  };

  const scrollTop = () => {
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };
  const goNext = () => {
    setI((n) => Math.min(closeIdx, n + 1));
    scrollTop();
  };
  const goPrev = () => {
    setI((n) => Math.max(0, n - 1));
    scrollTop();
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
      onAnswer={recordStepAnswers}
      nextDay={nextDay}
      onHome={() => navigate({ to: "/" })}
    />
  );
}

function ScreenBody({
  content,
  screen,
  label,
  progress,
  onBack,
  onNext,
  answers,
  onAnswer,
  nextDay,
  onHome,
}: {
  content: JourneyDayContent;
  screen: ScreenKey;
  label: string;
  progress: { current: number; total: number };
  onBack?: () => void;
  onNext: () => void;
  answers: string[];
  onAnswer: (stepKey: string, indexes: number[]) => void;
  nextDay: number | null;
  onHome: () => void;
}) {
  const shell = (
    node: React.ReactNode,
    nav: {
      onContinue?: () => void;
      continueLabel?: string;
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
      return shell(<ReflectionScreen content={content} answers={answers} />, {
        onContinue: onNext,
      });

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
  onAnswer: (stepKey: string, indexes: number[]) => void;
  onNext: () => void;
  label: string;
  progress: { current: number; total: number };
  onBack?: () => void;
}) {
  const [selected, setSelected] = useState<number[]>(() =>
    optionIndexesFor(answers, stepKey, question.options.length),
  );

  // Restore previously recorded choices once they arrive from storage.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    const prior = optionIndexesFor(answers, stepKey, question.options.length);
    if (prior.length > 0) {
      restoredRef.current = true;
      setSelected(prior);
    }
  }, [answers, stepKey, question.options.length]);

  const toggle = (idx: number) => {
    restoredRef.current = true;
    const next = toggleSelection(question, selected, idx);
    setSelected(next);
    onAnswer(stepKey, next);
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
  const chosen = optionIndexesFor(
    answers,
    answerKeyFor(content, question.id),
    question.options.length,
  )
    .map((idx) => echo.byOption[question.options[idx]!.id])
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
  const [open, setOpen] = useState<"reflection" | "spiritual" | null>(null);
  return (
    <div className="space-y-5">
      <p className="eyebrow">Practise</p>
      <h1 className="font-serif text-2xl leading-tight text-foreground sm:text-3xl">
        {content.practise.heading}
      </h1>
      <p className="text-base text-foreground">{content.practise.intro}</p>
      <p className="text-base text-muted-foreground">{content.practise.either}</p>
      <PracticePanel
        path={content.practise.reflection}
        isOpen={open === "reflection"}
        onToggle={() => setOpen(open === "reflection" ? null : "reflection")}
      />
      <PracticePanel
        path={content.practise.spiritual}
        isOpen={open === "spiritual"}
        onToggle={() => setOpen(open === "spiritual" ? null : "spiritual")}
      />
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
        className="btn-quiet w-full"
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

function ReflectionScreen({
  content,
  answers,
}: {
  content: JourneyDayContent;
  answers: string[];
}) {
  const [built, setBuilt] = useState<BuiltReflection | null>(null);

  const reveal = () => {
    const next = buildReflection(content, answers);
    setBuilt(next);
    // Saved locally only, so this screen can be resumed on this device.
    saveDayReflection(dayIdFor(content.day), reflectionToText(next));
  };

  return (
    <div className="space-y-5">
      <p className="eyebrow">Your Reflection</p>
      <h1 className="font-serif text-2xl leading-tight text-foreground sm:text-3xl">
        A reflection drawn from today
      </h1>
      <p className="text-base text-foreground">{content.reflection.intro}</p>

      {!built ? (
        <button type="button" onClick={reveal} className="btn-primary-journey w-full">
          See My Personalized Reflection
        </button>
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
