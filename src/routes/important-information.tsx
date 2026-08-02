import { Link, createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/important-information")({
  head: () => ({
    meta: [
      { title: "Important Information — Beauty from Ashes" },
      {
        name: "description",
        content:
          "Clinical disclaimer, boundaries of the app, and crisis support information for users of Beauty from Ashes.",
      },
      { property: "og:title", content: "Important Information — Beauty from Ashes" },
      {
        property: "og:description",
        content:
          "Clinical disclaimer, boundaries of the app, and crisis support information.",
      },
    ],
  }),
  component: ImportantInfoPage,
});

function ImportantInfoPage() {
  return (
    <LegalPage
      title="Important Information, Clinical Disclaimer &amp; Crisis Support"
      lastUpdated="August 2, 2026"
    >
      <p className="text-lg">
        <strong className="font-medium text-foreground">
          Beauty from Ashes is not psychotherapy.
        </strong>
      </p>
      <p>
        No therapeutic relationship is formed by using this app. The app is not
        monitored by a therapist, counsellor or crisis responder. It cannot
        assess risk, respond to disclosures, contact emergency services, or
        know when you are in danger.
      </p>

      <h2 className="font-serif text-xl">What the app cannot do</h2>
      <p>
        Information, reflections and exercises in the app do not replace
        clinical assessment, diagnosis, psychotherapy, medical care, medication
        advice, spiritual direction or individualized safety planning.
      </p>

      <h2 className="font-serif text-xl">Confidentiality</h2>
      <p>
        Using this app is not a confidential psychotherapy session. Local
        device preferences the app stores (see the{" "}
        <Link to="/privacy" className="inline-link text-primary underline underline-offset-4">
          Privacy Policy
        </Link>
        ) may be visible to anyone with access to your device or browser
        profile. Any external email or contact channel offered by the project
        is not an appropriate place to share confidential clinical
        disclosures. Please do not submit sensitive personal or health
        information.
      </p>

      <h2 className="font-serif text-xl">If you feel overwhelmed</h2>
      <p>
        It is okay to stop, and stopping is allowed at any point. You may close
        the app, put it down, or leave a day unfinished. If it helps, you might
        turn your attention to something ordinary around you, or reach a person
        or professional you trust. Nothing here is required, and no particular
        response is promised. Your safety matters more than any exercise in this
        app. You can also open{" "}
        <Link to="/support" className="inline-link text-primary underline underline-offset-4">
          Support &amp; Safety
        </Link>{" "}
        for crisis lines and other kinds of help.
      </p>

      <h2 className="font-serif text-xl">This app may complement therapy</h2>
      <p>
        Beauty from Ashes may accompany work you are already doing with a
        therapist, doctor or trusted professional. It does not replace that
        care.
      </p>

      <div className="surface-card space-y-3 border-l-4 border-l-destructive">
        <h2 className="font-serif text-lg text-foreground">
          If safety is at immediate risk
        </h2>
        <p className="text-sm text-foreground">
          Call{" "}
          <a href="tel:911" className="text-primary underline underline-offset-4">
            911
          </a>{" "}
          or go to your nearest emergency department.
        </p>
        <p className="text-sm text-foreground">
          If you are thinking about suicide, or are worried about someone else,
          the 9-8-8 Suicide Crisis Helpline in Canada is free, confidential and
          available 24/7 by phone or text.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="tel:988"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-primary underline underline-offset-4"
          >
            Call 988
          </a>
          <a
            href="sms:988"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-primary underline underline-offset-4"
          >
            Text 988
          </a>
        </div>
        <p className="text-sm text-muted-foreground">
          If you are outside Canada, please use your local emergency or crisis
          service.
        </p>
      </div>

      <p className="text-sm">
        For the full list of Canadian crisis lines and other kinds of help used
        in this app, see{" "}
        <Link to="/support" className="inline-link text-primary underline underline-offset-4">
          Support &amp; Safety
        </Link>
        .
      </p>
    </LegalPage>
  );
}
