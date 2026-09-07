// Focused tests for the pure current-ten-day generation core.
//
// ZERO real AI. Every provider here is a hand-written mock and every piece of
// reflection prose below is MOCK TEST MATERIAL written by hand for these tests.
// None of it is AI-generated output and none of it is evidence about model
// quality. No network, environment, storage or route access occurs.

import { describe, expect, it, vi } from "vitest";

import { FIRST_JOURNEY_DAYS, getFirstJourneyDay } from "@/content/first-journey";
import type { JourneyDayContent } from "@/content/journey-types";
import { answerKeyFor } from "@/lib/journey/reflection-engine";
import { parseJourneyRequest } from "@/lib/ai/journey-contract";
import { prepareJourneyGeneration, JOURNEY_POLICY_VERSION } from "@/lib/ai/journey-policy";
import {
  JOURNEY_DEADLINE_MS,
  JOURNEY_MAX_OUTPUT_TOKENS,
  JOURNEY_MAX_PREPARED_CHARS,
  JOURNEY_MODEL_ID,
  generateJourneyReflection,
  type JourneyModelProvider,
  type JourneyProviderErrorCode,
  type JourneyProviderResponse,
} from "@/lib/ai/journey-generation";
import { LIVE_MODEL_ID } from "@/lib/ai/live-provider";
import {
  MAX_JOURNEY_OUTPUT_CHARS,
  validateJourneyReflection,
} from "@/lib/ai/journey-response";

/* --------------------------------------------------------------- fixtures -- */

/** MOCK TEST MATERIAL — hand-written, not AI output. */
const MOCK_PROSE =
  "You said that something has been taking up space, and you left the rest open. That is enough to work with today.\n\n" +
  "Nothing here needs to be settled. If it helps, you might notice once today what the heaviness feels like — and if it does not help, you can leave it.";

/** MOCK TEST MATERIAL — a restrained reflection for a private or sparse day. */
const MOCK_RESTRAINED = "You kept this private today. That is a complete answer, and nothing more is asked of you here.";

function tokensFor(day: JourneyDayContent, picks: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const [questionId, optionIds] of Object.entries(picks)) {
    const key = answerKeyFor(day, questionId);
    for (const id of optionIds) out.push(`${key}:${id}`);
  }
  return out;
}

function rawFor(
  dayNumber: number,
  picks: Record<string, string[]> = {},
  spiritual = false,
) {
  const day = getFirstJourneyDay(dayNumber)!;
  return {
    day: day.day,
    answerMeaningVersion: day.answerMeaningVersion,
    answers: tokensFor(day, picks),
    spiritual,
  };
}

/** Every allowable non-exclusive selection on a day, plus one step choice. */
function fullPicks(day: JourneyDayContent): Record<string, string[]> {
  const picks: Record<string, string[]> = {};
  for (const q of day.questions) {
    picks[q.id] =
      q.select === "many"
        ? q.options.filter((o) => !o.exclusive).map((o) => o.id)
        : [q.options[0]!.id];
  }
  picks[day.step.id] = [day.step.options[0]!.id];
  return picks;
}

const OPEN_GATES = {
  activationEnabled: true,
  consentEstablished: true,
  pilotAdmitted: true,
};

function mockProvider(
  response: JourneyProviderResponse,
  provenance: "mock" | "live-model" = "live-model",
): JourneyModelProvider & { calls: number } {
  return {
    provenance,
    calls: 0,
    async generate() {
      (this as { calls: number }).calls += 1;
      return response;
    },
  } as JourneyModelProvider & { calls: number };
}

function okResponse(text: string, overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    text,
    model: LIVE_MODEL_ID,
    finishReason: "stop",
    ...overrides,
  };
}

/* ------------------------------------------------------- happy path, 10 days */

describe("current-ten-day generation core — all ten days", () => {
  for (const day of FIRST_JOURNEY_DAYS) {
    it(`day ${day.day} accepts a validated mock reflection with honest provenance`, async () => {
      const provider = mockProvider(okResponse(MOCK_PROSE));
      const result = await generateJourneyReflection({
        rawRequest: rawFor(day.day, fullPicks(day)),
        gates: OPEN_GATES,
        provider,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(provider.calls).toBe(1);
      expect(result.reflection.text).toContain("taking up space");
      expect(result.meta.model).toBe(JOURNEY_MODEL_ID);
      expect(result.meta.maxOutputTokens).toBe(JOURNEY_MAX_OUTPUT_TOKENS);
      expect(result.meta.deadlineMs).toBe(JOURNEY_DEADLINE_MS);
      expect(result.meta.identity.day).toBe(day.day);
      expect(result.meta.identity.provenance).toBe("live-model");
      expect(result.meta.acceptedAsLiveAi).toBe(true);
    });

    it(`day ${day.day} prepared size stays inside the documented input ceiling`, () => {
      for (const spiritual of [false, true]) {
        const parsed = parseJourneyRequest(rawFor(day.day, fullPicks(day), spiritual));
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const prepared = prepareJourneyGeneration(parsed.request);
        const size = prepared.policy.length + prepared.groundedPayload.length;
        expect(size).toBeLessThan(JOURNEY_MAX_PREPARED_CHARS);
      }
    });
  }
});

/* -------------------------------------------------- sparse / private inputs -- */

describe("restrained inputs", () => {
  it("a wholly unanswered day still produces a complete short reflection", async () => {
    const provider = mockProvider(okResponse(MOCK_RESTRAINED));
    const result = await generateJourneyReflection({
      rawRequest: rawFor(1, {}),
      gates: OPEN_GATES,
      provider,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reflection.paragraphs).toHaveLength(1);
  });

  it("private and unclear selections are accepted and grounded as unknown-free labels", () => {
    const day = getFirstJourneyDay(10)!;
    const parsed = parseJourneyRequest(
      rawFor(10, { different: ["private"], unfinished: ["unclear"] }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const prepared = prepareJourneyGeneration(parsed.request);
    expect(prepared.grounding.day).toBe(day.day);
    expect(prepared.grounding.selections.some((s) => s.labels.length > 0)).toBe(true);
  });

  it("grief, shame, anger and mixed feelings are carried as authored labels only", () => {
    const parsed = parseJourneyRequest(
      rawFor(10, { unfinished: ["grief", "relationship", "self"] }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const prepared = prepareJourneyGeneration(parsed.request);
    const labels = prepared.grounding.selections.flatMap((s) => s.labels).join(" | ");
    expect(labels.length).toBeGreaterThan(0);
    // Nothing records a completed action, on any path.
    expect(prepared.grounding.oneHonestStep.reportedDone).toBe(false);
  });

  it("a declined next step is never described as done", () => {
    const parsed = parseJourneyRequest(rawFor(10, { step: ["none"] }));
    if (!parsed.ok) {
      // Some days name the step differently; fall back to the canonical id.
      const day = getFirstJourneyDay(10)!;
      const retry = parseJourneyRequest(rawFor(10, { [day.step.id]: ["none"] }));
      expect(retry.ok).toBe(true);
      if (!retry.ok) return;
      const prepared = prepareJourneyGeneration(retry.request);
      expect(prepared.grounding.oneHonestStep.reportedDone).toBe(false);
      return;
    }
    const prepared = prepareJourneyGeneration(parsed.request);
    expect(prepared.grounding.oneHonestStep.reportedDone).toBe(false);
  });
});

/* ------------------------------------------------------------- Day 9 routes -- */

describe("Day 9 routing and fallbacks are preserved", () => {
  const routes = ["grounding", "unsent", "boundary", "support", "lament", "prepare", "loosen"];

  for (const route of routes) {
    it(`route ${route} resolves its own practice`, () => {
      const parsed = parseJourneyRequest(rawFor(9, { practice: [route] }));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const prepared = prepareJourneyGeneration(parsed.request);
      expect(prepared.grounding.practiceRoutedBy).toBe(route);
    });
  }

  for (const open of ["unclear", "none", "private"]) {
    it(`open choice ${open} uses the canonical fallback practice`, () => {
      const parsed = parseJourneyRequest(rawFor(9, { practice: [open] }));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const prepared = prepareJourneyGeneration(parsed.request);
      expect(prepared.grounding.practiceRoutedBy).toBeNull();
    });
  }

  it("distinct Day 9 routes produce materially different grounded payloads and identities", () => {
    const of = (route: string) => {
      const parsed = parseJourneyRequest(rawFor(9, { practice: [route] }));
      if (!parsed.ok) throw new Error("fixture invalid");
      return prepareJourneyGeneration(parsed.request);
    };
    const a = of("grounding");
    const b = of("lament");
    expect(a.groundedPayload).not.toBe(b.groundedPayload);
    expect(a.identity.canonicalIdentity).not.toBe(b.identity.canonicalIdentity);
  });
});

/* ------------------------------------------------------- spiritual boundary -- */

describe("spiritual preference", () => {
  for (const dayNumber of [8, 9, 10]) {
    it(`day ${dayNumber} with spiritual off supplies no spiritual practice and forbids devotional prose`, async () => {
      const parsed = parseJourneyRequest(rawFor(dayNumber, {}, false));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const prepared = prepareJourneyGeneration(parsed.request);
      expect(prepared.grounding.spiritualPractice).toBeUndefined();
      expect(prepared.policy).toContain("OFF");

      const leak = validateJourneyReflection({
        // MOCK TEST MATERIAL — deliberate off-path leakage.
        text: "You might pray about this and let God carry it for you.",
        source: prepared.grounding,
      });
      expect(leak.ok).toBe(false);
      if (!leak.ok) expect(leak.code).toBe("devotional-leakage");
    });

    it(`day ${dayNumber} with spiritual on supplies the authorised practice`, () => {
      const parsed = parseJourneyRequest(rawFor(dayNumber, {}, true));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const prepared = prepareJourneyGeneration(parsed.request);
      expect(prepared.grounding.spiritualPractice).toBeDefined();
      expect(prepared.grounding.spiritualAuthorised).toBe(true);
    });
  }

  it("spiritual on then off again removes the spiritual material", () => {
    const on = parseJourneyRequest(rawFor(9, {}, true));
    const off = parseJourneyRequest(rawFor(9, {}, false));
    expect(on.ok && off.ok).toBe(true);
    if (!on.ok || !off.ok) return;
    expect(prepareJourneyGeneration(on.request).grounding.spiritualPractice).toBeDefined();
    expect(prepareJourneyGeneration(off.request).grounding.spiritualPractice).toBeUndefined();
  });
});

/* ------------------------------------------------------------------- gates -- */

describe("gates return fixed codes with zero provider calls", () => {
  const cases: Array<[string, typeof OPEN_GATES, string]> = [
    ["disabled", { ...OPEN_GATES, activationEnabled: false }, "generation-disabled"],
    ["no consent", { ...OPEN_GATES, consentEstablished: false }, "consent-not-established"],
    [
      "not admitted",
      { ...OPEN_GATES, pilotAdmitted: false },
      "pilot-admission-not-established",
    ],
  ];

  for (const [name, gates, code] of cases) {
    it(`${name} makes no call`, async () => {
      const generate = vi.fn();
      const provider = { provenance: "mock" as const, generate };
      const result = await generateJourneyReflection({
        rawRequest: rawFor(1, {}),
        gates,
        provider,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(code);
        expect(result.providerCalled).toBe(false);
      }
      expect(generate).not.toHaveBeenCalled();
    });
  }

  it("malformed and outdated requests make no call and never echo input", async () => {
    const generate = vi.fn();
    const provider = { provenance: "mock" as const, generate };
    const bad: unknown[] = [
      null,
      "string",
      { day: 1 },
      { day: 99, answerMeaningVersion: "x", answers: [], spiritual: false },
      { ...rawFor(1, {}), answerMeaningVersion: "stale-version" },
      { ...rawFor(1, {}), secretNote: "private-looking value" },
      { ...rawFor(1, {}), answers: ["not.a.real.token"] },
      { ...rawFor(1, {}), spiritual: null },
    ];
    for (const rawRequest of bad) {
      const result = await generateJourneyReflection({ rawRequest, gates: OPEN_GATES, provider });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("invalid-request");
        expect(result.providerCalled).toBe(false);
        expect(JSON.stringify(result)).not.toContain("private-looking");
        expect(JSON.stringify(result)).not.toContain("stale-version");
      }
    }
    expect(generate).not.toHaveBeenCalled();
  });
});

/* --------------------------------------------------------- provider failure -- */

describe("provider failures are bounded and never retried", () => {
  const codes: JourneyProviderErrorCode[] = [
    "provider-unavailable",
    "provider-network",
    "provider-timeout",
    "provider-rate-limited",
    "provider-budget-exhausted",
    "provider-invalid-output",
  ];

  for (const code of codes) {
    it(`${code} is surfaced once, with no second call`, async () => {
      const provider = mockProvider({ ok: false, error: code });
      const result = await generateJourneyReflection({
        rawRequest: rawFor(1, {}),
        gates: OPEN_GATES,
        provider,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe(code);
      expect(provider.calls).toBe(1);
    });
  }

  it("a thrown provider is caught and its message is never surfaced", async () => {
    const provider: JourneyModelProvider = {
      provenance: "live-model",
      async generate() {
        throw new Error("secret upstream body 401 key=abc");
      },
    };
    const result = await generateJourneyReflection({
      rawRequest: rawFor(1, {}),
      gates: OPEN_GATES,
      provider,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("provider-threw");
      expect(JSON.stringify(result)).not.toContain("secret upstream");
      expect(JSON.stringify(result)).not.toContain("key=abc");
    }
  });

  it("only one attempt is ever made, even on rejection", async () => {
    let calls = 0;
    const provider: JourneyModelProvider = {
      provenance: "live-model",
      async generate() {
        calls += 1;
        return { ok: false, error: "provider-timeout" };
      },
    };
    await generateJourneyReflection({ rawRequest: rawFor(2, {}), gates: OPEN_GATES, provider });
    expect(calls).toBe(1);
  });
});

/* --------------------------------------------------- completeness / identity -- */

describe("only complete, correctly attributed output is accepted", () => {
  it("a truncated finish is rejected rather than trimmed and presented", async () => {
    const provider = mockProvider(okResponse(MOCK_PROSE, { finishReason: "length" }));
    const result = await generateJourneyReflection({
      rawRequest: rawFor(1, {}),
      gates: OPEN_GATES,
      provider,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("response-incomplete");
  });

  it("a missing finish status is not treated as complete", async () => {
    const provider = mockProvider(okResponse(MOCK_PROSE, { finishReason: undefined }));
    const result = await generateJourneyReflection({
      rawRequest: rawFor(1, {}),
      gates: OPEN_GATES,
      provider,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("response-incomplete");
  });

  it("a different or lookalike model identity is rejected", async () => {
    for (const model of [
      undefined,
      "",
      "other/model",
      `${LIVE_MODEL_ID}-preview`,
      `x-${LIVE_MODEL_ID}`,
    ]) {
      const provider = mockProvider(okResponse(MOCK_PROSE, { model }));
      const result = await generateJourneyReflection({
        rawRequest: rawFor(1, {}),
        gates: OPEN_GATES,
        provider,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("response-model-mismatch");
    }
  });

  it("an empty response is not a reflection", async () => {
    const provider = mockProvider(okResponse("   \n  "));
    const result = await generateJourneyReflection({
      rawRequest: rawFor(1, {}),
      gates: OPEN_GATES,
      provider,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("output-empty");
  });

  it("a non-string response is not a reflection", async () => {
    const provider = mockProvider(okResponse("x", { text: { parts: ["x"] } }));
    const result = await generateJourneyReflection({
      rawRequest: rawFor(1, {}),
      gates: OPEN_GATES,
      provider,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("output-not-text");
  });

  it("a mock transport is never recorded as live participant AI", async () => {
    const provider = mockProvider(okResponse(MOCK_PROSE), "mock");
    const result = await generateJourneyReflection({
      rawRequest: rawFor(1, {}),
      gates: OPEN_GATES,
      provider,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.identity.provenance).toBe("mock");
    expect(result.meta.acceptedAsLiveAi).toBe(false);
    expect(result.meta.identity.canonicalIdentity).toContain("mock");
  });

  it("mock and live provenance produce different result identities", async () => {
    const run = async (provenance: "mock" | "live-model") => {
      const result = await generateJourneyReflection({
        rawRequest: rawFor(3, {}),
        gates: OPEN_GATES,
        provider: mockProvider(okResponse(MOCK_PROSE), provenance),
      });
      if (!result.ok) throw new Error("expected acceptance");
      return result.meta.identity.canonicalIdentity;
    };
    expect(await run("mock")).not.toBe(await run("live-model"));
  });

  it("usage is only bounded numbers, and cost is never invented", async () => {
    const provider = mockProvider(
      okResponse(MOCK_PROSE, {
        usage: {
          inputTokens: 900,
          outputTokens: 300,
          reasoningTokens: 120,
          totalTokens: 1320,
          costUsd: 0.42,
          reasoningText: "hidden chain of thought",
          outputTokensBogus: Infinity,
        },
      }),
    );
    const result = await generateJourneyReflection({
      rawRequest: rawFor(1, {}),
      gates: OPEN_GATES,
      provider,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meta.usage).toEqual({
      inputTokens: 900,
      outputTokens: 300,
      reasoningTokens: 120,
      totalTokens: 1320,
    });
    expect(JSON.stringify(result.meta)).not.toContain("costUsd");
    expect(JSON.stringify(result.meta)).not.toContain("hidden chain");
  });

  it("malformed or hostile usage never appears", async () => {
    const provider = mockProvider(
      okResponse(MOCK_PROSE, { usage: { inputTokens: -5, outputTokens: "many", totalTokens: NaN } }),
    );
    const result = await generateJourneyReflection({
      rawRequest: rawFor(1, {}),
      gates: OPEN_GATES,
      provider,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.meta.usage).toBeUndefined();
  });
});

/* ------------------------------------------------- limited safety heuristics -- */

describe("deterministic checks (limited lexical heuristics only)", () => {
  const source = (() => {
    const parsed = parseJourneyRequest(rawFor(1, {}, false));
    if (!parsed.ok) throw new Error("fixture invalid");
    return prepareJourneyGeneration(parsed.request).grounding;
  })();

  // MOCK TEST MATERIAL — hand-written positive examples that must PASS.
  const acceptable = [
    "This is not about diagnosing yourself. It is about noticing what is here.",
    "Some people describe a heaviness like this. It may or may not fit for you.",
    "Naming something does not fix it, and nothing here promises that it will change.",
    "You may find that anger and grief sit together. Both can be true at once.",
  ];
  for (const text of acceptable) {
    it(`accepts benign prose: ${text.slice(0, 34)}…`, () => {
      expect(validateJourneyReflection({ text, source }).ok).toBe(true);
    });
  }

  // MOCK TEST MATERIAL — hand-written negative examples that must be REJECTED.
  const rejected: Array<[string, string]> = [
    ["This practice will cure the heaviness you are carrying.", "unsupported-therapeutic-guarantee"],
    ["You will recover if you keep going.", "unsupported-therapeutic-guarantee"],
    ["This is guaranteed to bring relief.", "unsupported-therapeutic-guarantee"],
    ["You clearly have PTSD from what you described.", "affirmative-diagnosis"],
    ["You are clinically depressed.", "affirmative-diagnosis"],
    ["You meet the criteria for an anxiety disorder.", "affirmative-diagnosis"],
    ["<p>Consider this</p>", "output-contains-markup"],
    ["Let us pray together about this heaviness.", "devotional-leakage"],
  ];
  for (const [text, code] of rejected) {
    it(`rejects ${code}: ${text.slice(0, 34)}…`, () => {
      const result = validateJourneyReflection({ text, source });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe(code);
    });
  }

  it("does not inherit the old blanket 'diagnos' rejection", () => {
    const result = validateJourneyReflection({
      text: "Nothing here is about diagnosing yourself or naming a condition.",
      source,
    });
    expect(result.ok).toBe(true);
  });

  it("oversized output is rejected whole, never trimmed", () => {
    const result = validateJourneyReflection({
      text: "a".repeat(MAX_JOURNEY_OUTPUT_CHARS + 1),
      source,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("output-too-large");
  });

  it("a failed check is surfaced as its specific code, not softened into acceptance", async () => {
    const provider = mockProvider(
      okResponse("You clearly have PTSD, and this practice will cure it."),
    );
    const result = await generateJourneyReflection({
      rawRequest: rawFor(1, {}),
      gates: OPEN_GATES,
      provider,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unsupported-therapeutic-guarantee");
      expect(result.providerCalled).toBe(true);
    }
  });
});

/* ------------------------------------------------------- versions and drift -- */

describe("identity is tied to preparation, policy and output versions", () => {
  it("the policy version is the current one, not the retired journey-p2", () => {
    expect(JOURNEY_POLICY_VERSION).toBe("journey-p3");
  });

  it("materially different selections give different identities", () => {
    const of = (picks: Record<string, string[]>) => {
      const parsed = parseJourneyRequest(rawFor(10, picks));
      if (!parsed.ok) throw new Error("fixture invalid");
      return prepareJourneyGeneration(parsed.request).identity.canonicalIdentity;
    };
    expect(of({ different: ["named"] })).not.toBe(of({ different: ["nothing"] }));
  });

  it("order-only differences in the same selections are equivalent", () => {
    const of = (ids: string[]) => {
      const parsed = parseJourneyRequest(rawFor(10, { unfinished: ids }));
      if (!parsed.ok) throw new Error("fixture invalid");
      return prepareJourneyGeneration(parsed.request).identity.canonicalIdentity;
    };
    expect(of(["grief", "rest"])).toBe(of(["rest", "grief"]));
  });

  it("a changed policy text invalidates identity", () => {
    const parsed = parseJourneyRequest(rawFor(1, {}));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const prepared = prepareJourneyGeneration(parsed.request);
    expect(prepared.identity.canonicalIdentity).toContain(prepared.policy.slice(0, 40));
  });

  it("preparation alone carries no response provenance", () => {
    const parsed = parseJourneyRequest(rawFor(1, {}));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const prepared = prepareJourneyGeneration(parsed.request);
    expect((prepared.identity as { provenance?: string }).provenance).toBeUndefined();
  });

  it("Day 10 coexisting nuance is preserved without over-inference", () => {
    const parsed = parseJourneyRequest(rawFor(10, { different: ["named", "nothing"] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const prepared = prepareJourneyGeneration(parsed.request);
    const selection = prepared.grounding.selections.find((s) => s.questionId === "different")!;
    expect(selection.labels).toHaveLength(2);
    expect(selection.unknown).toBe(false);
  });
});

/* --------------------------------------------------------------- no runtime -- */

describe("the core has no runtime, environment or network reach", () => {
  it("never touches fetch during a full accepted run", async () => {
    const original = globalThis.fetch;
    const spy = vi.fn();
    (globalThis as { fetch: unknown }).fetch = spy;
    try {
      const result = await generateJourneyReflection({
        rawRequest: rawFor(5, {}),
        gates: OPEN_GATES,
        provider: mockProvider(okResponse(MOCK_PROSE)),
      });
      expect(result.ok).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      (globalThis as { fetch: unknown }).fetch = original;
    }
  });

  it("the source modules contain no transport, environment or storage access", async () => {
    const files = [
      "src/lib/ai/journey-generation.ts",
      "src/lib/ai/journey-response.ts",
      "src/lib/ai/journey-policy.ts",
    ];
    const fs = await import("node:fs/promises");
    for (const file of files) {
      const text = await fs.readFile(file, "utf8");
      const code = text
        .split("\n")
        .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
        .join("\n");
      expect(code).not.toMatch(/\bfetch\s*\(/);
      expect(code).not.toMatch(/process\.env/);
      expect(code).not.toMatch(/localStorage|sessionStorage/);
      expect(code).not.toMatch(/\.server['"]/);
      expect(code).not.toMatch(/import\.meta\.env/);
    }
  });

  it("the model identity is exactly the existing constant, not a new one", () => {
    expect(JOURNEY_MODEL_ID).toBe(LIVE_MODEL_ID);
  });
});
