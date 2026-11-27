import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { isPrivateProjectPreview } from "@/lib/ai/conversation/staging/private-preview-origin";
import { readPrivatePreviewAvailability } from "@/lib/ai/conversation/staging/private-preview.functions";
import { PrivateStagingSignIn } from "./PrivateStagingSignIn";
import { StagingConsole } from "./StagingConsole";

const leaseMs = 30_000;
type Screen = "checking" | "ordinary" | "closed" | "private";

export function HostedStagingEntry() {
  const check = useServerFn(readPrivatePreviewAvailability);
  const [screen, setScreen] = useState<Screen>("checking");
  const deadline = useRef(0);
  const epoch = useRef(0);
  const generation = epoch.current;
  const isOpen = () => generation === epoch.current && performance.now() < deadline.current;

  useEffect(() => {
    if (!isPrivateProjectPreview(window.location.href)) {
      setScreen("ordinary");
      return;
    }
    let disposed = false;
    let latest = 0;
    let expiry: ReturnType<typeof setTimeout>;
    let renewal: ReturnType<typeof setTimeout>;
    let timeout: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    function retire() {
      ++latest;
      controller?.abort();
      if (deadline.current) ++epoch.current;
      deadline.current = 0;
      clearTimeout(renewal);
      clearTimeout(expiry);
      clearTimeout(timeout);
    }
    function close() {
      retire();
      setScreen("closed");
    }
    async function refresh() {
      const start = performance.now();
      if (deadline.current && start >= deadline.current) close();
      const ticket = ++latest;
      controller?.abort();
      clearTimeout(timeout);
      controller = new AbortController();
      timeout = setTimeout(close, leaseMs);
      try {
        const open = await check({ signal: controller.signal });
        if (disposed || ticket !== latest) return;
        clearTimeout(timeout);
        clearTimeout(renewal);
        const remaining = start + leaseMs - performance.now();
        if (open !== true || remaining <= 0) return close();
        clearTimeout(expiry);
        deadline.current = start + leaseMs;
        setScreen("private");
        expiry = setTimeout(close, remaining);
        renewal = setTimeout(refresh, remaining / 2);
      } catch {
        if (!disposed && ticket === latest) close();
      }
    }
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      disposed = true;
      retire();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [check]);

  if (screen === "ordinary") return <StagingConsole />;
  if (screen === "private")
    return <PrivateStagingSignIn key={generation} privateReview previewIsOpen={isOpen} />;
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p role="status">
        {screen === "closed" ? "Private testing is closed." : "Checking staging availability…"}
      </p>
    </main>
  );
}
