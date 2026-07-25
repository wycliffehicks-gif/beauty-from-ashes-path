import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { usePrefs } from "@/lib/prefs";
import { computeReflection, type ReflectionServerResult } from "@/lib/ai/compute";
import { generateDay01Reflection } from "@/lib/ai-reflection.functions";
import { getRegion } from "@/content/crisis-registry";
import type {
  EmotionId,
  EnergyId,
  ReflectionOutput,
  RegionCode,
  RoadTypeId,
} from "@/lib/ai/types";

type ReflectionMode = "curated" | "live";

export const Route = createFileRoute("/day/$day/reflection")({
  validateSearch: (search: Record<string, unknown>): { mode: ReflectionMode } => ({
    mode: search.mode === "live" ? "live" : "curated",
  }),
  head: () => ({
    meta: [
      { title: "Your Reflection and Next Gentle Steps — Beauty from Ashes" },
      {
        name: "description",
        content:
          "An optional Day 1 reflection shaped by a few brief answers. Private, not saved.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReflectionFlow,
});


type Screen =
  | "eligibility"
  | "q1-road"
  | "q2-emotion"
  | "q3-energy"
  | "optional-text"
  | "result"
  | "safety"
  | "not-eligible";

const ROADS: Array<{ id: RoadTypeId; label: string }> = [
  { id: "difficult-conversation", label: "A difficult conversation" },
  { id: "grief-set-aside", label: "A grief I keep setting aside" },
  { id: "boundary-postponed", label: "A boundary I have been postponing" },
  { id: "asking-for-help", label: "Asking for help" },
  { id: "truth-about-self", label: "A truth about myself I have been avoiding" },
  { id: "meaningful-calling-or-decision", label: "A meaningful calling or decision" },
  { id: "not-sure", label: "I’m not sure" },
  { id: "prefer-not-to-say", label: "I’d rather not say" },
];

const EMOTIONS: Array<{ id: EmotionId; label: string }> = [
  { id: "fear", label: "Fear" },
  { id: "shame", label: "Shame" },
  { id: "grief", label: "Grief" },
  { id: "anger", label: "Anger" },
  { id: "numbness", label: "Numbness" },
  { id: "uncertainty", label: "Uncertainty" },
  { id: "mixed", label: "A mixture of things" },
];

const ENERGIES: Array<{ id: EnergyId; label: string }> = [
  { id: "very-little", label: "Very little" },
  { id: "some", label: "Some" },
  { id: "more-than-usual", label: "More than usual" },
];

function ReflectionFlow() {
  const { day } = Route.useParams();
  const { mode } = Route.useSearch();
  const dayNum = Number(day);
  const [prefs] = usePrefs();
  const navigate = useNavigate();
  const callGenerate = useServerFn(generateDay01Reflection);

  const [screen, setScreen] = useState<Screen>("eligibility");
  const [adult, setAdult] = useState(false);
  const [consent, setConsent] = useState(false);
  const [region, setRegion] = useState<RegionCode>("CA");
  const [road, setRoad] = useState<RoadTypeId | null>(null);
  const [emotion, setEmotion] = useState<EmotionId | null>(null);
  const [energy, setEnergy] = useState<EnergyId | null>(null);
  const [notSafe, setNotSafe] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [result, setResult] = useState<ReflectionServerResult | null>(null);
  const [pending, setPending] = useState(false);

  // Only Day 1 is supported for the preview.
  if (dayNum !== 1) {
    return (
      <Frame title="Personalized reflection">
        <p className="text-foreground">
          This preview is available on Day 1. Please open Day 1 to try it.
        </p>
        <div className="pt-4">
          <Link
            to="/day/$day"
            params={{ day: "1" }}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground"
          >
            Go to Day 1
          </Link>
        </div>
      </Frame>
    );
  }

  const closeToDay = () =>
    navigate({ to: "/day/$day", params: { day: String(dayNum) } });

  const runCompute = async (safe: boolean) => {
    const input = {
      dayId: "day-01" as const,
      roadType: road!,
      emotion: emotion!,
      energy: energy!,
      notSafeNow: safe ? false : true,
      adultConfirmed: true as const,
      spiritual: prefs.showSpiritual,
      region,
      ...(freeText.trim().length > 0 ? { freeText: freeText.trim() } : {}),
    };
    let res: ReflectionServerResult;
    if (mode === "live") {
      setPending(true);
      try {
        res = await callGenerate({ data: { input, mode: "live" } });
      } catch {
        // Any transport error — fall back to curated locally so the user
        // is never left staring at an error.
        res = computeReflection(input, false, "curated");
      } finally {
        setPending(false);
      }
    } else {
      res = computeReflection(input, false, "curated");
    }
    setResult(res);
    if (res.kind === "urgent-safety") setScreen("safety");
    else if (res.kind === "minor-not-eligible") setScreen("not-eligible");
    else setScreen("result");
  };


  // ---------------- Eligibility ----------------
  if (screen === "eligibility") {
    const canContinue = adult && (mode !== "live" || consent);
    return (
      <Frame
        title="Your Reflection and Next Gentle Steps"
        eyebrow={mode === "live" ? "Optional live-AI preview" : "Optional preview"}
      >
        <p className="text-foreground">
          Answer three brief questions and receive a reflection shaped by what you
          select. Your answers and the reflection are not saved.
        </p>

        {mode === "live" && (
          <div className="mt-4 rounded-lg border border-[color:var(--gold)]/60 bg-[color:var(--champagne)]/25 p-4 text-sm leading-relaxed text-foreground">
            <p className="font-medium">About this optional live-AI test</p>
            <p className="mt-1">
              For this optional live-AI test, your selected answers and any words you
              enter are sent through Lovable AI and its model provider to prepare this
              one reflection. This app does not intentionally save your answers or
              reflection. Please do not include names, addresses, workplaces,
              medical-record details, confidential information, or identifying details
              about other people.
            </p>
          </div>
        )}

        <label className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-card p-4">
          <input
            type="checkbox"
            checked={adult}
            onChange={(e) => setAdult(e.target.checked)}
            className="mt-1.5"
          />
          <span className="text-foreground">I confirm that I am 18 or older.</span>
        </label>

        {mode === "live" && (
          <label className="mt-3 flex items-start gap-3 rounded-lg border border-border bg-card p-4">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1.5"
            />
            <span className="text-foreground">
              I understand and choose to use live AI for this reflection.
            </span>
          </label>
        )}

        <fieldset className="mt-4 space-y-2">
          <legend className="eyebrow mb-2">Where are you today?</legend>
          <p className="pb-2 text-sm text-muted-foreground">
            Used only to show appropriate support information if needed.
          </p>
          <label className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
            <input
              type="radio"
              name="region"
              checked={region === "CA"}
              onChange={() => setRegion("CA")}
              className="mt-1.5"
            />
            <span className="text-foreground">Canada</span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
            <input
              type="radio"
              name="region"
              checked={region === "GLOBAL"}
              onChange={() => setRegion("GLOBAL")}
              className="mt-1.5"
            />
            <span className="text-foreground">Outside Canada / Global</span>
          </label>
        </fieldset>

        {mode === "live" && (
          <p className="mt-3 text-xs text-muted-foreground">
            Prefer no live AI?{" "}
            <Link
              to="/day/$day/reflection"
              params={{ day: "1" }}
              search={{ mode: "curated" }}
              className="underline underline-offset-4"
            >
              Use the curated reflection preview instead.
            </Link>
          </p>
        )}

        <Dock
          onBack={closeToDay}
          backLabel="Close"
          onNext={() =>
            canContinue
              ? setScreen("q1-road")
              : !adult
                ? setScreen("not-eligible")
                : undefined
          }
          nextDisabled={!canContinue}
          nextLabel="Continue"
          progress="1 of 5"
        />
      </Frame>
    );
  }



  if (screen === "not-eligible") {
    return (
      <Frame title="This preview is for adults 18+" eyebrow="Not eligible today">
        <p className="text-foreground">
          Thank you for being honest. This optional preview is available to adults 18
          or older. You can still close Day 1 gently, and return to the rest of the
          journey whenever you like.
        </p>
        <Dock onBack={closeToDay} backLabel="Return to Day 1" />
      </Frame>
    );
  }

  // ---------------- Q1 Road ----------------
  if (screen === "q1-road") {
    return (
      <Frame title="What best describes the road you may be avoiding?" eyebrow="Question 1 of 3">
        <ChoiceList
          options={ROADS}
          value={road}
          onChange={setRoad}
        />
        <Dock
          onBack={() => setScreen("eligibility")}
          onNext={() => road && setScreen("q2-emotion")}
          nextDisabled={!road}
          progress="2 of 5"
        />
      </Frame>
    );
  }

  // ---------------- Q2 Emotion ----------------
  if (screen === "q2-emotion") {
    return (
      <Frame title="What feels most present as you think about it?" eyebrow="Question 2 of 3">
        <ChoiceList options={EMOTIONS} value={emotion} onChange={setEmotion} />
        <Dock
          onBack={() => setScreen("q1-road")}
          onNext={() => emotion && setScreen("q3-energy")}
          nextDisabled={!emotion}
          progress="3 of 5"
        />
      </Frame>
    );
  }

  // ---------------- Q3 Energy + safety option ----------------
  if (screen === "q3-energy") {
    return (
      <Frame title="How much energy do you have for one small step today?" eyebrow="Question 3 of 3">
        <ChoiceList options={ENERGIES} value={energy} onChange={setEnergy} />
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              setNotSafe(true);
              // Route immediately to safety screen via a synthetic result.
              const r = getRegion(region);
              setResult({
                kind: "urgent-safety",
                reasonCode: "explicit-flag",
                region: {
                  code: r.code,
                  label: r.label,
                  emergencyGuidance: r.emergencyGuidance,
                },
              });
              setScreen("safety");
            }}
            className="w-full rounded-lg border border-[color:var(--gold)] bg-[color:var(--warm-ivory)] px-4 py-3 text-left text-base text-foreground hover:bg-[color:var(--champagne)]/40"
          >
            <span className="block font-medium">I do not feel safe right now.</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              We will pause the reflection and show support information.
            </span>
          </button>
        </div>
        <Dock
          onBack={() => setScreen("q2-emotion")}
          onNext={() => energy && setScreen("optional-text")}
          nextDisabled={!energy}
          progress="4 of 5"
        />
      </Frame>
    );
  }

  // ---------------- Optional text ----------------
  if (screen === "optional-text") {
    const remaining = 600 - freeText.length;
    return (
      <Frame title="If it would help, add one or two sentences in your own words." eyebrow="Optional">
        <p className="text-sm text-muted-foreground">
          Please leave out names, addresses, workplaces, medical-record details and
          identifying information about other people. Nothing you write is saved.
        </p>
        <textarea
          value={freeText}
          onChange={(e) => setFreeText(e.target.value.slice(0, 600))}
          maxLength={600}
          rows={6}
          className="mt-3 w-full rounded-lg border border-border bg-card p-3 text-base text-foreground"
          placeholder="Optional. You can skip this."
        />
        <p className="mt-1 text-right text-xs text-muted-foreground" aria-live="polite">
          {remaining} characters remaining
        </p>
        {pending && (
          <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
            Preparing your reflection… this can take a few seconds.
          </p>
        )}
        <Dock
          onBack={() => setScreen("q3-energy")}
          onNext={() => {
            if (!pending) void runCompute(!notSafe);
          }}
          nextDisabled={pending}
          nextLabel={pending ? "Preparing…" : "See my reflection"}
          progress="5 of 5"
          secondary={
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (pending) return;
                setFreeText("");
                void runCompute(!notSafe);
              }}
              className="text-sm text-muted-foreground underline underline-offset-4 disabled:opacity-40"
            >
              Skip this question
            </button>
          }
        />
      </Frame>
    );
  }



  // ---------------- Safety screen ----------------
  if (screen === "safety" && result?.kind === "urgent-safety") {
    const r = getRegion(result.region.code);
    return (
      <Frame title="Let’s pause here" eyebrow="Support first">
        <p className="text-foreground">
          Thank you for being honest. What you shared may need more support than a
          reflection can offer. This app is not monitored and cannot assess or
          respond in real time.
        </p>
        <p className="mt-3 font-medium text-foreground">{result.region.emergencyGuidance}</p>

        <ul className="mt-4 space-y-3">
          {r.crisisLines.map((line) => (
            <li key={line.name} className="rounded-lg border border-border bg-card p-4">
              <p className="font-medium text-foreground">{line.name}</p>
              <p className="mt-1 text-sm text-foreground">{line.detail}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {line.tel && (
                  <a href={`tel:${line.tel}`} className="text-primary underline underline-offset-4">
                    Call
                  </a>
                )}
                {line.sms && (
                  <a href={`sms:${line.sms}`} className="text-primary underline underline-offset-4">
                    Text
                  </a>
                )}
                {line.url && (
                  <a
                    href={line.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-4"
                  >
                    Open directory
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            to="/practice/$id"
            params={{ id: "pause-and-ground" }}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground"
          >
            Pause and Ground
          </Link>
          <Link
            to="/support"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-5 py-3 font-medium text-foreground"
          >
            Support &amp; Safety
          </Link>
          <button
            type="button"
            onClick={closeToDay}
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Return to Day 1
          </button>
        </div>
      </Frame>
    );
  }

  // ---------------- Result ----------------
  if (screen === "result" && result?.kind === "reflection") {
    return (
      <ResultScreen
        output={result.output}
        curated={result.meta.curated}
        aiEnabled={result.meta.aiEnabled}
        fallbackUsed={result.meta.fallbackUsed}
        onClose={closeToDay}
      />
    );
  }


  // Any invalid state falls back to eligibility.
  if (screen === "result" || screen === "safety") {
    // input-invalid, kill-switch (should not occur in curated), or minor
    return (
      <Frame title="Something didn’t line up" eyebrow="Try again">
        <p className="text-foreground">
          The reflection could not be prepared. Please try again, or return to Day 1.
        </p>
        <Dock onBack={closeToDay} backLabel="Return to Day 1" />
      </Frame>
    );
  }

  return null;
}

// ---------------- Result screen ----------------

function ResultScreen({
  output,
  curated,
  onClose,
}: {
  output: ReflectionOutput;
  curated: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const clipboard = useMemo(() => {
    const parts = [
      "What I’m hearing",
      output.hearing,
      "",
      "A theme that may fit",
      output.theme.gloss,
      "",
      "Three possible next gentle steps",
      ...output.nextSteps.map((s, i) => `${i + 1}. ${s.text}`),
      "",
      "Your One Honest Step",
      output.oneHonestStep.text,
    ];
    if (output.spiritualReflection) {
      parts.push("", "Spiritual reflection", output.spiritualReflection.reflection);
    }
    if (output.supportNote) parts.push("", "When more support may help", output.supportNote);
    return parts.join("\n");
  }, [output]);

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(clipboard);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <Frame title="Your Reflection and Next Gentle Steps" eyebrow="For today">
      <Section title="What I’m hearing">{output.hearing}</Section>
      <Section title="A Beauty from Ashes theme that may fit">{output.theme.gloss}</Section>

      <div className="space-y-3">
        <h3 className="eyebrow">Three possible next gentle steps</h3>
        <ol className="space-y-2">
          {output.nextSteps.map((s, i) => (
            <li
              key={s.id}
              className="rounded-lg border border-border bg-card p-4 text-foreground"
            >
              <span className="mr-2 font-serif text-[color:var(--deep-navy)]">{i + 1}.</span>
              {s.text}
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-lg border border-[color:var(--gold)]/60 bg-[color:var(--champagne)]/30 p-4">
        <h3 className="eyebrow">Your One Honest Step</h3>
        <p className="mt-2 font-serif text-lg leading-snug text-foreground">
          {output.oneHonestStep.text}
        </p>
      </div>

      {output.spiritualReflection && (
        <Section title="Optional spiritual reflection">
          {output.spiritualReflection.reflection}
        </Section>
      )}

      {output.supportNote && (
        <Section title="When more support may help">{output.supportNote}</Section>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={doCopy}
          className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-5 py-3 text-base font-medium text-foreground hover:bg-secondary"
        >
          {copied ? "Copied" : "Copy reflection"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-base font-medium text-primary-foreground"
        >
          Return to Day 1 Close
        </button>
        <Link
          to="/practice/$id"
          params={{ id: "pause-and-ground" }}
          className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-5 py-3 text-base font-medium text-foreground hover:bg-secondary"
        >
          Pause and Ground
        </Link>
        <Link
          to="/support"
          className="text-center text-sm text-muted-foreground underline underline-offset-4"
        >
          Support &amp; Safety
        </Link>
      </div>

      <div className="mt-6 rounded-md border border-border/60 bg-secondary/40 p-3 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => setAboutOpen((o) => !o)}
          aria-expanded={aboutOpen}
          className="flex w-full items-center justify-between"
        >
          <span>About this preview</span>
          <span aria-hidden>{aboutOpen ? "–" : "+"}</span>
        </button>
        {aboutOpen && (
          <p className="mt-2">
            This private preview currently uses founder-approved Beauty from Ashes
            material {curated ? "selected from your responses" : "prepared as a general Day 1 reflection"}.
            Live AI personalization is not connected yet.
          </p>
        )}
      </div>
    </Frame>
  );
}

// ---------------- Shared UI ----------------

function Frame({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="container-page flex min-h-[100dvh] flex-col py-6 pb-32">
        <header className="pb-4">
          <nav className="flex items-center justify-between text-sm">
            <Link
              to="/day/$day"
              params={{ day: "1" }}
              className="text-muted-foreground underline underline-offset-4"
            >
              ← Day 1
            </Link>
            <Link
              to="/support"
              className="text-muted-foreground underline underline-offset-4"
            >
              Support
            </Link>
          </nav>
        </header>
        <div className="flex-1 space-y-5">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="font-serif text-2xl leading-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {children}
        </div>
      </div>
    </div>
  );
}

function ChoiceList<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: T; label: string }>;
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <ul className="space-y-2">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => onChange(o.id)}
              aria-pressed={active}
              className={`w-full rounded-lg border px-4 py-3 text-left text-base transition-colors ${
                active
                  ? "border-[color:var(--gold)] bg-[color:var(--champagne)]/40 text-foreground"
                  : "border-border bg-card hover:border-[color:var(--deep-navy)]/40"
              }`}
            >
              {o.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="eyebrow">{title}</h3>
      <p className="leading-relaxed text-foreground">{children}</p>
    </div>
  );
}

function Dock({
  onBack,
  onNext,
  backLabel = "Back",
  nextLabel = "Continue",
  nextDisabled = false,
  progress,
  secondary,
}: {
  onBack: () => void;
  onNext?: () => void;
  backLabel?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  progress?: string;
  secondary?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-[color:var(--warm-ivory)]/95 backdrop-blur"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
    >
      <div className="container-page flex items-center justify-between gap-3 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
        >
          ← {backLabel}
        </button>
        <div className="flex flex-col items-center text-xs uppercase tracking-widest text-muted-foreground">
          {progress && <span>{progress}</span>}
          {secondary}
        </div>
        {onNext ? (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            {nextLabel} →
          </button>
        ) : (
          <span aria-hidden className="w-24" />
        )}
      </div>
    </div>
  );
}
