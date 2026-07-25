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
      <div className="container-page py-8">
        <div className="pb-4">
          <Link
            to="/"
            className="inline-link text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            ← Back
          </Link>
        </div>

        <header className="space-y-2 pb-6">
          <p className="eyebrow">Resurgence Therapeutics</p>
          <h1 className="font-serif text-3xl leading-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="text-xs text-muted-foreground">
            Last updated: {lastUpdated}
          </p>
        </header>

        <div className="legal-prose space-y-5 pb-10 text-[17px] leading-relaxed text-foreground">
          {children}
        </div>

        <div className="border-t border-border/60 pt-6 text-sm">
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
