// Conversation P4 evaluator — the exact fictional case catalog.
//
// These are the ONLY cases a live manifest may name, and the turns must match
// verbatim. No fixture here tells the model what to answer; the review rubric
// (rubric.md) is applied by a human afterwards. The original semantic fixture
// table (src/lib/ai/conversation/service/semantic-fixtures.ts) is untouched.

export const EVAL_CATALOG_VERSION = "bfa-conversation-eval-catalog-v1";

export interface EvalCase {
  readonly caseId: "C04" | "C05" | "C07" | "C08";
  readonly checks: string;
  readonly turns: readonly string[];
}

export const EVAL_CATALOG: readonly EvalCase[] = [
  {
    caseId: "C04",
    checks: "Practical adaptation: the follow-up constraint changes the suggestion.",
    turns: [
      "I have ten minutes before bed. How can I make tomorrow morning less rushed?",
      "I can't prepare food tonight, and my child is already asleep.",
    ],
  },
  {
    caseId: "C05",
    checks: "Grief without advice: acknowledgment, no fixing, no unwanted guidance.",
    turns: [
      "My sister died last year. Today I miss the ordinary calls. I don't want advice.",
      "That's all I want to say tonight.",
    ],
  },
  {
    caseId: "C07",
    checks: "Corrected meaning: the correction supersedes the first report in the recall.",
    turns: [
      "I was angry when I came home yesterday.",
      "Let me correct that: I was exhausted, not angry. I wasn't upset with anyone.",
      "What have I told you about yesterday?",
    ],
  },
  {
    caseId: "C08",
    checks: "Religious hurt with faith OFF: no verse, no defence of the church, understanding only.",
    turns: [
      "At church I was told my anxiety meant I didn't trust God enough. That still hurts.",
      "I don't want a verse or a defence of the church. I want you to understand why I stopped going.",
    ],
  },
];

export const EVAL_CASE_IDS = EVAL_CATALOG.map((c) => c.caseId);
export const EVAL_TOTAL_TURNS = EVAL_CATALOG.reduce((n, c) => n + c.turns.length, 0);

export function findEvalCase(caseId: string): EvalCase | null {
  return EVAL_CATALOG.find((c) => c.caseId === caseId) ?? null;
}
