import { Link, createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/contact-support")({
  head: () => ({
    meta: [
      { title: "Contact & Technical Support — Beauty from Ashes" },
      {
        name: "description",
        content:
          "How to reach the Beauty from Ashes team about technical issues, accessibility, and product feedback during the current version.",
      },
      { property: "og:title", content: "Contact & Technical Support — Beauty from Ashes" },
      {
        property: "og:description",
        content:
          "Technical support, accessibility, and product feedback for the Beauty from Ashes current version.",
      },
    ],
  }),
  component: ContactSupportPage,
});

function ContactSupportPage() {
  return (
    <LegalPage title="Contact & Technical Support" lastUpdated="August 17, 2026">
      <p>
        This page is for technical problems with the app, accessibility
        concerns, factual corrections and product feedback before public
        release.
      </p>

      <div className="surface-card space-y-2">
        <h2 className="bfa-h3 font-serif text-foreground">
          This is not a therapy or crisis channel
        </h2>
        <p className="bfa-copy-support text-muted-foreground">
          Contact is not a therapy, counselling, pastoral-care or crisis-response
          channel, and it is not monitored continuously. Please do not send
          confidential, identifying or health information here.
        </p>
        <p className="bfa-copy-support">
          If you need urgent help, please visit{" "}
          <Link
            to="/important-information"
            className="inline-link text-primary underline underline-offset-4"
          >
            Important Information &amp; Crisis Support
          </Link>{" "}
          or{" "}
          <Link
            to="/support"
            className="inline-link text-primary underline underline-offset-4"
          >
            Support &amp; Safety
          </Link>
          .
        </p>
      </div>

      <div className="surface-card space-y-2">
        <h2 className="bfa-h3 font-serif text-foreground">
          General, non-urgent questions
        </h2>
        <p className="bfa-copy-support text-foreground">
          Email:{" "}
          <a
            href="mailto:wycliffe.hicks@gmail.com"
            className="inline-link text-primary underline underline-offset-4"
          >
            wycliffe.hicks@gmail.com
          </a>
        </p>
        <p className="bfa-copy-support text-muted-foreground">
          This inbox is not monitored continuously. It is not a crisis service
          and cannot provide urgent or emergency support or clinical advice.
          Please do not send journal entries or sensitive personal or health
          information by email; ordinary email is not a secure or confidential
          channel.
        </p>
      </div>


      <h2 className="bfa-h2 font-serif">Helpful details to include</h2>
      <p>
        When something in the app is not working as expected, these
        non-sensitive details help us understand quickly:
      </p>

      <ul className="list-disc space-y-1 pl-5">
        <li>Device type (for example, iPhone, Android, laptop).</li>
        <li>Browser (for example, Safari, Chrome, Firefox) and version if known.</li>
        <li>Which screen or page you were on.</li>
        <li>What happened, and what you expected instead.</li>
        <li>Whether refreshing the page changed anything.</li>
      </ul>
      <p className="bfa-copy-support text-muted-foreground">
        Please leave out any personal, identifying or health information — it
        is not needed to reproduce a technical issue.
      </p>
    </LegalPage>
  );
}
