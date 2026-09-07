// Pure, mock-only tests for the transport-free ten-day AI foundation.
//
// No network, no provider, no gateway, no environment access. Every scenario
// below is clearly FICTIONAL test data.

import { describe, expect, it } from "vitest";
import { FIRST_JOURNEY_DAYS } from "@/content/first-journey";
import type { JourneyDayContent, Question } from "@/content/journey-types";
import { stableAnswerId } from "@/lib/journey/answers";
import { answerKeyFor } from "@/lib/journey/reflection-engine";
import { resolvePractice } from "@/lib/journey/practice-router";
import {
  MAX_JOURNEY_ANSWER_TOKENS,
  parseJourneyRequest,
} from "@/lib/ai/journey-contract";
import { buildJourneyGrounding } from "@/lib/ai/journey-grounding";
import { prepareJourneyGeneration } from "@/lib/ai/journey-policy";

const OPEN_IDS = ["private", "unclear", "unsure", "none", "not-sure", "prefer-not-to-say"];

function firstConcrete(question: Question): string | undefined {
  return question.options.find((o) => !o.exclusive && !o.spiritualOnly)?.id;
}

/** A valid FICTIONAL answer set: one concrete choice per question plus a step. */
function fictionalAnswers(day: JourneyDayContent): string[] {
  const tokens: string[] = [];
  for (const q of day.questions) {
    const id = firstConcrete(q);
    if (id) tokens.push(stableAnswerId(answerKeyFor(day, q.id), id));
  }
  const stepId = firstConcrete(day.step);
  if (stepId) tokens.push(stableAnswerId(answerKeyFor(day, day.step.id), stepId));
  return tokens;
}

function requestFor(day: JourneyDayContent, answers: string[], spiritual: boolean) {
  return {
    day: day.day,
    answerMeaningVersion: day.answerMeaningVersion,
    answers,
    spiritual,
  };
}

function parseOrThrow(raw: unknown) {
  const result = parseJourneyRequest(raw);
  if (!result.ok) throw new Error(`unexpected failure: ${result.error}`);
  return result.request;
}

describe("ten-day contract: every canonical day", () => {
  it("covers exactly the current ten days", () => {
    expect(FIRST_JOURNEY_DAYS.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  for (const day of FIRST_JOURNEY_DAYS) {
    it(`accepts representative and empty FICTIONAL choices for day ${day.day}`, () => {
      const full = parseOrThrow(requestFor(day, fictionalAnswers(day), false));
      expect(full.day.day).toBe(day.day);
      expect(full.selections.length).toBe(day.questions.length + 1);

      const empty = parseOrThrow(requestFor(day, [], false));
      expect(empty.selections.every((s) => s.optionIds.length === 0)).toBe(true);

      const grounded = buildJourneyGrounding(empty);
      expect(grounded.selections.every((s) => s.unknown)).toBe(true);
      expect(grounded.practice.title.length).toBeGreaterThan(0);
      expect(grounded.oneHonestStep.reportedDone).toBe(false);
    });

    it(`accepts private / unclear / none choices where day ${day.day} offers them`, () => {
      for (const question of [...day.questions, day.step]) {
        for (const id of OPEN_IDS) {
          if (!question.options.some((o) => o.id === id)) continue;
          const token = stableAnswerId(answerKeyFor(day, question.id), id);
          const request = parseOrThrow(requestFor(day, [token], false));
          const selection = request.selections.find((s) => s.questionId === question.id);
          expect(selection?.optionIds).toEqual([id]);
          const grounded = buildJourneyGrounding(request);
          expect(grounded.practice.title.length).toBeGreaterThan(0);
        }
      }
    });
  }
});

describe("contract rejects invalid input without mutating anything", () => {
  const day = FIRST_JOURNEY_DAYS[0]!;

  it("rejects non-objects and arrays", () => {
    for (const raw of [null, undefined, 7, "x", [], true]) {
      expect(parseJourneyRequest(raw)).toMatchObject({ ok: false, error: "not-an-object" });
    }
  });

  it("rejects unexpected fields, including free text and identifiers", () => {
    for (const field of ["freeText", "email", "history", "storage"]) {
      const raw = { ...requestFor(day, [], false), [field]: "anything" };
      expect(parseJourneyRequest(raw)).toEqual({ ok: false, error: "unexpected-field" });
    }
  });

  it("requires a real boolean spiritual preference", () => {
    for (const value of [undefined, null, "true", 1, {}]) {
      const raw = { ...requestFor(day, [], false), spiritual: value };
      const result = parseJourneyRequest(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(["spiritual-preference-required", "missing-field"]).toContain(result.error);
      }
    }
  });

  it("rejects unknown days and outdated answer meanings", () => {
    expect(parseJourneyRequest(requestFor(day, [], false) && {
      day: 99,
      answerMeaningVersion: "v1",
      answers: [],
      spiritual: false,
    })).toMatchObject({ ok: false, error: "unknown-day" });

    expect(
      parseJourneyRequest({
        day: day.day,
        answerMeaningVersion: "v8",
        answers: [],
        spiritual: false,
      }),
    ).toMatchObject({ ok: false, error: "outdated-answer-meaning" });
  });

  it("rejects malformed and unknown tokens", () => {
    const key = answerKeyFor(day, day.questions[0]!.id);
    expect(parseJourneyRequest(requestFor(day, ["garbage"], false))).toMatchObject({
      ok: false,
      error: "malformed-token",
    });
    expect(
      parseJourneyRequest(requestFor(day, [`${key}:not-an-option`], false)),
    ).toMatchObject({ ok: false, error: "unknown-token" });
    expect(parseJourneyRequest(requestFor(day, [`${key}.999`], false))).toMatchObject({
      ok: false,
      error: "unknown-token",
    });
    expect(parseJourneyRequest(requestFor(day, [{} as never], false))).toMatchObject({
      ok: false,
      error: "answers-not-string-array",
    });
  });

  it("rejects contradictory and excess selections", () => {
    const single = [...FIRST_JOURNEY_DAYS]
      .flatMap((d) => [...d.questions, d.step].map((q) => ({ d, q })))
      .find(({ q }) => q.select === "one" && q.options.length > 1)!;
    const key = answerKeyFor(single.d, single.q.id);
    expect(
      parseJourneyRequest(
        requestFor(
          single.d,
          [
            stableAnswerId(key, single.q.options[0]!.id),
            stableAnswerId(key, single.q.options[1]!.id),
          ],
          false,
        ),
      ),
    ).toMatchObject({ ok: false, error: "single-select-violation" });

    const multi = FIRST_JOURNEY_DAYS.flatMap((d) =>
      [...d.questions, d.step].map((q) => ({ d, q })),
    ).find(
      ({ q }) =>
        q.select === "many" &&
        q.options.some((o) => o.exclusive) &&
        q.options.some((o) => !o.exclusive),
    )!;
    const mKey = answerKeyFor(multi.d, multi.q.id);
    const exclusive = multi.q.options.find((o) => o.exclusive)!;
    const other = multi.q.options.find((o) => !o.exclusive)!;
    expect(
      parseJourneyRequest(
        requestFor(
          multi.d,
          [stableAnswerId(mKey, other.id), stableAnswerId(mKey, exclusive.id)],
          false,
        ),
      ),
    ).toMatchObject({ ok: false, error: "exclusive-selection-conflict" });

    const flood = Array.from({ length: MAX_JOURNEY_ANSWER_TOKENS + 1 }, (_, i) =>
      `${mKey}:fictional-${i}`,
    );
    expect(parseJourneyRequest(requestFor(multi.d, flood, false))).toMatchObject({
      ok: false,
      error: "too-many-tokens",
    });
  });

  it("does not mutate the supplied answers array", () => {
    const answers = fictionalAnswers(day);
    const copy = [...answers];
    const request = parseOrThrow(requestFor(day, answers, false));
    buildJourneyGrounding(request);
    expect(answers).toEqual(copy);
  });
});

describe("Day 9 practice routing", () => {
  const day9 = FIRST_JOURNEY_DAYS.find((d) => d.day === 9)!;
  const route = day9.practise.route!;
  const routeKey = answerKeyFor(day9, route.from);

  it("has seven routed rehearsals", () => {
    expect(Object.keys(route.reflectionByOption)).toHaveLength(7);
  });

  it("grounds the actual routed practice for each of the seven paths", () => {
    for (const optionId of Object.keys(route.reflectionByOption)) {
      const request = parseOrThrow(
        requestFor(day9, [stableAnswerId(routeKey, optionId)], false),
      );
      const grounded = buildJourneyGrounding(request);
      const expected = resolvePractice(day9, request.answers);
      expect(grounded.practiceRoutedBy).toBe(optionId);
      expect(grounded.practice.title).toBe(expected.reflection.title);
      expect(grounded.practice.title).not.toBe(day9.practise.reflection.title);
    }
  });

  it("uses the canonical fallback for private / unclear / none and for nothing selected", () => {
    const openIds = day9.questions
      .find((q) => q.id === route.from)!
      .options.filter((o) => !Object.prototype.hasOwnProperty.call(route.reflectionByOption, o.id))
      .map((o) => o.id);
    for (const id of [...openIds, null]) {
      const answers = id ? [stableAnswerId(routeKey, id)] : [];
      const grounded = buildJourneyGrounding(parseOrThrow(requestFor(day9, answers, false)));
      expect(grounded.practiceRoutedBy).toBeNull();
      expect(grounded.practice.title).toBe(day9.practise.reflection.title);
    }
  });
});

describe("spiritual preference across days 8, 9 and 10", () => {
  const spiritualDays = FIRST_JOURNEY_DAYS.filter((d) => [8, 9, 10].includes(d.day));

  it("off / on / off leaves raw answers unchanged and withholds spiritual content when off", () => {
    for (const day of spiritualDays) {
      const spiritualChoice = [...day.questions, day.step].flatMap((q) =>
        q.options.filter((o) => o.spiritualOnly).map((o) => ({ q, o })),
      )[0];
      let answers = fictionalAnswers(day);
      if (spiritualChoice) {
        const key = answerKeyFor(day, spiritualChoice.q.id);
        // A single-select question can hold only the spiritual choice.
        if (spiritualChoice.q.select === "one") {
          answers = answers.filter((t) => !t.startsWith(`${key}:`));
        }
        answers = [...answers, stableAnswerId(key, spiritualChoice.o.id)];
      }
      const frozen = [...answers];

      for (const spiritual of [false, true, false]) {
        const request = parseOrThrow(requestFor(day, answers, spiritual));
        expect(request.answers).toEqual(frozen);
        const grounded = buildJourneyGrounding(request);
        const payload = JSON.stringify(grounded);

        if (spiritual) {
          expect(grounded.spiritualPractice).toBeDefined();
          expect(grounded.spiritualAuthorised).toBe(true);
        } else {
          expect(grounded.spiritualPractice).toBeUndefined();
          expect(grounded.spiritualAuthorised).toBe(false);
          if (spiritualChoice) {
            expect(payload).not.toContain(spiritualChoice.o.label);
          }
          const scripture = day.practise.spiritual.scripture;
          if (scripture) expect(payload).not.toContain(scripture.reference);
        }
      }
      expect(answers).toEqual(frozen);
    }
  });

  it("keeps devotional material out of the spiritual-off policy text", () => {
    const day = spiritualDays[0]!;
    const off = prepareJourneyGeneration(
      parseOrThrow(requestFor(day, fictionalAnswers(day), false)),
    );
    expect(off.policy).toContain("Scripture and spiritual reflection are OFF");
    const scripture = day.practise.spiritual.scripture;
    if (scripture) {
      expect(off.policy).not.toContain(scripture.body);
      expect(off.groundedPayload).not.toContain(scripture.body);
    }
  });
});

describe("deterministic preparation identity", () => {
  const day = FIRST_JOURNEY_DAYS.find((d) => d.day === 2)!;

  it("is stable and excluded from provider text", () => {
    const request = parseOrThrow(requestFor(day, fictionalAnswers(day), false));
    const a = prepareJourneyGeneration(request);
    const b = prepareJourneyGeneration(request);
    expect(a.identity.canonicalIdentity).toBe(b.identity.canonicalIdentity);
    expect(a.policy).not.toContain(a.identity.canonicalIdentity);
    expect(a.groundedPayload).not.toContain(a.identity.canonicalIdentity);
    expect(a.identity.policyVersion.length).toBeGreaterThan(0);
    // A prepared request has generated nothing, so it carries no provenance.
    expect("provenance" in a.identity).toBe(false);
  });

  it("changes for a materially different selection and for the spiritual preference", () => {
    const base = prepareJourneyGeneration(
      parseOrThrow(requestFor(day, fictionalAnswers(day), false)),
    );
    const spiritualOn = prepareJourneyGeneration(
      parseOrThrow(requestFor(day, fictionalAnswers(day), true)),
    );
    expect(spiritualOn.identity.canonicalIdentity).not.toBe(base.identity.canonicalIdentity);

    const question = day.questions.find((q) => q.options.length > 2)!;
    const key = answerKeyFor(day, question.id);
    const other = question.options.filter((o) => !o.spiritualOnly)[1]!;
    const changed = prepareJourneyGeneration(
      parseOrThrow(requestFor(day, [stableAnswerId(key, other.id)], false)),
    );
    expect(changed.identity.canonicalIdentity).not.toBe(base.identity.canonicalIdentity);
  });

  it("treats order-only differences as equivalent", () => {
    const multi = FIRST_JOURNEY_DAYS.flatMap((d) =>
      d.questions.map((q) => ({ d, q })),
    ).find(
      ({ q }) => q.select === "many" && q.options.filter((o) => !o.exclusive && !o.spiritualOnly).length > 1,
    )!;
    const key = answerKeyFor(multi.d, multi.q.id);
    const [first, second] = multi.q.options.filter((o) => !o.exclusive && !o.spiritualOnly);
    const forward = [stableAnswerId(key, first!.id), stableAnswerId(key, second!.id)];
    const reversed = [...forward].reverse();
    const a = prepareJourneyGeneration(
      parseOrThrow(requestFor(multi.d, forward, false)),
    );
    const b = prepareJourneyGeneration(
      parseOrThrow(requestFor(multi.d, reversed, false)),
    );
    expect(b.identity.canonicalIdentity).toBe(a.identity.canonicalIdentity);
  });
});

describe("no runtime, environment or network access", () => {
  it("the new modules contain no transport, env or provider references", async () => {
    const files = [
      "src/lib/ai/journey-contract.ts",
      "src/lib/ai/journey-grounding.ts",
      "src/lib/ai/journey-policy.ts",
    ];
    const fs = await import("node:fs/promises");
    for (const file of files) {
      const text = await fs.readFile(file, "utf8");
      for (const banned of [
        "fetch(",
        "process.env",
        "import.meta.env",
        "XMLHttpRequest",
        "localStorage",
        "sessionStorage",
        "document.",
        "window.",
        "AI_GATEWAY",
        "apiKey",
        "live-provider",
        "system-policy",
        "session-policy",
        "content/ai/",
      ]) {
        expect(text.includes(banned), `${file} must not reference ${banned}`).toBe(false);
      }
    }
  });
});

describe("errors never echo untrusted caller input", () => {
  const day = FIRST_JOURNEY_DAYS[0]!;
  const ALLOWED = ["day", "answerMeaningVersion", "answers", "spiritual"];

  function detailsOf(raw: unknown): string[] {
    const result = parseJourneyRequest(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return [];
    return result.detail === undefined ? [] : [result.detail];
  }

  it("omits adversarial private-looking field names", () => {
    const secrets = [
      "fictional-secret-note",
      "email:jane.fictional@example.com",
      "__proto__",
      "<script>alert(1)</script>",
    ];
    for (const field of secrets) {
      const raw = { ...requestFor(day, [], false), [field]: "FICTIONAL private text" };
      expect(detailsOf(raw)).toEqual([]);
      expect(JSON.stringify(parseJourneyRequest(raw))).not.toContain(field);
    }
  });

  it("omits supplied answer-meaning versions, tokens and counts", () => {
    const key = answerKeyFor(day, day.questions[0]!.id);
    const probes: Array<[unknown, string]> = [
      [{ day: day.day, answerMeaningVersion: "FICTIONAL-v-secret", answers: [], spiritual: false }, "FICTIONAL-v-secret"],
      [requestFor(day, ["fictional-token-secret"], false), "fictional-token-secret"],
      [requestFor(day, [`${key}:fictional-secret-option`], false), "fictional-secret-option"],
      [
        requestFor(
          day,
          Array.from({ length: MAX_JOURNEY_ANSWER_TOKENS + 1 }, (_, i) => `${key}:f-${i}`),
          false,
        ),
        String(MAX_JOURNEY_ANSWER_TOKENS + 1),
      ],
      [{ day: 4321, answerMeaningVersion: "x", answers: [], spiritual: false }, "4321"],
    ];
    for (const [raw, secret] of probes) {
      expect(JSON.stringify(parseJourneyRequest(raw))).not.toContain(secret);
    }
  });

  it("still validates strictly and any detail is a fixed internal identifier", () => {
    const internal = new Set<string>([
      ...ALLOWED,
      ...FIRST_JOURNEY_DAYS.flatMap((d) => [
        ...[...d.questions, d.step].map((q) => answerKeyFor(d, q.id)),
        ...[...d.questions, d.step].flatMap((q) => q.options.map((o) => o.id)),
      ]),
    ]);
    const probes: unknown[] = [
      { day: day.day, answers: [], spiritual: false },
      { ...requestFor(day, [], false), surprise: 1 },
      requestFor(day, ["garbage"], false),
    ];
    for (const raw of probes) {
      for (const detail of detailsOf(raw)) expect(internal.has(detail)).toBe(true);
    }
  });
});

describe("grounding does not over-infer meaning from option ids", () => {
  const day10 = FIRST_JOURNEY_DAYS.find((d) => d.day === 10)!;

  it("keeps Day 10 coexisting selections honest, with no invented flags", () => {
    const question = day10.questions.find((q) =>
      q.select === "many" && q.options.length > 1,
    )!;
    const key = answerKeyFor(day10, question.id);
    const chosen = question.options.filter((o) => !o.exclusive && !o.spiritualOnly).slice(0, 2);
    const request = parseOrThrow(
      requestFor(day10, chosen.map((o) => stableAnswerId(key, o.id)), false),
    );
    const grounded = buildJourneyGrounding(request);
    const selection = grounded.selections.find((s) => s.questionId === question.id)!;
    for (const option of chosen) expect(selection.labels).toContain(option.label);
    expect(selection.unknown).toBe(false);
    expect(Object.keys(selection).sort()).toEqual(["labels", "prompt", "questionId", "unknown"]);
  });

  it("marks unknown only when nothing presentable was selected", () => {
    const grounded = buildJourneyGrounding(parseOrThrow(requestFor(day10, [], false)));
    expect(grounded.selections.every((s) => s.unknown && s.labels.length === 0)).toBe(true);
  });

  it("carries privacy and uncertainty through authored labels alone", () => {
    for (const day of FIRST_JOURNEY_DAYS) {
      for (const question of day.questions) {
        for (const option of question.options) {
          if (!OPEN_IDS.includes(option.id) || option.spiritualOnly) continue;
          const token = stableAnswerId(answerKeyFor(day, question.id), option.id);
          const grounded = buildJourneyGrounding(
            parseOrThrow(requestFor(day, [token], false)),
          );
          const selection = grounded.selections.find((s) => s.questionId === question.id)!;
          expect(selection.labels).toEqual([option.label]);
          expect(selection.unknown).toBe(false);
        }
      }
    }
  });
});

describe("preparation identity covers the whole outgoing meaning", () => {
  const day = FIRST_JOURNEY_DAYS.find((d) => d.day === 3)!;

  /**
   * The contract resolves the day from canonical content, so a FICTIONAL edited
   * copy is supplied to preparation directly, leaving canonical content intact.
   */
  function identityFor(source: JourneyDayContent, spiritual = false): string {
    const parsed = parseOrThrow(requestFor(day, fictionalAnswers(source), spiritual));
    return prepareJourneyGeneration({ ...parsed, day: source }).identity.canonicalIdentity;
  }

  /** A FICTIONAL edited copy of a real day; canonical content is never mutated. */
  function edited(mutate: (copy: JourneyDayContent) => JourneyDayContent): JourneyDayContent {
    return mutate(structuredClone(day) as JourneyDayContent);
  }

  const variants: Array<[string, JourneyDayContent]> = [
    ["teaching", edited((d) => {
      d.understand.body = [...d.understand.body, "FICTIONAL added teaching line."];
      return d;
    })],
    ["teaching order", edited((d) => {
      d.understand.body = [...d.understand.body].reverse();
      return d;
    })],
    ["purpose", edited((d) => {
      d.arrive.purpose = "FICTIONAL purpose.";
      return d;
    })],
    ["title", edited((d) => {
      d.title = "FICTIONAL title";
      return d;
    })],
    ["theme", edited((d) => {
      d.theme = "FICTIONAL theme";
      return d;
    })],
    ["question wording", edited((d) => {
      d.questions[0]!.prompt = "FICTIONAL prompt wording?";
      return d;
    })],
    ["practice summary", edited((d) => {
      d.practise.reflection.summary = "FICTIONAL practice summary.";
      return d;
    })],
    ["practice step order", edited((d) => {
      d.practise.reflection.steps = [...d.practise.reflection.steps].reverse();
      return d;
    })],
  ];

  it("invalidates identity when supplied source material changes", () => {
    const base = identityFor(day);
    for (const [label, variant] of variants) {
      expect(identityFor(variant), label).not.toBe(base);
    }
  });

  it("invalidates identity when an authorised Scripture changes", () => {
    const spiritualDay = FIRST_JOURNEY_DAYS.find((d) => d.practise.spiritual.scripture)!;
    const parsed = parseOrThrow(
      requestFor(spiritualDay, fictionalAnswers(spiritualDay), true),
    );
    const base = prepareJourneyGeneration(parsed).identity.canonicalIdentity;
    const copy = structuredClone(spiritualDay) as JourneyDayContent;
    copy.practise.spiritual.scripture!.body = "FICTIONAL passage text.";
    const changed = prepareJourneyGeneration({ ...parsed, day: copy }).identity
      .canonicalIdentity;
    expect(changed).not.toBe(base);
  });

  it("invalidates identity when the actual policy text differs", () => {
    const off = prepareJourneyGeneration(
      parseOrThrow(requestFor(day, fictionalAnswers(day), false)),
    );
    expect(off.identity.canonicalIdentity).toContain("Scripture and spiritual reflection are OFF");
    expect(off.identity.canonicalIdentity).not.toBe(identityFor(day, true));
  });

  it("keeps order-only answer permutations equivalent", () => {
    const multi = FIRST_JOURNEY_DAYS.flatMap((d) => d.questions.map((q) => ({ d, q }))).find(
      ({ q }) =>
        q.select === "many" &&
        q.options.filter((o) => !o.exclusive && !o.spiritualOnly).length > 1,
    )!;
    const key = answerKeyFor(multi.d, multi.q.id);
    const [a, b] = multi.q.options.filter((o) => !o.exclusive && !o.spiritualOnly);
    const forward = [stableAnswerId(key, a!.id), stableAnswerId(key, b!.id)];
    const one = prepareJourneyGeneration(parseOrThrow(requestFor(multi.d, forward, false)));
    const two = prepareJourneyGeneration(
      parseOrThrow(requestFor(multi.d, [...forward].reverse(), false)),
    );
    expect(two.identity.canonicalIdentity).toBe(one.identity.canonicalIdentity);
  });
});
