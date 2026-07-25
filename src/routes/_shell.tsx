import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { usePrefs } from "@/lib/prefs";
import { isSplashActive, onSplashEnd } from "@/lib/splash-state";
import { LegalFooter } from "@/components/LegalFooter";

export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  const [prefs, , hydrated] = usePrefs();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  // Route unonboarded users to /onboarding after hydration.
  useEffect(() => {
    if (!hydrated) return;
    if (prefs.onboarded) return;
    const go = () => navigate({ to: "/onboarding", replace: true });
    if (isSplashActive()) {
      const off = onSplashEnd(go);
      return () => off();
    }
    go();
  }, [hydrated, prefs.onboarded, navigate]);

  const tabs: { to: string; label: string; icon: React.ReactNode }[] = [
    { to: "/", label: "Today", icon: <SunIcon /> },
    { to: "/journey", label: "Journey", icon: <PathIcon /> },
    { to: "/practices", label: "Practices", icon: <LeafIcon /> },
    { to: "/resources", label: "Resources", icon: <BookIcon /> },
  ];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="container-page flex items-center justify-between pt-6 pb-2">
        <Link to="/" className="inline-link font-serif text-lg tracking-tight text-foreground">
          Beauty from Ashes
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link
            to="/support"
            className="inline-link rounded-md px-2 py-1 text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Support &amp; Safety
          </Link>
          <Link
            to="/settings"
            aria-label="Settings"
            className="inline-link rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <GearIcon />
          </Link>
        </div>
      </header>

      <main className="container-page pb-32 pt-2">
        <Outlet />
        <LegalFooter />
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="container-page grid grid-cols-4 gap-1 py-2">
          {tabs.map((t) => {
            const active = t.to === "/" ? pathname === "/" : pathname.startsWith(t.to);
            return (
              <li key={t.to}>
                <Link
                  to={t.to}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] transition-colors ${
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <span aria-hidden>{t.icon}</span>
                  <span>{t.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>
    </svg>
  );
}
function PathIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 20c3-4 3-7 6-9s3-5 6-7"/><circle cx="4" cy="20" r="1.3" fill="currentColor"/><circle cx="16" cy="4" r="1.3" fill="currentColor"/>
    </svg>
  );
}
function LeafIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M5 19c8 1 14-5 14-14-8 0-14 4-14 12"/><path d="M5 19c2-4 5-7 9-9"/>
    </svg>
  );
}
function BookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 5c3-1 6-1 8 1v14c-2-2-5-2-8-1zM20 5c-3-1-6-1-8 1v14c2-2 5-2 8-1z"/>
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
    </svg>
  );
}
