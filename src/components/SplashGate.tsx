import { useEffect, useState, type ReactNode } from "react";
import { VisualMotif } from "@/components/VisualMotifs";
import { beginSplash, endSplash } from "@/lib/splash-state";

const LOGO_URL =
  "https://static.wixstatic.com/media/d90d81_7308aab6b29e4efba9deb306e951a8c8~mv2.png";
const SESSION_KEY = "bfa_splash_shown_v1";


export function SplashGate({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [imgOk, setImgOk] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let shown = false;
    try {
      shown = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (shown) return;
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }

    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // Slightly longer, genuinely readable dwell; a very subtle fade only.
    const dwell = reduced ? 900 : 2600;
    const fade = reduced ? 0 : 420;

    beginSplash();
    setVisible(true);

    const t1 = window.setTimeout(() => setLeaving(true), dwell);
    const t2 = window.setTimeout(() => {
      setVisible(false);
      endSplash();
    }, dwell + fade);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      endSplash();
    };
  }, []);

  return (
    <>
      {children}
      {visible && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--ivory,#F6F2EA)] transition-opacity duration-500 ease-out motion-reduce:transition-none"
          style={{ opacity: leaving ? 0 : 1 }}
        >
          <VisualMotif variant="splash" className="bfa-visual-splash-bg" />
          <div className="relative flex w-full items-center justify-center px-4">
            <div className="bfa-visual-splash">
              <div className="bfa-visual-splash-inner">
                <p className="bfa-visual-splash-title">Beauty from Ashes</p>
                <p className="bfa-visual-splash-sub">The First Journey</p>
                <hr className="bfa-visual-splash-seam" />
                <div className="bfa-visual-splash-parent">
                  {imgOk ? (
                    <img
                      src={LOGO_URL}
                      alt=""
                      onError={() => setImgOk(false)}
                      className="bfa-visual-splash-logo object-contain"
                      draggable={false}
                    />
                  ) : (
                    <p className="bfa-visual-splash-parent-text">
                      Resurgence Therapeutics
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      )}
    </>
  );
}
