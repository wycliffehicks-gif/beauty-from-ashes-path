import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { hasCurrentAcceptance, isPublicPath } from "@/lib/agreement";
import { usePrefs } from "@/lib/prefs";
import { isSplashActive, onSplashEnd } from "@/lib/splash-state";

/**
 * Renders children only when the current agreement has been accepted on this
 * device, or when the route is one of the always-reachable safety/information
 * pages. Restricted routes never mount before then, so a fresh person opening
 * a restricted URL sees no therapeutic content and no restricted journey state
 * is written — no locator, no answers, no reflection, no completion. The launch
 * screen may still write its own non-therapeutic session marker beforehand.
 */
export function AgreementGate({ children }: { children: ReactNode }) {
  const [prefs, , hydrated] = usePrefs();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const publicPath = isPublicPath(pathname);
  const accepted = hasCurrentAcceptance(prefs);
  const allowed = publicPath || (hydrated && accepted);

  useEffect(() => {
    if (!hydrated) return;
    if (publicPath || accepted) return;
    const go = () => navigate({ to: "/onboarding", replace: true });
    if (isSplashActive()) {
      const off = onSplashEnd(go);
      return () => off();
    }
    go();
  }, [hydrated, publicPath, accepted, navigate, pathname]);

  if (allowed) return <>{children}</>;
  return <GateHolding />;
}

/** A calm, contentless surface while the gate settles. */
function GateHolding() {
  return (
    <div className="journey-page">
      <div
        className="container-page flex min-h-[100dvh] items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm text-muted-foreground">One moment…</p>
      </div>
    </div>
  );
}
