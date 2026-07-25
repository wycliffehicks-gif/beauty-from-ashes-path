import { useEffect, useState, type ReactNode } from "react";
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
    const dwell = reduced ? 500 : 1400;
    const fade = reduced ? 0 : 250;

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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--warm-ivory,#F6F2EA)] transition-opacity duration-300 ease-out motion-reduce:transition-none"
          style={{ opacity: leaving ? 0 : 1 }}
        >
          <div
            className="flex w-full items-center justify-center px-4 transition-transform duration-500 ease-out motion-reduce:transition-none"
            style={{ transform: leaving ? "scale(1.02)" : "scale(1)" }}
          >
            {imgOk ? (
              <img
                src={LOGO_URL}
                alt="Resurgence Therapeutics — Awaken, Rediscover, Hope"
                onError={() => setImgOk(false)}
                className="h-auto w-[82vw] max-w-[340px] object-contain sm:max-w-[420px]"
                draggable={false}
              />
            ) : (
              <div className="text-center">
                <p className="font-serif text-2xl text-[#1A355E]">
                  Resurgence Therapeutics
                </p>
                <p className="mt-3 whitespace-nowrap font-sans text-[0.78rem] font-bold tracking-[0.18em] text-[#1A355E]">
                  AWAKEN&nbsp;|&nbsp;REDISCOVER&nbsp;|&nbsp;HOPE
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
