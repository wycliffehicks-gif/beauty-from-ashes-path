// All transport traffic is injected local mock behaviour. No provider calls.
import { afterEach, describe, expect, it, vi } from "vitest";
import { getFirstJourneyDay } from "@/content/first-journey";
import { parseJourneyRequest } from "@/lib/ai/journey-contract";
import { prepareJourneyGeneration } from "@/lib/ai/journey-policy";
import { validateJourneyReflection } from "@/lib/ai/journey-response";
import { currentJourneyAiConsent, parseJourneyAiConsent } from "@/lib/ai/journey-consent";
import {
  readJourneyAiAvailability,
  runJourneyBoundary,
  type JourneyBoundaryDeps,
} from "@/lib/ai/journey-boundary";
import { JOURNEY_MODEL_ID, type JourneyProviderRequest } from "@/lib/ai/journey-generation";
import {
  createJourneyLiveTransport,
  JOURNEY_MAX_RESPONSE_BYTES,
} from "@/lib/ai/journey-transport.server";

const rawRequest = {
  day: 1,
  answerMeaningVersion: getFirstJourneyDay(1)!.answerMeaningVersion,
  answers: [],
  spiritual: false,
};
const input = () => ({ request: rawRequest, consent: currentJourneyAiConsent() });
const envOn = { JOURNEY_AI_ENABLED: "true", JOURNEY_AI_RELEASE_READY: "true" };
const request: JourneyProviderRequest = {
  systemPolicy: "Synthetic policy",
  groundedPayload: "Synthetic source",
  model: JOURNEY_MODEL_ID,
  maxOutputTokens: 4096,
  deadlineMs: 45_000,
};
const prose = "You can leave this question open today.";
const jsonResponse = (refusal?: unknown) =>
  JSON.stringify({
    model: JOURNEY_MODEL_ID,
    choices: [{ message: { content: prose, refusal }, finish_reason: "stop" }],
  });
const deps = (overrides: Partial<JourneyBoundaryDeps> = {}): JourneyBoundaryDeps => ({
  env: envOn,
  verifyPilotAdmission: async () => ({ ok: true }),
  createProvider: () => ({
    provenance: "live-model",
    async generate() {
      return { ok: true, text: prose, model: JOURNEY_MODEL_ID, finishReason: "stop" };
    },
  }),
  ...overrides,
});

afterEach(() => vi.useRealTimers());

describe("current gateway contract and bounded transport", () => {
  it("uses the previously established Bearer auth and max_tokens contract", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer synthetic-key");
      expect(headers.has("Lovable-API-Key")).toBe(false);
      expect(init?.redirect).toBe("error");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe(JOURNEY_MODEL_ID);
      expect(body.max_tokens).toBe(4096);
      expect(body).not.toHaveProperty("max_completion_tokens");
      return new Response(jsonResponse());
    });
    const provider = createJourneyLiveTransport({ apiKey: "synthetic-key", fetchImpl });
    expect(await provider.generate(request)).toMatchObject({ ok: true, text: prose });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("times out a body which ignores AbortSignal and cancels its reader", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Response(new ReadableStream({ cancel }));
    });
    const provider = createJourneyLiveTransport({ apiKey: "synthetic-key", fetchImpl });
    const pending = provider.generate({ ...request, deadlineMs: 10 });
    await vi.advanceTimersByTimeAsync(11);
    expect(await pending).toEqual({ ok: false, error: "provider-timeout" });
    expect(cancel).toHaveBeenCalled();
    expect(signal?.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns at the deadline even if fetch ignores abort, then cancels a late body", async () => {
    vi.useFakeTimers();
    let resolveFetch!: (response: Response) => void;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const provider = createJourneyLiveTransport({ apiKey: "synthetic-key", fetchImpl });
    const pending = provider.generate({ ...request, deadlineMs: 10 });
    await vi.advanceTimersByTimeAsync(11);
    expect(await pending).toEqual({ ok: false, error: "provider-timeout" });
    const cancel = vi.fn();
    resolveFetch(new Response(new ReadableStream({ cancel })));
    await Promise.resolve();
    await Promise.resolve();
    expect(cancel).toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("cancels an oversized body and aborts the request without reading or retrying further", async () => {
    const cancel = vi.fn();
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(JOURNEY_MAX_RESPONSE_BYTES + 1));
          },
          cancel,
        }),
      );
    });
    const provider = createJourneyLiveTransport({ apiKey: "synthetic-key", fetchImpl });
    expect(await provider.generate(request)).toEqual({
      ok: false,
      error: "provider-invalid-output",
    });
    expect(cancel).toHaveBeenCalled();
    expect(signal?.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects explicit refusal even when content and a complete finish exist", async () => {
    for (const refusal of ["synthetic refusal", { reason: "synthetic refusal" }]) {
      const provider = createJourneyLiveTransport({
        apiKey: "synthetic-key",
        fetchImpl: async () => new Response(jsonResponse(refusal)),
      });
      expect(await provider.generate(request)).toEqual({
        ok: false,
        error: "provider-invalid-output",
      });
    }
  });

  it("accepts absent, null or empty refusal metadata", async () => {
    for (const refusal of [undefined, null, ""]) {
      const provider = createJourneyLiveTransport({
        apiKey: "synthetic-key",
        fetchImpl: async () => new Response(jsonResponse(refusal)),
      });
      expect(await provider.generate(request)).toMatchObject({ ok: true, text: prose });
    }
  });
});

describe("strict participant admission, consent and provider construction", () => {
  it("requires exactly the current consent fields, including own fields", () => {
    const current = currentJourneyAiConsent();
    expect(parseJourneyAiConsent(current).ok).toBe(true);
    for (const malformed of [
      { ...current, extra: "synthetic marker" },
      { accepted: true, disclosureVersion: current.disclosureVersion },
      Object.create(current),
    ]) {
      expect(parseJourneyAiConsent(malformed)).toEqual({ ok: false, code: "consent-invalid" });
    }
  });

  it("refuses extra outer request fields before creating a provider", async () => {
    const createProvider = vi.fn();
    expect(
      await runJourneyBoundary({ ...input(), extra: "synthetic marker" }, deps({ createProvider })),
    ).toEqual({ ok: false, code: "invalid-request" });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("maps malformed admission responses to a fixed refusal with zero provider creation", async () => {
    const createProvider = vi.fn();
    for (const raw of [
      null,
      undefined,
      {},
      { ok: "true" },
      { ok: true, extra: 1 },
      { ok: false, reason: "synthetic marker" },
    ]) {
      const result = await runJourneyBoundary(
        input(),
        deps({
          createProvider,
          verifyPilotAdmission: async () => raw as never,
        }),
      );
      expect(result).toEqual({ ok: false, code: "pilot-check-unavailable" });
    }
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("normalizes a rejected provider factory without exposing its exception", async () => {
    const result = await runJourneyBoundary(
      input(),
      deps({
        createProvider: async () => {
          throw new Error("synthetic upstream factory marker");
        },
      }),
    );
    expect(result).toEqual({ ok: false, code: "provider-unavailable" });
  });

  it("refuses mock provenance at the participant boundary before any generation", async () => {
    const generate = vi.fn();
    const result = await runJourneyBoundary(
      input(),
      deps({
        createProvider: () => ({ provenance: "mock", generate }),
      }),
    );
    expect(result).toEqual({ ok: false, code: "provider-invalid-output" });
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("read-only availability", () => {
  it("does not inspect pilot admission while activation or readiness is off", async () => {
    const verifyPilotAdmission = vi.fn();
    expect(await readJourneyAiAvailability({ env: {}, verifyPilotAdmission })).toEqual({
      available: false,
      code: "ai-not-activated",
    });
    expect(
      await readJourneyAiAvailability({
        env: { JOURNEY_AI_ENABLED: "true" },
        verifyPilotAdmission,
      }),
    ).toEqual({ available: false, code: "ai-not-released" });
    expect(verifyPilotAdmission).not.toHaveBeenCalled();
  });

  it("returns only the allowed status after signed pilot admission", async () => {
    expect(
      await readJourneyAiAvailability({
        env: envOn,
        verifyPilotAdmission: async () => ({ ok: true }),
      }),
    ).toEqual({ available: true });
    expect(
      await readJourneyAiAvailability({
        env: envOn,
        verifyPilotAdmission: async () => ({ ok: false, reason: "not-verified" }),
      }),
    ).toEqual({ available: false, code: "pilot-not-verified" });
    expect(
      await readJourneyAiAvailability({
        env: envOn,
        verifyPilotAdmission: async () => {
          throw new Error("synthetic marker");
        },
      }),
    ).toEqual({ available: false, code: "pilot-check-unavailable" });
  });
});

describe("narrow benign wording exclusions", () => {
  const parsed = parseJourneyRequest(rawRequest);
  if (!parsed.ok) throw new Error("invalid synthetic fixture");
  const source = prepareJourneyGeneration(parsed.request).grounding;

  for (const text of [
    "This reflection will not cure grief. It may give you a moment to notice what is here.",
    "There is no guarantee of healing.",
    "If you have depression, appropriate support may help.",
  ]) {
    it(`accepts the bounded benign case: ${text}`, () => {
      expect(validateJourneyReflection({ text, source }).ok).toBe(true);
    });
  }

  for (const [text, code] of [
    ["This reflection will cure grief.", "unsupported-therapeutic-guarantee"],
    ["There is a guarantee of healing.", "unsupported-therapeutic-guarantee"],
    ["You have depression, and support will help.", "affirmative-diagnosis"],
    [
      "There is no guarantee of healing. This practice will cure grief.",
      "unsupported-therapeutic-guarantee",
    ],
    [
      "If you have depression, appropriate support may help. You clearly have PTSD.",
      "affirmative-diagnosis",
    ],
    ["I wonder if you have depression.", "affirmative-diagnosis"],
  ]) {
    it(`still rejects an affirmative statement: ${text}`, () => {
      expect(validateJourneyReflection({ text, source })).toEqual({ ok: false, code });
    });
  }
});
