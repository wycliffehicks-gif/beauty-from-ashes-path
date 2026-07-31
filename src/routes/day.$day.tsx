import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DAYS, getDay, type DayContent } from "@/content/days";
import { markDayVisited, usePrefs } from "@/lib/prefs";
import {
  BRANCH_KEYS,
  BRANCH_LABELS,
  resolveBranch,
  type BranchKey,
  type ResolvedBranch,
} from "@/lib/day-branches";
import { SESSION_DAY } from "@/lib/session/day-three";
import { DayThreeOrientation } from "@/components/DayThreeOrientation";
import { JourneyScreen } from "@/components/JourneyScreen";
import { dayIdFor } from "@/content/journey";
import { markDayComplete, readProgress, saveLocator } from "@/lib/journey/progress";


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
    const d = getDay(Number(params.day));
    const title = d ? `Day ${d.day}: ${d.title} — Beauty from Ashes` : "Day — Beauty from Ashes";
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

type StepKey =
  | "arrive"
  | "teach"
  | "notice"
  | "name"
  | "listen"
  | "reflection"
  | "reconnect"
  | "step"
  | "close";

const BASE_STEPS: { key: StepKey; label: string }[] = [
  { key: "arrive", label: "Arrive" },
  { key: "notice", label: "Notice" },
  { key: "name", label: "Name" },
  { key: "listen", label: "Listen" },
  { key: "reflection", label: "Reflection" },
  { key: "reconnect", label: "Reconnect" },
  { key: "step", label: "One Honest Step" },
  { key: "close", label: "Close" },
];

function stepsFor(content: DayContent): { key: StepKey; label: string }[] {
  if (!content.teach) return BASE_STEPS;
  // Insert Teach immediately after Arrive.
  return [
    BASE_STEPS[0],
    { key: "teach", label: "Teach" },
    ...BASE_STEPS.slice(1),
  ];
}

const NOTICE_OPTIONS = [
  "Heavy or tired",
  "Tense or on-edge",
  "Numb or far away",
  "Restless",
  "Softer than yesterday",
  "Somewhere in between",
  "I’m not sure yet",
];

const NAME_OPTIONS = [
  "Grief",
  "Fear",
  "Shame",
  "Anger",
  "Loneliness",
  "Exhaustion",
  "Longing",
  "Something old, without words",
  "I need to go slowly",
];

function DayFlow() {
  const { day } = Route.useParams();
  const dayNum = Number(day);
  const content = getDay(dayNum);
  const [prefs] = usePrefs();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const steps = useMemo(
    () => (content ? stepsFor(content) : BASE_STEPS),
    [content],
  );
  const closeIdx = steps.length - 1;

  const [i, setI] = useState(() =>
    search.step === "close" ? closeIdx : 0,
  );
  const [branch, setBranch] = useState<ResolvedBranch | null>(null);

  // Reset when day changes, or land on the requested / saved locator.
  useEffect(() => {
    if (search.step === "close") {
      setI(closeIdx);
    } else if (search.resume) {
      const saved = readProgress().locator;
      const idx =
        saved && saved.dayId === dayIdFor(dayNum)
          ? steps.findIndex((s) => s.key === saved.step)
          : -1;
      setI(idx >= 0 ? idx : 0);
    } else {
      setI(0);
    }
    setBranch(null);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, [dayNum, search.step, search.resume, closeIdx, steps]);

  // Universal autosave: the exact day and screen, nothing sensitive. This is
  // what lets Home quietly save and lets "Continue where you left off" work.
  useEffect(() => {
    if (!content || content.day === SESSION_DAY) return;
    saveLocator({ dayId: dayIdFor(content.day), step: steps[i].key, index: i });
  }, [content, steps, i]);

  // Completion is only recorded on genuinely reaching the closing screen.
  // Opening a day, or returning Home, never completes it. Day 3 is completed
  // only by the Stage 11 finish-and-clear action.
  useEffect(() => {
    if (!content || content.day === SESSION_DAY) return;
    if (steps[i].key !== "close") return;
    markDayComplete(dayIdFor(content.day));
    markDayVisited(content.day);
  }, [content, steps, i]);



  const nextDay = useMemo(
    () => DAYS.find((d) => d.day === dayNum + 1),
    [dayNum],
  );

  if (!content) {
    return (
      <FlowShell current={0} total={BASE_STEPS.length} onExit={() => navigate({ to: "/journey" })} label="Day">
        <div className="space-y-4">
          <h1 className="font-serif text-2xl text-foreground">This day isn’t here</h1>
          <p className="text-muted-foreground">Please choose a day from the journey.</p>
          <Link to="/journey" className="inline-link text-primary underline">
            Back to Journey
          </Link>
        </div>
      </FlowShell>
    );
  }

  if (content.day === SESSION_DAY) {
    return <DayThreeOrientation title={content.title} theme={content.theme} />;
  }



  const step = steps[i];
  const jumpTo = (key: StepKey) => {
    const idx = steps.findIndex((s) => s.key === key);
    if (idx >= 0) {
      setI(idx);
      if (typeof window !== "undefined") window.scrollTo(0, 0);
    }
  };
  const goNext = () => {
    setI((n) => Math.min(steps.length - 1, n + 1));
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };
  const goPrev = () => setI((n) => Math.max(0, n - 1));
  const exit = () => navigate({ to: "/" });

  const onBranch = (key: BranchKey) => {
    const r = resolveBranch(content, key);
    if (!r) return;
    setBranch(r);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };
  const clearBranch = () => setBranch(null);

  const label = branch
    ? `Day ${content.day} · ${BRANCH_LABELS[branch.key]}`
    : `Day ${content.day} · ${step.label}`;

  const backHandler = branch
    ? clearBranch
    : i > 0
      ? goPrev
      : undefined;

  return (
    <FlowShell
      current={i}
      total={steps.length}
      onExit={exit}
      onBack={backHandler}
      label={label}
    >
      {branch ? (
        <BranchView
          branch={branch}
          onContinueForward={() => {
            clearBranch();
            jumpTo("listen");
          }}
          onContinueTinyStep={() => {
            // Skip remaining prompts; the tiny-step view IS the remainder.
            clearBranch();
            jumpTo("close");
          }}
          onGroundingClose={() => {
            // Person chose "Not today" — leave safely; day already marked visited.
            navigate({ to: "/" });
          }}
        />
      ) : (
        <>
          {step.key === "arrive" && (
            <StepArrive title={content.title} arrive={content.arriveLine} onNext={goNext} />
          )}
          {step.key === "teach" && content.teach && (
            <StepTeach teach={content.teach} practiceId={content.practiceId} onNext={goNext} />
          )}
          {step.key === "notice" && (
            <StepNotice
              options={NOTICE_OPTIONS}
              branchKeys={content.branches ? BRANCH_KEYS : []}
              onNext={goNext}
              onBranch={onBranch}
            />
          )}
          {step.key === "name" && (
            <StepChoice
              heading="Name"
              prompt="What might you be carrying today?"
              hint="Naming is not fixing. You may choose more than one, or skip."
              options={NAME_OPTIONS}
              multi
              onNext={goNext}
            />
          )}
          {step.key === "listen" && (
            <StepListen prompts={content.listenPrompts} onNext={goNext} />
          )}
          {step.key === "reflection" && (
            <StepReflection
              content={content}
              showSpiritual={prefs.showSpiritual}
              onNext={goNext}
            />
          )}
          {step.key === "reconnect" && (
            <StepChoice
              heading="Reconnect"
              prompt="Where might reconnection begin today?"
              hint="Reconnection never means returning to unsafe people."
              options={content.reconnectOptions.map((o) => `${o.label} — ${o.description}`)}
              onNext={goNext}
            />
          )}
          {step.key === "step" && (
            <StepChoice
              heading="One Honest Step"
              prompt="What small, honest step feels possible today?"
              hint="Small counts. Preparation counts. Skipping is also a valid answer."
              options={content.oneHonestStep}
              onNext={goNext}
            />
          )}
          {step.key === "close" && (
            <StepClose
              dayNum={content.day}
              blessing={content.closingBlessing}
              prayer={prefs.showSpiritual ? content.optionalPrayer : undefined}
              nextDay={nextDay?.day}
            />
          )}
        </>
      )}
    </FlowShell>
  );
}

/**
 * Day-flow chrome. Delegates to the shared therapeutic screen shell: small
 * Home and Settings controls only, Back in the bottom navigation area, and no
 * safety banner, Pause, Support or "Close for today" in the content header.
 * Each step supplies its own Continue.
 */
function FlowShell({
  children,
  current,
  total,
  onBack,
  label,
}: {
  children: React.ReactNode;
  current: number;
  total: number;
  /** Retained for callers; exiting now happens through the Home control. */
  onExit?: () => void;
  onBack?: () => void;
  label: string;
}) {
  return (
    <JourneyScreen
      label={label}
      progress={{ current, total }}
      onBack={onBack}
      backLabel="← Back"
    >
      {children}
    </JourneyScreen>
  );
}

function StepArrive({
  title,
  arrive,
  onNext,
}: {
  title: string;
  arrive: string;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <p className="eyebrow">Arrive</p>
      <h1 className="font-serif text-3xl leading-tight text-foreground sm:text-4xl">{title}</h1>
      <p className="text-lg text-foreground">{arrive}</p>
      <p className="text-base text-muted-foreground">
        Take one slower breath. You don’t need to do more than arrive.
      </p>
      <div className="flex flex-col gap-2 pt-4">
        <PrimaryButton onClick={onNext}>Begin</PrimaryButton>
      </div>
    </div>
  );
}

function StepTeach({
  teach,
  practiceId,
  onNext,
}: {
  teach: string;
  practiceId?: string;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5" data-testid="step-teach">
      <p className="eyebrow">A word before we begin</p>
      <h2 className="font-serif text-2xl text-foreground sm:text-3xl">
        How to work with today
      </h2>
      <p className="whitespace-pre-line text-lg leading-relaxed text-foreground">
        {teach}
      </p>
      <p className="text-sm text-muted-foreground">
        This is guidance, not a test. There is no wrong way to read it.
      </p>
      {practiceId && (
        <Link
          to="/practice/$id"
          params={{ id: practiceId }}
          className="inline-link text-sm text-primary underline underline-offset-4"
        >
          Optional companion practice
        </Link>
      )}
      <div className="pt-2">
        <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
      </div>
    </div>
  );
}

function StepNotice({
  options,
  branchKeys,
  onNext,
  onBranch,
}: {
  options: string[];
  branchKeys: BranchKey[];
  onNext: () => void;
  onBranch: (k: BranchKey) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (o: string) =>
    setSelected((s) => (s.includes(o) ? s.filter((x) => x !== o) : [o]));
  return (
    <div className="space-y-5">
      <p className="eyebrow">Notice</p>
      <h2 className="font-serif text-2xl text-foreground sm:text-3xl">
        How is it, being you, right now?
      </h2>
      <p className="text-base text-muted-foreground">
        There is no right answer. Pick what fits, or choose a gentler path below.
      </p>
      <ul className="space-y-2">
        {options.map((o) => {
          const active = selected.includes(o);
          return (
            <li key={o}>
              <button
                type="button"
                onClick={() => toggle(o)}
                aria-pressed={active}
                className={`min-h-11 w-full rounded-md border px-4 py-3 text-left text-base transition-colors ${
                  active
                    ? "border-[var(--gold)] bg-[var(--champagne)]/40 text-foreground"
                    : "border-border bg-card hover:border-[var(--deep-navy)]/40"
                }`}
              >
                {o}
              </button>
            </li>
          );
        })}
      </ul>

      {branchKeys.length > 0 && (
        <div
          className="rounded-lg border border-border/70 bg-secondary/40 p-4"
          data-testid="branch-strip"
        >
          <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
            Or choose a gentler path
          </p>
          <p className="mb-3 text-sm text-muted-foreground">
            Each of these is a valid answer. Nothing is scored or saved.
          </p>
          <ul className="flex flex-wrap gap-2">
            {branchKeys.map((k) => (
              <li key={k}>
                <button
                  type="button"
                  data-testid={`branch-${k}`}
                  onClick={() => onBranch(k)}
                  className="min-h-11 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground hover:border-[var(--deep-navy)]/50"
                >
                  {BRANCH_LABELS[k]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
        <SubtleButton onClick={onNext}>Skip</SubtleButton>
      </div>
    </div>
  );
}

function BranchView({
  branch,
  onContinueForward,
  onContinueTinyStep,
  onGroundingClose,
}: {
  branch: ResolvedBranch;
  onContinueForward: () => void;
  onContinueTinyStep: () => void;
  onGroundingClose: () => void;
}) {
  return (
    <div className="space-y-5" data-testid={`branch-view-${branch.key}`}>
      <p className="eyebrow">{BRANCH_LABELS[branch.key]}</p>
      <p className="whitespace-pre-line text-lg leading-relaxed text-foreground">
        {branch.response}
      </p>

      {branch.mode === "forward" && (
        <div className="flex flex-col gap-2 pt-2">
          <PrimaryButton onClick={onContinueForward}>
            Continue gently
          </PrimaryButton>
          <p className="text-sm text-muted-foreground">
            We will move on without asking you to name anything else.
          </p>
        </div>
      )}

      {branch.mode === "low-arousal-grounding" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-secondary/40 p-4 text-base text-foreground">
            <p className="mb-2 font-medium">A low-key body moment</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Feel where your body meets the chair or ground.</li>
              <li>Let one exhale be slightly longer than the inhale.</li>
              <li>Notice the temperature of the air on your hands.</li>
            </ul>
            <p className="mt-2 text-sm text-muted-foreground">
              We will not press you to name a feeling. Sensation is enough.
            </p>
          </div>
          <PrimaryButton onClick={onContinueForward}>
            Continue when ready
          </PrimaryButton>
        </div>
      )}

      {branch.mode === "tiny-step" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-[color:var(--gold)]/60 bg-[color:var(--champagne)]/25 p-4">
            <p className="mb-1 font-medium text-foreground">
              One tiny preparation step
            </p>
            <ul className="list-disc space-y-1 pl-5 text-base text-foreground">
              <li>Notice that you opened this at all.</li>
              <li>Hold one word for the road, quietly, without writing it.</li>
              <li>Drink a sip of water.</li>
            </ul>
            <p className="mt-2 text-sm text-muted-foreground">
              Preparation counts. This is a whole step today.
            </p>
          </div>
          <PrimaryButton onClick={onContinueTinyStep}>
            Close today gently
          </PrimaryButton>
        </div>
      )}

      {branch.mode === "grounding-close" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-secondary/40 p-4 text-base text-foreground">
            <p className="mb-2 font-medium">A 60–90 second close</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Look slowly around and name three things you can see.</li>
              <li>Feel your feet on the floor for one full breath.</li>
              <li>
                Let this be enough:{" "}
                <em>you came here, and you get to leave when you need to.</em>
              </li>
            </ol>
          </div>
          <PrimaryButton onClick={onGroundingClose}>
            Leave safely
          </PrimaryButton>
          <p className="text-sm text-muted-foreground">
            Today is marked as visited. Nothing here pretends you did more than
            you did.
          </p>
        </div>
      )}
    </div>
  );
}

function StepChoice({
  heading,
  prompt,
  hint,
  options,
  multi,
  onNext,
}: {
  heading: string;
  prompt: string;
  hint?: string;
  options: string[];
  multi?: boolean;
  onNext: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (o: string) => {
    setSelected((s) =>
      multi
        ? s.includes(o)
          ? s.filter((x) => x !== o)
          : [...s, o]
        : [o],
    );
  };
  return (
    <div className="space-y-5">
      <p className="eyebrow">{heading}</p>
      <h2 className="font-serif text-2xl text-foreground sm:text-3xl">{prompt}</h2>
      {hint && <p className="text-base text-muted-foreground">{hint}</p>}
      <ul className="space-y-2">
        {options.map((o) => {
          const active = selected.includes(o);
          return (
            <li key={o}>
              <button
                type="button"
                onClick={() => toggle(o)}
                aria-pressed={active}
                className={`min-h-11 w-full rounded-md border px-4 py-3 text-left text-base transition-colors ${
                  active
                    ? "border-[var(--gold)] bg-[var(--champagne)]/40 text-foreground"
                    : "border-border bg-card hover:border-[var(--deep-navy)]/40"
                }`}
              >
                {o}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2 pt-2">
        <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
        <SubtleButton onClick={onNext}>Skip</SubtleButton>
      </div>
    </div>
  );
}

function StepListen({ prompts, onNext }: { prompts: string[]; onNext: () => void }) {
  return (
    <div className="space-y-5">
      <p className="eyebrow">Listen</p>
      <h2 className="font-serif text-2xl text-foreground sm:text-3xl">A few gentle questions</h2>
      <p className="text-base text-muted-foreground">
        Read slowly. You do not have to answer. Notice which one lingers.
      </p>
      <ul className="space-y-3">
        {prompts.map((p, idx) => (
          <li
            key={idx}
            className="rounded-lg border border-border bg-card p-4 font-serif text-lg leading-snug text-foreground"
          >
            {p}
          </li>
        ))}
      </ul>
      <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
    </div>
  );
}

function StepReflection({
  content,
  showSpiritual,
  onNext,
}: {
  content: DayContent;
  showSpiritual: boolean;
  onNext: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-5">
      <p className="eyebrow">Reflection</p>
      <h2 className="font-serif text-2xl leading-snug text-foreground sm:text-3xl">{content.title}</h2>
      <p className="whitespace-pre-line text-lg leading-relaxed text-foreground">
        {content.coreReflection}
      </p>

      {showSpiritual && content.scripture && (
        <div className="rounded-lg border border-border bg-secondary/50 p-4">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-link flex w-full items-center justify-between text-left font-medium text-foreground"
          >
            <span>Scripture &amp; spiritual reflection</span>
            <span aria-hidden>{open ? "–" : "+"}</span>
          </button>
          {open && (
            <div className="mt-3 space-y-2 text-base">
              <p className="font-medium text-foreground">{content.scripture.reference}</p>
              <blockquote className="border-l-2 border-[var(--gold)] pl-3 italic text-foreground">
                “{content.scripture.body}”
              </blockquote>
              {content.scripture.note && (
                <p className="text-muted-foreground">{content.scripture.note}</p>
              )}
            </div>
          )}
        </div>
      )}

      <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
    </div>
  );
}

function StepClose({
  dayNum,
  blessing,
  prayer,
  nextDay,
}: {
  dayNum: number;
  blessing: string;
  prayer?: string;
  nextDay?: number;
}) {
  const navigate = useNavigate();
  const isFinalDay = dayNum === 7;
  return (
    <div className="space-y-6">
      <p className="eyebrow">Close</p>
      <h2 className="font-serif text-2xl text-foreground sm:text-3xl">A gentle close</h2>
      <p className="text-lg leading-relaxed text-foreground">{blessing}</p>
      {prayer && (
        <div className="rounded-lg border border-border bg-secondary/50 p-4 text-base">
          <p className="mb-1 font-medium text-foreground">Optional prayer</p>
          <p className="italic text-foreground">{prayer}</p>
        </div>
      )}

      {dayNum === 1 && (
        <div className="rounded-lg border border-[color:var(--gold)]/60 bg-[color:var(--champagne)]/25 p-4">
          <h3 className="font-serif text-lg text-foreground">
            Your Reflection and Next Gentle Steps
          </h3>
          <p className="mt-1 text-sm text-foreground">
            Optional. Answer three brief questions and receive a reflection shaped by
            what you select. You may skip this and close Day 1.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <Link
              to="/day/$day/reflection"
              params={{ day: "1" }}
              search={{ mode: "live" }}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-base font-medium text-primary-foreground hover:opacity-90"
            >
              Try live AI reflection
            </Link>
            <Link
              to="/day/$day/reflection"
              params={{ day: "1" }}
              search={{ mode: "curated" }}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-5 py-3 text-base font-medium text-foreground hover:bg-secondary"
            >
              Use curated reflection preview
            </Link>
            <p className="text-xs text-muted-foreground">
              Live AI personalizes the tentative summary within founder-approved
              material. The curated version is always available.
            </p>
          </div>
        </div>
      )}


      {isFinalDay ? (
        <div className="space-y-4 rounded-lg border border-border bg-card p-5">
          <h3 className="font-serif text-xl text-foreground sm:text-2xl">
            You have reached the end of these seven days — but not the end of the journey.
          </h3>
          <ul className="list-disc space-y-2 pl-5 text-base text-foreground">
            <li>Revisit any day that still feels meaningful.</li>
            <li>Return to <em>One Honest Step</em> when life feels heavy or unclear.</li>
            <li>Continue with the Beauty from Ashes videos.</li>
            <li>Use the future companion journal for deeper reflection when available.</li>
            <li>Move toward a safe person, community or qualified professional when support is needed.</li>
            <li>Carry forward one truth, practice or prayer from the journey.</li>
          </ul>
          <div className="flex flex-col gap-2 pt-1">
            <PrimaryButton onClick={() => navigate({ to: "/" })}>Return Home</PrimaryButton>
            <SubtleButton onClick={() => navigate({ to: "/journey" })}>View the Journey</SubtleButton>
            <SubtleButton onClick={() => navigate({ to: "/resources" })}>Open Resources</SubtleButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 pt-2">
          {nextDay && (
            <PrimaryButton
              onClick={() => navigate({ to: "/day/$day", params: { day: String(nextDay) } })}
            >
              Continue to Day {nextDay}
            </PrimaryButton>
          )}
          <SubtleButton onClick={() => navigate({ to: "/" })}>Return Home</SubtleButton>
          <SubtleButton onClick={() => navigate({ to: "/journey" })}>View the Journey</SubtleButton>
        </div>
      )}
    </div>
  );
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:opacity-90"
    >
      {children}
    </button>
  );
}

function SubtleButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-background px-5 py-3 text-base font-medium text-foreground hover:bg-secondary"
    >
      {children}
    </button>
  );
}
