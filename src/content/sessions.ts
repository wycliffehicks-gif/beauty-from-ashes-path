// Weekly deep-session content model.
//
// A "session" is the substantial 30–60 minute guided psychospiritual
// experience that anchors each week (Week 1 = Day 3). The full eleven-stage
// sequence is declared here so the shape of the whole session is visible and
// testable even while only the opening movement is interactive.
//
// All therapeutic copy below is PROVISIONAL and written for founder review.
// It is deliberately plain to edit: each stage is a self-contained object.
//
// No scoring. No diagnosis. No inference from unselected options.

export type SessionStageKey =
  | "arrival"
  | "noticing"
  | "naming"
  | "exploration"
  | "meaning"
  | "attunement"
  | "reconnection"
  | "embodied"
  | "integration"
  | "one-honest-step"
  | "close";

/** The complete planned stage sequence, in order. */
export const SESSION_STAGE_ORDER: SessionStageKey[] = [
  "arrival",
  "noticing",
  "naming",
  "exploration",
  "meaning",
  "attunement",
  "reconnection",
  "embodied",
  "integration",
  "one-honest-step",
  "close",
];

export interface SessionChoice {
  /** Low-sensitivity, stable identifier. Safe to keep in sessionStorage. */
  id: string;
  label: string;
  /** Optional tentative, compassionate response shown after selection. */
  response?: string;
}

export type StageBehaviour =
  | "continue"
  /** Shorter route / micro-practice, but continuing stays available. */
  | "shorten"
  /** Low-arousal sensory orientation rather than pressure to feel. */
  | "low-arousal"
  /** 60–90 second grounding then a safe leave. */
  | "grounding-close"
  /** Deterministic route to the existing Support page. Never AI. */
  | "support";

export interface SessionReadinessOption extends SessionChoice {
  behaviour: StageBehaviour;
}

/**
 * A short movement inside a stage. Stages 4 and 5 are layered rather than one
 * long form: each group has its own teaching, prompt and choices.
 */
export interface SessionGroup {
  id: string;
  title: string;
  teach: string;
  prompt: string;
  choices: SessionChoice[];
}

export interface SessionStage {
  key: SessionStageKey;
  /** Short label used in the progress rail and headers. */
  label: string;
  /** Whether this stage is interactive in the current build. */
  status: "interactive" | "planned";
  /** One-line description of the stage's purpose (used for placeholders). */
  purpose: string;
  /** Teaching at the point of need — why this stage, and how to work with it. */
  teach?: string;
  heading?: string;
  /** Body copy shown under the heading. */
  body?: string[];
  /** A small practice offered within the stage. */
  practice?: { heading: string; body: string };
  /** Tentative, compassionate interpretation — always offered as a "maybe". */
  attunement?: string;
  choices?: SessionChoice[];
  /** Layered movements within the stage (stages 4 and 5). */
  groups?: SessionGroup[];
  readiness?: SessionReadinessOption[];
  /**
   * Low-pressure exits available part-way through a stage. Rendered as a
   * quiet "if this is too much right now" block, never as the main action.
   */
  branchOptions?: SessionReadinessOption[];
  /** Optional short text prompt. Transient sessionStorage only. */
  optionalText?: { prompt: string; placeholder: string };
}


export interface SessionContent {
  id: string;
  week: number;
  title: string;
  theme: string;
  /** Plain-language duration statement shown at arrival. */
  duration: string;
  stages: SessionStage[];
}

const LOW_PRESSURE_CHOICES: SessionChoice[] = [
  { id: "mixed", label: "Mixed — more than one thing at once" },
  { id: "numb", label: "Numb, or far away from myself" },
  { id: "unsure", label: "I’m not sure" },
  { id: "prefer-not", label: "I’d rather not say" },
  { id: "none", label: "None of these" },
];

export const WEEK_01_SESSION: SessionContent = {
  id: "week-01",
  week: 1,
  title: "The Walk You’ve Been Avoiding",
  theme:
    "A longer, guided walk toward the road you have been circling — at your pace, with company.",
  duration:
    "This session usually takes about 30 to 60 minutes. You can pause at any point, and nothing needs to be finished in one sitting.",
  stages: [
    {
      key: "arrival",
      label: "Arrival",
      status: "interactive",
      purpose: "Orientation, scope, consent to continue, and permission to stop.",
      heading: "Before we begin",
      teach:
        "Most of us approach something difficult by bracing first and thinking later. So we begin differently here: by making the room safe enough before we look at anything at all. Arriving well is not a warm-up. It is part of the work.",
      body: [
        "This is a longer session than the daily practice. It is a guided reflection — not therapy, not assessment, and not a substitute for a professional or a safe person in your life.",
        "You choose what to look at and how far to go. You can stop at any point without explaining yourself, and stopping early is a legitimate outcome, not a failed one.",
        "Nothing you write here is saved beyond this browsing session, and nothing is sent anywhere.",
      ],
      practice: {
        heading: "A small preparation",
        body: "If you can: sit somewhere you will not be interrupted for a while, put your phone on silent, have water nearby, and let your back find the support behind you. If none of that is possible right now, that is fine too — begin anyway, gently.",
      },
      readiness: [
        {
          id: "have-space",
          label: "I have enough space right now",
          behaviour: "continue",
          response:
            "Good. Let’s go slowly anyway — there is no advantage to hurrying through this.",
        },
        {
          id: "try-gently",
          label: "I can try, gently",
          behaviour: "continue",
          response:
            "That is more than enough to begin with. We will keep the steps small, and you can stop wherever you need to.",
        },
        {
          id: "very-little-energy",
          label: "Very little energy",
          behaviour: "shorten",
          response:
            "Then we will take the shorter route. You can still do something real today without spending what you do not have.",
        },
        {
          id: "not-today",
          label: "Not today",
          behaviour: "grounding-close",
          response:
            "Thank you for being honest about that. Choosing not to open something is itself a form of self-knowledge. Let’s close gently rather than just stopping.",
        },
        {
          id: "need-support",
          label: "I need support",
          behaviour: "support",
          response:
            "Let’s set this session aside and get you to support instead. That matters more than any reflection.",
        },
      ],
    },
    {
      key: "noticing",
      label: "Noticing",
      status: "interactive",
      purpose:
        "Guided attention across body, emotion, thought, energy, and connection.",
      heading: "What is already here",
      teach:
        "Before we look at the road you have been avoiding, it helps to know what state you are travelling in. Not to fix it — to know it. People often try to work on something painful while unaware they are exhausted, or braced, or already far away from themselves. Noticing first makes everything after it kinder and more accurate.",
      body: [
        "We will pass gently through five places: body, emotion, thought, energy, and connection. Take each one slowly. Choose what fits — including the gentler options — and leave the rest.",
        "Nothing here is measured or scored, and nothing is assumed about what you did not choose.",
      ],
      practice: {
        heading: "Before you choose",
        body: "Take one slower breath out. Let your attention drop from your head into your chest, then further down. You are not looking for anything in particular — only seeing what is already there.",
      },
      attunement:
        "It sounds like there may be more happening in you at once than is easy to summarise. That is usually a sign of depth, not of getting it wrong.",
      choices: [
        { id: "body-heavy", label: "Body — heavy, tired, weighted" },
        { id: "body-tense", label: "Body — tense, braced, on-edge" },
        { id: "body-restless", label: "Body — restless, hard to settle" },
        { id: "emotion-sad", label: "Emotion — sadness or grief nearby" },
        { id: "emotion-fear", label: "Emotion — fear or dread nearby" },
        { id: "emotion-shame", label: "Emotion — shame or self-blame nearby" },
        { id: "thought-loud", label: "Thought — loud, circling, hard to slow" },
        { id: "thought-blank", label: "Thought — blank or hard to reach" },
        { id: "energy-low", label: "Energy — very low" },
        { id: "energy-wired", label: "Energy — wired but tired" },
        { id: "connection-alone", label: "Connection — alone with this" },
        { id: "connection-some", label: "Connection — someone safe comes to mind" },
        ...LOW_PRESSURE_CHOICES,
      ],
    },
    {
      key: "naming",
      label: "Naming",
      status: "interactive",
      purpose:
        "Approaching the avoided road by kind, category, without requiring details.",
      heading: "The road you’ve been avoiding",
      teach:
        "Naming is not confession, and it is not the same as being ready to deal with something. Naming simply changes an unnamed weight into something with an edge — and a thing with edges can be looked at, set down, and picked up again by choice. That is why naming so often brings relief before anything is resolved.",
      body: [
        "You do not need to describe what happened, name a person, or explain yourself. A category is enough. Partial naming counts — “something about a conversation” is a real name.",
        "If nothing surfaces, or you would rather keep it private, that is a complete answer and we will move on without asking again.",
      ],
      practice: {
        heading: "A way in",
        body: "Think of something you have quietly stepped around this month — a thought you change the subject on, an email you do not open, a room you do not go into. You do not have to go toward it. Just notice that you know where it is.",
      },
      attunement:
        "It may be that this road has been avoided for good reason, and that some part of you has been protecting you rather than failing you.",
      choices: [
        { id: "grief", label: "Grief or loss" },
        { id: "truth-self", label: "A truth about myself" },
        { id: "boundary", label: "A boundary I have not set" },
        { id: "ask-help", label: "A request for help I have not made" },
        { id: "relationship", label: "A relationship or conversation" },
        { id: "decision", label: "An unfinished decision" },
        { id: "transition", label: "A change or transition" },
        { id: "no-words", label: "Something without words yet" },
        { id: "unsure", label: "I’m not sure" },
        { id: "private", label: "It’s private — I’d rather not say" },
        { id: "not-today", label: "Not today" },
      ],
      optionalText: {
        prompt:
          "If a few words want to come, you can write them here. Optional, and only if it helps.",
        placeholder: "A few words, if you wish…",
      },
    },
    {
      key: "exploration",
      label: "Exploration",
      status: "planned",
      purpose:
        "Gentle, non-excavating exploration of what makes this road hard to walk.",
    },
    {
      key: "meaning",
      label: "Meaning-making",
      status: "planned",
      purpose:
        "Making sense of what surfaced — what it may be protecting, costing, or asking for.",
    },
    {
      key: "attunement",
      label: "Attunement",
      status: "planned",
      purpose:
        "Compassionate, tentative reframing of the person’s own words back to them.",
    },
    {
      key: "reconnection",
      label: "Reconnection",
      status: "planned",
      purpose:
        "Optional spiritual reconnection, with a complete existential path for those who prefer it.",
    },
    {
      key: "embodied",
      label: "Practice",
      status: "planned",
      purpose: "A short embodied or relational practice to carry the insight into the body.",
    },
    {
      key: "integration",
      label: "Integration",
      status: "planned",
      purpose: "Gathering what emerged, without summary pressure or performance.",
    },
    {
      key: "one-honest-step",
      label: "One Honest Step",
      status: "planned",
      purpose:
        "One small, safe, specific and relational step — preparation counts as a step.",
    },
    {
      key: "close",
      label: "Close",
      status: "planned",
      purpose:
        "A grounding statement, a blessing or optional prayer, and a safe way to leave.",
    },
  ],
};

export const SESSIONS: SessionContent[] = [WEEK_01_SESSION];

export function getSession(id: string): SessionContent | undefined {
  return SESSIONS.find((s) => s.id === id);
}

export function getStage(
  session: SessionContent,
  key: SessionStageKey,
): SessionStage | undefined {
  return session.stages.find((s) => s.key === key);
}
