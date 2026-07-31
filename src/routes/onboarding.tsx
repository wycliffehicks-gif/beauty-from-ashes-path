import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LEGAL_BUNDLE_VERSION, usePrefs } from "@/lib/prefs";
import { AGREEMENT_COPY, OPENING_SCREENS } from "@/content/opening";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome — Beauty from Ashes: The First Journey" },
      {
        name: "description",
        content:
          "A quiet place to slow down and look honestly. Beauty from Ashes: The First Journey.",
      },
      { property: "og:title", content: "Welcome — Beauty from Ashes" },
      {
        property: "og:description",
        content: "A quiet place to slow down and look honestly.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Opening,
});

const TOTAL = OPENING_SCREENS.length + 1; // three explanatory screens + agreement

function Opening() {
  const [, update] = usePrefs();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);

  const isAgreement = step === OPENING_SCREENS.length;
  const canAdvance = !isAgreement || (adultConfirmed && termsAgreed);

  const accept = () => {
    if (!canAdvance) return;
    update({
      onboarded: true,
      legalAcceptance: {
        version: LEGAL_BUNDLE_VERSION,
        acceptedAt: new Date().toISOString(),
      },
    });
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="journey-page">
      <div className="container-page flex min-h-[100dvh] flex-col">
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 pt-4 pb-1">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="journey-chrome-btn text-sm"
              aria-label="Back"
            >
              ←
            </button>
          ) : (
            <span aria-hidden className="min-h-[44px] min-w-[44px]" />
          )}
          <p className="min-w-0 truncate text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {step + 1} of {TOTAL}
          </p>
          <Link
            to="/support"
            className="journey-chrome-btn"
            aria-label="Support and safety"
            title="Support and safety"
          >
            <svg
              aria-hidden
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="8.5" />
              <circle cx="12" cy="12" r="3.5" />
              <path d="M6 6l3.6 3.6M18 6l-3.6 3.6M6 18l3.6-3.6M18 18l-3.6-3.6" />
            </svg>
          </Link>
        </header>

        <main className="flex flex-1 flex-col justify-center py-2">
          {isAgreement ? (
            <AgreementScreen
              adultConfirmed={adultConfirmed}
              termsAgreed={termsAgreed}
              setAdultConfirmed={setAdultConfirmed}
              setTermsAgreed={setTermsAgreed}
            />
          ) : (
            <ExplanatoryScreen index={step} />
          )}
        </main>

        <nav aria-label="Opening navigation" className="journey-dock">
          <button
            type="button"
            disabled={!canAdvance}
            aria-disabled={!canAdvance}
            onClick={() => (isAgreement ? accept() : setStep((s) => s + 1))}
            className="btn-primary-journey w-full"
          >
            {isAgreement ? AGREEMENT_COPY.beginLabel : "Continue"}
          </button>
          {isAgreement && !canAdvance && (
            <p className="pt-2 text-center text-sm text-muted-foreground">
              Please confirm both statements above to continue.
            </p>
          )}
        </nav>
      </div>
    </div>
  );
}

function ExplanatoryScreen({ index }: { index: number }) {
  const screen = OPENING_SCREENS[index];
  return (
    <section className="space-y-5" data-screen={screen.key}>
      <p className="eyebrow">{screen.eyebrow}</p>
      <h1 className="font-serif text-[1.7rem] leading-tight text-[color:var(--navy)] sm:text-4xl">
        {screen.title}
      </h1>
      <hr className="gold-seam w-24" />
      <p className="text-[1.02rem] leading-relaxed text-foreground sm:text-lg">{screen.lead}</p>
      <ul className="space-y-2.5">
        {screen.points.map((p) => (
          <li key={p} className="flex gap-3 text-[0.98rem] leading-snug text-foreground sm:text-base">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--gold)]" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      {screen.closing && (
        <p className="text-[0.95rem] italic leading-snug text-muted-foreground">{screen.closing}</p>
      )}
    </section>
  );
}

function AgreementScreen({
  adultConfirmed,
  termsAgreed,
  setAdultConfirmed,
  setTermsAgreed,
}: {
  adultConfirmed: boolean;
  termsAgreed: boolean;
  setAdultConfirmed: (v: boolean) => void;
  setTermsAgreed: (v: boolean) => void;
}) {
  return (
    <section className="space-y-4" data-screen="agreement">
      <p className="eyebrow">{AGREEMENT_COPY.eyebrow}</p>
      <h1 className="font-serif text-[1.6rem] leading-tight text-[color:var(--navy)] sm:text-3xl">
        {AGREEMENT_COPY.title}
      </h1>
      <p className="text-[0.98rem] leading-snug text-foreground">{AGREEMENT_COPY.lead}</p>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="eyebrow text-[0.72rem]">What this is</p>
        <ul className="mt-2 space-y-1 text-[0.94rem] leading-snug text-foreground">
          {AGREEMENT_COPY.isPoints.map((p) => (
            <li key={p}>· {p}</li>
          ))}
        </ul>
        <p className="eyebrow mt-4 text-[0.72rem]">What it is not</p>
        <ul className="mt-2 space-y-1 text-[0.94rem] leading-snug text-foreground">
          {AGREEMENT_COPY.isNotPoints.map((p) => (
            <li key={p}>· {p}</li>
          ))}
        </ul>
      </div>

      <p className="text-[0.9rem] leading-snug text-muted-foreground">
        {AGREEMENT_COPY.automatedProcessingSentence}
      </p>
      <p className="text-[0.9rem] leading-snug text-muted-foreground">
        {AGREEMENT_COPY.safetySentence}
      </p>

      <p className="text-[0.86rem] leading-snug text-muted-foreground">
        {AGREEMENT_COPY.reviewNote}{" "}
        <Link to="/terms" target="_blank" className="inline-link text-primary underline underline-offset-4">
          Terms
        </Link>
        {" · "}
        <Link to="/privacy" target="_blank" className="inline-link text-primary underline underline-offset-4">
          Privacy
        </Link>
        {" · "}
        <Link
          to="/important-information"
          target="_blank"
          className="inline-link text-primary underline underline-offset-4"
        >
          Important Information
        </Link>
      </p>

      <label className="flex min-h-[44px] items-start gap-3 rounded-xl border border-border bg-card p-3.5">
        <input
          type="checkbox"
          data-testid="agree-adult"
          checked={adultConfirmed}
          onChange={(e) => setAdultConfirmed(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0"
        />
        <span className="text-[0.94rem] leading-snug text-foreground">
          {AGREEMENT_COPY.adultLabel}
        </span>
      </label>

      <label className="flex min-h-[44px] items-start gap-3 rounded-xl border border-border bg-card p-3.5">
        <input
          type="checkbox"
          data-testid="agree-terms"
          checked={termsAgreed}
          onChange={(e) => setTermsAgreed(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0"
        />
        <span className="text-[0.94rem] leading-snug text-foreground">
          {AGREEMENT_COPY.termsLabel}
        </span>
      </label>
    </section>
  );
}
