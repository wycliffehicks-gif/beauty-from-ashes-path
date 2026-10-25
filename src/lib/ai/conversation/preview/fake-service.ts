// Conversation preview — deterministic fictional response adapter.
//
// This is NOT an AI service. It produces canned fictional replies so the
// conversation screens can be reviewed without any provider, model, network
// or microphone connection. A canned reply is never evidence that a model
// understood a freeform question, and the default reply says so plainly.
//
// No retries, no fallbacks, no provider selection. Failure is simulated only
// when the review controls explicitly request it.

export interface FictionalReplyRequest {
  readonly message: string;
  readonly spiritualOn: boolean;
}

interface CannedExchange {
  readonly match: RegExp;
  readonly reply: string;
  readonly spiritualReply?: string;
}

// A small deterministic table, keyed by recognizable fictional prompts. These
// exist so reviewers can walk the accepted example paths; they are illustrative
// wording, not approved response policy or tested model output.
const CANNED: readonly CannedExchange[] = [
  {
    match: /don'?t know where to begin|where to start/i,
    reply:
      "You don't have to know where to begin. We can stay with not knowing for a moment — is there anything at all on your mind today, even something small?",
  },
  {
    match: /inbox|work tomorrow/i,
    reply:
      "Start by checking for messages with a real deadline tomorrow. Choose one to address first; if none are urgent, begin with one manageable reply.",
  },
  {
    match: /miss (my )?mum|miss (my )?mom|grief|died/i,
    reply:
      "You miss her. We can give that room here, without turning it into a task.",
  },
  {
    match: /regret|graduation/i,
    reply:
      "You wanted to be there, and you missed something that mattered. Regret on its own doesn't establish fault.",
  },
  {
    match: /church|god|faith|depression means/i,
    reply:
      "That comment put a judgment about your faith onto something painful. We can stay with the hurt of feeling judged.",
    spiritualReply:
      "That comment put a judgment about your faith onto something painful. Being judged like that is not a measure of your trust in God.",
  },
  {
    match: /prayer/i,
    reply:
      "Your ongoing setting has Christian reflection off, so I won't compose a prayer in this fictional preview. In the finished experience, an explicit request like this would be honored for that reply only.",
    spiritualReply:
      "God, I bring this unfinished day to you. Meet me with compassion in what is difficult, and help me rest without having to resolve it all tonight. Amen.",
  },
];

/**
 * The honest default: this preview cannot actually understand arbitrary
 * freeform input, and it says so rather than pretending.
 */
export const FICTIONAL_FALLBACK_REPLY =
  "This is a fictional preview response, not an AI answer. The finished service would respond to what you actually wrote; this preview only demonstrates the screens, controls and saving behavior around it.";

/** Deterministic fictional reply for a message. Pure; no I/O. */
export function fictionalReply(request: FictionalReplyRequest): string {
  for (const entry of CANNED) {
    if (entry.match.test(request.message)) {
      if (request.spiritualOn && entry.spiritualReply) return entry.spiritualReply;
      return entry.reply;
    }
  }
  return FICTIONAL_FALLBACK_REPLY;
}
