import { Link } from "@tanstack/react-router";

/**
 * Understated footer of legal & support links. Rendered on the main
 * shell pages and onboarding. Visually secondary — no banner treatment.
 */
export function LegalFooter() {
  const linkClass =
    "inline-link rounded-md px-1 py-0.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";
  return (
    <footer className="mt-12 border-t border-border/60 pt-4 pb-2 text-center text-xs text-muted-foreground">
      <nav aria-label="Legal and support">
        <ul className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
          <li>
            <Link to="/privacy" className={linkClass}>
              Privacy
            </Link>
          </li>
          <li aria-hidden>·</li>
          <li>
            <Link to="/terms" className={linkClass}>
              Terms
            </Link>
          </li>
          <li aria-hidden>·</li>
          <li>
            <Link to="/important-information" className={linkClass}>
              Important information
            </Link>
          </li>
          <li aria-hidden>·</li>
          <li>
            <Link to="/contact-support" className={linkClass}>
              Contact
            </Link>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
