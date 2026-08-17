import { Link, createFileRoute } from "@tanstack/react-router";

import {
  CA_REGION,
  GLOBAL_REGION,
  type CrisisLine,
  type RegionResource,
} from "@/content/crisis-registry";

export const Route = createFileRoute("/_shell/support")({
  head: () => ({
    meta: [
      { title: "Support & Safety — Beauty from Ashes" },
      {
        name: "description",
        content:
          "This app is not monitored and cannot respond to emergencies. In immediate danger, contact local emergency services.",
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

function prettyTel(tel: string) {
  if (tel === "988" || tel === "911") return tel;
  if (tel.length === 11 && tel.startsWith("1")) {
    return `1-${tel.slice(1, 4)}-${tel.slice(4, 7)}-${tel.slice(7)}`;
  }
  return tel;
}

const ACTION =
  "bfa-support-action bfa-copy-support inline-flex min-h-[48px] items-center justify-center rounded-lg border border-[color:var(--bfa-control-border)] bg-background px-4 py-2 font-medium text-primary underline underline-offset-4";

/** One registry entry, with separate Call and Text actions where both exist. */
function LineCard({ line }: { line: CrisisLine }) {
  return (
    <li className="rounded-lg border border-border bg-secondary/40 p-3">
      <p className="bfa-copy font-medium text-foreground">{line.name}</p>
      <p className="bfa-copy-support mt-1 text-muted-foreground">{line.detail}</p>
      {line.caution && <p className="bfa-copy-support mt-2 text-foreground">{line.caution}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {line.tel && (
          <a href={`tel:${line.tel}`} className={ACTION}>
            Call {prettyTel(line.tel)}
          </a>
        )}
        {line.sms && (
          <a href={`sms:${line.sms}`} className={ACTION}>
            {line.smsKeyword
              ? `Text ${line.smsKeyword} to ${prettyTel(line.sms)}`
              : `Text ${prettyTel(line.sms)}`}
          </a>
        )}
        {line.url && (
          <a href={line.url} target="_blank" rel="noopener noreferrer" className={ACTION}>
            {line.urlLabel ?? line.url}
          </a>
        )}
      </div>
    </li>
  );
}

function RegionBlock({ region }: { region: RegionResource }) {
  return (
    <ul className="space-y-2">
      {region.crisisLines.map((line) => (
        <LineCard key={line.name} line={line} />
      ))}
    </ul>
  );
}

function SupportPage() {
  return (
    <section className="space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="bfa-h1 font-serif text-foreground">Support &amp; Safety</h1>
        <p className="bfa-copy text-muted-foreground">
          Please read this before continuing. Your safety matters more than any exercise in this
          app.
        </p>
      </header>

      <div className="surface-card space-y-3 border-l-4 border-l-destructive">
        <h2 className="bfa-h2 font-serif text-foreground">If you are in immediate danger</h2>
        <p className="bfa-copy text-foreground">{CA_REGION.emergencyGuidance}</p>
        {CA_REGION.emergencyTel && (
          <a href={`tel:${CA_REGION.emergencyTel}`} className={ACTION}>
            Call {CA_REGION.emergencyTel}
          </a>
        )}
        <p className="bfa-copy-support text-muted-foreground">
          This app is not monitored. It cannot see, hear, or respond to emergencies.
        </p>
      </div>

      <div className="surface-card space-y-2">
        <h2 className="bfa-h2 font-serif text-foreground">What this app is not</h2>
        <ul className="bfa-copy-support list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>It is not psychotherapy or counselling.</li>
          <li>It is not medical treatment or diagnosis.</li>
          <li>It is not crisis care or emergency support.</li>
          <li>It cannot replace a qualified professional or a safe, trusted relationship.</li>
        </ul>
      </div>

      <div className="surface-card space-y-3">
        <h2 className="bfa-h2 font-serif text-foreground">Crisis lines in Canada</h2>
        <p className="bfa-copy-support text-muted-foreground">
          If you are not in immediate danger but need to talk to someone, these lines are free and
          confidential.
        </p>
        <RegionBlock region={CA_REGION} />
      </div>

      {CA_REGION.supportLines && (
        <div className="surface-card space-y-3" data-testid="support-non-crisis">
          <h2 className="bfa-h2 font-serif text-foreground">Other kinds of help</h2>
          <p className="bfa-copy-support text-muted-foreground">
            These are not crisis lines. They may help with finding services, safety planning or
            practical support.
          </p>
          <ul className="space-y-2">
            {CA_REGION.supportLines.map((line) => (
              <LineCard key={line.name} line={line} />
            ))}
          </ul>
        </div>
      )}

      <div className="surface-card space-y-3" data-testid="support-global">
        <h2 className="bfa-h2 font-serif text-foreground">If you are outside Canada</h2>
        <p className="bfa-copy-support text-muted-foreground">
          This is a Canada-only private pilot, and its resources have not yet been localized for
          other countries. {GLOBAL_REGION.emergencyGuidance}
        </p>
        <RegionBlock region={GLOBAL_REGION} />
      </div>

      <div className="surface-card space-y-2">
        <h2 className="bfa-h2 font-serif text-foreground">Reach a person</h2>
        <p className="bfa-copy-support text-muted-foreground">
          If you can, contact a trusted friend, family member, elder, pastor, community worker,
          doctor, or therapist. You do not have to be alone with this.
        </p>
      </div>

      <p className="bfa-copy-support text-muted-foreground">
        Resources last verified {CA_REGION.lastVerified}. If a line has changed, please contact your
        local emergency services instead.
      </p>

      <div className="pt-2">
        <Link to="/" className="btn-quiet">
          ← Return to Your Journey
        </Link>
      </div>
    </section>
  );
}
