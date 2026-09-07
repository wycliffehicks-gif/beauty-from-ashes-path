// Mock-only coverage of the participant AI boundary, transport, store and the
// two core boundary fixes. ZERO network calls: every provider and fetch is a
// local stub, and the tests assert that no gateway module is ever reached when a
// request is refused.

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  JOURNEY_AI_ACTIVATION_ENV,
  JOURNEY_AI_READINESS_ENV,
  readJourneyAiActivation,
} from "@/lib/ai/journey-activation";
import { currentJourneyAiConsent, parseJourneyAiConsent } from "@/lib/ai/journey-consent";
import { JOURNEY_AI_DISCLOSURE_VERSION } from "@/lib/ai/journey-disclosure";
import { composeJourneyResponseIdentity } from "@/lib/ai/journey-identity";
import { runJourneyBoundary, type PilotAdmission } from "@/lib/ai/journey-boundary";
import {
  JOURNEY_MODEL_ID,
  type JourneyModelProvider,
} from "@/lib/ai/journey-generation";
import { validateJourneyReflection } from "@/lib/ai/journey-response";
import { parseJourneyRequest } from "@/lib/ai/journey-contract";
import { prepareJourneyGeneration } from "@/lib/ai/journey-policy";
import { createJourneyLiveTransport } from "@/lib/ai/journey-transport.server";
import {
  aiConsentAccepted,
  clearAiReflection,
  clearAllAiReflections,
  readAiReflection,
  recordAiConsent,
  saveAiReflection,
} from "@/lib/ai/journey-ai-store";
import { getFirstJourneyDay } from "@/content/first-journey";

/* A local fake browser. No jsdom, no real storage, no events leave this file. */
class FakeStorage {
  map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

const fakeLocal = new FakeStorage();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: fakeLocal,
  sessionStorage: new FakeStorage(),
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
};
(globalThis as unknown as { Event: unknown }).Event =
  (globalThis as unknown as { Event?: unknown }).Event ??
  class {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  };

/* ------------------------------------------------------------- helpers -- */

function dayRequest(day: number, answers: string[] = [], spiritual = false) {
  const content = getFirstJourneyDay(day)!;
  return {
    day,
    answerMeaningVersion: content.answerMeaningVersion,
    answers,
    spiritual,
  };
}

function identityFor(request: ReturnType<typeof dayRequest>) {
  const parsed = parseJourneyRequest(request);
  if (!parsed.ok) throw new Error("fixture request must be valid");
  return composeJourneyResponseIdentity(
    prepareJourneyGeneration(parsed.request).identity,
    "live-model",
  );
}

function okProvider(text: string): JourneyModelProvider & { calls: number } {
  const provider = {
    calls: 0,
    provenance: "live-model" as const,
    async generate() {
      provider.calls += 1;
      return { ok: true as const, text, model: JOURNEY_MODEL_ID, finishReason: "stop" };
    },
  };
  return provider;
}

const GOOD_TEXT =
  "You chose only a little today, and that is enough to work with. What you named may have been carrying more weight than it looked like from outside. If it helps, you might notice one place where that weight eases, even slightly.";

const ENV_ON = {
  [JOURNEY_AI_ACTIVATION_ENV]: "true",
  [JOURNEY_AI_READINESS_ENV]: "true",
};

const admitted = async (): Promise<PilotAdmission> => ({ ok: true });

/* -------------------------------------------------------- activation -- */

describe("current-journey activation", () => {
  it("is off with no configuration at all", () => {
    const a = readJourneyAiActivation(undefined);
    expect(a.activationEnabled).toBe(false);
    expect(a.releaseReady).toBe(false);
    expect(a.liveGenerationAllowed).toBe(false);
  });

  it("is off for every value other than the two documented ones", () => {
    for (const value of ["false", "0", "yes", "on", "TRUE ", "", " ", "truthy"]) {
      const a = readJourneyAiActivation({
        [JOURNEY_AI_ACTIVATION_ENV]: value,
        [JOURNEY_AI_READINESS_ENV]: "true",
      });
      const expected = value.trim().toLowerCase() === "true";
      expect(a.activationEnabled).toBe(expected);
    }
  });

  it("stays locked while readiness is off even when activation is on", () => {
    const a = readJourneyAiActivation({ [JOURNEY_AI_ACTIVATION_ENV]: "true" });
    expect(a.activationEnabled).toBe(true);
    expect(a.releaseReady).toBe(false);
    expect(a.liveGenerationAllowed).toBe(false);
  });

  it("is not switched on by the legacy flag", () => {
    const a = readJourneyAiActivation({ LIVE_AI_ENABLED: "true" });
    expect(a.liveGenerationAllowed).toBe(false);
  });
});

/* ------------------------------------------------------------ consent -- */

describe("AI consent envelope", () => {
  it("accepts only the exact current envelope", () => {
    expect(parseJourneyAiConsent(currentJourneyAiConsent()).ok).toBe(true);
  });

  it("refuses truthy stand-ins for acceptance", () => {
    for (const accepted of ["true", 1, "yes", {}, null]) {
      const r = parseJourneyAiConsent({ ...currentJourneyAiConsent(), accepted });
      expect(r.ok).toBe(false);
    }
  });

  it("refuses a stale disclosure version", () => {
    const r = parseJourneyAiConsent({
      ...currentJourneyAiConsent(),
      disclosureVersion: "2000-01-01.1",
    });
    expect(r).toEqual({ ok: false, code: "consent-version-stale" });
  });

  it("refuses a non-object and never echoes it", () => {
    expect(parseJourneyAiConsent("newpaths")).toEqual({ ok: false, code: "consent-invalid" });
    expect(parseJourneyAiConsent([])).toEqual({ ok: false, code: "consent-invalid" });
  });
});

/* ----------------------------------------------------------- boundary -- */

describe("participant AI boundary", () => {
  it("makes no provider call when activation is off", async () => {
    const createProvider = vi.fn();
    const result = await runJourneyBoundary(
      { request: dayRequest(1), consent: currentJourneyAiConsent() },
      { env: {}, verifyPilotAdmission: admitted, createProvider },
    );
    expect(result).toEqual({ ok: false, code: "ai-not-activated" });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("makes no provider call while the release lock is closed", async () => {
    const createProvider = vi.fn();
    const result = await runJourneyBoundary(
      { request: dayRequest(1), consent: currentJourneyAiConsent() },
      {
        env: { [JOURNEY_AI_ACTIVATION_ENV]: "true" },
        verifyPilotAdmission: admitted,
        createProvider,
      },
    );
    expect(result).toEqual({ ok: false, code: "ai-not-released" });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("makes no provider call without valid consent", async () => {
    const createProvider = vi.fn();
    const result = await runJourneyBoundary(
      { request: dayRequest(1), consent: { accepted: true } },
      { env: ENV_ON, verifyPilotAdmission: admitted, createProvider },
    );
    expect(result).toEqual({ ok: false, code: "consent-invalid" });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("does not trust a caller-supplied admission claim", async () => {
    const createProvider = vi.fn();
    const result = await runJourneyBoundary(
      {
        request: { ...dayRequest(1), pilotAdmitted: true } as unknown,
        consent: currentJourneyAiConsent(),
      },
      { env: ENV_ON, verifyPilotAdmission: admitted, createProvider },
    );
    // The extra field is refused by the canonical contract.
    expect(result).toEqual({ ok: false, code: "invalid-request" });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("fails closed when the pilot check is unverified or unavailable", async () => {
    const createProvider = vi.fn();
    for (const [admission, code] of [
      [{ ok: false, reason: "not-verified" }, "pilot-not-verified"],
      [{ ok: false, reason: "unavailable" }, "pilot-check-unavailable"],
    ] as const) {
      const result = await runJourneyBoundary(
        { request: dayRequest(1), consent: currentJourneyAiConsent() },
        { env: ENV_ON, verifyPilotAdmission: async () => admission, createProvider },
      );
      expect(result).toEqual({ ok: false, code });
    }
    const thrown = await runJourneyBoundary(
      { request: dayRequest(1), consent: currentJourneyAiConsent() },
      {
        env: ENV_ON,
        verifyPilotAdmission: async () => {
          throw new Error("session store unreachable");
        },
        createProvider,
      },
    );
    expect(thrown).toEqual({ ok: false, code: "pilot-check-unavailable" });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("returns an accepted reflection with an honest live identity", async () => {
    const provider = okProvider(GOOD_TEXT);
    const request = dayRequest(3, [], false);
    const result = await runJourneyBoundary(
      { request, consent: currentJourneyAiConsent() },
      { env: ENV_ON, verifyPilotAdmission: admitted, createProvider: () => provider },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(provider.calls).toBe(1);
    expect(result.text).toBe(GOOD_TEXT);
    expect(result.identity.provenance).toBe("live-model");
    expect(result.identity.canonicalIdentity).toBe(
      identityFor(request).canonicalIdentity,
    );
  });

  it("makes exactly one call and never retries a failure", async () => {
    let calls = 0;
    const provider: JourneyModelProvider = {
      provenance: "live-model",
      async generate() {
        calls += 1;
        return { ok: false, error: "provider-timeout" };
      },
    };
    const result = await runJourneyBoundary(
      { request: dayRequest(1), consent: currentJourneyAiConsent() },
      { env: ENV_ON, verifyPilotAdmission: admitted, createProvider: () => provider },
    );
    expect(result).toEqual({ ok: false, code: "provider-timeout" });
    expect(calls).toBe(1);
  });

  it("never lets a mock transport be recorded as live AI", async () => {
    const provider: JourneyModelProvider = {
      provenance: "mock",
      async generate() {
        return { ok: true, text: GOOD_TEXT, model: JOURNEY_MODEL_ID, finishReason: "stop" };
      },
    };
    const request = dayRequest(1);
    const result = await runJourneyBoundary(
      { request, consent: currentJourneyAiConsent() },
      { env: ENV_ON, verifyPilotAdmission: admitted, createProvider: () => provider },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.identity.provenance).toBe("mock");
    expect(result.identity.canonicalIdentity).not.toBe(
      identityFor(request).canonicalIdentity,
    );
  });

  it("refuses devotional output when spiritual reflection is off", async () => {
    const provider = okProvider(
      "God is holding this for you today, and prayer may ease the weight you named.",
    );
    const result = await runJourneyBoundary(
      { request: dayRequest(4, [], false), consent: currentJourneyAiConsent() },
      { env: ENV_ON, verifyPilotAdmission: admitted, createProvider: () => provider },
    );
    expect(result).toEqual({ ok: false, code: "devotional-leakage" });
  });
});

/* ------------------------------------------- core boundary corrections -- */

describe("provider failure envelopes are whitelisted", () => {
  const cases: Array<[string, unknown]> = [
    ["a provider-invented string", { ok: false, error: "quota_exceeded_v2" }],
    ["a missing error", { ok: false }],
    ["a non-boolean ok", { ok: "false", error: "provider-network" }],
    ["a truthy non-true ok", { ok: 1, error: "provider-network" }],
  ];
  for (const [name, envelope] of cases) {
    it(`turns ${name} into provider-invalid-output`, async () => {
      const provider: JourneyModelProvider = {
        provenance: "live-model",
        async generate() {
          return envelope as never;
        },
      };
      const result = await runJourneyBoundary(
        { request: dayRequest(1), consent: currentJourneyAiConsent() },
        { env: ENV_ON, verifyPilotAdmission: admitted, createProvider: () => provider },
      );
      expect(result).toEqual({ ok: false, code: "provider-invalid-output" });
    });
  }
});

describe("structural formats are not prose", () => {
  const source = prepareJourneyGeneration(
    (parseJourneyRequest(dayRequest(1)) as { ok: true; request: never }).request,
  ).grounding;

  it("rejects a whole JSON object or array", () => {
    for (const text of ['{"reflection":"you named something today"}', '[ "a", "b" ]']) {
      expect(validateJourneyReflection({ text, source })).toEqual({
        ok: false,
        code: "output-not-prose",
      });
    }
  });

  it("rejects a fenced code block", () => {
    const text = "```json\n{\"a\":1}\n```";
    expect(validateJourneyReflection({ text, source })).toEqual({
      ok: false,
      code: "output-not-prose",
    });
  });

  it("keeps a short legitimate paragraph and benign not-diagnosing wording", () => {
    const short = "You showed up today. That counts.";
    expect(validateJourneyReflection({ text: short, source }).ok).toBe(true);
    const benign =
      "This is not about diagnosing yourself. It is only about noticing what has been taking up space.";
    expect(validateJourneyReflection({ text: benign, source }).ok).toBe(true);
  });

  it("keeps prose that merely mentions a brace", () => {
    const text = "You wrote { and then stopped. That pause is worth noticing.";
    expect(validateJourneyReflection({ text, source }).ok).toBe(true);
  });
});

/* ---------------------------------------------------------- transport -- */

describe("live transport", () => {
  const request = {
    systemPolicy: "policy",
    groundedPayload: "payload",
    model: JOURNEY_MODEL_ID,
    maxOutputTokens: 4096,
    deadlineMs: 45_000,
  };

  it("refuses without a key and never calls fetch", async () => {
    const fetchImpl = vi.fn();
    const transport = createJourneyLiveTransport({
      apiKey: undefined,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await transport.generate(request)).toEqual({
      ok: false,
      error: "provider-unavailable",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the exact model and caps, once, with redirects refused", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body.model).toBe(JOURNEY_MODEL_ID);
      expect(body.max_completion_tokens).toBe(4096);
      expect(init.redirect).toBe("error");
      return new Response(
        JSON.stringify({
          model: JOURNEY_MODEL_ID,
          choices: [{ message: { content: GOOD_TEXT }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
        { status: 200 },
      );
    });
    const transport = createJourneyLiveTransport({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await transport.generate(request);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, text: GOOD_TEXT, finishReason: "stop" });
  });

  it("maps statuses to fixed codes without carrying a provider body", async () => {
    for (const [status, error] of [
      [429, "provider-rate-limited"],
      [402, "provider-budget-exhausted"],
      [403, "provider-budget-exhausted"],
      [500, "provider-unavailable"],
    ] as const) {
      const transport = createJourneyLiveTransport({
        apiKey: "k",
        fetchImpl: (async () =>
          new Response("secret provider detail", { status })) as unknown as typeof fetch,
      });
      expect(await transport.generate(request)).toEqual({ ok: false, error });
    }
  });

  it("reports an aborted call as a timeout and a thrown call as network", async () => {
    const abort = createJourneyLiveTransport({
      apiKey: "k",
      fetchImpl: (async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }) as unknown as typeof fetch,
    });
    expect(await abort.generate(request)).toEqual({ ok: false, error: "provider-timeout" });

    const network = createJourneyLiveTransport({
      apiKey: "k",
      fetchImpl: (async () => {
        throw new Error("dns");
      }) as unknown as typeof fetch,
    });
    expect(await network.generate(request)).toEqual({ ok: false, error: "provider-network" });
  });

  it("rejects a body that is not usable JSON", async () => {
    const transport = createJourneyLiveTransport({
      apiKey: "k",
      fetchImpl: (async () => new Response("not json", { status: 200 })) as unknown as typeof fetch,
    });
    expect(await transport.generate(request)).toEqual({
      ok: false,
      error: "provider-invalid-output",
    });
  });
});

/* -------------------------------------------------------------- store -- */

describe("AI response store", () => {
  beforeEach(() => {
    fakeLocal.clear();
  });

  it("returns a saved response only on an exact identity match", () => {
    const request = dayRequest(2, [], false);
    const identity = identityFor(request);
    expect(
      saveAiReflection({
        dayId: "day-2",
        text: GOOD_TEXT,
        paragraphs: [GOOD_TEXT],
        identity,
      }),
    ).toBe(true);

    expect(readAiReflection("day-2", identity.canonicalIdentity)?.text).toBe(GOOD_TEXT);
    expect(readAiReflection("day-2", identity.canonicalIdentity + "x")).toBeNull();
    expect(readAiReflection("day-3", identity.canonicalIdentity)).toBeNull();
  });

  it("stops matching when the spiritual preference changes", () => {
    const identityOff = identityFor(dayRequest(9, [], false));
    const identityOn = identityFor(dayRequest(9, [], true));
    saveAiReflection({
      dayId: "day-9",
      text: GOOD_TEXT,
      paragraphs: [GOOD_TEXT],
      identity: identityOff,
    });
    expect(readAiReflection("day-9", identityOn.canonicalIdentity)).toBeNull();
    expect(readAiReflection("day-9", identityOff.canonicalIdentity)).not.toBeNull();
  });

  it("never writes into the deterministic journey key", () => {
    const identity = identityFor(dayRequest(1));
    saveAiReflection({ dayId: "day-1", text: GOOD_TEXT, paragraphs: [GOOD_TEXT], identity });
    expect(fakeLocal.getItem("bfa.journey.v1")).toBeNull();
  });

  it("removes one day, and all days, without touching answers", () => {
    const identity = identityFor(dayRequest(1));
    fakeLocal.setItem("bfa.journey.v1", '{"answers":{}}');
    saveAiReflection({ dayId: "day-1", text: GOOD_TEXT, paragraphs: [GOOD_TEXT], identity });
    expect(clearAiReflection("day-1")).toBe(true);
    expect(readAiReflection("day-1", identity.canonicalIdentity)).toBeNull();
    saveAiReflection({ dayId: "day-1", text: GOOD_TEXT, paragraphs: [GOOD_TEXT], identity });
    expect(clearAllAiReflections()).toBe(true);
    expect(fakeLocal.getItem("bfa.journey.v1")).toBe('{"answers":{}}');
  });

  it("forgets a recorded choice when the disclosure version moves on", () => {
    expect(aiConsentAccepted()).toBe(false);
    recordAiConsent(true);
    expect(aiConsentAccepted()).toBe(true);
    fakeLocal.setItem(
      "bfa.ai.consent.v1",
      JSON.stringify({ accepted: true, disclosureVersion: "1999-01-01.1" }),
    );
    expect(aiConsentAccepted()).toBe(false);
    expect(JOURNEY_AI_DISCLOSURE_VERSION.length).toBeGreaterThan(0);
  });
});
