import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_shell/support")({
  head: () => ({
    meta: [
      { title: "Support & Safety — Beauty from Ashes" },
      {
        name: "description",
        content: "This app is not monitored and cannot respond to emergencies. In immediate danger, contact local emergency services.",
      },
      { property: "og:title", content: "Support & Safety — Beauty from Ashes" },
      {
        property: "og:description",
        content: "How to reach help — this app is not therapy, and cannot respond to emergencies.",
      },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <section className="space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl text-foreground">Support &amp; Safety</h1>
        <p className="text-muted-foreground">
          Please read this before continuing. Your safety matters more than any exercise in this app.
        </p>
      </header>

      <div className="surface-card space-y-3 border-l-4 border-l-destructive">
        <h2 className="font-serif text-lg text-foreground">If you are in immediate danger</h2>
        <p className="text-sm text-foreground">
          Please contact your local emergency services now, or reach a person nearby who can be with you.
        </p>
        <p className="text-sm text-muted-foreground">
          This app is not monitored. It cannot see, hear, or respond to emergencies.
        </p>
      </div>

      <div className="surface-card space-y-2">
        <h2 className="font-serif text-lg text-foreground">What this app is not</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>It is not psychotherapy or counselling.</li>
          <li>It is not medical treatment or diagnosis.</li>
          <li>It is not crisis care or emergency support.</li>
          <li>It cannot replace a qualified professional or a safe, trusted relationship.</li>
        </ul>
      </div>

      <div className="surface-card space-y-3">
        <h2 className="font-serif text-lg text-foreground">Crisis and support lines</h2>
        <p className="text-sm text-muted-foreground">
          Verified regional numbers will be added before public release. For this private beta, please
          use the resources you already know, or ask a trusted person to help you find one.
        </p>
        <ul className="space-y-2 text-sm">
          <li className="rounded-lg border border-dashed border-border bg-secondary/40 p-3">
            <strong className="font-medium text-foreground">Canada — placeholder.</strong>{" "}
            <span className="text-muted-foreground">
              Verified national and regional lines to be added (e.g. suicide and crisis helpline, distress
              lines, Indigenous-specific lines).
            </span>
          </li>
          <li className="rounded-lg border border-dashed border-border bg-secondary/40 p-3">
            <strong className="font-medium text-foreground">International — placeholder.</strong>{" "}
            <span className="text-muted-foreground">
              Verified country-specific lines to be added. Please do not rely on this beta for numbers.
            </span>
          </li>
        </ul>
      </div>

      <div className="surface-card space-y-2">
        <h2 className="font-serif text-lg text-foreground">Reach a person</h2>
        <p className="text-sm text-muted-foreground">
          If you can, contact a trusted friend, family member, elder, pastor, community worker, doctor,
          or therapist. You do not have to be alone with this.
        </p>
      </div>

      <div className="pt-2">
        <Link to="/" className="inline-link text-sm text-primary underline underline-offset-4">
          ← Return to Today
        </Link>
      </div>
    </section>
  );
}
