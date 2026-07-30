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

/**
 * Stage 7 — one of two complete reconnection routes. Neither route is marked
 * as deeper, better, or preferred anywhere in content or UI. The Christian
 * route is only ever reached by an explicit choice; nothing is preselected.
 */
export interface ReconnectionRoute {
  id: "meaning" | "christian";
  label: string;
  /** Short, neutral description shown on the route-choice screen. */
  blurb: string;
  teach: string;
  prompt: string;
  choices: SessionChoice[];
  /** A short private exercise: sentence stems, completed silently. */
  exercise: { heading: string; body: string; stems: string[] };
  /** Christian route only — how much of the spiritual material to include. */
  modes?: SessionReadinessOption[];
  scripture?: { reference: string; text: string; translation: string; note: string };
  reflection?: string[];
  prayer?: string;
  /** Closing line for the route, before returning to the shared flow. */
  closing: string;
}

/** Stage 8 — an offered practice. Never automatically prescribed. */
export interface EmbodiedPractice {
  id: string;
  title: string;
  /** Why this one might fit — descriptive, never directive. */
  blurb: string;
  body: string;
  /** The explicit non-requirement attached to this practice. */
  safety: string;
}

/** Stage 10 — a small, safe, specific candidate step. */
export interface HonestStep {
  id: string;
  label: string;
  /** Broad approved category. Used for deterministic ordering only. */
  category:
    | "private"
    | "time"
    | "information"
    | "rest"
    | "relational"
    | "rehearsal"
    | "noticing"
    | "meaning"
    | "support"
    | "none";
  /** Tentative reflection on why this is small enough. */
  why: string;
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
  /** Layered movements within the stage (stages 4, 5 and 9). */
  groups?: SessionGroup[];
  readiness?: SessionReadinessOption[];
  /**
   * Low-pressure exits available part-way through a stage. Rendered as a
   * quiet "if this is too much right now" block, never as the main action.
   */
  branchOptions?: SessionReadinessOption[];
  /** Optional short text prompt. Transient sessionStorage only. */
  optionalText?: { prompt: string; placeholder: string };
  /** Stage 7 only. */
  routes?: ReconnectionRoute[];
  /** Stage 8 only. */
  practices?: EmbodiedPractice[];
  /** Stage 10 only. */
  steps?: HonestStep[];
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
      status: "interactive",
      purpose:
        "A choice between two complete routes back toward connection — one without spiritual language, one with Christian reflection.",
      heading: "Toward connection, at your pace",
      teach:
        "Insight on its own tends to evaporate. What makes it hold is connection — to yourself, to what you still care about, and to at least one other person or presence. So this movement is not about deciding anything. It is about noticing where you are still connected, even faintly, and letting that be the ground you stand on.",
      body: [
        "There are two complete routes through this movement. They are different in language, not in depth. Choose whichever is honest for you today; you can switch without losing anything you have already done.",
      ],
      branchOptions: MID_STAGE_BRANCHES,
      routes: [
        {
          id: "meaning",
          label: "Meaning and connection, without spiritual language",
          blurb:
            "Dignity, values, what feels true now, safe people, meaning and the ordinary present.",
          teach:
            "It is worth saying plainly what reconnection is not. It is not optimism, and it does not ask you to feel better than you do. It is not agreement with what happened, or forgiveness of anyone, or a step back toward a person who is not safe. It is the slower work of not being cut off from yourself while something is unresolved.",
          prompt: "Where, even faintly, are you still connected?",
          choices: [
            { id: "rc-dignity", label: "To my own dignity — I still matter" },
            { id: "rc-inner-truth", label: "To what I actually think and feel" },
            { id: "rc-value", label: "To a value I have not abandoned" },
            { id: "rc-safe-person", label: "To one person who is safe" },
            { id: "rc-community", label: "To a group or community" },
            { id: "rc-work", label: "To work or study that means something" },
            { id: "rc-creativity", label: "To something I make or tend" },
            { id: "rc-nature", label: "To the outdoors, or an animal" },
            { id: "rc-body", label: "To my body, at least a little" },
            { id: "rc-ordinary", label: "To ordinary life — meals, routines, the day" },
            { id: "rc-purpose", label: "To a sense of purpose or belonging" },
            { id: "rc-faint", label: "Only faintly, to any of it" },
            ...lowPressureChoices("rc-"),
          ],
          exercise: {
            heading: "A short private exercise",
            body: "Finish one of these silently, or under your breath. Nothing is typed, recorded or shared. If more than one wants finishing, take them one at a time.",
            stems: [
              "What I still care about is…",
              "What I do not want to abandon in myself is…",
              "One place I am still connected is…",
            ],
          },
          closing:
            "None of that has to be acted on. Knowing where you are still connected is enough for one movement — it is the ground that the rest of this stands on.",
        },
        {
          id: "christian",
          label: "Include Christian spiritual reflection",
          blurb:
            "A short passage, a reflection on grace and lament, and an optional brief prayer.",
          teach:
            "Christian faith at its most honest does not remove ambivalence or hurry grief. The Scriptures are full of people who kept speaking to God while still unresolved — that is what lament is, and it is treated there as relationship rather than failure. Nothing here will tell you what God is doing, or that this was sent to teach you something. Presence is what is offered, not explanation.",
          prompt: "How much would you like to include today?",
          modes: [
            {
              id: "sc-scripture-only",
              label: "Scripture only",
              behaviour: "continue",
              response: "Just the passage, then, and space around it.",
            },
            {
              id: "sc-reflection-no-prayer",
              label: "Reflection, without prayer",
              behaviour: "continue",
              response: "The passage and a short reflection. No prayer.",
            },
            {
              id: "sc-with-prayer",
              label: "Include a brief prayer",
              behaviour: "continue",
              response: "The passage, a short reflection, and a brief prayer you may use or ignore.",
            },
            {
              id: "sc-unsure",
              label: "I’m not sure",
              behaviour: "continue",
              response:
                "Then start with the passage alone. You can stop after it, and unsureness is a fair place to stand.",
            },
            {
              id: "sc-not-today",
              label: "Not today",
              behaviour: "grounding-close",
              response:
                "That is entirely respected. Choosing not to pray today is not distance from God, and it is not a failure of faith.",
            },
          ],
          scripture: {
            reference: "Luke 24:15",
            text: "While they talked and questioned together, Jesus himself came near, and went with them.",
            translation: "World English Bible (public domain)",
            note:
              "Two people are walking away from Jerusalem, talking about something that has gone badly wrong. They are not resolved, not hopeful, and not recognising who is with them. The company arrives before the understanding does.",
          },
          reflection: [
            "The pattern in that road is worth sitting with: they are met while still walking in the wrong direction, still confused, still grieving. Nothing is required of them first. They are not asked to have better faith, or to stop being disappointed, before there is company.",
            "That is what grace tends to look like in practice — accompaniment before resolution. Not an explanation for what happened, and not a promise about how it will turn out, but a presence that walks at the pace you are actually walking.",
            "If what you have is lament rather than praise, that is not a lesser form of prayer. Much of the Bible is lament. Saying honestly to God what hurts and what you need is a way of staying in the relationship, not stepping out of it.",
          ],
          prayer:
            "God, I am on a road I did not choose and do not understand. I am not going to pretend to feel more settled than I do. Be near me here, at the pace I can actually walk. Hold what I cannot resolve today. Amen.",
          choices: [
            { id: "sr-accompanied", label: "That someone might walk with me here" },
            { id: "sr-grace", label: "Grace that arrives before I have sorted anything out" },
            { id: "sr-lament", label: "Permission to lament honestly" },
            { id: "sr-dignity", label: "That I still have dignity in this" },
            { id: "sr-not-alone", label: "That I am less alone than it feels" },
            { id: "sr-slow", label: "That it is allowed to take a long time" },
            { id: "sr-nothing-landed", label: "Nothing landed today" },
            ...lowPressureChoices("sr-"),
          ],
          exercise: {
            heading: "A short private exercise",
            body: "If you would like, finish one of these silently. Nothing is typed or shared.",
            stems: [
              "What I would say to God if I did not have to be polite is…",
              "What I still care about is…",
              "One place I am still connected is…",
            ],
          },
          closing:
            "Nothing here needs to resolve into certainty. Company on the road is enough for one movement, and the road can stay unfinished.",
        },
      ],
    },
    {
      key: "embodied",
      label: "Practice",
      status: "interactive",
      purpose:
        "A short embodied or relational practice, chosen freely, so the insight has somewhere to land.",
      heading: "Somewhere for this to land",
      teach:
        "Understanding something rarely changes it by itself. What tends to make a difference is giving the insight a landing place — in the body, or in a small piece of contact with another person. That is why this movement is physical or relational rather than mental. It is a small rehearsal of a different way of being, not a commitment to anything.",
      body: [
        "Choose one, or skip this entirely. Nothing here is prescribed for you, and nothing is recommended based on what you selected earlier.",
        "No practice on this page requires sending, disclosing, confronting, deciding, forgiving, or returning to anyone.",
      ],
      branchOptions: MID_STAGE_BRANCHES,
      practices: [
        {
          id: "pc-grounding",
          title: "Neutral-body grounding and orientation",
          blurb: "Two or three minutes. Nothing to feel, nothing to process.",
          body: "Let your feet find the floor and your back find the chair. Look slowly around and name five ordinary things you can see, without commentary. Then breathe out a little longer than you breathe in, three times. If your attention wanders, that is what attention does — bring it back to the floor under your feet.",
          safety: "This asks nothing of your emotions. You do not have to feel calm for it to have worked.",
        },
        {
          id: "pc-unsent-sentence",
          title: "One unsent sentence of truth",
          blurb: "One sentence, kept private. Never sent.",
          body: "Say one true sentence, in your head or under your breath, to the person or situation involved. Not the whole truth — one sentence. Then let it stay exactly where it is. If you would rather write it, use the optional note earlier in this session; it disappears when this browsing session ends.",
          safety: "This is not a message and never becomes one. Nothing is sent, and there is no next step attached to it.",
        },
        {
          id: "pc-boundary-rehearsal",
          title: "A boundary sentence, rehearsed privately",
          blurb: "Preparation only. Not a conversation.",
          body: "Choose one plain sentence you might one day need — for example, “I am not able to take that on,” or “I need some time before I answer.” Say it quietly, twice, and notice what happens in your body as you do. That is the whole practice.",
          safety: "Rehearsing is not deciding, and it is not a plan to confront anyone. You are not agreeing to say it to anybody.",
        },
        {
          id: "pc-ask-support",
          title: "Asking for support, rehearsed",
          blurb: "Directed only toward someone already safe.",
          body: "Bring to mind one person who is safe — meaning someone who has not used your honesty against you. Rehearse one short sentence you could say to them: “Something has been hard lately.” Notice what rises as you imagine it. Then stop there.",
          safety: "Only rehearse this toward someone who is safe. If nobody comes to mind, that is important information, not a personal failure — Support and Safety lists other routes.",
        },
        {
          id: "pc-lament",
          title: "A lament practice",
          blurb: "Naming what hurts and what is needed. Spiritual wording optional.",
          body: "Lament has two halves. First, name what hurts, plainly and without softening it. Then name what you need, even if it is unavailable. You can address this to God, or to no one in particular, or to the room. Both forms are complete; neither is more serious than the other.",
          safety: "This is not complaining and it is not self-pity. Naming what hurts is not the same as being stuck in it.",
        },
        {
          id: "pc-prepare",
          title: "Prepare, don’t perform",
          blurb: "Identify one thing you would need first.",
          body: "Instead of asking what you should do, ask what you would need in place before anything could be done — more rest, more information, one safe person nearby, a different time of day. Name one. That is preparation, and preparation is real work.",
          safety: "This deliberately does not identify an action. Naming what is missing is the whole point.",
        },
        {
          id: "pc-five-percent",
          title: "Five per cent loosening",
          blurb: "A very small experiment with a protector, in a safe moment only.",
          body: "Pick one protector you named earlier — silence, busyness, keeping others comfortable. In one low-stakes moment this week, try five per cent less of it. Half a sentence more honest. One minute less busy. Then let it go back to normal.",
          safety: "Only in a moment that is genuinely safe. If the protector is still needed, keep it — it is not the enemy here.",
        },
      ],
      choices: [
        { id: "pc-skip", label: "I’d rather skip a practice today" },
        { id: "pc-later", label: "I’ll come back to one of these later" },
        { id: "pc-unsure", label: "I’m not sure which, and that’s fine" },
      ],
      practice: {
        heading: "If you did one",
        body: "Give it a moment before moving on. Practices like these often land slightly after they finish rather than during them.",
      },
    },
    {
      key: "integration",
      label: "Integration",
      status: "interactive",
      purpose: "Gathering what emerged, without summary pressure or performance.",
      heading: "Gathering what emerged",
      teach:
        "There is a temptation at this point to tidy everything into a conclusion. Resist it gently. Sessions like this one usually leave something clearer, something still unresolved, and something tender — and that mixture is a sign that the work was real, not that it was incomplete. Integration continues after you close this app, mostly without your supervision.",
      body: [
        "Three small movements. Choose what fits, or choose nothing; nothing is inferred from what you leave unselected.",
      ],
      branchOptions: MID_STAGE_BRANCHES,
      groups: [
        {
          id: "understand",
          title: "First — something understood a little differently",
          teach:
            "Not a breakthrough. A small shift in how something looks is the ordinary unit of change.",
          prompt: "Something I understand a little differently…",
          choices: [
            { id: "un-protector-made-sense", label: "How I have coped made sense" },
            { id: "un-two-forces", label: "There are two honest forces in me, not one failure" },
            { id: "un-not-laziness", label: "This was never about discipline or laziness" },
            { id: "un-cost-visible", label: "There is a present cost I had not looked at" },
            { id: "un-grief-present", label: "There is grief in this, not only difficulty" },
            { id: "un-still-connected", label: "I am more connected than I assumed" },
            { id: "un-dignity", label: "My dignity is not conditional on resolving this" },
            { id: "un-slower", label: "This is allowed to take longer than I wanted" },
            ...lowPressureChoices("un-"),
          ],
        },
        {
          id: "unfinished",
          title: "Then — something still unfinished",
          teach:
            "Naming what is unresolved keeps it from quietly becoming shame. Unfinishedness is expected here, not a sign that you did this badly.",
          prompt: "Something that still feels unfinished or unclear…",
          choices: [
            { id: "uf-what-to-do", label: "What, if anything, to do about it" },
            { id: "uf-a-relationship", label: "A relationship that is not resolved" },
            { id: "uf-a-decision", label: "A decision I am not ready to make" },
            { id: "uf-grief", label: "Grief that is not finished" },
            { id: "uf-trust-self", label: "Whether I can trust my own read on this" },
            { id: "uf-worth", label: "Whether I am worth the trouble of healing" },
            { id: "uf-almost-all", label: "Most of it, honestly" },
            ...lowPressureChoices("uf-"),
          ],
        },
        {
          id: "care",
          title: "Last — something that deserves care rather than pressure",
          teach:
            "Some things respond to effort. Others only respond to being treated kindly for a while. Telling them apart is a skill worth having.",
          prompt: "Something that deserves care rather than pressure…",
          choices: [
            { id: "cr-tiredness", label: "How tired I am" },
            { id: "cr-grief", label: "The grief underneath this" },
            { id: "cr-protector", label: "The part of me that has been protecting me" },
            { id: "cr-loneliness", label: "How alone I have felt with it" },
            { id: "cr-shame", label: "The shame that shows up around this" },
            { id: "cr-body", label: "My body, which has been carrying it" },
            { id: "cr-hope", label: "The small amount of hope I still have" },
            ...lowPressureChoices("cr-"),
          ],
        },
      ],
      practice: {
        heading: "A short orientation pause",
        body: "Before moving on: look around the room and let your eyes settle on something ordinary — a door, a window, a cup. Feel the chair or floor holding you. Notice the time of day. You have been inward for a while, and coming part-way back out before the last movements is deliberate.",
      },
    },
    {
      key: "one-honest-step",
      label: "One Honest Step",
      status: "interactive",
      purpose:
        "One small, safe, specific step — preparation counts, and no outward action is required.",
      heading: "One honest step",
      teach:
        "This is the bridge from reflection into ordinary life, and it is deliberately small. A step that is too large does not get taken, and a step that does not get taken usually becomes more evidence against yourself. So the aim is not the most meaningful step available. It is the smallest one that is genuinely true.",
      body: [
        "None of these are recommendations, and none of them are the right answer — there is no way for this app to know that. Choose one that fits, or choose none.",
        "Nothing here involves confronting anyone, disclosing anything you would rather keep private, reconciling, forgiving, or making a decision about a relationship, a job, or your health.",
      ],
      branchOptions: MID_STAGE_BRANCHES,
      steps: [
        {
          id: "os-private-sentence",
          label: "Write one private sentence and keep it unsent",
          category: "private",
          why: "It is small because it goes nowhere. Nothing is delivered, and nobody is involved but you.",
        },
        {
          id: "os-calendar-date",
          label: "Put a date in the calendar to reconsider — without committing to anything",
          category: "time",
          why: "It is small because it commits you to a moment of attention, not to an action or an outcome.",
        },
        {
          id: "os-gather-info",
          label: "Gather information only — no decision attached",
          category: "information",
          why: "It is small because knowing more is reversible. Nothing has to follow from what you find.",
        },
        {
          id: "os-rest",
          label: "Rest before deciding anything",
          category: "rest",
          why: "It is small because it asks nothing of you. Tiredness distorts almost every judgement, and resting first is a legitimate step.",
        },
        {
          id: "os-tell-safe-person",
          label: "Tell one safe person only that something has been difficult",
          category: "relational",
          why: "It is small because the details stay yours. “Something has been hard” is a complete sentence.",
        },
        {
          id: "os-sit-with-me",
          label: "Ask a safe person to sit with you while you think",
          category: "relational",
          why: "It is small because it asks for company, not advice — and company is usually the easier thing to give.",
        },
        {
          id: "os-boundary-sentence",
          label: "Practise one boundary sentence privately",
          category: "rehearsal",
          why: "It is small because rehearsal is not confrontation. Nobody hears it, and nothing is promised.",
        },
        {
          id: "os-notice-protector",
          label: "Notice the protector once, without changing it",
          category: "noticing",
          why: "It is small because it changes nothing on purpose. Seeing a pattern while it happens is the step.",
        },
        {
          id: "os-return-to-value",
          label: "Return to one value or meaningful routine",
          category: "meaning",
          why: "It is small because it is something you already know how to do. It reconnects rather than resolves.",
        },
        {
          id: "os-seek-support",
          label: "Look into professional, pastoral or community support",
          category: "support",
          why: "It is small because looking is not committing. Some things are not meant to be carried in an app or alone.",
        },
        {
          id: "os-no-outward-action",
          label: "Take no outward action today — preparation counts",
          category: "none",
          why: "It is small because it is honest. Having looked at this at all is the step; nothing is owed today.",
        },
      ],
      choices: [
        { id: "os-not-ready", label: "I’m not ready to choose a step" },
        { id: "os-very-little-energy", label: "Very little energy — the smallest thing only" },
        { id: "os-unsure", label: "I’m not sure" },
      ],
      optionalText: {
        prompt:
          "If your own step is something else, you can note it here. Optional, private, and gone when this browsing session ends.",
        placeholder: "Something else, if you wish…",
      },
    },
    {
      key: "close",
      label: "Close",
      status: "interactive",
      purpose:
        "A grounded re-entry into ordinary life, with an optional blessing and a private way to finish.",
      heading: "Coming back to the room",
      teach:
        "Endings matter more than they seem to. A session like this one opens things, and walking straight back into the day while still open is how people end up flattened by the evening. So this last movement is about re-entry — orienting to the room, the body and the time, before anything else happens.",
      body: [
        "Take a moment before you leave. Look around and let your eyes rest on three ordinary things. Feel where your body meets the chair or the floor. Notice roughly what time it is and what is next in your day.",
        "Nothing here has to be acted on today. Reflection is not an obligation, and there is no task waiting because of what you noticed.",
        "A meaningful session can leave relief, sadness, tiredness, clarity, numbness, or several of those at once. All of that is ordinary. If you can, drink some water, move gently, and let there be some human contact today — even brief and ordinary contact counts.",
      ],
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

/**
 * Stage 11 closings. The non-spiritual closing is complete on its own and is
 * what everybody sees unless the Christian route was explicitly chosen AND a
 * prayer was explicitly requested within it.
 */
export const CLOSE_STATEMENT_PLAIN =
  "You looked at something you have been walking around, and you did it without abandoning yourself. That is the whole of what was asked today. Nothing is owed because of it — not an action, not a decision, not a better mood. Whatever is unfinished is allowed to stay unfinished for now, and you are allowed to be tired.";

export const CLOSE_BLESSING_CHRISTIAN =
  "May you be met on the road you are actually walking, at the pace you are actually able. May grace reach you before anything is resolved, and may you be spared the pressure to feel more settled than you are. And may there be company for you today — human company as well as holy.";

export const CLOSE_PRAYER_CHRISTIAN =
  "God, thank you for staying near while I looked at this. I am not finished, and I am not pretending to be. Carry what I cannot carry today, and let me rest. Amen.";

