import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { LEGAL_BUNDLE_VERSION, usePrefs } from "@/lib/prefs";
import { isSplashActive, onSplashEnd } from "@/lib/splash-state";

export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

/** Routes reachable before the one-time agreement has been accepted. */
const PRE_ONBOARDING_ALLOWED = ["/support", "/settings"];

function ShellLayout() {
  const [prefs, , hydrated] = usePrefs();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  // Route users to the opening flow until the current legal bundle version has
  // been accepted. Support & Safety stays reachable at any moment, including
  // before onboarding has ever been completed.
  const accepted =
    prefs.onboarded && prefs.legalAcceptance?.version === LEGAL_BUNDLE_VERSION;

  useEffect(() => {
    if (!hydrated) return;
    if (accepted) return;
    if (PRE_ONBOARDING_ALLOWED.includes(pathname)) return;
    const go = () => navigate({ to: "/onboarding", replace: true });
    if (isSplashActive()) {
      const off = onSplashEnd(go);
      return () => off();
    }
    go();
  }, [hydrated, accepted, navigate, pathname]);

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
