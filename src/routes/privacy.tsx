import { Link, createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Beauty from Ashes" },
      {
        name: "description",
        content:
          "How Beauty from Ashes handles information in this current version. No accounts, no cloud storage, no analytics of reflections.",
      },
      { property: "og:title", content: "Privacy Policy — Beauty from Ashes" },
      {
        property: "og:description",
        content: "How Beauty from Ashes handles information in this current version.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="August 16, 2026">
      <p>
        Beauty from Ashes is provided by Resurgence Therapeutics. This policy
        explains, in plain language, how information is handled by the current
        version of the app.
      </p>

      <h2 className="bfa-h2 font-serif">What the app does not collect</h2>
      <p>
        The current app does not require you to create an account. It does not
        intentionally collect your name, email address, journal entries,
        diagnosis, medical record or other personal health information through
        the app itself. The responses you select on each day are saved on this
        device only. They are not sent to Resurgence Therapeutics, and nobody at
        Resurgence Therapeutics receives or reads them.
      </p>

      <h2 className="bfa-h2 font-serif">What is kept on this device</h2>
      <p>
        The app stores a small amount of low-sensitivity information in your own
        browser or device storage only:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          A flag recording that you completed the opening steps, and your
          agreement to the Terms, Privacy Notice and Important Information —
          the version you agreed to and the date and time of that agreement.
        </li>
        <li>
          Your optional Scripture and spiritual-reflection preference (on or
          off).
        </li>
        <li>
          A legacy list of day numbers you had opened, kept from an earlier
          version of the app and not used to decide anything.
        </li>
        <li>
          The version number of the journey store, so saved information can be
          read correctly after an update.
        </li>
        <li>
          The day and page you were last on, and the furthest page you reached
          in a day, so you can return to the same place.
        </li>
        <li>
          The responses you selected, saved as short coded option identifiers
          (for example <code>q.notice:heavy</code>) rather than the wording of
          the option, and never anything you typed.
        </li>
        <li>Which of the ten days you have finished.</li>
        <li>
          The exact personalized reflection prepared for you on a day, together
          with a coded fingerprint of the selections it was built from, so the
          same words can be shown again if you return to that page.
        </li>
        <li>The date and time this saved information was last updated.</li>
      </ul>
      <p>
        The app also uses your browser’s <em>session storage</em>, which is
        cleared when you close the browser, to remember that the launch screen
        has already been shown so it does not repeat.
      </p>
      <p>
        An earlier weekly “deep session” feature may also have left session-only
        information in this browser: which stage of that session you were on, the
        coded option identifiers you had selected there, and an optional short
        note limited to 400 characters. That information is session-only, stays
        on this device, and is removed along with everything else when you clear
        your journey.
      </p>
      <p>
        Your personalized reflection is assembled on this device. It is put
        together locally and deterministically from the approved wording written
        for that day and the coded options you selected. No artificial
        intelligence, no server and no external service is involved, and nothing
        is transmitted in order to produce it.
      </p>
      <p>
        Everything above stays on this device and browser. It is not sent to us,
        it is not stored on a server, and there is no account, database or
        analytics behind it. Because it is local, it does not move with you to
        another device or browser.
      </p>
      <p>
        These local items are not confidential clinical records. They are not
        protected in the way that psychotherapy or medical records are. Anyone
        with access to your device or browser profile may be able to see them,
        and we cannot promise confidentiality for information held in your own
        browser. You can remove all of it at any time with “Clear or restart my
        journey” in Settings, or by clearing this browser’s data for the app.
      </p>



      <h2 className="bfa-h2 font-serif">
        Optional Day 10 earlier-choices view
      </h2>
      <p>
        On Day 10, you may choose “Show earlier choices.” Until you do, no
        gathered view is shown. If you choose it, the app temporarily assembles
        neutral, approved wording on this device from compatible coded choices
        already stored under each earlier day’s current answer-meaning version.
        Earlier-version choices are not interpreted. Any choice marked for
        optional Christian presentation—including the Day 8 choice about
        God—is withheld while Scripture and spiritual reflection is off or has
        not finished loading.
      </p>
      <p>
        The gathered view does not form a diagnosis, explanation or measure of
        progress, and it does not claim that a practice was attempted or that
        anything changed. The gathered wording itself is not saved in local
        storage or session storage, is not added to your saved personalized
        reflection or its coded fingerprint, and is not sent to Resurgence
        Therapeutics, a server, artificial intelligence, analytics or any other
        external service. It disappears when you hide it, leave the page or
        reload.
      </p>

      <h2 className="bfa-h2 font-serif">Please do not send sensitive information</h2>
      <p>
        You should not enter or send sensitive personal or health information
        through the app, because the app does not need it. If you contact us
        through any external channel, please do not include confidential
        clinical or identifying information there either.
      </p>

      <h2 className="bfa-h2 font-serif">Standard technical information</h2>
      <p>
        Delivering any web app involves some standard technical information —
        for example your IP address, device and browser type, and access logs —
        being processed automatically by the hosting, content-delivery, font
        and media providers used to make the app available. We cannot promise
        that “no data is ever processed.” In particular, this app currently
        loads:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Web fonts from Google Fonts.</li>
      </ul>

      <p>
        Those providers apply their own privacy practices to that technical
        information.
      </p>

      <h2 className="bfa-h2 font-serif">What the app does not do</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>No behavioural advertising.</li>
        <li>No profiling of users.</li>
        <li>No sale of personal information.</li>
        <li>No clinical record is created about you.</li>
        <li>No artificial-intelligence analysis of your reflections.</li>
      </ul>

      <h2 className="bfa-h2 font-serif">External links</h2>
      <p>
        The app may link to third-party resources (for example crisis lines,
        the Resurgence Therapeutics website, or the Beauty from Ashes video
        series). Once you follow an external link, the third party’s own
        privacy practices apply, not this policy.
      </p>

      <h2 className="bfa-h2 font-serif">Future changes</h2>
      <p>
        Privacy practices may change if future versions of the app add
        accounts, payments, cloud storage or analytics. You will be told, and
        this policy will be updated with a new date, before such features are
        used with your information.
      </p>

      <h2 className="bfa-h2 font-serif">Privacy questions</h2>
      <p>
        For questions about this Privacy Notice, email{" "}
        <a
          href="mailto:wycliffe.hicks@gmail.com"
          className="inline-link text-primary underline underline-offset-4"
        >
          wycliffe.hicks@gmail.com
        </a>
        . Please do not include sensitive personal or health information;
        ordinary email is not a secure or confidential channel.
      </p>
      <p>
        See also the{" "}
        <Link
          to="/contact-support"
          className="inline-link text-primary underline underline-offset-4"
        >
          Contact &amp; Technical Support
        </Link>{" "}
        page. A named privacy contact, and a monitored channel for privacy
        requests, must be in place before any public or paid launch.
      </p>


      <p className="bfa-copy-support text-muted-foreground">
        This policy is written in plain language and is not legal advice. It
        does not create rights or obligations beyond what applicable law
        already provides.
      </p>
    </LegalPage>
  );
}
