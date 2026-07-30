// Beauty from Ashes — seven-day journey content.
// Draft copy grounded in Carl Wycliffe Hicks Jr.'s series.
// Edit here to revise a day; nothing is hard-coded in components.

export type OneStepSuggestion = string;

/**
 * Curated branch responses for when a user chooses a low-pressure option
 * on the daily Notice step. Each value is a short (1–3 sentence)
 * founder-authored teaching fragment that acknowledges the choice and
 * carries the user forward without re-asking or shaming.
 *
 * These are read by the daily flow when the user selects the matching
 * chip; they never trigger AI, never persist input, and never re-route
 * to a diagnostic screen.
 */
export interface DayBranches {
  notSure: string;
  preferNotToSay: string;
  notToday: string;
  veryLittleEnergy: string;
  numb: string;
  mixed: string;
}

export interface DayContent {
  day: number;
  title: string;
  theme: string;
  arriveLine: string;
  /**
   * Short (3–6 sentence) founder-authored teaching that frames how to
   * work with what today's practice invites — not just what to notice.
   * Rendered as a distinct "Teach" step between Arrive and Notice.
   * DRAFT copy is marked in the seed data below and awaits founder approval.
   */
  teach?: string;
  /** Optional ID of a curated practice from src/content/practices.ts that pairs with today's teaching. */
  practiceId?: string;
  /** Curated branch responses (see DayBranches). Optional during rollout. */
  branches?: DayBranches;
  coreReflection: string;
  scripture?: {
    reference: string;
    body: string;
    note?: string;
  };
  listenPrompts: string[];
  reconnectOptions: {
    label: string;
    description: string;
  }[];
  oneHonestStep: OneStepSuggestion[];
  closingBlessing: string;
  optionalPrayer?: string;
}


export const DAYS: DayContent[] = [
  {
    day: 1,
    title: "Begin Where You Are",
    theme: "The meaningful road we have been avoiding.",
    arriveLine:
      "Start where you are — not where you think you should be.",
    // DRAFT — founder to approve. 3–6 sentences teaching how to work with today's invitation.
    teach:
      "Avoidance is rarely laziness. It is usually a form of protection that once made sense — and may still be doing quiet work now. Today is not about walking the whole road. It is about letting the road become a little more visible, at a pace your body can bear. Notice, without judgement, that some part of you already knows where the road is. Beginning is not the same as arriving; simply acknowledging the road is real work, and it counts.",
    practiceId: "start-where-you-are",
    // DRAFT — founder to approve. Curated response for each low-pressure branch.
    branches: {
      notSure:
        "Not sure is an honest place to begin. You do not have to name anything yet — staying near the question is already part of the work.",
      preferNotToSay:
        "You do not owe this app your answer. Keeping it to yourself, or naming it only inside, is a valid form of participation today.",
      notToday:
        "Choosing not today is a kind of care. The road will still be there tomorrow, and so will you. A slow exhale is enough for now.",
      veryLittleEnergy:
        "When energy is very low, the honest step becomes very small — a single breath, one word held quietly, or simply noticing that you opened this at all.",
      numb:
        "Numbness is often protection, not absence. You do not have to feel more than you feel. Let noticing the numbness itself be the whole of today's practice.",
      mixed:
        "Mixed is not confusion — it is often accuracy. More than one true thing can live in you at once. You can let both be here without choosing between them.",
    },

    coreReflection:
      "Sometimes we already know where life is asking for honesty — a conversation, a grief, a boundary, a request for help, or a truth we have postponed. You do not have to walk the whole road today. The beginning may simply be acknowledging where the road is.",
    scripture: {
      reference: "Luke 9:51",
      body: "When the days drew near for him to be taken up, he set his face to go to Jerusalem.",
      note: "This is not an invitation to move toward danger or suffering. It is an image of gentle resolve — of naming the meaningful road, in your own time, with support.",
    },
    listenPrompts: [
      "What road have I been quietly avoiding?",
      "What might it be asking of me — perhaps in a very small way?",
      "What kind of support would make a first step feel safer?",
    ],
    reconnectOptions: [
      { label: "Self", description: "Acknowledge the road without demanding you walk it today." },
      { label: "A safe person", description: "Name it aloud to someone trustworthy." },
      { label: "Meaning", description: "Notice why this road matters to who you are becoming." },
      { label: "God (optional)", description: "Speak an honest, unpolished sentence." },
    ],
    oneHonestStep: [
      "Name the avoided area in a single phrase.",
      "Identify one safe preparation step — not the whole road.",
      "Speak with a trusted or professional support person about it.",
      "Write the phrase somewhere private, outside this app.",
    ],
    closingBlessing:
      "May you receive credit for beginning, even when the beginning is only honest acknowledgement.",
    optionalPrayer:
      "God, I am not sure I am ready. Help me stay near what is true, and near people who are safe. Amen.",
  },
  {
    day: 2,
    title: "Name What You Are Carrying",
    theme: "Unnamed burdens can grow heavier.",
    arriveLine: "Naming is not fixing. It is allowing what is present to become a little less hidden.",
    // PROVISIONAL — founder review. 3–6 sentences on how to work with today's invitation.
    teach:
      "What we cannot name tends to run the day from behind us. Naming is not analysis and it is not confession — it is simply giving something a word so it stops having to shout. A single ordinary word is enough; it does not need to be the right word, or the whole truth. Notice that naming can make a weight feel briefly heavier before it feels lighter, because you are finally looking at it. You are allowed to name only the edge of it today, and leave the rest for another time.",
    practiceId: "name-the-old-pattern",
    // PROVISIONAL — founder review.
    branches: {
      notSure:
        "Not knowing what you are carrying is itself a kind of information. You can stay near the weight without labelling it today.",
      preferNotToSay:
        "Some weights are named more safely in private, or with a person you trust. Keeping it unspoken here takes nothing away from your work.",
      notToday:
        "Naming can wait. Setting the weight down for now is not avoidance — it is pacing, and pacing is part of carrying well.",
      veryLittleEnergy:
        "With little energy, one word is plenty. Let a single word rise, hold it for one breath, and let that be the whole of it.",
      numb:
        "When you feel nothing, there may still be something being carried quietly. You do not have to reach for feeling — noticing the flatness is enough today.",
      mixed:
        "You may be carrying several things at once, and they may not agree with each other. That is common, and it does not need sorting out today.",
    },

    coreReflection:
      "Feeling stuck does not always mean you lack desire or courage. Sometimes you are trying to move while carrying grief, fear, shame, anger, exhaustion, or a story that has never been given words. Naming is not fixing. It is allowing what is present to become a little less hidden.",
    scripture: {
      reference: "Psalm 55:22",
      body: "Cast your burden on the Lord, and he will sustain you.",
      note: "Casting begins with acknowledging that a burden is being carried at all.",
    },
    listenPrompts: [
      "If I had to give what I am carrying a single word, what might it be?",
      "Where do I notice it in my body — without forcing?",
      "Is this a new weight, or an old one that has grown quieter but not lighter?",
    ],
    reconnectOptions: [
      { label: "Body", description: "Slow the exhale. Let the ground hold you." },
      { label: "Self", description: "Offer the same kindness you would offer a friend." },
      { label: "A safe person", description: "Share only what feels safe to share." },
      { label: "God (optional)", description: "Name the weight without editing it." },
    ],
    oneHonestStep: [
      "Choose one word for what you are carrying today.",
      "Notice where it sits in the body — briefly, without forcing.",
      "Write privately, outside this app, if writing feels helpful.",
      "Pause and use grounding if any of this feels overwhelming.",
    ],
    closingBlessing:
      "May what has been unnamed become a little less hidden, at a pace that is kind to you.",
    optionalPrayer:
      "God, this is what I am carrying today. I do not need to explain it. Please stay near. Amen.",
  },
  {
    day: 3,
    title: "Listen to the Divided Self",
    theme: "Part of us may want change while another part wants familiar safety.",
    arriveLine: "Ambivalence is not a moral failure. It is often two parts of you trying to help.",
    coreReflection:
      "Ambivalence is not proof that you are lazy, rebellious, or insincere. One part of you may long to move forward while another remembers what change has cost, fears disappointment, or trusts what is familiar. Both parts may be trying, in different ways, to protect you.",
    listenPrompts: [
      "A part of me wants…",
      "Another part of me fears…",
      "What has the fearful part been trying to protect me from?",
    ],
    reconnectOptions: [
      { label: "Self", description: "Thank the protective part without letting it drive." },
      { label: "A safe person", description: "Talk it through with someone who will not rush you." },
      { label: "Reality", description: "Name what is actually true today — not what could go wrong tomorrow." },
    ],
    oneHonestStep: [
      "Finish the sentence: “A part of me wants…”",
      "Finish the sentence: “Another part of me fears…”",
      "Thank the protective part without giving it the final vote.",
      "Choose one very small next step — small enough that both parts can bear it.",
    ],
    closingBlessing:
      "May the parts of you learn to listen to each other before either has to win.",
  },
  {
    day: 4,
    title: "Dignity Before Change",
    theme: "Shame and the question, “Am I worth healing?”",
    arriveLine: "Your struggle does not erase your dignity.",
    // PROVISIONAL — founder review.
    teach:
      "Shame speaks in a voice that sounds like honesty, which is why it is so persuasive. Working with it does not mean arguing back or forcing positive statements you do not believe. It means noticing the difference between “I did something painful” and “I am something wrong,” and letting that gap widen slightly. Dignity is not something you earn by improving; it is the ground you stand on while anything changes. Today you are asked only to let one true, kind sentence be said about you.",
    practiceId: "sacred-reframing",
    // PROVISIONAL — founder review.
    branches: {
      notSure:
        "You may not be able to tell whether shame or truth is speaking. Not deciding today is safer than agreeing with the harsher voice.",
      preferNotToSay:
        "Shame usually asks for secrecy, and you may still choose privacy for other reasons. Both can be true; nothing needs disclosing here.",
      notToday:
        "This question can wait. Stepping away from it is not proof of anything about your worth.",
      veryLittleEnergy:
        "With little energy, let the smallest kindness stand: you are here, and that is not nothing.",
      numb:
        "If worth feels like an abstract word right now, leave it be. Noticing the numbness costs less than arguing with it.",
      mixed:
        "You may believe in your dignity and doubt it in the same hour. That is ordinary, and it is not hypocrisy.",
    },

    coreReflection:
      "Shame does more than say something went wrong. It can begin telling us that we are what is wrong. Healing participation becomes difficult when we expect compassion for others but not for ourselves. Your struggle does not erase your dignity.",
    scripture: {
      reference: "Mark 10:46–52",
      body: "Jesus stopped and said, “Call him.” … “What do you want me to do for you?”",
      note: "Bartimaeus is seen, stopped for, and asked what he wants — before anything else changes.",
    },
    listenPrompts: [
      "If shame were quieter today, what might I ask for?",
      "Where do I offer compassion to others that I withhold from myself?",
      "What is one true, kind sentence about who I am — not what I have done?",
    ],
    reconnectOptions: [
      { label: "Self", description: "Speak to yourself the way a kind friend would." },
      { label: "A safe person", description: "Let someone see you without performing." },
      { label: "God (optional)", description: "Name what you want, without apologising." },
    ],
    oneHonestStep: [
      "Name what you want, without apologising for wanting it.",
      "Replace one shame statement with a truthful, compassionate one.",
      "Ask for appropriate help from a safe person or professional.",
      "Notice one act of care you would offer a friend — and offer it to yourself.",
    ],
    closingBlessing:
      "May you receive the compassion you have so easily given others.",
    optionalPrayer:
      "God, I am tired of being hard on myself. Would you help me see what you see? Amen.",
  },
  {
    day: 5,
    title: "Let Goodness Come Near",
    theme: "Receiving care, kindness, grace, and safe connection.",
    arriveLine: "You are not ungrateful or broken because receiving takes time.",
    // PROVISIONAL — founder review.
    teach:
      "Receiving is a skill, not a virtue you either have or lack. If care once arrived with conditions or cost, your guardedness learned something accurate. Working with today means watching what happens in your body when kindness comes near — the small deflection, the joke, the change of subject — with curiosity rather than correction. You are not asked to open toward anyone unsafe. Discernment about who to let near is part of this practice, not a failure of it.",
    practiceId: "reach-toward-safe-connection",
    // PROVISIONAL — founder review.
    branches: {
      notSure:
        "You may not know yet whether receiving feels safe. Uncertainty here is often wisdom, not resistance.",
      preferNotToSay:
        "Who is safe, and who is not, is yours to hold. You can weigh it privately and still be doing today's work.",
      notToday:
        "Openness cannot be scheduled. Letting today stay guarded is a legitimate answer, not a step backwards.",
      veryLittleEnergy:
        "With little energy, receiving can be very small — letting one kind thing land without answering it.",
      numb:
        "If kindness does not register right now, that is not ingratitude. Let the practice be noticing the distance rather than closing it.",
      mixed:
        "Wanting closeness and bracing against it often arrive together. Both parts can stay; neither has to win today.",
    },

    coreReflection:
      "Some people know how to endure more easily than they know how to receive. If care once came with conditions, disappointment, or harm, openness may not feel safe. You are not ungrateful or broken because you need time. Receiving can begin with allowing one safe kindness to land.",
    scripture: {
      reference: "Luke 19:1–10",
      body: "Zacchaeus, hurry and come down, for I must stay at your house today.",
      note: "Zacchaeus watches from a controlled distance, and grace comes near before his life is fully arranged.",
    },
    listenPrompts: [
      "Where do I keep myself at a controlled distance from kindness?",
      "When kindness comes close, what does my body do?",
      "Where would receiving be safe today — and where would boundaries be wiser?",
    ],
    reconnectOptions: [
      { label: "A safe person", description: "Allow one safe kindness to land, without deflecting." },
      { label: "Self", description: "Let yourself count as someone worth caring for." },
      { label: "Boundaries", description: "Notice where care would not be safe, and honour that." },
    ],
    oneHonestStep: [
      "Receive one compliment today without deflecting it.",
      "Accept one safe offer of help.",
      "Notice where kindness creates tension — with curiosity, not judgment.",
      "Where care is not safe, choose a boundary instead of forcing openness.",
    ],
    closingBlessing:
      "May goodness come near you at a pace that your history can bear.",
  },
  {
    day: 6,
    title: "Honour What Protected You",
    theme: "Survival strategies that once helped but may now be costly.",
    arriveLine: "Letting go does not require shaming the way you survived.",
    // PROVISIONAL — founder review.
    teach:
      "Before you ask what a pattern costs, it helps to ask what it once saved. Anger, silence, control and distance are usually intelligent responses to something real. Working with them gently means thanking them first, then asking a quieter question: is this still the best way to keep me safe now? Nothing here asks you to drop a protection you still need. A five per cent loosening, in a safe moment, is a real change — and some patterns should only be loosened with company.",
    practiceId: "sacred-reframing",
    // PROVISIONAL — founder review.
    branches: {
      notSure:
        "You may not know yet whether a pattern still helps or now costs. Holding both possibilities is wiser than deciding quickly.",
      preferNotToSay:
        "Survival strategies are private for good reasons. You can consider yours without describing it here.",
      notToday:
        "This is tender ground. Choosing not to open it today is itself good judgement about your own pacing.",
      veryLittleEnergy:
        "With little energy, do not touch the pattern at all. Simply notice, without acting, that it has been protecting you.",
      numb:
        "Numbness may be the protection itself. You do not need to go behind it today — noticing that it is there is enough.",
      mixed:
        "Gratitude and frustration toward the same pattern can be true at once. You do not have to resolve that tension today.",
    },

    coreReflection:
      "The anger, numbness, control, withdrawal, or guardedness you carry may once have served a real purpose. Letting go does not require shaming the way you survived. It begins by asking whether the same strategy is still helping you live now.",
    scripture: {
      reference: "Matthew 26:36–39",
      body: "My Father, if it be possible, let this cup pass from me; nevertheless, not as I will, but as you will.",
      note: "Gethsemane is honest struggle — not shallow ‘letting go.’ It names the cost before it names the surrender.",
    },
    listenPrompts: [
      "What did this pattern once protect me from?",
      "What is it costing me now — in relationships, body, or spirit?",
      "What is the smallest way I could loosen it — perhaps by five per cent?",
    ],
    reconnectOptions: [
      { label: "Self", description: "Thank the strategy for surviving. Then ask what it costs now." },
      { label: "A safe person", description: "Do not attempt a high-risk change alone." },
      { label: "Professional support", description: "Some patterns need company to shift safely." },
    ],
    oneHonestStep: [
      "Name what this pattern once protected you from.",
      "Name one present-day cost, without harshness.",
      "Loosen it by five per cent — not all at once.",
      "If the pattern is high-risk, seek support before changing it.",
    ],
    closingBlessing:
      "May the parts of you that survived be honoured, even as you learn a gentler way to live.",
    optionalPrayer:
      "God, thank you that I am still here. Help me lay down only what is mine to lay down, and only when I am held. Amen.",
  },
  {
    day: 7,
    title: "Practise New Life",
    theme: "New life is not going backward or pretending wounds disappeared.",
    arriveLine: "Insight needs somewhere to land.",
    // PROVISIONAL — founder review.
    teach:
      "New life rarely announces itself. More often it looks like one small practice you keep doing while the grief is still unfinished. Today is not about summing up the week or proving it worked. It is about choosing one thing small enough to survive an ordinary week, and one connection worth moving toward. What you do not carry forward is not wasted; it simply waits. Continuing gently is a better sign than continuing perfectly.",
    practiceId: "reach-toward-safe-connection",
    // PROVISIONAL — founder review.
    branches: {
      notSure:
        "Not knowing what to carry forward is a fair place to end. You can let the week settle first and choose later.",
      preferNotToSay:
        "Your continuation can stay entirely private. Nothing needs to be declared here for it to be real.",
      notToday:
        "You do not have to close the week tidily. Leaving it open is allowed, and you can return whenever you are ready.",
      veryLittleEnergy:
        "With little left, let the continuation be one sentence held quietly: this mattered, and I can return to it.",
      numb:
        "If the end of the week feels flat, nothing has gone amiss. Let the practice be simply noticing that you arrived here at all.",
      mixed:
        "Relief and sadness often finish together. You can carry both forward without deciding which one is the truer ending.",
    },

    coreReflection:
      "New life may begin before everything feels resolved. It can be a new way of relating to the same story, wound, or question. Insight needs somewhere to land. One small lived practice can become a quiet beginning.",
    scripture: {
      reference: "Luke 24:13–35",
      body: "Were not our hearts burning within us while he talked with us on the road?",
      note: "Emmaus — hope comes near while the travellers are still grieving and confused.",
    },
    listenPrompts: [
      "Which of the past six days most needs to keep breathing in my life?",
      "What one safe connection could I move toward this week?",
      "What boundary or support would help me continue?",
    ],
    reconnectOptions: [
      { label: "Self", description: "Choose one practice to continue, and one to release." },
      { label: "A safe person", description: "Name one connection you can move toward." },
      { label: "Meaning", description: "Set a quiet continuation intention." },
    ],
    oneHonestStep: [
      "Choose one practice to continue beyond today.",
      "Identify one safe connection to move toward.",
      "Name one boundary or support that will help you continue.",
      "Write a simple continuation intention, outside this app.",
    ],
    closingBlessing:
      "May the small, lived practices you choose become the quiet beginning of new life.",
    optionalPrayer:
      "God, I do not need everything resolved today. Meet me on the road. Amen.",
  },
];

export const getDay = (n: number): DayContent | undefined =>
  DAYS.find((d) => d.day === n);
