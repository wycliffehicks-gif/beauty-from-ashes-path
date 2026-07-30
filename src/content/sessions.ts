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

/**
 * The five low-pressure answers that must be available wherever choices are
 * offered. `kind` is the stable semantic suffix; when the same set appears in
 * more than one group within a stage, each group gets its own prefixed copy
 * so selecting "unsure" in one movement does not light it up in another.
 */
export const LOW_PRESSURE_KINDS = [
  "mixed",
  "numb",
  "unsure",
  "prefer-not",
  "none",
] as const;

export type LowPressureKind = (typeof LOW_PRESSURE_KINDS)[number];

const LOW_PRESSURE_LABELS: Record<LowPressureKind, string> = {
  mixed: "Mixed — more than one thing at once",
  numb: "Numb, or far away from myself",
  unsure: "I’m not sure",
  "prefer-not": "I’d rather not say",
  none: "None of these",
};

function lowPressureChoices(prefix = ""): SessionChoice[] {
  return LOW_PRESSURE_KINDS.map((kind) => ({
    id: `${prefix}${kind}`,
    label: LOW_PRESSURE_LABELS[kind],
  }));
}

const LOW_PRESSURE_CHOICES: SessionChoice[] = lowPressureChoices();


/**
 * Low-pressure exits offered part-way through the longer middle stages.
 * Identical behaviour contract to the arrival readiness options.
 */
const MID_STAGE_BRANCHES: SessionReadinessOption[] = [
  {
    id: "very-little-energy",
    label: "Very little energy",
    behaviour: "shorten",
    response:
      "Then we will not spend what you do not have. There is a shorter way through this movement that is still real.",
  },
  {
    id: "not-today",
    label: "Not today",
    behaviour: "grounding-close",
    response:
      "That is a complete answer. Let’s close gently rather than just stopping.",
  },
  {
    id: "need-support",
    label: "I need support",
    behaviour: "support",
    response: "Let’s set this aside and get you to support instead.",
  },
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
      status: "interactive",
      purpose:
        "Gentle, non-excavating exploration of what makes this road hard to walk.",
      heading: "What makes this road hard to walk?",
      teach:
        "There is a common assumption that if something matters, we would simply do it — and that not doing it means we lack discipline or courage. That is almost never what is happening. Usually there are two honest forces at work: something pulling forward, and something holding back for a reason it thinks is good. We are going to look at both, and at what has been standing between them keeping you safe.",
      body: [
        "Three short movements. Take them one at a time — there is no need to have this worked out in advance, and nothing here is a test.",
        "Choose only what genuinely fits. Nothing at all is assumed from what you leave unchosen.",
      ],
      attunement:
        "It may be that one part of you wants movement while another is protecting you from a cost it expects. Both may be telling the truth.",
      branchOptions: MID_STAGE_BRANCHES,
      groups: [
        {
          id: "pull-forward",
          title: "First — the pull forward",
          teach:
            "Something brought you to this road rather than to any other. That pull is worth naming before we look at what resists it, because it is usually the quieter of the two and the easiest to lose sight of.",
          prompt: "What in you may be wanting something here?",
          choices: [
            { id: "pf-truth", label: "I want the truth of it to be said" },
            { id: "pf-relief", label: "I want relief from carrying this" },
            { id: "pf-connection", label: "I want to be closer to someone" },
            { id: "pf-dignity", label: "I want my own dignity back" },
            { id: "pf-help", label: "I want help I have not asked for" },
            { id: "pf-closure", label: "I want closure or an ending" },
            { id: "pf-faithfulness", label: "I want to be faithful to what matters" },
            { id: "pf-freedom", label: "I want more freedom than I have" },
            { id: "pf-next-chapter", label: "I want a next chapter to begin" },
            { id: "pf-change", label: "I want something to change, unspecified" },
            ...lowPressureChoices("pf-"),
          ],
        },
        {
          id: "pull-back",
          title: "Then — the pull back",
          teach:
            "What holds a person back is rarely irrational. It is usually an expectation about cost, learned from somewhere real. Naming it does not make it happen and does not commit you to anything. It simply means you are no longer negotiating with something invisible.",
          prompt: "What may this be protecting you from finding out or facing?",
          choices: [
            { id: "pb-rejection", label: "Being rejected" },
            { id: "pb-conflict", label: "Conflict I cannot control" },
            { id: "pb-disappointment", label: "Disappointing someone" },
            { id: "pb-exposure", label: "Being seen too clearly" },
            { id: "pb-grief-real", label: "The grief becoming real" },
            { id: "pb-losing-control", label: "Losing control of myself" },
            { id: "pb-hurting-someone", label: "Hurting someone I care about" },
            { id: "pb-misunderstood", label: "Being misunderstood" },
            { id: "pb-wrong-choice", label: "Making the wrong choice" },
            { id: "pb-nothing-changes", label: "Finding out nothing changes" },
            { id: "pb-no-words", label: "Something I cannot put words to" },
            ...lowPressureChoices("pb-"),
          ],
        },
        {
          id: "protector",
          title: "Last — the protector",
          teach:
            "Between the pull forward and the pull back, most people develop something that manages the gap. It is easy to call these habits or faults. It is usually more accurate to call them protection — they were built for a reason, often a good one, and often a long time ago.",
          prompt: "What may have been standing between you and this, keeping you safe?",
          choices: [
            { id: "pr-silence", label: "Staying silent" },
            { id: "pr-busy", label: "Staying busy" },
            { id: "pr-numbing", label: "Numbing or switching off" },
            { id: "pr-overthinking", label: "Thinking it through, again" },
            { id: "pr-pleasing", label: "Keeping others comfortable" },
            { id: "pr-controlling", label: "Keeping tight control" },
            { id: "pr-withdrawing", label: "Withdrawing from people" },
            { id: "pr-anger", label: "Anger or irritation" },
            { id: "pr-humour", label: "Humour, keeping it light" },
            { id: "pr-spiritualising", label: "Reaching for a spiritual answer quickly" },
            { id: "pr-postponing", label: "Postponing — later, not now" },
            ...lowPressureChoices("pr-"),
          ],
        },
      ],
      practice: {
        heading: "Before you move on",
        body: "One slower breath out. Notice that you have just looked at something you have been walking around — and that nothing bad happened. You are still here, and the room is still the room.",
      },
    },
    {
      key: "meaning",
      label: "Meaning-making",
      status: "interactive",
      purpose:
        "Making sense of what surfaced — what it may be protecting, costing, or asking for.",
      heading: "What has this way of coping been doing for you?",
      teach:
        "This is the movement people most often expect to be an accusation, so let us be clear: nothing here asks you to condemn how you have survived. Ways of coping are usually intelligent responses to real conditions. What is worth asking, gently, is a different question — whether what helped then is still helping now, or whether the conditions have quietly changed while the strategy stayed the same.",
      body: [
        "Two short movements: what this has been doing for you, and what it may be costing now. Both can be true at once.",
        "There is no correct answer, and “it may still be necessary” is a legitimate one.",
      ],
      attunement:
        "It may be that this deserves thanks for what it protected and honest curiosity about what it costs now. Those two things can sit together.",
      branchOptions: MID_STAGE_BRANCHES,
      groups: [
        {
          id: "function",
          title: "First — what it has been doing for you",
          teach:
            "A pattern that persists is usually doing a job. Finding the job is more useful than finding fault, because a job can be done another way once you know what it is.",
          prompt: "What may this way of coping have been doing for you?",
          choices: [
            { id: "fn-feel-less", label: "It protected me from feeling too much" },
            { id: "fn-accepted", label: "It helped me stay accepted, or avoid conflict" },
            { id: "fn-control", label: "It gave me control when life felt uncertain" },
            { id: "fn-functioning", label: "It helped me keep functioning" },
            { id: "fn-hope-distance", label: "It kept hope, or disappointment, at a distance" },
            { id: "fn-protect-other", label: "It protected someone else" },
            { id: "fn-preserve-relationship", label: "It preserved a relationship" },
            { id: "fn-preserve-identity", label: "It preserved who I understood myself to be" },
            { id: "fn-belonging", label: "It preserved my belonging somewhere" },
            { id: "fn-still-necessary", label: "It may still be necessary" },
            { id: "fn-unknown", label: "I do not know" },
            { id: "fn-private", label: "That part is private" },
          ],
        },
        {
          id: "cost",
          title: "Then — what it may be costing now",
          teach:
            "This is not the same question as “was it wrong”. It never was wrong. The question is only about the present bill — and sometimes the honest answer is that there is not much of one yet.",
          prompt: "Where, if anywhere, might the present cost be showing up?",
          choices: [
            { id: "cost-body", label: "In my body — tension, tiredness, bracing" },
            { id: "cost-energy", label: "In my energy — less than there should be" },
            { id: "cost-self-trust", label: "In how much I trust my own read on things" },
            { id: "cost-relationships", label: "In closeness with people" },
            { id: "cost-meaning", label: "In meaning — things matter less than they did" },
            { id: "cost-choice", label: "In my sense of having a choice" },
            { id: "cost-grief", label: "In grief that has not had anywhere to go" },
            { id: "cost-none-yet", label: "Nothing I can see yet" },
            { id: "cost-unsure", label: "I’m not sure" },
            { id: "cost-prefer-not", label: "I’d rather not say" },
          ],
        },
      ],
      practice: {
        heading: "A small practice",
        body: "Put a hand somewhere neutral — a forearm, a knee, the centre of your chest if that is comfortable. Let it rest for three slow breaths out. If words help, try this one, silently: “This made sense somehow. I do not have to shame it in order to change my relationship with it.”",
      },
    },
    {
      key: "attunement",
      label: "Attunement",
      status: "interactive",
      purpose:
        "Compassionate, tentative reframing of the person’s own words back to them.",
      heading: "What might be true, held gently",
      teach:
        "Something shifts when what you have been carrying alone is said back to you by someone else — not corrected, not solved, just held accurately. That is what this movement offers. It is a reflection, not a verdict. If any part of it does not fit, it is wrong and you are right; take what is useful and leave the rest.",
      body: [
        "There are two ways to receive this, and both are equally legitimate. Neither is the better version.",
      ],
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
