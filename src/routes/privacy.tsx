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
    <LegalPage title="Privacy Policy">
      <p>
        Beauty from Ashes is provided by Resurgence Therapeutics. This policy
        explains, in plain language, how information is handled by the current
        current version of the app.
      </p>

      <h2 className="font-serif text-xl">What the app does not collect</h2>
      <p>
        The current app does not require you to create an account. It does not
        intentionally collect your name, email address, journal entries,
        selected reflection responses, diagnosis, medical record or other
        personal health information through the app itself.
      </p>

      <h2 className="font-serif text-xl">What is kept on this device</h2>
      <p>
        The app stores a small amount of low-sensitivity information locally in
        your browser or device only:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Whether you have completed the opening steps, and that you agreed to
          the Terms, Privacy Notice and Important Information, with the date of
          that agreement.</li>
        <li>Your optional Scripture and spiritual-reflection preference.</li>
        <li>Which of the ten days you have opened, the day and page you were
          last on, and which days you have finished.</li>
        <li>The choices you selected from the lists offered on each day, saved as
          short option labels rather than anything you typed.</li>
        <li>The personalized reflection prepared for you on a day, so that it can
          be shown again if you return to that page.</li>
      </ul>
      <p>
        The app also uses your browser’s <em>session storage</em> to remember,
        for the current session only, that the launch screen has already been
        shown, so it does not repeat.
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
        with access to your device or browser profile may be able to see them.
        You can remove all of them at any time with “Clear or restart my
        journey” in Settings, or by clearing this browser’s data for the app.
      </p>


      <h2 className="font-serif text-xl">Please do not send sensitive information</h2>
      <p>
        You should not enter or send sensitive personal or health information
        through the app, because the app does not need it. If you contact us
        through any external channel, please do not include confidential
        clinical or identifying information there either.
      </p>

      <h2 className="font-serif text-xl">Standard technical information</h2>
      <p>
        Delivering any web app involves some standard technical information —
        for example your IP address, device and browser type, and access logs —
        being processed automatically by the hosting, content-delivery, font
        and media providers used to make the app available. We cannot promise
        that “no data is ever processed.” In particular, this app currently
        loads:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>The Resurgence Therapeutics logo from Wix-hosted media.</li>
        <li>Web fonts from Google Fonts.</li>
      </ul>
      <p>
        Those providers apply their own privacy practices to that technical
        information.
      </p>

      <h2 className="font-serif text-xl">What the app does not do</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>No behavioural advertising.</li>
        <li>No profiling of users.</li>
        <li>No sale of personal information.</li>
        <li>No clinical record is created about you.</li>
        <li>No artificial-intelligence analysis of your reflections.</li>
      </ul>

      <h2 className="font-serif text-xl">External links</h2>
      <p>
        The app may link to third-party resources (for example crisis lines,
        the Resurgence Therapeutics website, or the Beauty from Ashes video
        series). Once you follow an external link, the third party’s own
        privacy practices apply, not this policy.
      </p>

      <h2 className="font-serif text-xl">Future changes</h2>
      <p>
        Privacy practices may change if future versions of the app add
        accounts, payments, cloud storage or analytics. You will be told, and
        this policy will be updated with a new date, before such features are
        used with your information.
      </p>

      <h2 className="font-serif text-xl">Privacy questions</h2>
      <p>
        For privacy questions during this version, please use the{" "}
        <Link
          to="/contact-support"
          className="inline-link text-primary underline underline-offset-4"
        >
          Contact &amp; Technical Support
        </Link>{" "}
        page. A named privacy contact and email address will be added here
        before public launch.
      </p>

      <p className="text-sm text-muted-foreground">
        This policy is written in plain language and is not legal advice. It
        does not create rights or obligations beyond what applicable law
        already provides.
      </p>
    </LegalPage>
  );
}
