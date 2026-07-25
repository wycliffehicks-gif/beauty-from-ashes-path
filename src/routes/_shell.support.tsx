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
          If you are not in immediate danger but need to talk to someone, these lines are free,
          confidential and available in Canada. If you are outside Canada, please use a trusted local
          line — a curated international list will be added before public release.
        </p>
        <ul className="space-y-2 text-sm">
          <li className="rounded-lg border border-border bg-secondary/40 p-3">
            <strong className="font-medium text-foreground">9-8-8 — Suicide Crisis Helpline (Canada).</strong>{" "}
            <span className="text-muted-foreground">
              Call or text <a href="tel:988" className="text-primary underline underline-offset-4">988</a>.
              24/7, in English and French.
            </span>
          </li>
          <li className="rounded-lg border border-border bg-secondary/40 p-3">
            <strong className="font-medium text-foreground">Talk Suicide Canada.</strong>{" "}
            <span className="text-muted-foreground">
              Call <a href="tel:18334564566" className="text-primary underline underline-offset-4">1-833-456-4566</a>.
              24/7 across Canada.
            </span>
          </li>
          <li className="rounded-lg border border-border bg-secondary/40 p-3">
            <strong className="font-medium text-foreground">Kids Help Phone.</strong>{" "}
            <span className="text-muted-foreground">
              Call <a href="tel:18006686868" className="text-primary underline underline-offset-4">1-800-668-6868</a>{" "}
              or text CONNECT to <a href="sms:686868" className="text-primary underline underline-offset-4">686868</a>.
              For young people, 24/7.
            </span>
          </li>
          <li className="rounded-lg border border-border bg-secondary/40 p-3">
            <strong className="font-medium text-foreground">Hope for Wellness Helpline.</strong>{" "}
            <span className="text-muted-foreground">
              For Indigenous peoples across Canada. Call{" "}
              <a href="tel:18552423310" className="text-primary underline underline-offset-4">1-855-242-3310</a>.
              24/7, with counsellors available in Cree, Ojibway and Inuktitut on request.
            </span>
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Numbers current at time of writing. If a line has changed, please contact your local emergency
          services instead.
        </p>
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
