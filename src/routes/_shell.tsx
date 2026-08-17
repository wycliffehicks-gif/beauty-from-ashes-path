import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { JourneyIcon, SettingsIcon } from "@/components/Icons";

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
              <JourneyIcon />
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
