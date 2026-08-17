import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

interface LegalPageProps {
  title: string;
  lastUpdated?: string;
  children: ReactNode;
}

export function LegalPage({
  title,
  lastUpdated = "July 24, 2026",
  children,
}: LegalPageProps) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="container-page bfa-top-safe-roomy pb-8">
        <div className="pb-4">
          <Link
            to="/"
            className="btn-quiet"
          >
            ← Return to Your Journey
          </Link>
        </div>

        {/* Exactly one main landmark for this page: the legal document itself,
            heading included. Nothing else on the route renders a main. */}
        <main>
          <header className="space-y-2 pb-6">
            <p className="eyebrow">Resurgence Therapeutics</p>
            <h1 className="bfa-h1 font-serif text-foreground">
              {title}
            </h1>
            <p className="bfa-copy-meta text-muted-foreground">
              Last updated: {lastUpdated}
            </p>
          </header>

          <div className="legal-prose space-y-5 pb-10 text-foreground">
            {children}
          </div>
        </main>


        <div className="bfa-copy-support border-t border-border/60 pt-6">
          <p className="text-muted-foreground">
            See also:{" "}
            <Link to="/privacy" className="inline-link text-primary underline underline-offset-4">
              Privacy
            </Link>{" "}
            ·{" "}
            <Link to="/terms" className="inline-link text-primary underline underline-offset-4">
              Terms
            </Link>{" "}
            ·{" "}
            <Link to="/important-information" className="inline-link text-primary underline underline-offset-4">
              Important information
            </Link>{" "}
            ·{" "}
            <Link to="/contact-support" className="inline-link text-primary underline underline-offset-4">
              Contact
            </Link>{" "}
            ·{" "}
            <Link to="/support" className="inline-link text-primary underline underline-offset-4">
              Support &amp; Safety
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
