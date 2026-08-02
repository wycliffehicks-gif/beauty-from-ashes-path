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
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 pt-4 pb-2">
          {isHome ? (
            <span aria-hidden className="min-h-[44px] min-w-[44px]" />
          ) : (
            <Link to="/" aria-label="Home — Your Journey" className="journey-chrome-btn">
              <HomeIcon />
            </Link>
          )}
          <span aria-hidden />
          <Link to="/settings" aria-label="Settings" className="journey-chrome-btn">
            <MenuIcon />
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

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
