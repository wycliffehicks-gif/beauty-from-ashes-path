import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LEGAL_BUNDLE_VERSION, usePrefs } from "@/lib/prefs";
import { LegalFooter } from "@/components/LegalFooter";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome — Beauty from Ashes" },
      { name: "description", content: "A gentle daily companion for walking toward hope." },
      { property: "og:title", content: "Welcome — Beauty from Ashes" },
      { property: "og:description", content: "A gentle daily companion for walking toward hope." },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const [, update] = usePrefs();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [showSpiritual, setShowSpiritual] = useState<boolean>(true);

  const steps = [
    {
      key: "welcome",
      body: (
        <div className="space-y-6 text-center">
          <p className="font-serif text-xl font-medium tracking-wide text-[var(--deep-navy)] sm:text-2xl">
            Resurgence Therapeutics
          </p>
          <p className="brand-tagline mx-auto">
            AWAKEN&nbsp;|&nbsp;REDISCOVER&nbsp;|&nbsp;HOPE
          </p>
          <div className="rule-gold mx-auto my-2 w-24" aria-hidden />

          <h1 className="font-serif text-4xl leading-tight text-foreground sm:text-5xl">
            Beauty from Ashes
          </h1>
          <p className="text-lg text-foreground">
            A guided psycho-spiritual reflection and formation journey for walking toward hope.
          </p>
          <p className="mx-auto max-w-md text-base text-muted-foreground">
            It is for people who know something feels emotionally or spiritually heavy,
            guarded, disconnected or stuck, but may not know where to begin.
          </p>
        </div>
      ),
    },
    {
      key: "why-what-how",
      body: (
        <div className="space-y-5">
          <h2 className="font-serif text-2xl text-foreground sm:text-3xl">
            Why, what, and how
          </h2>
          <div className="surface-card space-y-2">
            <h3 className="eyebrow">Why</h3>
            <p className="text-foreground">
              Sometimes we know something is weighing on us, but we do not yet have
              words for it — or a safe place to begin.
            </p>
          </div>
          <div className="surface-card space-y-2">
            <h3 className="eyebrow">What</h3>
            <p className="text-foreground">
              Beauty from Ashes is a seven-day guided journey that brings together
              psychologically informed reflection, spiritual meaning, practical
              exercises and one small next step.
            </p>
          </div>
          <div className="surface-card space-y-2">
            <h3 className="eyebrow">How</h3>
            <p className="text-foreground">
              Each day helps you arrive, notice, name, listen, reconnect and choose
              One Honest Step. Move at your own pace. Pause, stop or return whenever
              you need to.
            </p>
            <p className="pt-1 text-sm text-muted-foreground">
              Most days can be completed in about 10–15 minutes.
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "preferences",
      body: (
        <div className="space-y-5">
          <h2 className="font-serif text-2xl text-foreground sm:text-3xl">
            Your preferences and pace
          </h2>
          <p className="text-foreground">
            Some days offer an optional Scripture reflection and prayer. You may
            include these, or hide them. Reflections work fully either way. You can
            change this any time in Settings.
          </p>
          <div className="space-y-2">
            <label className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
              <input
                type="radio"
                name="spiritual"
                checked={showSpiritual}
                onChange={() => setShowSpiritual(true)}
                className="mt-1.5"
              />
              <span>
                <span className="block font-medium text-foreground">Include Scripture and prayer</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Optional sections appear, always collapsible.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
              <input
                type="radio"
                name="spiritual"
                checked={!showSpiritual}
                onChange={() => setShowSpiritual(false)}
                className="mt-1.5"
              />
              <span>
                <span className="block font-medium text-foreground">Hide Scripture and prayer</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Focus on the core reflection only.
                </span>
              </span>
            </label>
          </div>
          <div className="surface-card space-y-1">
            <h3 className="eyebrow">Move gently</h3>
            <p className="text-sm text-foreground">
              You can pause a day part way through, stop when you need to, and
              return whenever it feels possible. Nothing is graded. Nothing is
              lost.
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "what-this-is",
      body: (
        <div className="space-y-4">
          <h2 className="font-serif text-2xl text-foreground sm:text-3xl">
            Before you begin: what this is — and is not
          </h2>
          <div className="surface-card space-y-2">
            <h3 className="eyebrow">It is</h3>
            <ul className="list-disc space-y-1 pl-5 text-foreground">
              <li>An educational, reflective and spiritually sensitive companion.</li>
              <li>A place to notice, name and take one honest step at your own pace.</li>
            </ul>
          </div>
          <div className="surface-card space-y-2">
            <h3 className="eyebrow">It is not</h3>
            <ul className="list-disc space-y-1 pl-5 text-foreground">
              <li>Psychotherapy, diagnosis or medical treatment.</li>
              <li>Crisis care or emergency support. It is not monitored and cannot
                respond if someone is in danger.</li>
              <li>A replacement for a qualified professional or a safe, trusted
                relationship.</li>
            </ul>
          </div>
          <p className="text-sm text-muted-foreground">
            You can stop at any time and seek support. If you are in immediate danger,
            please contact local emergency services or a person nearby.
          </p>
        </div>
      ),
    },
  ];

  const isLast = step === steps.length - 1;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="container-page flex min-h-[100dvh] flex-col py-8">
        <div className="flex items-center justify-between text-sm uppercase tracking-widest text-muted-foreground">
          <span>Step {step + 1} of {steps.length}</span>
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="inline-link underline underline-offset-4"
            >
              Back
            </button>
          )}
        </div>

        <div className="flex-1 py-10">{steps[step].body}</div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              if (isLast) {
                update({ onboarded: true, showSpiritual });
                navigate({ to: "/" });
              } else {
                setStep((s) => s + 1);
              }
            }}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:opacity-90"
          >
            {isLast ? "Begin" : "Continue"}
          </button>
          {isLast && (
            <p className="pt-1 text-center text-sm text-muted-foreground">
              By continuing, you acknowledge the{" "}
              <Link to="/terms" className="inline-link text-primary underline underline-offset-4">
                Terms of Use
              </Link>{" "}
              and{" "}
              <Link
                to="/important-information"
                className="inline-link text-primary underline underline-offset-4"
              >
                Important Information
              </Link>
              .
            </p>
          )}
        </div>

        <LegalFooter />
      </div>
    </div>
  );
}
