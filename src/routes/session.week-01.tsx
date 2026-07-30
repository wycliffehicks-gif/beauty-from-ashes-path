import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  SESSION_STAGE_ORDER,
  getSession,
  type SessionStage,
  type SessionStageKey,
} from "@/content/sessions";
import {
  ChoiceChip,
  SessionPrimaryButton,
  SessionStageShell,
  SessionSubtleButton,
  StageTeach,
} from "@/components/SessionStageShell";
import {
  MAX_NOTE_LENGTH,
  clearSessionState,
  emptySessionState,
  readSessionState,
  sanitizeNote,
  writeSessionState,
  type SessionState,
} from "@/lib/session-state";

const SESSION_ID = "week-01";

export const Route = createFileRoute("/session/week-01")({
  head: () => ({
    meta: [
      { title: "Week 1 Session: The Walk You’ve Been Avoiding — Beauty from Ashes" },
      {
        name: "description",
        content:
          "A longer guided reflection for Week 1 — about 30 to 60 minutes, pausable at any point.",
      },
      {
        property: "og:title",
        content: "Week 1 Session: The Walk You’ve Been Avoiding — Beauty from Ashes",
      },
      {
        property: "og:description",
        content: "A longer guided reflection you can pause at any point.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WeekOneSession,
});

type View = "stage" | "grounding-close" | "shortened";

function WeekOneSession() {
  const session = getSession(SESSION_ID)!;
  const navigate = useNavigate();

  const [state, setState] = useState<SessionState>(() => emptySessionState());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("stage");
  const [note, setNote] = useState("");
  const [branchResponse, setBranchResponse] = useState<string | null>(null);

  // Resume within the same browser session.
  useEffect(() => {
    const restored = readSessionState(SESSION_ID);
    setState(restored);
    setNote(restored.note ?? "");
    setHydrated(true);
  }, []);

  const stageIndex = SESSION_STAGE_ORDER.indexOf(state.stage);
  const stage = session.stages[stageIndex] as SessionStage;

  const update = (patch: Partial<SessionState>) => {
    setState((prev) => writeSessionState(SESSION_ID, { ...prev, ...patch }));
  };

  const goToStage = (key: SessionStageKey) => {
    setBranchResponse(null);
    setView("stage");
    update({ stage: key });
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };

  const next = () => {
    const idx = SESSION_STAGE_ORDER.indexOf(state.stage);
    const nextKey = SESSION_STAGE_ORDER[Math.min(idx + 1, SESSION_STAGE_ORDER.length - 1)];
    goToStage(nextKey);
  };

  const back = () => {
    if (branchResponse || view !== "stage") {
      setBranchResponse(null);
      setView("stage");
      return;
    }
    const idx = SESSION_STAGE_ORDER.indexOf(state.stage);
    if (idx <= 0) {
      navigate({ to: "/journey" });
      return;
    }
    goToStage(SESSION_STAGE_ORDER[idx - 1]);
  };

  const pause = () => {
    writeSessionState(SESSION_ID, state);
    navigate({ to: "/practice/$id", params: { id: "pause-and-ground" } });
  };

  const leave = () => {
    writeSessionState(SESSION_ID, state);
    navigate({ to: "/" });
  };

  const clear = () => {
    clearSessionState(SESSION_ID);
    const fresh = emptySessionState();
    setState(fresh);
    setNote("");
    setBranchResponse(null);
    setView("stage");
  };

  const selected = useMemo(
    () => state.choices[state.stage] ?? [],
    [state.choices, state.stage],
  );

  const toggleChoice = (id: string) => {
    const current = state.choices[state.stage] ?? [];
    const nextIds = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    update({ choices: { ...state.choices, [state.stage]: nextIds } });
  };

  if (!hydrated) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <div className="container-page py-10">
          <p className="text-muted-foreground">Preparing a quiet space…</p>
        </div>
      </div>
    );
  }

  const shell = (children: React.ReactNode) => (
    <SessionStageShell
      stageLabel={`${session.title} · ${stage.label}`}
      stageNumber={stageIndex + 1}
      totalStages={SESSION_STAGE_ORDER.length}
      onBack={back}
      onPause={pause}
      onLeave={leave}
      onClear={clear}
    >
      {children}
    </SessionStageShell>
  );

  if (view === "grounding-close") {
    return shell(
      <div className="space-y-5" data-testid="session-grounding-close">
        <p className="eyebrow">A gentle close</p>
        <h2 className="font-serif text-2xl text-foreground">Let’s stop here, well</h2>
        <p className="text-lg text-foreground">
          Take about a minute. Feel where your body meets the chair or the floor.
          Look slowly around the room and let your eyes rest on three ordinary things.
          Breathe out a little longer than you breathe in, three times.
        </p>
        <p className="text-base text-muted-foreground">
          Nothing was wasted by stopping. Knowing that today is not the day is real
          self-knowledge, and this session will be here unchanged whenever you return.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <SessionPrimaryButton onClick={leave}>Leave gently</SessionPrimaryButton>
          <SessionSubtleButton onClick={() => setView("stage")}>
            Actually, I’ll stay a moment
          </SessionSubtleButton>
        </div>
      </div>,
    );
  }

  if (view === "shortened") {
    return shell(
      <div className="space-y-5" data-testid="session-shortened">
        <p className="eyebrow">The shorter route</p>
        <h2 className="font-serif text-2xl text-foreground">
          Something small, and genuinely enough
        </h2>
        <p className="text-lg text-foreground">
          When energy is very low, the honest step is not a smaller version of the whole
          session — it is one true thing. So here is the whole of it:
        </p>
        <div className="surface-card space-y-2">
          <p className="text-base text-foreground">
            Put a hand somewhere on your body that feels neutral — a forearm, a knee.
            Let it rest there while you breathe out three times. Then finish this
            sentence in your head, without needing it to be profound:
            <em> “The thing I keep walking around is somewhere near…”</em>
          </p>
          <p className="text-sm text-muted-foreground">
            You do not have to finish it out loud, write it down, or do anything with it.
            Noticing where the road is counts as walking toward it.
          </p>
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <SessionPrimaryButton onClick={leave}>
            That’s enough for today
          </SessionPrimaryButton>
          <SessionSubtleButton onClick={() => setView("stage")}>
            I’d like to continue the longer session
          </SessionSubtleButton>
        </div>
      </div>,
    );
  }

  if (branchResponse) {
    return shell(
      <div className="space-y-5" data-testid="session-branch-response">
        <p className="eyebrow">Heard</p>
        <p className="text-lg leading-relaxed text-foreground">{branchResponse}</p>
        <div className="flex flex-col gap-2 pt-2">
          <SessionPrimaryButton onClick={next}>Continue gently</SessionPrimaryButton>
          <SessionSubtleButton onClick={leave}>Save my place and leave</SessionSubtleButton>
        </div>
      </div>,
    );
  }

  if (stage.status === "planned") {
    return shell(
      <div className="space-y-5" data-testid="session-planned-stage">
        <p className="eyebrow">Still being written</p>
        <h2 className="font-serif text-2xl text-foreground">{stage.label}</h2>
        <p className="text-lg text-foreground">{stage.purpose}</p>
        <p className="text-base text-muted-foreground">
          This part of the session is not ready yet. You have reached the end of what is
          available today — and what you have already done stands on its own.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <SessionPrimaryButton onClick={leave}>Return home</SessionPrimaryButton>
          <SessionSubtleButton onClick={back}>Go back a movement</SessionSubtleButton>
        </div>
      </div>,
    );
  }

  return shell(
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="eyebrow">{stage.label}</p>
        <h1 className="font-serif text-3xl leading-tight text-foreground sm:text-4xl">
          {stage.heading}
        </h1>
      </div>

      {stage.key === "arrival" && (
        <p className="rounded-lg border border-border bg-secondary/40 p-4 text-base text-foreground">
          {session.duration}
        </p>
      )}

      {stage.teach && <StageTeach text={stage.teach} />}

      {stage.body?.map((p) => (
        <p key={p.slice(0, 24)} className="text-lg leading-relaxed text-foreground">
          {p}
        </p>
      ))}

      {stage.practice && (
        <div className="surface-card space-y-1">
          <h3 className="font-serif text-lg text-foreground">{stage.practice.heading}</h3>
          <p className="text-base text-muted-foreground">{stage.practice.body}</p>
        </div>
      )}

      {stage.readiness && (
        <div className="space-y-2">
          <p className="text-base text-muted-foreground">
            Which is closest to true right now? Whatever you choose is respected — there is
            no answer here that continues the session against your wishes.
          </p>
          <ul className="space-y-2">
            {stage.readiness.map((r) => (
              <li key={r.id}>
                <ChoiceChip
                  label={r.label}
                  active={state.readiness === r.id}
                  onClick={() => {
                    update({ readiness: r.id });
                    if (r.behaviour === "support") {
                      navigate({ to: "/support" });
                      return;
                    }
                    if (r.behaviour === "grounding-close") {
                      setView("grounding-close");
                      return;
                    }
                    if (r.behaviour === "shorten") {
                      setView("shortened");
                      return;
                    }
                    setBranchResponse(r.response ?? null);
                    if (!r.response) next();
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {stage.choices && (
        <div className="space-y-2">
          <p className="text-base text-muted-foreground">
            Choose as many or as few as fit. Nothing is assumed about what you leave
            unchosen.
          </p>
          <ul className="space-y-2">
            {stage.choices.map((c) => (
              <li key={c.id}>
                <ChoiceChip
                  label={c.label}
                  active={selected.includes(c.id)}
                  onClick={() => toggleChoice(c.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {stage.optionalText && (
        <div className="space-y-2">
          <label
            htmlFor="session-note"
            className="block text-base text-foreground"
          >
            {stage.optionalText.prompt}
          </label>
          <textarea
            id="session-note"
            rows={3}
            maxLength={MAX_NOTE_LENGTH}
            value={note}
            onChange={(e) => {
              const clean = sanitizeNote(e.target.value);
              setNote(clean);
              update({ note: clean });
            }}
            placeholder={stage.optionalText.placeholder}
            className="w-full rounded-md border border-border bg-card p-3 text-base text-foreground"
          />
          <p className="text-sm text-muted-foreground">
            This is not saved beyond this browsing session and never leaves your device.
            Please avoid names or identifying details.
          </p>
        </div>
      )}

      {stage.attunement && (selected.length > 0 || note.length > 0) && (
        <p
          data-testid="session-attunement"
          className="rounded-lg border border-border bg-card p-4 text-base italic text-foreground"
        >
          {stage.attunement}
        </p>
      )}

      {!stage.readiness && (
        <div className="flex flex-col gap-2 pt-2">
          <SessionPrimaryButton onClick={next}>Continue</SessionPrimaryButton>
          <SessionSubtleButton onClick={next}>
            Skip this — move on without choosing
          </SessionSubtleButton>
        </div>
      )}
    </div>,
  );
}
