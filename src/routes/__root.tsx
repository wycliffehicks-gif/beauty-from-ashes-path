import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SplashGate } from "../components/SplashGate";
import { AgreementGate } from "../components/AgreementGate";
import { PilotGate } from "../components/PilotGate";
import { recordRouteTransition } from "../components/JourneyScreen";

/**
 * System dark mode, applied before the body paints so there is no light flash
 * and no hydration mismatch: the class lives on <html>, which React does not
 * manage. No user setting, no persistence, no analytics. Responds safely if the
 * system preference changes mid-session.
 */
const THEME_SCRIPT = `(function(){try{var m=window.matchMedia("(prefers-color-scheme: dark)");var a=function(d){var r=document.documentElement;r.classList.toggle("dark",d);var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute("content",d?"#12213D":"#F6F2EA");};a(m.matches);if(m.addEventListener)m.addEventListener("change",function(e){a(e.matches);});else if(m.addListener)m.addListener(function(e){a(e.matches);});}catch(e){}})();`;


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <p className="font-serif text-6xl text-foreground">…</p>
        <h1 className="bfa-h1 mt-4 font-serif text-foreground">This page isn’t here</h1>
        <p className="bfa-copy-support mt-3 text-muted-foreground">
          The path you followed doesn’t lead anywhere just now. That’s alright — you can begin again.
        </p>
        <div className="mt-8">
          <Link
            to="/"
            className="btn-primary-journey"
          >
            Return to Your Journey
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <h1 className="bfa-h1 font-serif text-foreground">Something didn’t load</h1>
        <p className="bfa-copy-support mt-3 text-muted-foreground">
          Take a breath. You can try again, or return to Your Journey.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="btn-primary-journey"
          >
            Try again
          </button>
          <a
            href="/"
            className="btn-quiet"
          >
            Return to Your Journey
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#F6F2EA" },
      { title: "Beauty from Ashes — A gentle daily companion for walking toward hope" },
      {
        name: "description",
        content:
          "A private, mobile-first companion for reflection, grounding and one honest step. Part of the Resurgence Therapeutics ecosystem.",
      },
      { name: "author", content: "Resurgence Therapeutics" },
      { property: "og:title", content: "Beauty from Ashes" },
      {
        property: "og:description",
        content: "A gentle daily companion for walking toward hope.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.json" },
      { rel: "stylesheet", href: appCss },
      // Original mark: deep navy field with one restrained gold living thread.
      // No builder identity, no raster dependency, no remote request.
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },

      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@400;500;600&display=swap",
      },

    ],

  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // Recorded during render, before the routed child mounts, so a screen knows
  // whether it arrived through a client navigation or an ordinary document
  // load. Idempotent and client-only, so StrictMode's repeated render probe and
  // SSR both leave it unchanged.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (typeof document !== "undefined") recordRouteTransition(pathname);

  // Register the lightweight installable shell service worker in production.
  // Dev HMR and the dev server can conflict with a service worker, so this is
  // gated on a production build and on navigator.serviceWorker availability.
  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        // Service worker registration is a best-effort enhancement; failures are
        // not surfaced to the user.
      });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SplashGate>
        <PilotGate>
          <AgreementGate>
            <Outlet />
          </AgreementGate>
        </PilotGate>
      </SplashGate>
    </QueryClientProvider>

  );
}
