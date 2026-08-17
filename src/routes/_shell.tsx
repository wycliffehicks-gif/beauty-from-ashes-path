import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

/**
 * Shared chrome only. The one hydrated agreement gate lives in the root route
 * (src/components/AgreementGate.tsx) so it covers every surface, including
 * root-level routes such as /day/$day and /practice/*.
 */
function ShellLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isHome = pathname === "/";


  return (
    <div className="journey-page">
      <div className="container-page flex min-h-[100dvh] flex-col">
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 bfa-top-safe pb-2">
          {isHome ? (
            <span aria-hidden className="min-h-[44px] min-w-[44px]" />
          ) : (
            <Link to="/" aria-label="Home — Your Journey" className="journey-chrome-btn">
              <HomeIcon />
            </Link>
          )}
          <span aria-hidden />
          <Link to="/settings" aria-label="Settings" className="journey-chrome-btn">
            <SettingsIcon />
          </Link>

        </header>

        <main className="flex-1 pb-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 11.2 12 4l8 7.2" />
      <path d="M6 10.5V20h12v-9.5" />
    </svg>
  );
}

/** Conventional settings glyph: this control navigates to Settings, not a menu. */
function SettingsIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a1.5 1.5 0 1 1-2.12 2.12l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a1.5 1.5 0 1 1-3 0v-.11a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a1.5 1.5 0 1 1-2.12-2.12l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a1.5 1.5 0 1 1 0-3h.11a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a1.5 1.5 0 1 1 2.12-2.12l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a1.5 1.5 0 1 1 3 0v.11a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a1.5 1.5 0 1 1 2.12 2.12l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.03H21a1.5 1.5 0 1 1 0 3h-.11a1.7 1.7 0 0 0-1.49 1.03z" />
    </svg>
  );
}

