// Client-facing opening copy for The First Journey.
//
// PROVISIONAL — founder content review required.
// Warm client-facing titles only: never label a screen Why / What / How.
// Each explanatory screen is deliberately short so it fits a 360px phone
// viewport without scrolling.

export interface OpeningScreen {
  key: "welcome" | "find-here" | "how-it-works";
  /** Small navy line above the heading. */
  eyebrow: string;
  title: string;
  lead: string;
  points: string[];
  closing?: string;
}

export const OPENING_SCREENS: OpeningScreen[] = [
  {
    key: "welcome",
    eyebrow: "Welcome",
    title: "You don’t have to arrive with the words yet",
    lead: "Many people come here carrying something heavy, hidden or numb — and no clear way to begin.",
    points: [
      "This is a quiet place to slow down and look honestly.",
      "Nothing here asks you to explain yourself to anyone.",
      "You set the pace, and you can stop at any point.",
    ],
    closing: "Beauty from Ashes was made for the part of you that is still hoping.",
  },
  {
    key: "find-here",
    eyebrow: "What you’ll find here",
    title: "Short, honest reflections — and something to carry",
    lead: "Each day gives you something to understand, something to practise and one small step.",
    points: [
      "Plain-language reflection, explained as you go.",
      "A practice you can do with or without spiritual language.",
      "A personalized reflection shaped by what you choose that day.",
      "One honest step — small, safe and yours.",
    ],
  },
  {
    key: "how-it-works",
    eyebrow: "How the journey works",
    title: "One day at a time, in your own time",
    lead: "Open a day when you have a little space. Most days are short; a few go deeper.",
    points: [
      "You can answer, or continue without answering.",
      "Your place is saved on this device, so you can leave and return.",
      "Nothing is scored, timed or compared. There are no streaks.",
      "Spiritual reflection is offered only if you choose it.",
    ],
  },
];

/** Before You Begin — the one-time agreement. */
export const AGREEMENT_COPY = {
  eyebrow: "Before you begin",
  title: "A few honest things first",
  lead: "Please read this short summary. It matters more than any exercise here.",
  isPoints: [
    "An educational, reflective and spiritually sensitive companion.",
    "A place to notice, name and take one honest step at your own pace.",
  ],
  isNotPoints: [
    "Not psychotherapy, diagnosis or medical treatment.",
    "Not crisis care. This app is not monitored and cannot respond if someone is in danger.",
    "Not a replacement for a qualified professional or a safe, trusted relationship.",
  ],
  /** One calm sentence, no alarming technical language. */
  automatedProcessingSentence:
    "To create your personalized reflection, the choices you select may be processed automatically for a moment and are not read by a person.",
  safetySentence:
    "If you are ever in immediate danger, please contact local emergency services or someone nearby.",
  adultLabel: "I confirm that I am 18 years of age or older.",
  termsLabel:
    "I have had the opportunity to review, and I agree to, the Terms of Use, Privacy Notice and Important Information.",
  reviewNote:
    "You are welcome to open these, and you are not required to read them to continue.",
  beginLabel: "Begin",
} as const;
