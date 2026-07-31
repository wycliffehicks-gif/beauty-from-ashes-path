import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { usePrefs, resetAll } from "@/lib/prefs";
import { clearJourney } from "@/lib/journey/progress";
import {
  ABOUT_BEAUTY_FROM_ASHES,
  ABOUT_RESURGENCE,
  CLEAR_CONFIRM_QUESTION,
  PRIVACY_CONFIDENTIALITY_POINTS,
  PRIVACY_CONFIDENTIALITY_REVIEW_NOTE,
  SETTINGS_SECTIONS,
} from "@/content/settings";

export const Route = createFileRoute("/_shell/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Beauty from Ashes: The First Journey" },
      {
        name: "description",
        content:
          "Privacy and confidentiality, support and safety, spiritual preference, and clearing your saved journey.",
      },
      { property: "og:title", content: "Settings — Beauty from Ashes" },
      {
        property: "og:description",
        content: "Privacy, support, important information and your saved journey.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SettingsPage,
});

function sectionTitle(id: string) {
  return SETTINGS_SECTIONS.find((s) => s.id === id)!.title;
}

function SettingsPage() {
  const [prefs, update] = usePrefs();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="space-y-6 pb-4">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl text-[color:var(--navy)]">Settings</h1>
        <p className="text-sm text-muted-foreground">Small choices, changeable any time.</p>
        <hr className="gold-seam w-24" />
      </header>

      {/* Privacy & Confidentiality */}
      <section
        data-testid="settings-privacy-confidentiality"
        className="rounded-xl border border-border bg-card p-5"
      >
        <h2 className="font-serif text-xl text-foreground">
          {sectionTitle("privacy-confidentiality")}
        </h2>
        <ul className="mt-3 space-y-2.5 text-[0.95rem] leading-snug text-foreground">
          {PRIVACY_CONFIDENTIALITY_POINTS.map((p) => (
            <li key={p} className="flex gap-3">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--gold)]" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">{PRIVACY_CONFIDENTIALITY_REVIEW_NOTE}</p>
      </section>

      {/* Support & Safety / Important Information / Terms and Privacy */}
      <nav
        aria-label="Information and support"
        data-testid="settings-links"
        className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card"
      >
        <SettingsLink to="/support" title={sectionTitle("support-safety")} />
        <SettingsLink
          to="/important-information"
          title={sectionTitle("important-information")}
        />
        <SettingsLink to="/terms" title="Terms of Use" />
        <SettingsLink to="/privacy" title="Privacy Notice" />
        <SettingsLink to="/contact-support" title="Contact" />
      </nav>

      {/* Spiritual preference */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-serif text-lg text-foreground">
              Scripture &amp; spiritual reflection
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Include optional Scripture and prayer where a day offers them. Every reflection
              works fully without it.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.showSpiritual}
            aria-label="Include Scripture and spiritual reflection"
            onClick={() => update({ showSpiritual: !prefs.showSpiritual })}
            className={`relative h-11 w-[52px] shrink-0 rounded-full border border-border transition-colors ${
              prefs.showSpiritual ? "bg-[color:var(--navy)]" : "bg-secondary"
            }`}
          >
            <span
              className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background shadow transition-all ${
                prefs.showSpiritual ? "left-7" : "left-1"
              }`}
            />
          </button>
        </div>
      </section>

      {/* About */}
      <section data-testid="settings-about" className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-serif text-lg text-foreground">
            {sectionTitle("about-beauty-from-ashes")}
          </h2>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-foreground">
            {ABOUT_BEAUTY_FROM_ASHES}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-serif text-lg text-foreground">{sectionTitle("about-resurgence")}</h2>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-foreground">{ABOUT_RESURGENCE}</p>
        </div>
      </section>

      {/* Clear or restart */}
      <section
        data-testid="settings-clear-or-restart"
        className="rounded-xl border border-border bg-card p-5"
      >
        <h2 className="font-serif text-lg text-foreground">{sectionTitle("clear-or-restart")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your journey is kept on this device and browser only. Clearing it removes your saved
          place and completed days.
        </p>
        {!confirming ? (
          <button
            type="button"
            data-testid="clear-journey"
            onClick={() => setConfirming(true)}
            className="btn-quiet mt-4"
          >
            Clear or restart my journey
          </button>
        ) : (
          <div className="mt-4 space-y-3" data-testid="clear-journey-confirm">
            <p className="text-[0.95rem] text-foreground">{CLEAR_CONFIRM_QUESTION}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                data-testid="clear-journey-cancel"
                onClick={() => setConfirming(false)}
                className="btn-quiet flex-1"
              >
                Keep my journey
              </button>
              <button
                type="button"
                data-testid="clear-journey-confirmed"
                onClick={() => {
                  clearJourney();
                  resetAll();
                  navigate({ to: "/onboarding", replace: true });
                }}
                className="btn-primary-journey flex-1"
              >
                Yes, clear it
              </button>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}

function SettingsLink({ to, title }: { to: string; title: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-[56px] items-center justify-between gap-3 px-5 py-3 text-foreground hover:bg-[color:var(--champagne)]/35"
    >
      <span className="min-w-0 font-medium">{title}</span>
      <span aria-hidden className="text-[color:var(--gold)]">
        ›
      </span>
    </Link>
  );
}
