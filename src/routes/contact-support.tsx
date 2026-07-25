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
    <LegalPage title="Contact & Technical Support">
      <p>
        This page is for technical problems with the app, accessibility
        concerns, factual corrections and product feedback during the private
        beta.
      </p>

      <div className="surface-card space-y-2">
        <h2 className="font-serif text-lg text-foreground">
          This is not a therapy or crisis channel
        </h2>
        <p className="text-sm text-muted-foreground">
          This contact page is not monitored continuously. It is not a
          therapy, counselling, pastoral-care or crisis-response channel.
          Please do not send confidential, identifying or health information
          here.
        </p>
        <p className="text-sm">
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
        <h2 className="font-serif text-lg text-foreground">Contact details</h2>
        <p className="text-sm text-muted-foreground">
          Direct support contact will be added before public release.
        </p>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Coming soon
        </p>
      </div>

      <h2 className="font-serif text-xl">Helpful details to include</h2>
      <p>
        When something in the app is not working as expected, these non-
        sensitive details help us understand quickly:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Device type (for example, iPhone, Android, laptop).</li>
        <li>Browser (for example, Safari, Chrome, Firefox) and version if known.</li>
        <li>Which screen or page you were on.</li>
        <li>What happened, and what you expected instead.</li>
        <li>Whether refreshing the page changed anything.</li>
      </ul>
      <p className="text-sm text-muted-foreground">
        Please leave out any personal, identifying or health information — it
        is not needed to reproduce a technical issue.
      </p>
    </LegalPage>
  );
}
