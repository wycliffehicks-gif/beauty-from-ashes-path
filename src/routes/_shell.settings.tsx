import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { usePrefs, resetAll } from "@/lib/prefs";
import { clearJourney } from "@/lib/journey/progress";
import { useStorageStatus } from "@/lib/storage-status";
import {
  ABOUT_BEAUTY_FROM_ASHES,
  ABOUT_RESURGENCE,
  CLEAR_CONFIRM_QUESTION,
  CREATOR_ATTRIBUTION,
  CREATOR_SCOPE_NOTE,
  PRIVACY_CONFIDENTIALITY_REVIEW_NOTE,
  PRIVACY_SUMMARY_LINK_LABEL,
  PRIVACY_SUMMARY_POINTS,
  SETTINGS_SECTIONS,
  SPIRITUAL_TOGGLE_DESCRIPTION,
  SPIRITUAL_TOGGLE_TITLE,
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
  const { persistent, hydrated: storageHydrated } = useStorageStatus();
  const volatileStorage = storageHydrated && !persistent;

  return (
    <section className="space-y-6 pb-4">
      <header className="space-y-2">
        <h1 className="bfa-heading font-serif text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground">Small choices, changeable any time.</p>
        <hr className="gold-seam w-24" />
      </header>

      {/* Spiritual preference — the opt-in a person most often comes here to
          find, so it sits immediately under the heading. */}
      <section
        data-testid="settings-spiritual"
        className="rounded-xl border border-border bg-card p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-serif text-lg text-foreground">{SPIRITUAL_TOGGLE_TITLE}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{SPIRITUAL_TOGGLE_DESCRIPTION}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.showSpiritual}
            aria-label="Include Scripture and spiritual reflection"
            onClick={() => update({ showSpiritual: !prefs.showSpiritual })}
            className={`relative h-11 w-[52px] shrink-0 rounded-full border border-border transition-colors ${
              prefs.showSpiritual ? "bg-primary" : "bg-secondary"
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

      {/* Support & Safety / Important Information / Terms and Privacy / Contact */}
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
        <SettingsLink to="/privacy" title="Privacy Notice" />
        <SettingsLink to="/terms" title="Terms of Use" />
        <SettingsLink to="/contact-support" title="Contact" />
      </nav>

      {/* Privacy & Confidentiality — a short plain-language summary only. The
          complete detail stays on the Privacy Notice page. */}
      <section
        data-testid="settings-privacy-confidentiality"
        className="rounded-xl border border-border bg-card p-5"
      >
        <h2 className="font-serif text-xl text-foreground">
          {sectionTitle("privacy-confidentiality")}
        </h2>
        <ul className="mt-3 space-y-2.5 text-[0.95rem] leading-snug text-foreground">
          {PRIVACY_SUMMARY_POINTS.map((p) => (
            <li key={p} className="flex gap-3">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--gold)]" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm">
          <Link
            to="/privacy"
            data-testid="settings-privacy-full-link"
            className="inline-link text-primary underline underline-offset-4"
          >
            {PRIVACY_SUMMARY_LINK_LABEL}
          </Link>
        </p>
        <p className="mt-3 text-xs text-muted-foreground">{PRIVACY_CONFIDENTIALITY_REVIEW_NOTE}</p>
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
          <p className="mt-3 text-[0.95rem] leading-relaxed text-foreground">
            {CREATOR_ATTRIBUTION}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {CREATOR_SCOPE_NOTE}
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
        <p className="mt-2 text-sm text-muted-foreground" data-testid="settings-storage-note">
          {volatileStorage
            ? "Saving is unavailable in this browser right now, so what this app holds — your place, the choices you selected, your reflections, your finished days, your preferences and your recorded agreement — is available in this tab only, and may be lost when the tab closes or reloads. Clearing removes all of it and returns you to the opening."
            : "Everything this app saves stays in this browser, on this device only: your saved place, the choices you selected, your reflections, your finished days, your preferences and your recorded agreement. Clearing removes all of it and returns you to the opening."}
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
