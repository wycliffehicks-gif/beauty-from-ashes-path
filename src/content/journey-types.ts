// Beauty from Ashes: The First Journey — content model.
//
// One data-driven shape describes every day. The flow route renders it; no day
// content is hard-coded in components. Copy here is PROVISIONAL and awaits
// founder content review.
//
// Rules encoded by this model (governing project knowledge):
//  - every day has its own unique questions, both practice pathways, One
//    Honest Step, a personalized reflection and a meaningful close;
//  - no routine exit controls (no skip / not-today / close-for-today);
//  - answers are stored as structured low-sensitivity IDs only;
//  - Christian material is always a separate, equal, explicitly chosen path.

/** A compact plain-language explanation opened in place, without leaving the screen. */
export interface InfoNote {
  term: string;
  explanation: string;
}

export interface Choice {
  /** Stable, safe id used for structured storage and reflection lookup. */
  id: string;
  label: string;
  /** Optional one-line clarification under the label. */
  note?: string;
  /**
   * Multi-select only: this choice cannot honestly co-exist with the others
   * (for example "Nothing much registers right now").
   */
  exclusive?: boolean;
}

export interface Question {
  /** Safe id, also the storage step key, e.g. "state". */
  id: string;
  eyebrow: string;
  prompt: string;
  hint?: string;
  select: "one" | "many";
  options: Choice[];
  info?: InfoNote[];
  /**
   * Short interpretation shown on its own screen after the choice.
   * Keyed by option id, with a substantive fallback when nothing was chosen.
   */
  echo?: {
    heading: string;
    byOption: Record<string, string>;
    unanswered: string;
    closing?: string;
  };
}

export interface PracticePath {
  title: string;
  /** Why this practice, in one or two sentences. */
  summary: string;
  /** Step-by-step guidance. Never assume the person has done this before. */
  steps: string[];
  /** Named explicitly so nothing feels compulsory. */
  notRequired: string;
  /** Christian path only. Public-domain World English Bible. */
  scripture?: {
    reference: string;
    body: string;
    note: string;
  };
}

export type ReflectionSectionId =
  | "hearing"
  | "underneath"
  | "protected"
  | "care"
  | "next";

export interface ReflectionSection {
  id: ReflectionSectionId;
  title: string;
  /** Always-included framing sentence for this section. */
  opening?: string;
  /** Question id whose selections drive the personalized lines. */
  from?: string;
  /** Option id → one tentative sentence. */
  lines?: Record<string, string>;
  /** Used when the person continued without answering that question. */
  unanswered: string;
}

/**
 * Answer SEMANTICS identity for one day.
 *
 * This names what a day's coded selections MEAN, nothing else. It is bumped
 * ONLY when a question, an option set or an option's meaning changes such that
 * an older stored selection would no longer say what the person said. It is
 * deliberately NOT bumped for ordinary copy edits, and it carries no screen,
 * order, ID or storage implication of its own.
 *
 * Bounded to eight versions, matching the per-day bound in the progress store.
 */
export type AnswerMeaningVersion =
  | "v1"
  | "v2"
  | "v3"
  | "v4"
  | "v5"
  | "v6"
  | "v7"
  | "v8";

export interface JourneyDayContent {
  day: number;
  /** Meaning of this day's coded answers. See AnswerMeaningVersion. */
  answerMeaningVersion: AnswerMeaningVersion;
  title: string;
  theme: string;
  /** Which line-art motif accompanies this day. */
  motif: MotifKey;
  /** Screen-order variant, so ten days do not feel copied and pasted. */
  shape: FlowShape;
  /** Honest short descriptor for the journey home. */
  descriptor: string;

  arrive: {
    /**
     * Required plain-language reason this day exists, shown on Arrive under
     * "Why this day matters" before any settling invitation. Therapeutic copy.
     */
    purpose: string;
    lead: string;
    body: string[];
    /** A grounded first movement — more than "take a breath". */
    settle?: string[];
  };
  understand: {
    heading: string;
    body: string[];
    info?: InfoNote[];
    /** Optional phase label for this screen, replacing the default "Understand". */
    label?: string;
  };
  questions: Question[];
  practise: {
    heading: string;
    intro: string;
    /** Makes "either or both" explicit. */
    either: string;
    reflection: PracticePath;
    spiritual: PracticePath;
  };
  /** One Honest Step, gathered as a structured choice. */
  step: Question;
  reflection: {
    intro: string;
    sections: ReflectionSection[];
    closing: string;
  };
  close: {
    heading: string;
    body: string[];
    carryForward: string;
  };
}

export type MotifKey =
  | "threshold"
  | "attention"
  | "naming"
  | "shelter"
  | "two-pulls"
  | "cost"
  | "compassion"
  | "reconnect"
  | "practise"
  | "carry";

export type FlowShape = "standard" | "notice-first" | "practise-mid";

export type ScreenKey =
  | { kind: "arrive" }
  | { kind: "understand" }
  | { kind: "question"; questionId: string }
  | { kind: "echo"; questionId: string }
  | { kind: "practise" }
  | { kind: "step" }
  | { kind: "reflection" }
  | { kind: "close" };

/** Stable storage/step key for a screen. */
export function screenKey(screen: ScreenKey): string {
  switch (screen.kind) {
    case "question":
      return `q.${screen.questionId}`;
    case "echo":
      return `e.${screen.questionId}`;
    default:
      return screen.kind;
  }
}

/** Short label for the quiet header, e.g. "Day 4 · Notice". */
export function screenLabel(day: JourneyDayContent, screen: ScreenKey): string {
  switch (screen.kind) {
    case "arrive":
      return "Arrive";
    case "understand":
      return day.understand.label ?? "Understand";
    case "question": {
      const q = day.questions.find((x) => x.id === screen.questionId);
      return q?.eyebrow ?? "Notice";
    }
    case "echo":
      return "Explore";
    case "practise":
      return "Practise";
    case "step":
      return "One Honest Step";
    case "reflection":
      return "Your Reflection";
    case "close":
      return "Carry Forward";
  }
}

/**
 * Build the screen order for a day. An Explore screen follows any question
 * that carries an echo, so the person's choice is met with something.
 */
export function screensFor(day: JourneyDayContent): ScreenKey[] {
  const q = (index: number): ScreenKey[] => {
    const question = day.questions[index];
    if (!question) return [];
    const out: ScreenKey[] = [{ kind: "question", questionId: question.id }];
    if (question.echo) out.push({ kind: "echo", questionId: question.id });
    return out;
  };
  const rest = day.questions.slice(2).flatMap((_, idx) => q(idx + 2));
  const tail: ScreenKey[] = [
    { kind: "step" },
    { kind: "reflection" },
    { kind: "close" },
  ];

  if (day.shape === "notice-first") {
    return [
      { kind: "arrive" },
      ...q(0),
      { kind: "understand" },
      ...q(1),
      ...rest,
      { kind: "practise" },
      ...tail,
    ];
  }
  if (day.shape === "practise-mid") {
    return [
      { kind: "arrive" },
      { kind: "understand" },
      ...q(0),
      { kind: "practise" },
      ...q(1),
      ...rest,
      ...tail,
    ];
  }
  return [
    { kind: "arrive" },
    { kind: "understand" },
    ...q(0),
    ...q(1),
    ...rest,
    { kind: "practise" },
    ...tail,
  ];
}
