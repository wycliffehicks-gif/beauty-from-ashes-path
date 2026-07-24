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
  const goNext = () => setI((n) => Math.min(STEPS.length - 1, n + 1));
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
        <StepArrive title={content.title} arrive={content.arriveLine} onNext={goNext} onSkip={goNext} />
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
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 pb-4">
          <button
            type="button"
            onClick={onBack ?? onExit}
            className="inline-link rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
            aria-label={onBack ? "Back" : "Close"}
          >
            {onBack ? "← Back" : "✕ Close"}
          </button>
          <p className="min-w-0 truncate text-center text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <Link
            to="/support"
            className="inline-link rounded-md px-2 py-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Support
          </Link>
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

        <div className="pt-6 text-center text-xs text-muted-foreground">
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
  onSkip,
}: {
  title: string;
  arrive: string;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-6">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Arrive</p>
      <h1 className="font-serif text-3xl leading-tight text-foreground sm:text-4xl">{title}</h1>
      <p className="text-lg text-muted-foreground">{arrive}</p>
      <p className="text-sm text-muted-foreground">
        Take one slower breath. You don’t need to do more than arrive.
      </p>
      <div className="flex flex-col gap-2 pt-4">
        <PrimaryButton onClick={onNext}>Begin</PrimaryButton>
        <SubtleButton onClick={onSkip}>Skip to reflection</SubtleButton>
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
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{heading}</p>
      <h2 className="font-serif text-2xl text-foreground">{prompt}</h2>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      <ul className="space-y-2">
        {options.map((o) => {
          const active = selected.includes(o);
          return (
            <li key={o}>
              <button
                type="button"
                onClick={() => toggle(o)}
                aria-pressed={active}
                className={`w-full rounded-md border px-4 py-3 text-left text-[15px] transition-colors ${
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
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Listen</p>
      <h2 className="font-serif text-2xl text-foreground">A few gentle questions</h2>
      <p className="text-sm text-muted-foreground">
        Read slowly. You do not have to answer. Notice which one lingers.
      </p>
      <ul className="space-y-3">
        {prompts.map((p, idx) => (
          <li
            key={idx}
            className="rounded-xl border border-border bg-card p-4 font-serif text-lg leading-snug text-foreground"
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
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Reflection</p>
      <h2 className="font-serif text-2xl leading-snug text-foreground">{content.title}</h2>
      <p className="whitespace-pre-line text-[17px] leading-relaxed text-foreground">
        {content.coreReflection}
      </p>

      {showSpiritual && content.scripture && (
        <div className="rounded-xl border border-border bg-secondary/50 p-4">
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
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-medium text-foreground">{content.scripture.reference}</p>
              <blockquote className="border-l-2 border-[var(--ember)] pl-3 italic text-foreground">
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
  blessing,
  prayer,
  nextDay,
}: {
  blessing: string;
  prayer?: string;
  nextDay?: number;
}) {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Close</p>
      <h2 className="font-serif text-2xl text-foreground">A gentle close</h2>
      <p className="text-[17px] leading-relaxed text-foreground">{blessing}</p>
      {prayer && (
        <div className="rounded-xl border border-border bg-secondary/50 p-4 text-sm">
          <p className="mb-1 font-medium text-foreground">Optional prayer</p>
          <p className="italic text-foreground">{prayer}</p>
        </div>
      )}
      <div className="flex flex-col gap-2 pt-2">
        {nextDay ? (
          <PrimaryButton onClick={() => navigate({ to: "/day/$day", params: { day: String(nextDay) } })}>
            When you’re ready, continue to Day {nextDay}
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={() => navigate({ to: "/journey" })}>
            You’ve walked all seven days. Revisit any time.
          </PrimaryButton>
        )}
        <SubtleButton onClick={() => navigate({ to: "/" })}>Return to Today</SubtleButton>
      </div>
    </div>
  );
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground transition-colors hover:opacity-90"
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
      className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-background px-5 py-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  );
}
