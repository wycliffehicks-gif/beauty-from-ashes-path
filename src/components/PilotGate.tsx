import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getGateStatus, unlockSite } from "@/lib/gate.functions";
import {
  classifyUnlockAttempt,
  marksFieldInvalid,
  UNLOCK_MESSAGES,
  type UnlockOutcome,
} from "@/lib/gate-ui";
import { VisualMotif } from "@/components/VisualMotifs";


/**
 * The private-pilot passcode gate.
 *
 * One shared code, held by the founder and given to invited testers. This is a
 * gate, not a login: there is no account, no identity and nothing personal is
 * collected. The code itself never reaches the browser — it is compared on the
 * server, and an encrypted cookie remembers the unlocked state for a month.
 *
 * Safety and legal pages stay reachable while locked, so a person who lands
 * here in distress can still find Support & Safety.
 */
const ALWAYS_OPEN = ["/support", "/privacy", "/terms", "/important-information", "/contact-support"];

type Status = "checking" | "locked" | "open";

export function PilotGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [status, setStatus] = useState<Status>("checking");
  const check = useServerFn(getGateStatus);

  useEffect(() => {
    let active = true;
    check()
      .then((r) => {
        if (active) setStatus(!r.required || r.unlocked ? "open" : "locked");
      })
      .catch(() => {
        // If the check cannot complete, do not strand the person behind a gate.
        if (active) setStatus("open");
      });
    return () => {
      active = false;
    };
  }, [check]);

  const alwaysOpen = ALWAYS_OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (status === "open" || alwaysOpen) return <>{children}</>;
  if (status === "checking") return <GateHolding />;
  return <PasscodeScreen onUnlocked={() => setStatus("open")} />;
}

function GateHolding() {
  return (
    <div className="journey-page">
      <div
        className="container-page flex min-h-[100dvh] items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <p className="bfa-copy-support text-muted-foreground">One moment…</p>
      </div>
    </div>
  );
}

function PasscodeScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const unlock = useServerFn(unlockSite);
  const [value, setValue] = useState("");
  const [outcome, setOutcome] = useState<Exclude<UnlockOutcome, "unlocked"> | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setOutcome(null);
    const result = await classifyUnlockAttempt(() => unlock({ data: { passcode: value } }));
    setBusy(false);
    if (result === "unlocked") onUnlocked();
    else setOutcome(result);
  }

  const invalid = marksFieldInvalid(outcome);

  return (
    <div className="journey-page">
      <div className="container-page bfa-top-safe-roomy flex min-h-[100dvh] flex-col justify-start pb-10 pt-[clamp(2rem,9vh,5rem)]">
        <div className="bfa-visual-home-hero">
          <VisualMotif variant="home" />
          <div className="bfa-visual-home-hero-inner space-y-3">
            <p className="eyebrow">Private pilot</p>
            <h1 className="bfa-heading bfa-h1 font-serif">Beauty from Ashes</h1>
            <hr className="gold-seam w-24" />
            <p className="bfa-copy text-muted-foreground">
              This is a private draft, shared with a small number of invited people. Enter the
              access code you were given to continue.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-3" data-testid="pilot-gate-form">
          <label htmlFor="pilot-passcode" className="bfa-copy-support block text-foreground">
            Access code
          </label>
          <input
            id="pilot-passcode"
            name="passcode"
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={outcome ? "pilot-passcode-error" : undefined}
            className="bfa-copy w-full rounded-lg border border-border bg-background p-3 text-foreground"
          />
          {outcome && (
            <p
              id="pilot-passcode-error"
              role="alert"
              className="bfa-copy-support bfa-form-error text-destructive"
              data-testid={outcome === "mismatch" ? "pilot-gate-error" : "pilot-gate-unavailable"}
            >
              {UNLOCK_MESSAGES[outcome]}
            </p>
          )}
          <button type="submit" className="btn-primary-journey w-full" disabled={busy}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>


        <p className="bfa-copy-support mt-8 text-muted-foreground">
          If something in your life feels urgent right now, help is available without a code —{" "}
          <Link to="/support" className="text-link">
            Support &amp; Safety
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
