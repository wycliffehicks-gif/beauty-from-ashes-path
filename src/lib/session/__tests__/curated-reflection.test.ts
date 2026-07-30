import { describe, expect, it } from "vitest";
import {
  SESSION_W1_CONTENT_PACK,
  SESSION_W1_VALID_IDS,
  SESSION_SECTION_ORDER,
} from "@/content/ai/session-week-01";
import {
  buildCuratedReflection,
  reflectionWordCount,
  selectCostId,
  selectHearingId,
  selectHoldingId,
  selectProtectionId,
  selectPullsId,
  toSections,
  type CuratedSelectionInput,
} from "@/lib/session/curated-reflection";
import { validateSessionReflection } from "@/lib/session/session-validator";

const base: CuratedSelectionInput = {
  naming: [],
  exploration: [],
  meaning: [],
  noticing: [],
};

const withInput = (p: Partial<CuratedSelectionInput>): CuratedSelectionInput => ({
  ...base,
  ...p,
});

describe("session content pack", () => {
  it("has unique ids within every section", () => {
    const lists = [
      SESSION_W1_CONTENT_PACK.hearing,
      SESSION_W1_CONTENT_PACK.pulls,
      SESSION_W1_CONTENT_PACK.protection,
      SESSION_W1_CONTENT_PACK.cost,
      SESSION_W1_CONTENT_PACK.holding,
      SESSION_W1_CONTENT_PACK.supportReminders,
    ];
    for (const list of lists) {
      expect(new Set(list.map((i) => i.id)).size).toBe(list.length);
    }
  });

  it("offers several variants per section so patterns do not all sound alike", () => {
    expect(SESSION_W1_CONTENT_PACK.hearing.length).toBeGreaterThanOrEqual(5);
    expect(SESSION_W1_CONTENT_PACK.pulls.length).toBeGreaterThanOrEqual(4);
    expect(SESSION_W1_CONTENT_PACK.protection.length).toBeGreaterThanOrEqual(4);
    expect(SESSION_W1_CONTENT_PACK.cost.length).toBeGreaterThanOrEqual(5);
    expect(SESSION_W1_CONTENT_PACK.holding.length).toBeGreaterThanOrEqual(4);
  });

  it("contains no crisis phone numbers and no spiritual content", () => {
    const all = [
      ...SESSION_W1_CONTENT_PACK.hearing,
      ...SESSION_W1_CONTENT_PACK.pulls,
      ...SESSION_W1_CONTENT_PACK.protection,
      ...SESSION_W1_CONTENT_PACK.cost,
      ...SESSION_W1_CONTENT_PACK.holding,
      ...SESSION_W1_CONTENT_PACK.supportReminders,
    ]
      .map((i) => i.text)
      .join(" ");
    expect(all).not.toMatch(/\d{3}[-.\s]?\d{3,4}/);
    expect(all).not.toMatch(/\b(god|jesus|scripture|bible|pray|psalm)\b/i);
  });

  it("never uses directive or diagnostic language", () => {
    const all = [
      ...SESSION_W1_CONTENT_PACK.hearing,
      ...SESSION_W1_CONTENT_PACK.pulls,
      ...SESSION_W1_CONTENT_PACK.protection,
      ...SESSION_W1_CONTENT_PACK.cost,
      ...SESSION_W1_CONTENT_PACK.holding,
      ...SESSION_W1_CONTENT_PACK.supportReminders,
    ]
      .map((i) => i.text.toLowerCase())
      .join(" ");
    for (const phrase of SESSION_W1_CONTENT_PACK.prohibitedClaims) {
      expect(all.includes(phrase.toLowerCase())).toBe(false);
    }
  });

  it("declares the six sections in the required order", () => {
    expect([...SESSION_SECTION_ORDER]).toEqual([
      "hearing",
      "pulls",
      "protection",
      "cost",
      "holding",
      "support",
    ]);
  });
});

describe("curated selection", () => {
  it("routes private naming to the private hearing variant", () => {
    expect(selectHearingId(withInput({ naming: ["private"] }))).toBe("hearing-private");
  });

  it("honours a group-scoped prefer-not answer", () => {
    expect(selectHearingId(withInput({ exploration: ["pb-prefer-not"] }))).toBe(
      "hearing-private",
    );
  });

  it("recognises numb from noticing or exploration without pretending to feel-knowledge", () => {
    expect(selectHearingId(withInput({ noticing: ["numb"] }))).toBe("hearing-numb");
    expect(selectHearingId(withInput({ exploration: ["pr-numb"] }))).toBe("hearing-numb");
  });

  it("maps naming categories to distinct hearing variants", () => {
    expect(selectHearingId(withInput({ naming: ["grief"] }))).toBe("hearing-grief");
    expect(selectHearingId(withInput({ naming: ["relationship"] }))).toBe("hearing-relational");
    expect(selectHearingId(withInput({ naming: ["decision"] }))).toBe("hearing-decision");
    expect(selectHearingId(withInput({ naming: ["truth-self"] }))).toBe("hearing-self");
    expect(selectHearingId(base)).toBe("hearing-general");
  });

  it("names both pulls only when both were actually chosen", () => {
    expect(selectPullsId(withInput({ exploration: ["pf-truth", "pb-conflict"] }))).toBe(
      "pulls-both",
    );
    expect(selectPullsId(withInput({ exploration: ["pf-truth"] }))).toBe("pulls-forward");
    expect(selectPullsId(withInput({ exploration: ["pb-conflict"] }))).toBe("pulls-back");
    expect(selectPullsId(base)).toBe("pulls-unclear");
  });

  it("treats a low-pressure answer as an answer, not as a substantive pull", () => {
    expect(selectPullsId(withInput({ exploration: ["pf-unsure"] }))).toBe("pulls-unclear");
    expect(selectPullsId(withInput({ exploration: ["pb-mixed"] }))).toBe("pulls-mixed");
  });

  it("maps protector selections to their protection variant", () => {
    expect(selectProtectionId(withInput({ exploration: ["pr-silence"] }))).toBe(
      "protection-quiet",
    );
    expect(selectProtectionId(withInput({ exploration: ["pr-busy"] }))).toBe(
      "protection-effort",
    );
    expect(selectProtectionId(withInput({ exploration: ["pr-humour"] }))).toBe(
      "protection-expression",
    );
    expect(selectProtectionId(withInput({ exploration: ["pr-postponing"] }))).toBe(
      "protection-timing",
    );
    expect(selectProtectionId(base)).toBe("protection-unnamed");
  });

  it("never manufactures a present cost that was not chosen", () => {
    expect(selectCostId(base)).toBe("cost-not-yet");
    expect(selectCostId(withInput({ meaning: ["cost-none-yet"] }))).toBe("cost-not-yet");
    expect(selectCostId(withInput({ meaning: ["fn-still-necessary"] }))).toBe("cost-not-yet");
    expect(selectCostId(withInput({ meaning: ["cost-grief"] }))).toBe("cost-grief");
    expect(selectCostId(withInput({ meaning: ["cost-body"] }))).toBe("cost-body");
  });

  it("holds 'still necessary' without asking the person to condemn it", () => {
    expect(selectHoldingId(withInput({ meaning: ["fn-still-necessary"] }))).toBe(
      "holding-not-yet",
    );
    expect(selectHoldingId(withInput({ meaning: ["fn-accepted"] }))).toBe(
      "holding-companioned",
    );
  });
});

describe("curated reflection assembly", () => {
  const scenarios: Array<[string, CuratedSelectionInput]> = [
    ["empty / skipped everything", base],
    [
      "grief with both pulls and silence",
      withInput({
        naming: ["grief"],
        exploration: ["pf-relief", "pb-grief-real", "pr-silence"],
        meaning: ["fn-feel-less", "cost-grief"],
      }),
    ],
    [
      "relational, protector effort, relational cost",
      withInput({
        naming: ["relationship", "boundary"],
        exploration: ["pf-connection", "pb-rejection", "pr-pleasing"],
        meaning: ["fn-accepted", "cost-relationships"],
      }),
    ],
    [
      "private and unsure throughout",
      withInput({
        naming: ["private"],
        exploration: ["pf-unsure", "pb-prefer-not", "pr-unsure"],
        meaning: ["fn-unknown", "cost-unsure"],
      }),
    ],
    [
      "numb and low arousal",
      withInput({
        noticing: ["numb"],
        exploration: ["pr-numbing"],
        meaning: ["fn-functioning", "cost-body"],
      }),
    ],
    [
      "still necessary",
      withInput({
        naming: ["truth-self"],
        exploration: ["pr-postponing"],
        meaning: ["fn-still-necessary", "cost-none-yet"],
      }),
    ],
    [
      "decision, mixed",
      withInput({
        naming: ["decision"],
        exploration: ["pf-freedom", "pb-mixed", "pr-overthinking"],
        meaning: ["fn-control", "cost-choice"],
      }),
    ],
  ];

  it.each(scenarios)("%s produces a valid six-section reflection", (_name, input) => {
    const output = buildCuratedReflection(input);
    const sections = toSections(output);

    expect(sections.map((s) => s.key)).toEqual([
      "hearing",
      "pulls",
      "protection",
      "cost",
      "holding",
      "support",
    ]);
    expect(sections.map((s) => s.heading)).toEqual([
      "What I’m hearing",
      "The two pulls that may be present",
      "What this may have protected",
      "What it may be costing now",
      "A more compassionate way to hold it",
      "When more support may help",
    ]);

    // Every id came from the approved pack.
    expect(SESSION_W1_VALID_IDS.hearing.has(output.hearing.id)).toBe(true);
    expect(SESSION_W1_VALID_IDS.pulls.has(output.pulls.id)).toBe(true);
    expect(SESSION_W1_VALID_IDS.protection.has(output.protection.id)).toBe(true);
    expect(SESSION_W1_VALID_IDS.cost.has(output.cost.id)).toBe(true);
    expect(SESSION_W1_VALID_IDS.holding.has(output.holding.id)).toBe(true);
    expect(SESSION_W1_VALID_IDS.support.has(output.support!.id)).toBe(true);

    // Passes the same validator the AI route must pass.
    expect(validateSessionReflection(output)).toEqual({ ok: true });

    // In the required length band.
    const wc = reflectionWordCount(output);
    expect(wc).toBeGreaterThanOrEqual(250);
    expect(wc).toBeLessThanOrEqual(420);

    // Tentative, never certain.
    expect(output.hearing.text).toMatch(/\b(may|might|perhaps|it sounds like|it seems)\b/i);
  });

  it("is deterministic — the same selections always produce the same reflection", () => {
    const input = scenarios[1][1];
    expect(buildCuratedReflection(input)).toEqual(buildCuratedReflection(input));
  });

  it("produces different reflections for different patterns", () => {
    const a = buildCuratedReflection(scenarios[1][1]);
    const b = buildCuratedReflection(scenarios[2][1]);
    expect(a).not.toEqual(b);
  });

  it("never uses the optional note content to select anything", () => {
    const withNote = buildCuratedReflection(withInput({ naming: ["grief"], hasNote: true }));
    const withoutNote = buildCuratedReflection(withInput({ naming: ["grief"] }));
    expect(withNote).toEqual(withoutNote);
  });
});
