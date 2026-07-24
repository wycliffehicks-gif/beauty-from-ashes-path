import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { usePrefs } from "@/lib/prefs";

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
        <div className="space-y-5 text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Resurgence Therapeutics
          </p>
          <p className="font-serif text-sm tracking-[0.3em] text-[var(--ember)]">
            AWAKEN · REDISCOVER · HOPE
          </p>
          <h1 className="font-serif text-4xl leading-tight text-foreground">
            Beauty from Ashes
          </h1>
          <p className="text-lg text-muted-foreground">
            A gentle daily companion for walking toward hope.
          </p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Bringing beauty out of ugliness. Healing through rediscovery and reconnection — with self, others, and God.
          </p>
        </div>
      ),
    },
    {
      key: "what-this-is",
      body: (
        <div className="space-y-4">
          <h2 className="font-serif text-2xl text-foreground">What this app is — and is not</h2>
          <div className="surface-card space-y-2">
            <h3 className="font-medium text-foreground">It is</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>A quiet, reflective companion for daily practice.</li>
              <li>A place to notice, name and take one honest step.</li>
              <li>Spiritually sensitive, at a pace that is kind to you.</li>
            </ul>
          </div>
          <div className="surface-card space-y-2">
            <h3 className="font-medium text-foreground">It is not</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Therapy, counselling, medical treatment, or diagnosis.</li>
              <li>Crisis care or emergency support — this app is not monitored.</li>
              <li>A replacement for a qualified professional or a safe, trusted relationship.</li>
            </ul>
          </div>
          <p className="text-sm text-muted-foreground">
            If you are in immediate danger, please contact local emergency services or a person nearby.
          </p>
        </div>
      ),
    },
    {
      key: "privacy",
      body: (
        <div className="space-y-4">
          <h2 className="font-serif text-2xl text-foreground">Privacy, kept simple</h2>
          <p className="text-muted-foreground">
            This beta does not ask you to save private journal entries. Nothing you name or reflect on
            is stored anywhere.
          </p>
          <div className="surface-card space-y-1 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Stored on this device only:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Your spiritual-content preference.</li>
              <li>Which days you have visited.</li>
              <li>Any items you mark as a favourite.</li>
            </ul>
            <p className="pt-2">
              Clearing your browser data will remove these. There are no accounts, no cloud storage,
              and no analytics on your reflections.
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "spiritual",
      body: (
        <div className="space-y-4">
          <h2 className="font-serif text-2xl text-foreground">Spiritual content preference</h2>
          <p className="text-muted-foreground">
            Some days offer an optional Scripture reflection and prayer. You may include these, or hide
            them. Reflections work fully either way. You can change this any time in Settings.
          </p>
          <div className="space-y-2">
            <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
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
            <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
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
        </div>
      ),
    },
  ];

  const isLast = step === steps.length - 1;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="container-page flex min-h-[100dvh] flex-col py-8">
        <div className="flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
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
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90"
          >
            {isLast ? "Begin" : "Continue"}
          </button>
          {isLast && (
            <p className="text-center text-xs text-muted-foreground">
              By continuing, you acknowledge this app is educational and reflective, not therapy or crisis care.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
