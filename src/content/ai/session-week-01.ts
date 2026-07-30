// Founder-approved content pack for the Week 1 deep-session Compassionate
// Attunement stage (stage 6).
//
// This pack is SEPARATE from the Day 1 pack (`src/content/ai/day-01.ts`) and
// must never weaken it. It supplies:
//   - the only IDs a curated or AI-shaped session reflection may reference;
//   - founder-review prose variants for each of the six sections;
//   - prohibited claims enforced by the session validator.
//
// There is deliberately NO spiritual content in this pack. Spirituality and
// the complete nonreligious existential path belong to stage 7 (Reconnection).
//
// All copy below is PROVISIONAL and written for founder review.

export const SESSION_W1_PACK_VERSION = "2026-07-30.1";

export interface PackItem {
  id: string;
  text: string;
}

/** The six sections, in fixed order. Never reordered, never omitted. */
export const SESSION_SECTION_ORDER = [
  "hearing",
  "pulls",
  "protection",
  "cost",
  "holding",
  "support",
] as const;

export type SessionSectionKey = (typeof SESSION_SECTION_ORDER)[number];

export const SESSION_SECTION_HEADINGS: Record<SessionSectionKey, string> = {
  hearing: "What I’m hearing",
  pulls: "The two pulls that may be present",
  protection: "What this may have protected",
  cost: "What it may be costing now",
  holding: "A more compassionate way to hold it",
  support: "When more support may help",
};

// -- Section 1: What I'm hearing -------------------------------------------

const HEARING: PackItem[] = [
  {
    id: "hearing-private",
    text: "It sounds like you came this far without needing to hand over the details, and that seems like a considered choice rather than an evasion. What you did give — the shape of the thing, roughly where it sits — may be enough to work with. Perhaps the part of you that keeps some things unspoken has learned that not every listener has been safe.",
  },
  {
    id: "hearing-numb",
    text: "It sounds like the clearest thing available right now may be a kind of distance — not a lack of feeling so much as feeling held at arm’s length. That is a recognisable state, and it often shows up around material that matters. Perhaps arriving here at all, while feeling far away from yourself, took more than it appeared to.",
  },
  {
    id: "hearing-grief",
    text: "It sounds like something has been lost, or is being lost, and the road you have been avoiding may run straight through that. Grief has a way of waiting quietly rather than announcing itself. Perhaps part of what makes this walk hard is that going toward it means letting the loss become real in a way it has not yet been.",
  },
  {
    id: "hearing-relational",
    text: "It sounds like another person is somewhere near the centre of this — a conversation not had, a boundary not set, a request not made. Perhaps that is why it has stayed difficult: it is not something you can resolve alone, and moving at all seems to risk something in the relationship you are trying to keep.",
  },
  {
    id: "hearing-decision",
    text: "It sounds like there may be an unfinished decision or a change sitting in the middle of this, and that it has been carried rather than made. Perhaps postponing has not felt like avoidance from the inside — more like waiting for a clarity that has not yet arrived, while the weight of not choosing quietly accumulates.",
  },
  {
    id: "hearing-self",
    text: "It sounds like some of this may be about how you see yourself rather than only about circumstances — a truth you half-know and have not fully turned toward. Perhaps that is the hardest sort of road, because there is nowhere to walk to that you are not already standing in. Coming this far with it may have taken real courage.",
  },
  {
    id: "hearing-general",
    text: "It sounds like there is a road you know the location of, even if you have not walked it, and that knowing where it is has been its own quiet weight. Perhaps you have circled it long enough that the circling itself has become familiar. Naming it here, without going down it, may already be a change of relationship with it.",
  },
];

// -- Section 2: The two pulls ----------------------------------------------

const PULLS: PackItem[] = [
  {
    id: "pulls-both",
    text: "It may be that one part of you genuinely wants movement — toward truth, relief, or a next chapter — while another part is protecting you from a cost it expects to arrive with that movement. Both may be accurate. Ambivalence of this kind is not weakness or indecision; it is usually two forms of self-care that have not yet been introduced to each other.",
  },
  {
    id: "pulls-forward",
    text: "The pull forward seems the clearer of the two right now — something in you wants this to change. What holds you back may be less articulate: not an argument, perhaps, but a hesitation with no words yet. It might be worth assuming that hesitation has a reason, even if the reason has not surfaced. Reasons do not have to be stated to be real.",
  },
  {
    id: "pulls-back",
    text: "What you can name most clearly may be the cost — what could go wrong, who could be hurt, what could become undeniable. The pull forward might be quieter, but it is likely present, or you would not have opened this session at all. Something in you may be looking for a way through that does not cost more than you can pay.",
  },
  {
    id: "pulls-unclear",
    text: "It may be that neither pull is clear yet, and that trying to name them produces mostly fog. That is a legitimate place to be standing. Perhaps the honest description is not “I want this” or “I fear this” but “I know this matters and I do not yet know what I want.” Uncertainty is a real answer, not a missing one.",
  },
  {
    id: "pulls-mixed",
    text: "It sounds like more than one thing may be true at once, and that summarising it flattens it. Perhaps you want the conversation and dread it, grieve the loss and are relieved by it, hope for change and expect disappointment. Holding two contradictory things is not confusion — it is often the most accurate account available.",
  },
];

// -- Section 3: What this may have protected --------------------------------

const PROTECTION: PackItem[] = [
  {
    id: "protection-quiet",
    text: "Silence, withdrawal, or going somewhere far away inside may have kept something intact — peace in a room, a relationship that could not have survived the conversation, or simply your own capacity to keep going. These are not failures of courage. They are what a person does when the cost of speaking has, at some point, been higher than the cost of not.",
  },
  {
    id: "protection-effort",
    text: "Staying busy, thinking it through again, managing the details, or making sure others are all right may have been doing real work. Effort of this kind often holds a life together during a period when nothing else will. It may have protected you from a helplessness that would have been unbearable to feel directly at the time.",
  },
  {
    id: "protection-expression",
    text: "Humour, heat, or reaching for a spiritual frame quickly may have made something survivable that would otherwise have flattened you. Each of these can carry real truth as well as real distance. It may be that they let you stay in the room and stay recognisable to yourself, at a moment when the alternative was going under.",
  },
  {
    id: "protection-timing",
    text: "Postponing may have been protecting your timing rather than avoiding the thing itself. There are seasons when a person genuinely cannot afford what a conversation or a decision would cost. Waiting can be wisdom. It may only become costly when the waiting outlives the circumstances that made it necessary — and that is worth noticing gently, not condemning.",
  },
  {
    id: "protection-unnamed",
    text: "Even without naming how, it seems likely that something in you has been doing protective work. People rarely avoid a road for no reason. Perhaps the strategy is so familiar it no longer looks like a strategy — just how things are. That it is hard to see is usually a sign of how long it has been carrying something.",
  },
];

// -- Section 4: What it may be costing now ----------------------------------

const COST: PackItem[] = [
  {
    id: "cost-body",
    text: "The present cost may be showing up in the body and in energy before it shows up in words — tension that does not fully release, tiredness that sleep does not resolve, a background bracing you have stopped noticing. Bodies carry postponed things faithfully and expensively. That may be worth attending to as information rather than as a fault.",
  },
  {
    id: "cost-relational",
    text: "The present cost may be relational — a distance that has grown quietly, a version of yourself that gets shown while another stays out of sight. It might be that people who care about you are close to who you appear to be rather than who you are. That is a lonely arrangement, even in a room full of people who love you.",
  },
  {
    id: "cost-self-trust",
    text: "The present cost may be to self-trust. Each time something true is set aside, it can become slightly harder to believe your own read on things. Perhaps you find yourself checking with others, or doubting a clear instinct. That erosion is usually gradual and rarely deserved — it is a side effect of the strategy, not evidence about you.",
  },
  {
    id: "cost-meaning",
    text: "The present cost may be to meaning — a flattening in things that once carried significance, or a sense of going through motions that used to matter. When something significant is left unaddressed, it can quietly grey out everything nearby. That greyness is often less about losing your values than about the effort of keeping something at bay.",
  },
  {
    id: "cost-grief",
    text: "The present cost may be unfinished grief — a loss that has not been allowed to be a loss, still waiting to be recognised. Grief that is deferred does not lessen; it just becomes less locatable. Perhaps some of the weight you carry is not the situation itself but the mourning that has not yet had anywhere to go.",
  },
  {
    id: "cost-choice",
    text: "The present cost may be to your sense of choice — the feeling that this is simply how things are, rather than something with any give in it. When a protective pattern has run long enough, it can start to look like the whole landscape. It might be that fewer things are fixed than they currently appear, even if nothing changes today.",
  },
  {
    id: "cost-not-yet",
    text: "It may be that no clear present cost is visible yet, and it would be wrong to manufacture one. Sometimes a protective strategy is still doing more good than harm, and the honest answer is that it is still needed. Noticing that plainly is worth more than producing a cost to satisfy the shape of a reflection.",
  },
];

// -- Section 5: A more compassionate way to hold it -------------------------

const HOLDING: PackItem[] = [
  {
    id: "holding-both-and",
    text: "Perhaps this can be held as both/and rather than either/or: thank you to the part that protected you, and a quiet question about what it costs now. You do not have to shame a survival strategy in order to change your relationship with it. Most people move further with gratitude toward the pattern than with contempt for it.",
  },
  {
    id: "holding-not-yet",
    text: "Perhaps “not yet” can be an honest position rather than a failure. If the circumstances that made this necessary are still in place, continuing to protect yourself may be the right call. It might be enough today to have looked at it directly, named roughly where it sits, and left it where it is on purpose rather than by default.",
  },
  {
    id: "holding-slow",
    text: "Perhaps the invitation is smaller than it appears. Not the whole road — one step onto it, or even one step toward the place where it begins. Preparation counts. A person who has considered the conversation, or written one sentence they will never send, has already moved. Slowness here is not delay; it is often how something lasting is built.",
  },
  {
    id: "holding-companioned",
    text: "Perhaps the change most worth making is not doing this differently but doing it less alone. What has been carried privately may not need to be solved before it can be shared. It might be that one safe person hearing an outline of it — no details required — would alter the weight more than any further thinking will.",
  },
  {
    id: "holding-dignity",
    text: "Perhaps you can hold this with the same steadiness you would offer someone you respect who told you the same thing. It seems unlikely you would call them avoidant or weak. You would probably assume there were reasons. Extending that assumption to yourself is not indulgence — it may simply be a more accurate reading of the situation.",
  },
];

// -- Section 6: When more support may help ----------------------------------
// Never contains a phone number. Crisis routing is deterministic and lives
// outside this pack.

const SUPPORT_REMINDERS: PackItem[] = [
  {
    id: "support-general",
    text: "If this stays heavy after today, or keeps returning with more weight than you can carry alone, that may be a sign for a person rather than a page — a counsellor, doctor, or someone you trust. The Support page in this app has options you can reach at any time.",
  },
  {
    id: "support-relational",
    text: "If moving on this seems to require a conversation you cannot safely have, it may be worth having support in place first rather than going alone. A counsellor or a trusted person can help you think it through beforehand. The Support page is always available from any screen here.",
  },
  {
    id: "support-heavy",
    text: "If what surfaced here feels larger than a reflection can hold, that is not a sign you did this wrong — it may simply mean the material deserves a person’s full attention rather than an app’s. Please consider reaching out, and use the Support page whenever you need it.",
  },
];

// -- Prohibited claims ------------------------------------------------------
// Checked case-insensitively against the whole generated reflection.

const PROHIBITED_CLAIMS: string[] = [
  "you need to",
  "you must",
  "you should just",
  "you have to forgive",
  "you have to reconcile",
  "this will heal you",
  "you will be healed",
  "this will cure",
  "i can tell you have",
  "you are suffering from",
  "you clearly have",
  "your diagnosis",
  "god is telling you",
  "god wants you to",
  "it is god's will",
  "the bible says",
  "i guarantee",
  "definitely",
  "certainly you",
  "leave your partner",
  "quit your job",
  "stop taking",
  "your medication",
  "confront them",
  "call this number",
];

export const SESSION_W1_CONTENT_PACK = {
  version: SESSION_W1_PACK_VERSION,
  hearing: HEARING,
  pulls: PULLS,
  protection: PROTECTION,
  cost: COST,
  holding: HOLDING,
  supportReminders: SUPPORT_REMINDERS,
  prohibitedClaims: PROHIBITED_CLAIMS,
};

export const SESSION_W1_VALID_IDS = {
  hearing: new Set(HEARING.map((i) => i.id)),
  pulls: new Set(PULLS.map((i) => i.id)),
  protection: new Set(PROTECTION.map((i) => i.id)),
  cost: new Set(COST.map((i) => i.id)),
  holding: new Set(HOLDING.map((i) => i.id)),
  support: new Set(SUPPORT_REMINDERS.map((i) => i.id)),
};

export function findPackItem(
  section: keyof typeof SESSION_W1_VALID_IDS,
  id: string,
): PackItem | undefined {
  const list =
    section === "support"
      ? SESSION_W1_CONTENT_PACK.supportReminders
      : SESSION_W1_CONTENT_PACK[section];
  return list.find((i) => i.id === id);
}
