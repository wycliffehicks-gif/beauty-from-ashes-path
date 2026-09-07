// FICTIONAL / SYNTHETIC evaluation fixtures.
//
// These are invented examples written for engineering evaluation only. They
// contain no participant information of any kind, are never read from storage,
// and are never presented in the participant journey.
//
// The runnable boundary of this harness accepts ONLY the six fixture ids below.
// No free text, no answer arrays, no source paths, no model parameters.

export const EVAL_FIXTURE_IDS = [
  "fx-day3-grief-sleep",
  "fx-day3-anger-patience",
  "fx-day3-private-uncertain",
  "fx-day5-no-pull-no-step",
  "fx-day10-spiritual-on",
  "fx-day10-spiritual-off",
] as const;

export type EvalFixtureId = (typeof EVAL_FIXTURE_IDS)[number];

export interface EvalFixture {
  id: EvalFixtureId;
  /** Always true: every fixture is invented for testing. */
  fictional: true;
  label: string;
  day: number;
  /** Stored-token form exactly as the journey records coded selections. */
  answers: string[];
  /** Whether Scripture and spiritual reflection are explicitly ON. */
  showSpiritual: boolean;
}

export const EVAL_FIXTURES: readonly EvalFixture[] = [
  {
    id: "fx-day3-grief-sleep",
    fictional: true,
    label: "FICTIONAL: Day 3 — grief, noticed in sleep",
    day: 3,
    answers: ["q.carrying:grief", "q.shows:sleep", "step:hold"],
    showSpiritual: false,
  },
  {
    id: "fx-day3-anger-patience",
    fictional: true,
    label: "FICTIONAL: Day 3 — anger, noticed in patience",
    day: 3,
    answers: ["q.carrying:anger", "q.shows:patience", "step:hold"],
    showSpiritual: false,
  },
  {
    id: "fx-day3-private-uncertain",
    fictional: true,
    label: "FICTIONAL: Day 3 — kept private, unclear where it shows",
    day: 3,
    answers: ["q.carrying:private", "q.shows:unclear"],
    showSpiritual: false,
  },
  {
    id: "fx-day5-no-pull-no-step",
    fictional: true,
    label: "FICTIONAL: Day 5 — no clear pull, no clear concern, nothing outward",
    day: 5,
    answers: ["q.forward:none", "q.holdback:none", "step:prepare"],
    showSpiritual: false,
  },
  {
    id: "fx-day10-spiritual-on",
    fictional: true,
    label: "FICTIONAL: Day 10 — faith question open, spiritual reflection ON",
    day: 10,
    answers: ["q.different:named", "q.unfinished:faith", "step:prepare"],
    showSpiritual: true,
  },
  {
    id: "fx-day10-spiritual-off",
    fictional: true,
    label: "FICTIONAL: Day 10 — same saved selection, spiritual reflection OFF",
    day: 10,
    answers: ["q.different:named", "q.unfinished:faith", "step:prepare"],
    showSpiritual: false,
  },
] as const;

export function isEvalFixtureId(value: unknown): value is EvalFixtureId {
  return typeof value === "string" && (EVAL_FIXTURE_IDS as readonly string[]).includes(value);
}

/** Fixture lookup by allowlisted id. Anything else is refused. */
export function getEvalFixture(id: unknown): EvalFixture | undefined {
  if (!isEvalFixtureId(id)) return undefined;
  return EVAL_FIXTURES.find((f) => f.id === id);
}
