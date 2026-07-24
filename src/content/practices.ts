// Standalone practices. Content in a single editable file.

export interface PracticeStep {
  heading?: string;
  body: string;
}

export interface Practice {
  id: string;
  title: string;
  purpose: string;
  duration: string;
  steps: PracticeStep[];
  cautions?: string[];
}

export const PRACTICES: Practice[] = [
  {
    id: "pause-and-ground",
    title: "Pause and Ground",
    purpose:
      "A brief orienting practice to help your body remember it is safe enough, here, now.",
    duration: "About 2 minutes",
    steps: [
      {
        heading: "Sight",
        body: "Look slowly around and name three things you can see. There is no right answer — a wall, a plant, the edge of a cup.",
      },
      {
        heading: "Sound",
        body: "Notice two sounds. A distant sound and a nearer one. You do not need to interpret them.",
      },
      {
        heading: "Feet and support",
        body: "Feel where your feet or body meet the ground or chair. Let the support hold you a little more than usual.",
      },
      {
        heading: "Slower exhale",
        body: "Breathe out a little longer than you breathe in. Three or four gentle rounds.",
      },
      {
        heading: "Close",
        body: "Notice where you are now. Not fixed. Not far from where you started. Just a little more here.",
      },
    ],
    cautions: [
      "Stop if this makes you feel worse. Grounding is not one-size-fits-all.",
      "If any step increases distress, open your eyes, move gently, or reach out to a safe person.",
    ],
  },
  {
    id: "start-where-you-are",
    title: "Start Where You Are",
    purpose:
      "A short practice for days when you cannot begin the whole road — only acknowledge it.",
    duration: "About 3 minutes",
    steps: [
      {
        body: "Take one slower breath. You do not have to do more than arrive.",
      },
      {
        heading: "Name the road",
        body: "In one phrase — not a full sentence — name the meaningful road that has felt too heavy to face.",
      },
      {
        heading: "Choose a beginning",
        body: "Pick one small preparation. Not the whole road. Perhaps a question, a message to a safe person, or simply naming it aloud.",
      },
      {
        body: "Let the acknowledgement be the whole practice today. Beginning counts.",
      },
    ],
  },
  {
    id: "name-the-old-pattern",
    title: "Name the Old Pattern",
    purpose:
      "A gentle way to notice a survival strategy — with honour, not shame.",
    duration: "About 4 minutes",
    steps: [
      {
        heading: "Notice",
        body: "Bring to mind a pattern you have wondered about. Withdrawal, control, over-giving, numbness, anger, or something else.",
      },
      {
        heading: "Honour",
        body: "Ask: What did this once protect me from? Let the answer be quiet and honest.",
      },
      {
        heading: "Notice the cost",
        body: "Ask: What might this be costing me now — in my body, my relationships, or my spirit?",
      },
      {
        heading: "Loosen, do not force",
        body: "Ask: Where could I loosen this by five per cent, with support, this week?",
      },
    ],
    cautions: [
      "If the pattern involves substances, self-harm, or high-risk coping, please involve a professional before changing it.",
    ],
  },
  {
    id: "sacred-reframing",
    title: "Sacred Reframing",
    purpose:
      "Hold two truths at once: what happened mattered, and what else may also be true.",
    duration: "About 3 minutes",
    steps: [
      {
        heading: "First truth",
        body: "Name it quietly: What happened mattered. It shaped me. It was not nothing.",
      },
      {
        heading: "Second truth",
        body: "Ask: What else may also be true — about me, about the people around me, about God, about what is still possible?",
      },
      {
        body: "You are not being asked to replace the first with the second. Both may live together.",
      },
    ],
    cautions: [
      "This is not positive reframing. Do not use this to overwrite grief, injustice, or pain.",
    ],
  },
  {
    id: "reach-toward-safe-connection",
    title: "Reach Toward Safe Connection",
    purpose:
      "One small movement toward another person — or toward a wiser boundary.",
    duration: "About 3 minutes",
    steps: [
      {
        heading: "Choose one",
        body: "Ask for help. Receive safe care. Tell the truth wisely. Or set a boundary.",
      },
      {
        heading: "Ask for help",
        body: "Send one honest message. It can be brief. “I could use company today,” is enough.",
      },
      {
        heading: "Receive safe care",
        body: "Let one kindness land without deflecting it.",
      },
      {
        heading: "Tell the truth wisely",
        body: "Say one true thing, to one safe person, in a way you can bear.",
      },
      {
        heading: "Set a boundary",
        body: "Where care is not safe, choose a boundary instead of forcing openness.",
      },
    ],
  },
  {
    id: "lament",
    title: "Lament",
    purpose:
      "Permission to name pain, loss, anger, disappointment, and longing — without rushing to resolve them.",
    duration: "About 5 minutes",
    steps: [
      {
        heading: "Name it",
        body: "What has been lost, broken, or long delayed? You may name more than one.",
      },
      {
        heading: "Say it plainly",
        body: "Speak or think one honest sentence. It does not need to be beautiful.",
      },
      {
        heading: "Do not rush the ending",
        body: "You do not have to arrive at hope today. Lament is a room, not a doorway you must pass through.",
      },
      {
        heading: "Close gently",
        body: "Return to your breath, or to a safe person, or to a small kindness for yourself.",
      },
    ],
    cautions: [
      "If lament stirs up distress that is hard to hold alone, please reach a safe person or professional support.",
    ],
  },
];

export const getPractice = (id: string) => PRACTICES.find((p) => p.id === id);
