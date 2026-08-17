import { Link, createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/pilot-feedback")({
  head: () => ({
    meta: [
      { title: "Pilot Feedback — Beauty from Ashes: The First Journey" },
      {
        name: "description",
        content:
          "Share non-sensitive feedback about the Beauty from Ashes private pilot. Not for crisis, therapy, or confidential disclosures.",
      },
      { property: "og:title", content: "Pilot Feedback — Beauty from Ashes" },
      {
        property: "og:description",
        content:
          "Share non-sensitive feedback about the Beauty from Ashes private pilot.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PilotFeedbackPage,
});

function PilotFeedbackPage() {
  return (
    <LegalPage title="Pilot Feedback" lastUpdated="August 17, 2026">
      <p>
        This page is for feedback on the private pilot of <strong>Beauty from Ashes: The First Journey</strong>
        — things that felt confusing, missing, helpful, or hard to use.
      </p>

      <div className="surface-card space-y-2">
        <h2 className="bfa-h3 font-serif text-foreground">Please do not send sensitive information here</h2>
        <p className="bfa-copy-support text-muted-foreground">
          This is not a therapy, counselling, pastoral-care or crisis-response channel. Please do not include
          confidential, identifying, or health information in your feedback.
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
        <h2 className="bfa-h3 font-serif text-foreground">How to share feedback</h2>
        <p className="bfa-copy-support text-foreground">
          During this private pilot, feedback is gathered through the Resurgence Therapeutics contact
          channel at <strong>ResurgenceTherapeutics.ca</strong>, when that contact channel launches.
        </p>
        <p className="bfa-copy-support text-muted-foreground">
          That website contact channel is not finished yet, so this private version does not currently offer
          a monitored telephone or email route for feedback. The domain is shown as plain text on purpose,
          rather than as a link that would not reach anyone.
        </p>
      </div>

      <div className="surface-card space-y-2">
        <h2 className="bfa-h3 font-serif text-foreground">What is helpful to include</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Which screen or day you were on.</li>
          <li>What felt unclear, rushed, or difficult.</li>
          <li>What felt supportive, grounding, or useful.</li>
          <li>Whether the language, length, or pacing felt right.</li>
          <li>Device and browser (for example, iPhone Safari or Android Chrome).</li>
        </ul>
        <p className="bfa-copy-support text-muted-foreground">
          Please leave out any personal, identifying, or health information — it is not needed to improve
          the app.
        </p>
      </div>

      <div className="surface-card space-y-2">
        <h2 className="bfa-h3 font-serif text-foreground">Response expectations</h2>
        <p className="bfa-copy-support text-muted-foreground">
          This is not a continuously monitored channel. If your feedback is sent through the Resurgence
          Therapeutics contact channel, it will be reviewed as part of the pilot process and you can expect a
          response within a few business days when that channel is live.
        </p>
      </div>
    </LegalPage>
  );
}
