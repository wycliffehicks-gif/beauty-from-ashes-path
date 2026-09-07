import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { usePrefs } from "@/lib/prefs";
import { clearJourney } from "@/lib/journey/progress";
import { useReminder } from "@/lib/journey/reminder";
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

// Lightweight PWA install prompt event available in Chromium-based browsers.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

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
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installSupported, setInstallSupported] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setInstallSupported(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  return (
    <section className="space-y-6 pb-4">
      <header className="space-y-2">
        <h1 className="bfa-heading bfa-h1 font-serif">Settings</h1>
        <p className="bfa-copy-support text-muted-foreground">Small choices, changeable any time.</p>
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
            <h2 className="bfa-h2 font-serif text-foreground">{SPIRITUAL_TOGGLE_TITLE}</h2>
            <p className="bfa-copy-support mt-1 text-muted-foreground">
              {SPIRITUAL_TOGGLE_DESCRIPTION}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.showSpiritual}
            aria-label="Include Scripture and spiritual reflection"
            onClick={() => update({ showSpiritual: !prefs.showSpiritual })}
            className={`bfa-settings-switch relative h-12 w-[58px] shrink-0 rounded-full border border-[color:var(--bfa-control-border)] ${
              prefs.showSpiritual ? "bg-primary" : "bg-secondary"
            }`}
          >
            <span
              className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background shadow ${
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
        <SettingsLink to="/pilot-feedback" title="Pilot feedback" />
      </nav>

      {/* Install as app — only surfaced when the browser supports it. */}
      {installSupported && (
        <section
          data-testid="settings-install"
          className="rounded-xl border border-border bg-card p-5"
        >
          <h2 className="bfa-h2 font-serif text-foreground">Add to this device</h2>
          <p className="bfa-copy-support mt-1 text-muted-foreground">
            Install Beauty from Ashes to your home screen for easy access. It will work offline
            once opened and stays private to this device.
          </p>
          <button
            type="button"
            data-testid="install-pwa"
            onClick={() => installPrompt?.prompt()}
            className="btn-quiet mt-4"
          >
            Install app
          </button>
        </section>
      )}

      <ReminderSection />


      {/* Privacy & Confidentiality — a short plain-language summary only. The
          complete detail stays on the Privacy Notice page. */}
      <section
        data-testid="settings-privacy-confidentiality"
        className="rounded-xl border border-border bg-card p-5"
      >
        <h2 className="bfa-h2 font-serif text-foreground">
          {sectionTitle("privacy-confidentiality")}
        </h2>
        <ul className="bfa-copy mt-3 space-y-3 text-foreground">
          {PRIVACY_SUMMARY_POINTS.map((p) => (
            <li key={p} className="flex gap-3">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--gold)]" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <p className="bfa-copy-support mt-4">
          <Link
            to="/privacy"
            data-testid="settings-privacy-full-link"
            className="inline-link text-primary underline underline-offset-4"
          >
            {PRIVACY_SUMMARY_LINK_LABEL}
          </Link>
        </p>
        <p className="bfa-copy-support mt-3 text-muted-foreground">
          {PRIVACY_CONFIDENTIALITY_REVIEW_NOTE}
        </p>
      </section>

      {/* About */}
      <section data-testid="settings-about" className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="bfa-h2 font-serif text-foreground">
            {sectionTitle("about-beauty-from-ashes")}
          </h2>
          <p className="bfa-copy mt-2 text-foreground">
            {ABOUT_BEAUTY_FROM_ASHES}
          </p>
          <p className="bfa-copy mt-3 text-foreground">
            {CREATOR_ATTRIBUTION}
          </p>
          <p className="bfa-copy-support mt-2 text-muted-foreground">
            {CREATOR_SCOPE_NOTE}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="bfa-h2 font-serif text-foreground">{sectionTitle("about-resurgence")}</h2>
          <p className="bfa-copy mt-2 text-foreground">{ABOUT_RESURGENCE}</p>
        </div>
      </section>

      {/* Clear or restart */}
      <section
        data-testid="settings-clear-or-restart"
        className="rounded-xl border border-border bg-card p-5"
      >
        <h2 className="bfa-h2 font-serif text-foreground">{sectionTitle("clear-or-restart")}</h2>
        <p
          className="bfa-copy-support mt-2 text-muted-foreground"
          data-testid="settings-storage-note"
        >
          When browser storage is available, this app keeps your saved place,
          selected choices, personalized reflections, finished days, preferences
          and recorded agreement in this browser on this device. If storage is
          unavailable, information may exist only in the current tab and can be
          lost when that tab closes or reloads. Choosing Clear or restart my
          journey asks the app to remove its saved journey information and return
          you to the opening. If removal cannot be confirmed, the app will tell
          you.
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
            <p className="bfa-copy text-foreground">{CLEAR_CONFIRM_QUESTION}</p>
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
                  // One removal pass, one honest outcome. clearJourney owns every
                  // app key (including the pilot continuation marker, the
                  // reminder choice and preferences) and notifies every
                  // subscriber, so a second round of removals here cannot mask a
                  // partial failure.
                  clearJourney();
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

/**
 * Opt-in gentle return. Off unless chosen, cancellable in one tap, and no
 * streaks, counts or comparisons. The reminder is local to this device and only
 * while the app is open — there is no server, no account and no tracking.
 */
function ReminderSection() {
  const { settings, hydrated, support, enable, disable, setTime } = useReminder();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);

  if (!hydrated || support === "unsupported") return null;

  return (
    <section data-testid="settings-reminder" className="rounded-xl border border-border bg-card p-5">
      <h2 className="bfa-h2 font-serif text-foreground">A gentle reminder</h2>
      <p className="bfa-copy-support mt-1 text-muted-foreground">
        If it would help, this device can offer one quiet reminder at a time you choose. It is off
        unless you turn it on, there is no streak or count, and missing it means nothing.
      </p>

      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-3">
          <label htmlFor="reminder-time" className="bfa-copy text-foreground">
            Time of day
          </label>
          <input
            id="reminder-time"
            data-testid="reminder-time"
            type="time"
            value={settings.time}
            onChange={(e) => setTime(e.target.value)}
            className="bfa-copy min-h-[44px] rounded-lg border border-border bg-background px-3 text-foreground"
          />
        </div>

        {settings.enabled ? (
          <button
            type="button"
            data-testid="reminder-disable"
            onClick={() => disable()}
            className="btn-quiet"
          >
            Turn the reminder off
          </button>
        ) : (
          <button
            type="button"
            data-testid="reminder-enable"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await enable(settings.time);
              setRefused(!ok);
              setBusy(false);
            }}
            className="btn-quiet"
          >
            Turn the reminder on
          </button>
        )}

        {settings.enabled && (
          <p className="bfa-copy-support text-muted-foreground" data-testid="reminder-on-note">
            The reminder is on for this device. It arrives only while this app is open in the
            browser or installed on your home screen.
          </p>
        )}

        {(refused || support === "denied") && (
          <p className="bfa-copy-support text-muted-foreground" data-testid="reminder-denied-note">
            This browser is not allowing reminders right now. That is fine — you can open the app
            whenever you like instead.
          </p>
        )}
      </div>
    </section>
  );
}


function SettingsLink({ to, title }: { to: string; title: string }) {
  return (
    <Link
      to={to}
      className="bfa-settings-link bfa-copy flex min-h-[56px] items-center justify-between gap-3 px-5 py-3 text-foreground"
    >
      <span className="min-w-0 font-medium">{title}</span>
      <span aria-hidden className="text-[color:var(--gold)]">
        ›
      </span>
    </Link>
  );
}
