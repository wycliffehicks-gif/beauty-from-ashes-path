import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DAYS, getDay } from "@/content/days";
import { markDayVisited, usePrefs } from "@/lib/prefs";

export const Route = createFileRoute("/day/$day")({
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
  | "notice"
  | "name"
  | "listen"
  | "reflection"
  | "reconnect"
  | "step"
  | "close";

const STEPS: { key: StepKey; label: string }[] = [
  { key: "arrive", label: "Arrive" },
  { key: "notice", label: "Notice" },
  { key: "name", label: "Name" },
  { key: "listen", label: "Listen" },
  { key: "reflection", label: "Reflection" },
  { key: "reconnect", label: "Reconnect" },
  { key: "step", label: "One Honest Step" },
  { key: "close", label: "Close" },
];

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
  const [i, setI] = useState(0);

  // CRITICAL: reset step index and scroll on every day change so that
  // navigating from Day N → Day N+1 always opens at ARRIVE.
  useEffect(() => {
    setI(0);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, [dayNum]);

  useEffect(() => {
    if (content) markDayVisited(content.day);
  }, [content]);

  const nextDay = useMemo(
    () => DAYS.find((d) => d.day === dayNum + 1),
    [dayNum],
  );

  if (!content) {
    return (
      <FlowShell current={0} onExit={() => navigate({ to: "/journey" })} label="Day">
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

  const step = STEPS[i];
  const goNext = () => {
    setI((n) => Math.min(STEPS.length - 1, n + 1));
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };
  const goPrev = () => setI((n) => Math.max(0, n - 1));
  const exit = () => navigate({ to: "/" });

  return (
    <FlowShell
      current={i}
      total={STEPS.length}
      onExit={exit}
      onBack={i > 0 ? goPrev : undefined}
      label={`Day ${content.day} · ${step.label}`}
    >
      {step.key === "arrive" && (
        <StepArrive title={content.title} arrive={content.arriveLine} onNext={goNext} />
      )}
      {step.key === "notice" && (
        <StepChoice
          heading="Notice"
          prompt="How is it, being you, right now?"
          hint="There is no right answer. Pick what fits, or skip."
          options={NOTICE_OPTIONS}
          onNext={goNext}
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
    </FlowShell>
  );
}

function FlowShell({
  children,
  current,
  total = STEPS.length,
  onExit,
  onBack,
  label,
}: {
  children: React.ReactNode;
  current: number;
  total?: number;
  onExit: () => void;
  onBack?: () => void;
  label: string;
}) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="container-page flex min-h-[100dvh] flex-col py-6">
        <header className="space-y-3 pb-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack ?? onExit}
              className="inline-link rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
              aria-label={onBack ? "Back" : "Close"}
            >
              {onBack ? "← Back" : "✕ Close"}
            </button>
            <p className="min-w-0 flex-1 truncate text-center text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {label}
            </p>
            <button
              type="button"
              onClick={onExit}
              className="inline-link rounded-md px-2 py-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Close
            </button>
          </div>
          <nav className="flex items-center justify-center gap-4 text-sm">
            <Link
              to="/"
              className="inline-link text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Home
            </Link>
            <span aria-hidden className="text-muted-foreground">·</span>
            <Link
              to="/practice/$id"
              params={{ id: "pause-and-ground" }}
              className="inline-link text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Pause
            </Link>
            <span aria-hidden className="text-muted-foreground">·</span>
            <Link
              to="/support"
              className="inline-link text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Support
            </Link>
          </nav>
        </header>

        <div aria-hidden className="mb-6 flex gap-1">
          {Array.from({ length: total }).map((_, idx) => (
            <span
              key={idx}
              className={`h-0.5 flex-1 rounded ${
                idx <= current ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>

        <div className="flex-1">{children}</div>

        <div className="pt-6 text-center text-sm text-muted-foreground">
          <button
            type="button"
            onClick={onExit}
            className="inline-link underline underline-offset-4"
          >
            Close for today
          </button>
        </div>
      </div>
    </div>
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
                className={`w-full rounded-md border px-4 py-3 text-left text-base transition-colors ${
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
  content: ReturnType<typeof getDay> & object;
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
      className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-5 py-3 text-base font-medium text-primary-foreground transition-colors hover:opacity-90"
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
      className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-background px-5 py-3 text-base font-medium text-foreground hover:bg-secondary"
    >
      {children}
    </button>
  );
}
