import { Link } from "@tanstack/react-router";
import { JOURNEY_DAYS } from "@/content/journey";
import { VisualMotif } from "@/components/VisualMotifs";
import { LegalFooter } from "@/components/LegalFooter";

export function LandingPage() {
  return (
    <div className="landing-page">
      {/* Quiet hero */}
      <section className="landing-hero">
        <VisualMotif variant="home" />
        <div className="landing-hero-inner">
          <h1 className="bfa-heading bfa-h1 font-serif">Beauty from Ashes</h1>
          <p className="bfa-copy-lead mt-2 text-foreground">
            A gentle daily companion for walking toward hope
          </p>
          <hr className="gold-seam w-24" />
          <p className="bfa-copy mt-4 text-muted-foreground">
            Ten days of teaching, reflection and practice for adults who want to notice what is
            heavy, name it with honesty, and take one small step forward. No scores. No streaks. No
            pressure.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link to="/onboarding" className="btn-primary-journey">
              Begin the journey
            </Link>
            <Link to="/support" className="btn-quiet inline-flex text-center">
              Support & Safety
            </Link>
          </div>
        </div>
      </section>

      {/* What the ten days are */}
      <section className="landing-section">
        <h2 className="bfa-h2 font-serif text-foreground">The ten days</h2>
        <p className="bfa-copy-support mt-1 text-muted-foreground">
          Each day has a single purpose, one or two questions, and a practice you can try.
        </p>
        <ol className="landing-day-list">
          {JOURNEY_DAYS.map((d) => (
            <li key={d.id} className="landing-day-item">
              <span className="landing-day-number" aria-hidden>
                <span className="day-marker-word">Day</span>
                <span className="day-marker-num">{d.day}</span>
              </span>
              <span className="bfa-copy text-foreground">{d.title}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* What a day looks like */}
      <section className="landing-section">
        <h2 className="bfa-h2 font-serif text-foreground">What a day looks like</h2>
        <div className="landing-card">
          <ul className="bfa-copy space-y-3 text-foreground">
            <li>
              <strong className="text-foreground">Arrive</strong> — a short orientation so you
              know what this day is for.
            </li>
            <li>
              <strong className="text-foreground">Notice</strong> — a brief teaching and a few
              questions to gather your own words.
            </li>
            <li>
              <strong className="text-foreground">Practise</strong> — a psychological exercise, and
              an optional Christian path if you choose it in Settings.
            </li>
            <li>
              <strong className="-foreground">One Honest Step</strong> — a small, specific movement
              before you close.
            </li>
          </ul>
        </div>
      </section>

      {/* Home Screen guidance */}
      <section className="landing-section">
        <h2 className="bfa-h2 font-serif text-foreground">
          Add it to your Home Screen (optional)
        </h2>
        <div className="landing-card">
          <p className="bfa-copy text-foreground">
            Beauty from Ashes is a web app. You can use it in your browser, or add an icon to your
            Home Screen for easier access. It is not downloaded from an app store.
          </p>
          <h3 className="bfa-h3 mt-4 font-serif text-foreground">iPhone or iPad — Safari</h3>
          <ol className="bfa-copy-support mt-1 list-decimal space-y-1 pl-5 text-foreground">
            <li>Open this page in Safari.</li>
            <li>Tap the Share button.</li>
            <li>Scroll down and tap Add to Home Screen.</li>
            <li>If shown, turn on Open as Web App, then tap Add.</li>
          </ol>
          <h3 className="bfa-h3 mt-4 font-serif text-foreground">Android — Chrome</h3>
          <ol className="bfa-copy-support mt-1 list-decimal space-y-1 pl-5 text-foreground">
            <li>Open this page in Chrome.</li>
            <li>Tap the three-dot More menu.</li>
            <li>Tap Install app or Add to Home screen.</li>
            <li>Follow the prompt to finish.</li>
          </ol>
          <p className="bfa-copy-support mt-3 text-muted-foreground">
            For the smoothest experience, add it before beginning and then return using the same
            Home Screen icon. Progress does not sync or transfer between browsers or devices. Menu
            wording can vary by device and browser.
          </p>
        </div>
      </section>

      {/* What this is not */}
      <section className="landing-section">
        <h2 className="bfa-h2 font-serif text-foreground">What this is not</h2>
        <div className="landing-card">
          <p className="bfa-copy text-foreground">
            This is an educational and reflective companion, not psychotherapy, diagnosis,
            treatment, medical care or crisis support. It does not promise cure, transformation or
            symptom reduction. If you are in urgent distress, please use the{" "}
            <Link to="/support" className="text-link">
              Support & Safety
            </Link>{" "}
            page.
          </p>
        </div>
      </section>

      {/* Privacy */}
      <section className="landing-section">
        <h2 className="bfa-h2 font-serif text-foreground">Privacy</h2>
        <div className="landing-card">
          <p className="bfa-copy text-foreground">
            Your answers and reflections stay in this browser on this device when browser storage is available; otherwise they may exist only in the current tab and can be lost when that tab closes or reloads. No account is needed.
            Your answers and reflections are not sent to Resurgence Therapeutics. You can save or clear your own data at any time.
          </p>
          <p className="bfa-copy-support mt-3 text-muted-foreground">
            Read the full{" "}
            <Link to="/privacy" className="text-link">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link to="/important-information" className="text-link">
              Important Information
            </Link>.
          </p>
        </div>
      </section>

      {/* Resurgence / Founder */}
      <section className="landing-section">
        <h2 className="bfa-h2 font-serif text-foreground">From Resurgence Therapeutics</h2>
        <div className="landing-card">
          <p className="bfa-copy text-foreground">
            Beauty from Ashes is part of the Resurgence Therapeutics ecosystem, founded by Carl
            Wycliffe Hicks Jr. It grows out of the book and video series{" "}
            <em>Beauty from Ashes: Walking Toward Hope</em>, and the broader Sacred Reweaving Therapy
            framework that informs its depth.
          </p>
          <p className="bfa-copy-support mt-3 text-muted-foreground">
            The purpose: to help people rediscover what pain, shame, loss, fear and protective
            responses may have buried or disconnected — and to move toward hope one honest step at
            a time.
          </p>
        </div>
      </section>

      {/* Final call to action */}
      <section className="landing-cta">
        <p className="bfa-copy-lead text-foreground">One honest step is enough.</p>
        <Link to="/onboarding" className="btn-primary-journey mt-4">
          Begin the journey
        </Link>
      </section>

      <p className="bfa-copy-support text-muted-foreground">
        General, non-urgent questions:{" "}
        <a href="mailto:wycliffe.hicks@gmail.com" className="text-link">
          wycliffe.hicks@gmail.com
        </a>
        . Not for crisis support, emergencies, or clinical advice.
      </p>

      <LegalFooter />
    </div>
  );
}
