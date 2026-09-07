import { useEffect, useRef, useState, type ReactNode } from "react";

import { VisualMotif } from "@/components/VisualMotifs";
import { beginSplash, endSplash } from "@/lib/splash-state";
import { ClearNotice, StorageNotice } from "@/lib/storage-status";

const SESSION_KEY = "bfa_splash_shown_v1";

/**
 * The opening splash visually covers the whole app, so while it is showing the
 * underlying app must not be reachable by keyboard or screen reader. The
 * underlay is marked inert and aria-hidden without unmounting it, so no state
 * is lost, and both are removed the moment the splash ends.
 *
 * The overlay itself is pure branding: it has no controls, so it is hidden from
 * assistive technology rather than wrapped in an artificial focus trap.
 */
export function SplashGate({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // The storage notice must not exist inside the aria-hidden/inert underlay, so
  // it stays unmounted until the splash decision is made and any splash ends.
  const [noticeSuppressed, setNoticeSuppressed] = useState(true);
  const underlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let shown = false;
    try {
      shown = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (shown) {
      setNoticeSuppressed(false);
      return;
    }
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }

    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // A short, synchronized dwell with a brief fade; nothing loops.
    const dwell = reduced ? 700 : 1200;
    const fade = reduced ? 0 : 240;

    beginSplash();
    setVisible(true);

    const t1 = window.setTimeout(() => setLeaving(true), dwell);
    const t2 = window.setTimeout(() => {
      setVisible(false);
      setNoticeSuppressed(false);
      endSplash();
    }, dwell + fade);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      endSplash();
    };
  }, []);

  // `inert` is applied imperatively so older browsers simply keep aria-hidden.
  useEffect(() => {
    const node = underlayRef.current;
    if (!node) return;
    if (visible) node.setAttribute("inert", "");
    else node.removeAttribute("inert");
    return () => {
      node.removeAttribute("inert");
    };
  }, [visible]);

  return (
    <>
      <div
        ref={underlayRef}
        data-testid="splash-underlay"
        aria-hidden={visible ? "true" : undefined}
      >
        {/* Above the app in normal flow: visible in the first viewport and
            never covering the sticky bottom navigation dock. */}
        <StorageNotice suppressed={noticeSuppressed} />
        <ClearNotice suppressed={noticeSuppressed} />

        {children}
      </div>
      {visible && (
        <div
          data-testid="splash-overlay"
          aria-hidden="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bfa-reading-backdrop,#F6F2EA)] transition-opacity duration-[240ms] ease-out motion-reduce:transition-none"
          style={{ opacity: leaving ? 0 : 1 }}
        >
          <VisualMotif variant="splash" className="bfa-visual-splash-bg" />
          <div className="relative flex w-full items-center justify-center px-4">
            <div className="bfa-visual-splash">
              {/* Product-first: the title and what it is. Resurgence identity is
                  preserved in About, the legal pages and page metadata. */}
              <div className="bfa-visual-splash-inner">
                <p className="bfa-visual-splash-title">Beauty from Ashes</p>
                <p className="bfa-visual-splash-sub">A 10-Day Guided Reflection Journey</p>
                <hr className="bfa-visual-splash-seam" />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
