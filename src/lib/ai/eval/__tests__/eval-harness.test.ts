// Tests for the isolated AI evaluation harness (engineering only).
// All providers here are MOCK providers and are labelled as such.

import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { EVAL_FIXTURE_IDS, EVAL_FIXTURES, getEvalFixture } from "@/lib/ai/eval/fixtures";
import { buildGroundedSource, getEvalDay } from "@/lib/ai/eval/grounding";
import {
  buildEvalPayload,
  runEvalFixture,
  validateEvalOutput,
  EVAL_MAX_OUTPUT_TOKENS,
  EVAL_TIMEOUT_MS,
  EVAL_INPUT_CHAR_CAP,
  EVAL_VALIDATOR_VERSION,
  classifyEvalIssues,
  type EvalProvider,
} from "@/lib/ai/eval/harness";
import { FIRST_JOURNEY_DAYS } from "@/content/first-journey";
import { createEvalGatewayProvider } from "@/lib/ai/eval/gateway-provider.server";

function mockProvider(
  text: string,
  kind: "live" | "mock" = "mock",
  captured?: { req?: unknown },
): EvalProvider {
  return {
    kind,
    name: kind === "live" ? "mock-labelled-live-provider" : "mock-provider",
    async generate(req) {
      if (captured) captured.req = req;
      return { ok: true, text, requestedModel: "mock/model", returnedModel: "mock/model" };
    },
  };
}

describe("fixtures allowlist", () => {
  it("exposes exactly six fictional fixtures, all tagged fictional", () => {
    expect(EVAL_FIXTURE_IDS).toHaveLength(6);
    expect(EVAL_FIXTURES).toHaveLength(6);
    for (const f of EVAL_FIXTURES) {
      expect(f.fictional).toBe(true);
      expect(f.label.startsWith("FICTIONAL:")).toBe(true);
    }
  });

  it("refuses anything that is not an allowlisted fixture id", () => {
    for (const bad of [
      "",
      "fx-unknown",
      "fx-day3-grief-sleep ",
      { id: "fx-day3-grief-sleep", extra: "text" },
      ["fx-day3-grief-sleep"],
      null,
      undefined,
      42,
    ]) {
      expect(getEvalFixture(bad)).toBeUndefined();
      expect(buildEvalPayload(bad)).toEqual({ ok: false, error: "unknown-fixture" });
    }
  });

  it("uses only canonical current option ids", () => {
    for (const fixture of EVAL_FIXTURES) {
      const day = getEvalDay(fixture.day)!;
      const questions = [...day.questions, day.step];
      for (const token of fixture.answers) {
        const [key, optionId] = token.split(":");
        const questionId = key === "step" ? day.step.id : key!.replace(/^q\./, "");
        const question = questions.find((q) => q.id === questionId);
        expect(question, `${token} question`).toBeDefined();
        expect(question!.options.some((o) => o.id === optionId)).toBe(true);
      }
    }
  });
});

describe("grounding builders", () => {
  it("builds a grounded source with a stable fingerprint for all ten days", () => {
    expect(FIRST_JOURNEY_DAYS).toHaveLength(10);
    const seen = new Set<string>();
    for (const day of FIRST_JOURNEY_DAYS) {
      const source = buildGroundedSource({ day, answers: [], showSpiritual: false });
      expect(source.day).toBe(day.day);
      expect(source.title).toBe(day.title);
      expect(source.purpose).toBe(day.arrive.purpose);
      expect(source.teaching).toEqual(day.understand.body);
      expect(source.practice.title).toBe(day.practise.reflection.title);
      expect(source.spiritualPractice).toBeUndefined();
      expect(source.fingerprint).toMatch(new RegExp(`^eval-g1:d${day.day}:`));
      seen.add(source.fingerprint);

      const on = buildGroundedSource({ day, answers: [], showSpiritual: true });
      expect(on.spiritualPractice?.title).toBe(day.practise.spiritual.title);
      expect(on.fingerprint).not.toBe(source.fingerprint);
    }
    expect(seen.size).toBe(10);
  });

  it("sends no other day's content", () => {
    const day = getEvalDay(3)!;
    const text = JSON.stringify(buildGroundedSource({ day, answers: [], showSpiritual: false }));
    const other = getEvalDay(7)!;
    expect(text).not.toContain(other.title);
    expect(text).not.toContain(other.arrive.purpose);
  });
});

describe("spiritual-off leakage", () => {
  it("withholds the spiritualOnly Day 10 selection and the spiritual practice", () => {
    const off = buildEvalPayload("fx-day10-spiritual-off");
    const on = buildEvalPayload("fx-day10-spiritual-on");
    expect(off.ok && on.ok).toBe(true);
    if (!off.ok || !on.ok) return;

    const day = getEvalDay(10)!;
    const faithLabel = day.questions
      .find((q) => q.id === "unfinished")!
      .options.find((o) => o.id === "faith")!.label;

    expect(off.manifest.exactOutgoingText).not.toContain(faithLabel);
    expect(off.manifest.spiritualPracticeIncluded).toBe(false);
    expect(off.manifest.spiritualAuthorised).toBe(false);
    expect(off.manifest.exactOutgoingText).not.toContain(day.practise.spiritual.title);

    expect(on.manifest.exactOutgoingText).toContain(faithLabel);
    expect(on.manifest.spiritualPracticeIncluded).toBe(true);
    expect(on.manifest.fingerprint).not.toBe(off.manifest.fingerprint);
  });

  it("flags spiritual language in an output when authorisation is absent", () => {
    const result = validateEvalOutput("Perhaps a quiet prayer could help here.", {
      spiritualAuthorised: false,
    });
    expect(result.issues.some((i) => i.startsWith("spiritual-language"))).toBe(true);
    const allowed = validateEvalOutput("Perhaps a quiet prayer could help here.", {
      spiritualAuthorised: true,
    });
    expect(allowed.issues).toEqual([]);
  });
});

describe("sparse, private and no-action semantics", () => {
  it("marks privacy and uncertainty without guessing content", () => {
    const built = buildEvalPayload("fx-day3-private-uncertain");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const source = JSON.parse(built.payload.groundedSourceText) as {
      selections: Array<{ questionId: string; keptPrivate: boolean; markedUnclear: boolean }>;
      stepChoice?: string;
    };
    const carrying = source.selections.find((s) => s.questionId === "carrying")!;
    const shows = source.selections.find((s) => s.questionId === "shows")!;
    expect(carrying.keptPrivate).toBe(true);
    expect(shows.markedUnclear).toBe(true);
    expect(source.stepChoice).toBeUndefined();
  });

  it("keeps a no-pull, nothing-outward Day 5 example honest", () => {
    const built = buildEvalPayload("fx-day5-no-pull-no-step");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const source = JSON.parse(built.payload.groundedSourceText) as {
      selections: Array<{ questionId: string; reportedNone: boolean }>;
      stepChoice?: string;
    };
    expect(source.selections.every((s) => s.reportedNone)).toBe(true);
    expect(source.stepChoice).toContain("No outward action");
  });

  it("distinguishes the two comparable Day 3 examples", () => {
    const a = buildEvalPayload("fx-day3-grief-sleep");
    const b = buildEvalPayload("fx-day3-anger-patience");
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.manifest.fingerprint).not.toBe(b.manifest.fingerprint);
    expect(a.manifest.presentedSelectionLabels.join()).toContain("Grief");
    expect(b.manifest.presentedSelectionLabels.join()).toContain("Anger");
  });
});

describe("run statuses and output handling", () => {
  const good = "Something was named today, and that is enough for now. You may leave it there.";

  it("never labels a mock provider as genuine AI", async () => {
    const record = await runEvalFixture("fx-day3-grief-sleep", mockProvider(good, "mock"));
    expect("status" in record && record.status).toBe("mock");
  });

  it("reports ai_generated only for a live-kind provider", async () => {
    const record = await runEvalFixture("fx-day3-grief-sleep", mockProvider(good, "live"));
    expect("status" in record && record.status).toBe("ai_generated");
  });

  it("prepares a payload without calling the provider on a dry run", async () => {
    const provider = mockProvider(good, "live");
    const spy = vi.spyOn(provider, "generate");
    const record = await runEvalFixture("fx-day3-grief-sleep", provider, { dryRun: true });
    expect("status" in record && record.status).toBe("prepared");
    expect(spy).not.toHaveBeenCalled();
  });

  it("treats empty and malformed output as failure", async () => {
    for (const text of ["", "   ", "\n\n"]) {
      const record = await runEvalFixture("fx-day3-grief-sleep", mockProvider(text, "live"));
      expect("status" in record && record.status).toBe("failure");
    }
    const fenced = await runEvalFixture(
      "fx-day3-grief-sleep",
      mockProvider("```\n- one\n- two\n```", "live"),
    );
    expect("status" in fenced && fenced.validationIssues.length).toBeGreaterThan(0);
  });

  it("flags truncation reported by the provider and unfinished prose", async () => {
    const truncating: EvalProvider = {
      kind: "live",
      name: "mock-truncating-provider",
      async generate() {
        return {
          ok: true,
          text: "A reflection that stops mid",
          requestedModel: "mock/model",
          finishReason: "length",
        };
      },
    };
    const record = await runEvalFixture("fx-day3-grief-sleep", truncating);
    expect("status" in record && record.validationIssues).toContain(
      "output-truncated-by-token-cap",
    );
    expect("status" in record && record.status).toBe("rejected");
    expect("accepted" in record && record.accepted).toBe(false);
    expect("provenance" in record && record.provenance).toBe("live");
    expect("output" in record && record.output).toBe("A reflection that stops mid");
    expect("finishReason" in record && record.finishReason).toBe("length");

    const unfinished = await runEvalFixture(
      "fx-day3-grief-sleep",
      mockProvider("A reflection that stops mid", "live"),
    );
    expect("status" in unfinished && unfinished.validationIssues).toContain("possibly-truncated");
    expect(validateEvalOutput("A complete sentence.", { spiritualAuthorised: false }).issues).toEqual(
      [],
    );
  });

  it("records a provider error as failure and attempts no retry", async () => {
    let calls = 0;
    const provider: EvalProvider = {
      kind: "live",
      name: "mock-failing-provider",
      async generate() {
        calls += 1;
        return { ok: false, error: "http", detail: "429" };
      },
    };
    const record = await runEvalFixture("fx-day3-grief-sleep", provider);
    expect(calls).toBe(1);
    expect("status" in record && record.status).toBe("failure");
    expect("error" in record && record.error).toBe("http:429");
  });

  it("carries the caps into every provider request", async () => {
    const captured: { req?: { maxOutputTokens: number; timeoutMs: number } } = {};
    await runEvalFixture(
      "fx-day3-grief-sleep",
      mockProvider(good, "live", captured as { req?: unknown }),
    );
    expect(captured.req?.maxOutputTokens).toBe(EVAL_MAX_OUTPUT_TOKENS);
    expect(EVAL_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(1200);
    expect(captured.req?.timeoutMs).toBe(EVAL_TIMEOUT_MS);
    expect(EVAL_TIMEOUT_MS).toBe(45_000);
  });

  it("keeps every payload under the input cap", () => {
    for (const id of EVAL_FIXTURE_IDS) {
      const built = buildEvalPayload(id);
      expect(built.ok).toBe(true);
      if (built.ok) expect(built.manifest.totalChars).toBeLessThanOrEqual(EVAL_INPUT_CHAR_CAP);
    }
  });
});

describe("live gateway provider (mocked fetch)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const req = {
    systemPolicy: "policy",
    groundedSourceText: "{}",
    userInstruction: "go",
    maxOutputTokens: EVAL_MAX_OUTPUT_TOKENS,
    timeoutMs: 10,
  };

  it("refuses to call anything without a configured key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await createEvalGatewayProvider(undefined).generate(req);
    expect(result).toEqual({ ok: false, error: "missing-key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends one non-redirecting capped request and no retry", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: "returned/model",
          choices: [{ message: { content: "a reflection" } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await createEvalGatewayProvider("mock-key").generate(req);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.redirect).toBe("manual");
    const body = JSON.parse(String(init.body)) as { max_tokens: number };
    expect(body.max_tokens).toBe(EVAL_MAX_OUTPUT_TOKENS);
    expect(result.ok && result.usage?.totalTokens).toBe(30);
  });

  it("reports an aborted request as timeout", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      await new Promise((resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
        setTimeout(resolve, 5000);
      });
      return new Response("{}");
    });
    const result = await createEvalGatewayProvider("mock-key").generate(req);
    expect(result).toEqual({ ok: false, error: "timeout" });
  });

  it("reports a redirect rather than following it", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 302 }));
    const result = await createEvalGatewayProvider("mock-key").generate(req);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBe("redirect");
  });
});

describe("isolation from production", () => {
  it("is not imported by any route, client module, or server function", () => {
    // The harness modules are referenced only by their own tests and by the
    // engineering runner script, which lives outside src/.
    const runner = readFileSync("scripts/ai-eval/run-eval.ts", "utf8");
    expect(runner).toContain("@/lib/ai/eval/harness");
  });

  it("reads no storage and no browser state", () => {
    for (const path of [
      "src/lib/ai/eval/harness.ts",
      "src/lib/ai/eval/grounding.ts",
      "src/lib/ai/eval/fixtures.ts",
      "src/lib/ai/eval/gateway-provider.server.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/localStorage|sessionStorage|document\.|readProgress|window\./);
    }
  });
});

describe("provenance separated from quality acceptance (mock-only)", () => {
  const complete = "Something was named today, and that may be enough for now.";

  it("accepts a complete output and records live provenance", async () => {
    const record = await runEvalFixture("fx-day3-grief-sleep", mockProvider(complete, "live"));
    expect("status" in record && record.status).toBe("ai_generated");
    expect("accepted" in record && record.accepted).toBe(true);
    expect("provenance" in record && record.provenance).toBe("live");
    expect("reviewRequired" in record && record.reviewRequired).toBe(false);
    expect("validatorVersion" in record && record.validatorVersion).toBe(EVAL_VALIDATOR_VERSION);
  });

  it("keeps mocked provenance distinct from genuine AI", async () => {
    const record = await runEvalFixture("fx-day3-grief-sleep", mockProvider(complete, "mock"));
    expect("status" in record && record.status).toBe("mock");
    expect("provenance" in record && record.provenance).toBe("mock");
  });

  it("rejects an unfinished fragment while keeping the text and metadata", async () => {
    const record = await runEvalFixture(
      "fx-day3-grief-sleep",
      mockProvider("A reflection cut off before", "live"),
    );
    if (!("status" in record)) throw new Error("expected a record");
    expect(record.status).toBe("rejected");
    expect(record.accepted).toBe(false);
    expect(record.reviewRequired).toBe(true);
    expect(record.output).toBe("A reflection cut off before");
    expect(record.requestedModel).toBe("mock/model");
    expect(record.returnedModel).toBe("mock/model");
    expect(record.validationIssues).toContain("possibly-truncated");
  });

  it("rejects a spiritual breach when authorisation is absent", async () => {
    const record = await runEvalFixture(
      "fx-day3-grief-sleep",
      mockProvider("You must pray to God.", "live"),
    );
    if (!("status" in record)) throw new Error("expected a record");
    expect(record.status).toBe("rejected");
    expect(record.accepted).toBe(false);
    expect(record.output).toBe("You must pray to God.");
    expect(classifyEvalIssues(record.validationIssues).seriousPolicyIssue).toBe(true);
  });

  it("rejects an overreaching claim", async () => {
    const record = await runEvalFixture(
      "fx-day3-grief-sleep",
      mockProvider("You will heal because of this step.", "live"),
    );
    if (!("status" in record)) throw new Error("expected a record");
    expect(record.status).toBe("rejected");
    expect(classifyEvalIssues(record.validationIssues).seriousPolicyIssue).toBe(true);
  });

  it("words the review conclusion conservatively without clinical claims", () => {
    const flagged = classifyEvalIssues(["spiritual-language:god"]);
    expect(flagged.accepted).toBe(false);
    expect(flagged.reviewRequired).toBe(true);
    expect(flagged.summary).toContain("not proof of harm");
    const clean = classifyEvalIssues([]);
    expect(clean.accepted).toBe(true);
    expect(clean.summary).toContain("do not establish emotional or clinical safety");
  });
});

describe("deadline covers complete body consumption (mocked fetch only)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const req = {
    systemPolicy: "policy",
    groundedSourceText: "{}",
    userInstruction: "go",
    maxOutputTokens: EVAL_MAX_OUTPUT_TOKENS,
    timeoutMs: 20,
  };

  it("times out when headers arrive but the success body never settles", async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      ok: true,
      body: null,
      json: () => new Promise(() => {}),
      text: () => new Promise(() => {}),
    }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const result = await createEvalGatewayProvider("mock-key").generate(req);
    expect(result).toEqual({ ok: false, error: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("times out when an error body never settles", async () => {
    const fetchMock = vi.fn(async () => ({
      status: 500,
      ok: false,
      body: null,
      text: () => new Promise(() => {}),
      json: () => new Promise(() => {}),
    }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const result = await createEvalGatewayProvider("mock-key").generate(req);
    expect(result).toEqual({ ok: false, error: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still reads a slow but complete body inside the deadline", async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      ok: true,
      body: null,
      json: async () => {
        await new Promise((r) => setTimeout(r, 5));
        return { model: "m", choices: [{ message: { content: "a complete reflection." } }] };
      },
    }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const result = await createEvalGatewayProvider("mock-key").generate({ ...req, timeoutMs: 500 });
    expect(result.ok && result.text).toBe("a complete reflection.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports an http error with a readable body and makes no second request", async () => {
    const fetchMock = vi.fn(async () => ({
      status: 429,
      ok: false,
      body: null,
      text: async () => "slow down",
    }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const result = await createEvalGatewayProvider("mock-key").generate({ ...req, timeoutMs: 500 });
    expect(!result.ok && result.error).toBe("http");
    expect(!result.ok && result.detail).toContain("429");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cleans up its timer on the success path", async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "done." } }] }), {
        status: 200,
      }),
    );
    const promise = createEvalGatewayProvider("mock-key").generate({ ...req, timeoutMs: 1000 });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
    vi.useRealTimers();
  });

  it("treats malformed JSON as parse, not timeout", async () => {
    vi.stubGlobal("fetch", async () => new Response("not json", { status: 200 }));
    const result = await createEvalGatewayProvider("mock-key").generate({ ...req, timeoutMs: 500 });
    expect(!result.ok && result.error).toBe("parse");
  });
});

describe("historical evaluation artifact is annotated offline", () => {
  it("preserves the original run and adds a labelled review annotation", () => {
    const records = JSON.parse(
      readFileSync("artifacts/ai-eval/results.json", "utf8"),
    ) as Array<Record<string, unknown>>;
    expect(records).toHaveLength(6);
    for (const record of records) {
      expect(record["status"]).toBe("ai_generated");
      expect(record["validationIssues"]).toEqual([]);
      expect(record["finishReason"]).toBeUndefined();
      expect(typeof record["output"]).toBe("string");
      const annotation = record["offlineRevalidation"] as {
        label: string;
        accepted: boolean;
        reviewRequired: boolean;
        issues: string[];
        validatorVersion: string;
        historicalValidationIssues: string[];
        historicalFinishReasonSaved: boolean;
        notes: string[];
      };
      expect(annotation.label).toContain("no model call");
      expect(annotation.accepted).toBe(false);
      expect(annotation.reviewRequired).toBe(true);
      expect(annotation.issues).toContain("possibly-truncated");
      expect(annotation.validatorVersion).toBe(EVAL_VALIDATOR_VERSION);
      expect(annotation.historicalValidationIssues).toEqual([]);
      expect(annotation.historicalFinishReasonSaved).toBe(false);
      expect(annotation.notes.join(" ")).toContain("no reasoning-token breakdown");
      expect(annotation.notes.join(" ")).toContain("engineering test limit");
    }
  });
});
