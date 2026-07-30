import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CLOSE_BLESSING_CHRISTIAN,
  CLOSE_PRAYER_CHRISTIAN,
  CLOSE_STATEMENT_PLAIN,
  SESSION_STAGE_ORDER,
  getSession,
  type EmbodiedPractice,
  type ReconnectionRoute,
  type SessionReadinessOption,
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
import {
  buildCuratedReflection,
  toSections,
  type SessionReflectionOutput,
} from "@/lib/session/curated-reflection";
import {
  integrationSynthesis,
  namingTheme,
  orderHonestSteps,
  stepReflection,
} from "@/lib/session/stage-logic";
import { markDayVisited } from "@/lib/prefs";
import { generateSessionReflection } from "@/lib/session-reflection.functions";

const SESSION_ID = "week-01";
/** Week 1's deep session is anchored to Day 3 in the journey. */
const SESSION_DAY = 3;


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

type View = "stage" | "grounding-close" | "shortened" | "finished";

/**
 * Stage 6 sub-view. None of this is persisted: consent, the request, and the
 * generated reflection live in React state only and disappear on reload,
 * clear, or leaving the page.
 */
type AttunementView = "choose" | "curated" | "ai-consent" | "ai-working" | "ai-result";

/** Stage 8 adaptations. Offered, never applied automatically. */
const PRACTICE_ADAPTATIONS: SessionReadinessOption[] = [
  {
    id: "numb",
    label: "I feel numb, or far away from myself",
    behaviour: "low-arousal",
    response:
      "Then let’s not go looking for feeling. Sensory orientation is the practice for today: name four things you can see, three you can hear, and two you can feel touching your skin. Numbness is protection doing its job, not a wall you need to get through.",
  },
  {
    id: "very-little-energy",
    label: "Very little energy",
    behaviour: "shorten",
    response:
      "Then the whole practice is this: one slower breath out, one true sentence in your head, and one sip of water. That is not a reduced version of the practice — today it is the practice.",
  },
  {
    id: "prefer-not",
    label: "I’d rather not explain which one",
    behaviour: "continue",
    response:
      "You do not have to. Choose one by its title and open it, or move on without choosing. Nothing is recorded about why.",
  },
  {
    id: "not-today",
    label: "Not today",
    behaviour: "grounding-close",
    response: "That is a complete answer. Let’s close gently rather than just stopping.",
  },
  {
    id: "need-support",
    label: "I need support",
    behaviour: "support",
    response: "Let’s set this aside and get you to support instead.",
  },
];


function WeekOneSession() {
  const session = getSession(SESSION_ID)!;
  const navigate = useNavigate();
  const requestReflection = useServerFn(generateSessionReflection);

  const [state, setState] = useState<SessionState>(() => emptySessionState());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("stage");
  const [note, setNote] = useState("");
  const [branchResponse, setBranchResponse] = useState<string | null>(null);

  // --- Stage 6 transient state (never stored) ---
  const [attView, setAttView] = useState<AttunementView>("choose");
  const [consentAi, setConsentAi] = useState(false);
  const [consentAdult, setConsentAdult] = useState(false);
  const [reflection, setReflection] = useState<SessionReflectionOutput | null>(null);
  const [reflectionSource, setReflectionSource] = useState<"ai" | "curated" | null>(null);
  const [aiFellBack, setAiFellBack] = useState(false);

  // --- Stage 8 transient adaptation card (never stored) ---
  const [adaptation, setAdaptation] = useState<string | null>(null);


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

  const resetAttunement = () => {
    setAttView("choose");
    setConsentAi(false);
    setConsentAdult(false);
    setReflection(null);
    setReflectionSource(null);
    setAiFellBack(false);
  };

  const goToStage = (key: SessionStageKey) => {
    setBranchResponse(null);
    setAdaptation(null);
    setView("stage");
    if (key !== "attunement") resetAttunement();
    update({ stage: key });
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };

  const next = () => {
    const idx = SESSION_STAGE_ORDER.indexOf(state.stage);
    const nextKey = SESSION_STAGE_ORDER[Math.min(idx + 1, SESSION_STAGE_ORDER.length - 1)];
    goToStage(nextKey);
  };

  const back = () => {
    if (branchResponse || adaptation || view !== "stage") {
      setBranchResponse(null);
      setAdaptation(null);
      setView("stage");
      return;
    }
    if (state.stage === "attunement" && attView !== "choose") {
      resetAttunement();
      return;
    }
    if (state.stage === "reconnection" && state.route) {
      update({ route: undefined, spiritualMode: undefined });
      return;
    }
    if (state.stage === "embodied" && state.practice) {
      update({ practice: undefined });
      return;
    }
    if (state.stage === "one-honest-step" && state.step) {
      update({ step: undefined });
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
    setAdaptation(null);
    setView("stage");
    resetAttunement();
  };

  /**
   * The true close. Erases every transient trace of the session — the note,
   * every stage choice, the chosen route, consent, and the generated
   * reflection — and only then records the low-sensitivity visited flag.
   */
  const finishAndClear = () => {
    clear();
    markDayVisited(SESSION_DAY);
    setView("finished");
    if (typeof window !== "undefined") window.scrollTo(0, 0);
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

  const handleBranch = (option: SessionReadinessOption, persistReadiness: boolean) => {
    if (persistReadiness) update({ readiness: option.id });
    if (option.behaviour === "support") {
      navigate({ to: "/support" });
      return;
    }
    if (option.behaviour === "grounding-close") {
      setView("grounding-close");
      return;
    }
    if (option.behaviour === "shorten") {
      setView("shortened");
      return;
    }
    setBranchResponse(option.response ?? null);
    if (!option.response) next();
  };

  const curatedInput = useMemo(
    () => ({
      naming: state.choices.naming ?? [],
      exploration: state.choices.exploration ?? [],
      meaning: state.choices.meaning ?? [],
      noticing: state.choices.noticing ?? [],
      hasNote: Boolean(state.note),
    }),
    [state.choices, state.note],
  );

  const showCurated = () => {
    setReflection(buildCuratedReflection(curatedInput));
    setReflectionSource("curated");
    setAiFellBack(false);
    setAttView("curated");
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };

  const runAi = async () => {
    setAttView("ai-working");
    setAiFellBack(false);
    try {
      const result = await requestReflection({
        data: {
          input: {
            sessionId: SESSION_ID,
            naming: curatedInput.naming,
            exploration: curatedInput.exploration,
            meaning: curatedInput.meaning,
            noticing: curatedInput.noticing,
            ...(state.note ? { note: state.note } : {}),
            adultConfirmed: true as const,
            aiConsent: true as const,
            notSafeNow: false,
            region: "CA" as const,
          },
        },
      });

      if (result.kind === "urgent-safety") {
        navigate({ to: "/support" });
        return;
      }
      if (result.kind !== "reflection") {
        setReflection(buildCuratedReflection(curatedInput));
        setReflectionSource("curated");
        setAiFellBack(true);
        setAttView("ai-result");
        return;
      }
      setReflection(result.output);
      setReflectionSource(result.meta.source);
      setAiFellBack(result.meta.source !== "ai");
      setAttView("ai-result");
    } catch {
      setReflection(buildCuratedReflection(curatedInput));
      setReflectionSource("curated");
      setAiFellBack(true);
      setAttView("ai-result");
    }
    if (typeof window !== "undefined") window.scrollTo(0, 0);
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


  // ---------------- The true close (after clearing) ------------------------

  if (view === "finished") {
    return shell(
      <div className="space-y-5" data-testid="session-finished">
        <p className="eyebrow">Finished, and cleared</p>
        <h2 className="font-serif text-2xl text-foreground">This session is closed</h2>
        <p className="text-lg text-foreground">
          Everything from this session has been erased from this device — your
          selections, the optional note, the reflection you were shown, and the route
          you chose. There is nothing left to find, here or anywhere else.
        </p>
        <p className="text-base text-muted-foreground">
          Day 3 is marked as visited in your journey. That is a marker of where you have
          been, not a score, and nothing about it is shared.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <SessionPrimaryButton onClick={() => navigate({ to: "/" })}>
            Return home
          </SessionPrimaryButton>
          <SessionSubtleButton onClick={() => navigate({ to: "/journey" })}>
            View Week 1
          </SessionSubtleButton>
          <SessionSubtleButton
            onClick={() => navigate({ to: "/day/$day", params: { day: "4" } })}
          >
            Continue to Day 4
          </SessionSubtleButton>
        </div>
      </div>,
    );
  }

  // ---------------- A transient adaptation card (stage 8) ------------------

  if (adaptation) {
    return shell(
      <div className="space-y-5" data-testid="session-adaptation">
        <p className="eyebrow">Adjusted for today</p>
        <p className="text-lg leading-relaxed text-foreground">{adaptation}</p>
        <div className="flex flex-col gap-2 pt-2">
          <SessionPrimaryButton onClick={next}>Continue gently</SessionPrimaryButton>
          <SessionSubtleButton onClick={() => setAdaptation(null)}>
            ← Back to the practices
          </SessionSubtleButton>
        </div>
      </div>,
    );
  }

  // ---------------- Stage 7: Reconnection ----------------------------------

  if (stage.key === "reconnection") {
    const routes = stage.routes ?? [];
    const chosen = routes.find((r) => r.id === state.route);

    if (!chosen) {
      return shell(
        <div className="space-y-6" data-testid="session-reconnection-choose">
          <div className="space-y-2">
            <p className="eyebrow">{stage.label}</p>
            <h1 className="font-serif text-3xl leading-tight text-foreground sm:text-4xl">
              {stage.heading}
            </h1>
          </div>
          {stage.teach && <StageTeach text={stage.teach} />}
          {stage.body?.map((p) => (
            <p key={p.slice(0, 24)} className="text-lg leading-relaxed text-foreground">
              {p}
            </p>
          ))}
          <div className="space-y-3">
            {routes.map((r) => (
              <div key={r.id} className="surface-card space-y-2" data-testid={`route-${r.id}`}>
                <h2 className="font-serif text-lg text-foreground">{r.label}</h2>
                <p className="text-base text-muted-foreground">{r.blurb}</p>
                <SessionSubtleButton onClick={() => update({ route: r.id })}>
                  Take this route
                </SessionSubtleButton>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Nothing is chosen for you here, and you can switch routes later without
            losing anything you have already done.
          </p>
          {stage.branchOptions && (
            <div className="space-y-2 rounded-lg border border-dashed border-border p-4">
              <p className="text-base text-muted-foreground">
                If this is more than you have room for right now:
              </p>
              <ul className="space-y-2">
                {stage.branchOptions.map((b) => (
                  <li key={b.id}>
                    <ChoiceChip label={b.label} active={false} onClick={() => handleBranch(b, false)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-2 pt-2">
            <SessionSubtleButton onClick={next}>
              Skip this movement for now
            </SessionSubtleButton>
          </div>
        </div>,
      );
    }

    return shell(
      <ReconnectionRouteView
        route={chosen}
        selected={selected}
        spiritualMode={state.spiritualMode}
        onSelectMode={(m) => update({ spiritualMode: m })}
        onToggle={toggleChoice}
        onBranch={(b) => handleBranch(b, false)}
        onSwitch={() => update({ route: undefined, spiritualMode: undefined })}
        onContinue={next}
      />,
    );
  }

  // ---------------- Stage 8: Embodied or relational practice ---------------

  if (stage.key === "embodied") {
    const practices = stage.practices ?? [];
    const open = practices.find((p) => p.id === state.practice);

    if (open) {
      return shell(
        <div className="space-y-5" data-testid="session-practice-open">
          <p className="eyebrow">A practice, if you want it</p>
          <h2 className="font-serif text-2xl text-foreground">{open.title}</h2>
          <p className="text-lg leading-relaxed text-foreground">{open.body}</p>
          <p className="rounded-lg border border-border bg-secondary/40 p-4 text-base text-foreground">
            {open.safety}
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <SessionPrimaryButton onClick={next}>
              I’ve done this, or I’ll carry it with me
            </SessionPrimaryButton>
            <SessionSubtleButton onClick={() => update({ practice: undefined })}>
              ← Choose a different practice
            </SessionSubtleButton>
            <SessionSubtleButton onClick={next}>Move on without doing it</SessionSubtleButton>
          </div>
        </div>,
      );
    }

    return shell(
      <div className="space-y-6" data-testid="session-embodied">
        <div className="space-y-2">
          <p className="eyebrow">{stage.label}</p>
          <h1 className="font-serif text-3xl leading-tight text-foreground sm:text-4xl">
            {stage.heading}
          </h1>
        </div>
        {stage.teach && <StageTeach text={stage.teach} />}
        {stage.body?.map((p) => (
          <p key={p.slice(0, 24)} className="text-lg leading-relaxed text-foreground">
            {p}
          </p>
        ))}

        <div className="space-y-3">
          {practices.map((p) => (
            <div key={p.id} className="surface-card space-y-2" data-testid={`practice-${p.id}`}>
              <h2 className="font-serif text-lg text-foreground">{p.title}</h2>
              <p className="text-base text-muted-foreground">{p.blurb}</p>
              <SessionSubtleButton onClick={() => update({ practice: p.id })}>
                Open this practice
              </SessionSubtleButton>
            </div>
          ))}
        </div>

        {stage.choices && (
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
        )}

        <div className="space-y-2 rounded-lg border border-dashed border-border p-4">
          <p className="text-base text-muted-foreground">
            If today needs something different:
          </p>
          <ul className="space-y-2">
            {PRACTICE_ADAPTATIONS.map((a) => (
              <li key={a.id}>
                <ChoiceChip
                  label={a.label}
                  active={false}
                  onClick={() => {
                    if (a.behaviour === "support") {
                      navigate({ to: "/support" });
                      return;
                    }
                    if (a.behaviour === "grounding-close") {
                      setView("grounding-close");
                      return;
                    }
                    setAdaptation(a.response ?? null);
                    if (typeof window !== "undefined") window.scrollTo(0, 0);
                  }}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <SessionPrimaryButton onClick={next}>Continue</SessionPrimaryButton>
          <SessionSubtleButton onClick={next}>
            Skip a practice today — that’s allowed
          </SessionSubtleButton>
        </div>
      </div>,
    );
  }

  // ---------------- Stage 10: One Honest Step ------------------------------

  if (stage.key === "one-honest-step") {
    const priorIds = Object.values(state.choices).flat();
    const steps = orderHonestSteps(stage.steps ?? [], priorIds);
    const chosenStep = steps.find((s) => s.id === state.step);
    const theme = namingTheme(state.choices.naming ?? []);

    if (chosenStep) {
      return shell(
        <div className="space-y-5" data-testid="session-step-chosen">
          <p className="eyebrow">Your one honest step</p>
          <h2 className="font-serif text-2xl text-foreground">{chosenStep.label}</h2>
          {stepReflection(chosenStep, theme).map((line) => (
            <p key={line.slice(0, 24)} className="text-lg leading-relaxed text-foreground">
              {line}
            </p>
          ))}
          <div className="flex flex-col gap-2 pt-2">
            <SessionPrimaryButton onClick={next}>Continue to the close</SessionPrimaryButton>
            <SessionSubtleButton onClick={() => update({ step: undefined })}>
              ← Choose a different step
            </SessionSubtleButton>
          </div>
        </div>,
      );
    }

    return shell(
      <div className="space-y-6" data-testid="session-one-honest-step">
        <div className="space-y-2">
          <p className="eyebrow">{stage.label}</p>
          <h1 className="font-serif text-3xl leading-tight text-foreground sm:text-4xl">
            {stage.heading}
          </h1>
        </div>
        {stage.teach && <StageTeach text={stage.teach} />}
        {stage.body?.map((p) => (
          <p key={p.slice(0, 24)} className="text-lg leading-relaxed text-foreground">
            {p}
          </p>
        ))}

        <ul className="space-y-2">
          {steps.map((s) => (
            <li key={s.id}>
              <ChoiceChip
                label={s.label}
                active={false}
                onClick={() => {
                  update({ step: s.id });
                  if (typeof window !== "undefined") window.scrollTo(0, 0);
                }}
              />
            </li>
          ))}
        </ul>

        {stage.choices && (
          <ul className="space-y-2 border-t border-border pt-4">
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
        )}

        {stage.optionalText && (
          <div className="space-y-2">
            <label htmlFor="session-note" className="block text-base text-foreground">
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
            </p>
          </div>
        )}

        {stage.branchOptions && (
          <div className="space-y-2 rounded-lg border border-dashed border-border p-4">
            <p className="text-base text-muted-foreground">
              If this is more than you have room for right now:
            </p>
            <ul className="space-y-2">
              {stage.branchOptions.map((b) => (
                <li key={b.id}>
                  <ChoiceChip label={b.label} active={false} onClick={() => handleBranch(b, false)} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <SessionPrimaryButton onClick={next}>
            Continue without choosing a step
          </SessionPrimaryButton>
        </div>
      </div>,
    );
  }

  // ---------------- Stage 11: Safe close -----------------------------------

  if (stage.key === "close") {
    const christian = state.route === "christian";
    const prayerRequested = christian && state.spiritualMode === "sc-with-prayer";

    return shell(
      <div className="space-y-6" data-testid="session-close">
        <div className="space-y-2">
          <p className="eyebrow">{stage.label}</p>
          <h1 className="font-serif text-3xl leading-tight text-foreground sm:text-4xl">
            {stage.heading}
          </h1>
        </div>
        {stage.teach && <StageTeach text={stage.teach} />}
        {stage.body?.map((p) => (
          <p key={p.slice(0, 24)} className="text-lg leading-relaxed text-foreground">
            {p}
          </p>
        ))}

        <div className="surface-card space-y-2" data-testid="close-statement">
          <h2 className="font-serif text-lg text-foreground">Where this leaves you</h2>
          <p className="text-base leading-relaxed text-foreground">
            {CLOSE_STATEMENT_PLAIN}
          </p>
        </div>

        {christian && (
          <div className="surface-card space-y-2" data-testid="close-blessing">
            <h2 className="font-serif text-lg text-foreground">A blessing</h2>
            <p className="text-base leading-relaxed text-foreground">
              {CLOSE_BLESSING_CHRISTIAN}
            </p>
            {prayerRequested && (
              <p
                data-testid="close-prayer"
                className="text-base leading-relaxed italic text-foreground"
              >
                {CLOSE_PRAYER_CHRISTIAN}
              </p>
            )}
          </div>
        )}

        <div className="space-y-3 border-t border-border pt-5">
          <p className="text-base text-muted-foreground">
            Finishing erases everything from this session on this device: your
            selections, the optional note, the reflection you were shown, and the route
            you chose.
          </p>
          <SessionPrimaryButton onClick={finishAndClear}>
            Finish and clear this session
          </SessionPrimaryButton>
          <SessionSubtleButton onClick={leave}>
            Leave my place for this browser session
          </SessionSubtleButton>
          <p className="text-sm text-muted-foreground">
            Leaving your place keeps this session available until you close the browser.
            Nothing is written to long-term storage either way.
          </p>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          <Link to="/support" className="inline-link underline underline-offset-4">
            Support &amp; Safety
          </Link>{" "}
          is always available, including after you leave.
        </p>
      </div>,
    );
  }



  if (stage.key === "attunement" && attView !== "choose") {
    if (attView === "ai-working") {
      return shell(
        <div className="space-y-4" data-testid="session-ai-working">
          <p className="eyebrow">A moment</p>
          <h2 className="font-serif text-2xl text-foreground">Reading it back…</h2>
          <p className="text-lg text-foreground">
            This takes a few seconds. Nothing is being saved.
          </p>
        </div>,
      );
    }

    if (attView === "ai-consent") {
      const ready = consentAi && consentAdult;
      return shell(
        <div className="space-y-5" data-testid="session-ai-consent">
          <p className="eyebrow">Before this one thing</p>
          <h2 className="font-serif text-2xl text-foreground">
            What happens if you choose this
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-base text-foreground">
            <li>
              The options you selected, and your optional few words if you wrote any, are
              sent once to produce a single response. There is no conversation and no
              follow-up.
            </li>
            <li>
              They are not intentionally saved or logged — not by this app, and not
              anywhere you can retrieve them later.
            </li>
            <li>
              The response is checked against the same approved material before you see
              it. If anything does not pass, you are shown the curated reflection instead.
            </li>
            <li>
              The curated reflection stays available either way. Choosing it is not the
              lesser option.
            </li>
          </ul>

          <div className="surface-card space-y-3">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-base text-foreground">
              <input
                type="checkbox"
                data-testid="consent-adult"
                checked={consentAdult}
                onChange={(e) => setConsentAdult(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 rounded border-border"
              />
              <span>I am 18 or older.</span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-base text-foreground">
              <input
                type="checkbox"
                data-testid="consent-ai"
                checked={consentAi}
                onChange={(e) => setConsentAi(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 rounded border-border"
              />
              <span>
                I understand this sends my selections, and any words I wrote, for one
                response — and I would like to receive it.
              </span>
            </label>
          </div>

          <p className="text-sm text-muted-foreground">
            Please avoid names or identifying details in anything you wrote earlier. If
            you would rather not send anything, the curated reflection is right here.
          </p>

          <div className="flex flex-col gap-2 pt-2">
            <SessionPrimaryButton onClick={runAi} disabled={!ready}>
              Receive the reflection
            </SessionPrimaryButton>
            <SessionSubtleButton onClick={showCurated}>
              Use the curated reflection instead
            </SessionSubtleButton>
            <SessionSubtleButton onClick={resetAttunement}>
              ← Back to the two options
            </SessionSubtleButton>
          </div>
        </div>,
      );
    }

    // curated | ai-result
    const sections = reflection ? toSections(reflection) : [];
    return shell(
      <div className="space-y-5" data-testid="session-reflection">
        <p className="eyebrow">
          {reflectionSource === "ai" ? "A reflection, shaped for you" : "A curated reflection"}
        </p>
        <h2 className="font-serif text-2xl text-foreground">What might be true, held gently</h2>

        {aiFellBack && (
          <p
            data-testid="session-ai-fallback-notice"
            className="rounded-lg border border-border bg-secondary/40 p-4 text-base text-foreground"
          >
            The AI-shaped version was not available or did not pass its checks just now,
            so this is the curated reflection. Nothing went wrong on your side, and this
            version is not a lesser one.
          </p>
        )}

        <div className="space-y-4">
          {sections.map((s) => (
            <section key={s.key} className="surface-card space-y-1">
              <h3 className="font-serif text-lg text-foreground">{s.heading}</h3>
              <p className="text-base leading-relaxed text-foreground">{s.text}</p>
            </section>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          This is a reflection, not a conclusion. If a part of it does not fit, it does
          not fit. Nothing here is saved, and it will not appear anywhere else in the app.
        </p>

        <div className="flex flex-col gap-2 pt-2">
          <SessionPrimaryButton onClick={next}>Continue</SessionPrimaryButton>
          <SessionSubtleButton onClick={() => goToStage("meaning")}>
            Go back and revise my answers
          </SessionSubtleButton>
          <SessionSubtleButton onClick={resetAttunement}>
            Choose the other version — a new one replaces this
          </SessionSubtleButton>
        </div>
      </div>,
    );
  }

  // ---------------- Ordinary interactive stage -----------------------------

  const groupSelected = (id: string) => selected.includes(id);

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

      {stage.practice && stage.key !== "meaning" && (
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
                  onClick={() => handleBranch(r, true)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {stage.groups?.map((group) => (
        <section key={group.id} className="space-y-3" data-testid={`group-${group.id}`}>
          <div className="border-t border-border pt-5">
            <h2 className="font-serif text-xl text-foreground">{group.title}</h2>
          </div>
          <StageTeach text={group.teach} />
          <p className="text-lg text-foreground">{group.prompt}</p>
          <p className="text-sm text-muted-foreground">
            Choose as many or as few as fit. Nothing at all is assumed from what you leave
            unchosen.
          </p>
          <ul className="space-y-2">
            {group.choices.map((c) => (
              <li key={c.id}>
                <ChoiceChip
                  label={c.label}
                  active={groupSelected(c.id)}
                  onClick={() => toggleChoice(c.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

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

      {stage.practice && stage.key === "meaning" && (
        <div className="surface-card space-y-1">
          <h3 className="font-serif text-lg text-foreground">{stage.practice.heading}</h3>
          <p className="text-base text-muted-foreground">{stage.practice.body}</p>
        </div>
      )}

      {stage.optionalText && (
        <div className="space-y-2">
          <label htmlFor="session-note" className="block text-base text-foreground">
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

      {stage.attunement && selected.length > 0 && (
        <p
          data-testid="session-attunement"
          className="rounded-lg border border-border bg-card p-4 text-base italic text-foreground"
        >
          {stage.attunement}
        </p>
      )}

      {stage.attunement && selected.length === 0 && note.length > 0 && (
        <p
          data-testid="session-attunement"
          className="rounded-lg border border-border bg-card p-4 text-base italic text-foreground"
        >
          {stage.attunement}
        </p>
      )}

      {stage.key === "attunement" && (
        <div className="space-y-3" data-testid="session-attunement-choose">
          <div className="surface-card space-y-2">
            <h3 className="font-serif text-lg text-foreground">Use the curated reflection</h3>
            <p className="text-base text-muted-foreground">
              Written by hand and assembled from what you chose. Nothing leaves your
              device. This is the default, and it is complete on its own.
            </p>
            <SessionPrimaryButton onClick={showCurated}>
              Show the curated reflection
            </SessionPrimaryButton>
          </div>
          <div className="surface-card space-y-2">
            <h3 className="font-serif text-lg text-foreground">
              Receive an AI-shaped reflection
            </h3>
            <p className="text-base text-muted-foreground">
              Optional. One response, from the same approved material, shaped a little
              more closely around what you chose. You will be told exactly what is sent
              before anything is sent.
            </p>
            <SessionSubtleButton onClick={() => setAttView("ai-consent")}>
              See what this involves
            </SessionSubtleButton>
          </div>
        </div>
      )}

      {stage.branchOptions && (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-4">
          <p className="text-base text-muted-foreground">
            If this is more than you have room for right now:
          </p>
          <ul className="space-y-2">
            {stage.branchOptions.map((b) => (
              <li key={b.id}>
                <ChoiceChip
                  label={b.label}
                  active={false}
                  onClick={() => handleBranch(b, false)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {!stage.readiness && stage.key !== "attunement" && (
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
