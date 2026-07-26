import { describe, expect, it, vi } from "vitest";
import { runLivePipeline } from "@/lib/ai/live-pipeline";
import { buildDay01Fallback } from "@/content/ai/fallback-day-01";
import { selectDay01Reflection } from "@/lib/ai/select-day-01";
import type { LiveModelProvider } from "@/lib/ai/live-provider";
import type { ReflectionInput } from "@/lib/ai/schemas";

const validInput: ReflectionInput = {
  dayId: "day-01",
  roadType: "difficult-conversation",
  emotion: "fear",
  energy: "some",
  notSafeNow: false,
  adultConfirmed: true,
  spiritual: false,
  region: "CA",
};

function mkProvider(...responses: Array<{ ok: boolean; raw?: unknown }>): {
  provider: LiveModelProvider;
  calls: number;
} {
  let i = 0;
  const state = { calls: 0 };
  const provider: LiveModelProvider = {
    generate: vi.fn(async () => {
      state.calls++;
      const r = responses[Math.min(i, responses.length - 1)];
      i++;
      return r.ok
        ? ({ ok: true, raw: r.raw } as const)
        : ({ ok: false, error: "parse" } as const);
    }),
  };
  return {
    provider,
    get calls() {
      return state.calls;
    },
  } as { provider: LiveModelProvider; calls: number };
}

describe("runLivePipeline — safety cases skip the provider", () => {
  it("urgent-safety notSafeNow → no provider call", async () => {
    const { provider } = mkProvider();
    const { result, telemetry } = await runLivePipeline({
      rawInput: { ...validInput, notSafeNow: true },
      provider,
      liveAiEnabled: true,
    });
    expect(result.kind).toBe("urgent-safety");
    expect(telemetry.providerCalls).toBe(0);
  });

  it("minor-not-eligible → no provider call", async () => {
    const { provider } = mkProvider();
    const { result, telemetry } = await runLivePipeline({
      rawInput: { ...validInput, adultConfirmed: false },
      provider,
      liveAiEnabled: true,
    });
    expect(result.kind).toBe("input-invalid");
    expect(telemetry.providerCalls).toBe(0);
  });

  it("self-harm free text → no provider call", async () => {
    const { provider } = mkProvider();
    const { result, telemetry } = await runLivePipeline({
      rawInput: { ...validInput, freeText: "I want to die." },
      provider,
      liveAiEnabled: true,
    });
    expect(result.kind).toBe("urgent-safety");
    expect(telemetry.providerCalls).toBe(0);
  });
});

describe("runLivePipeline — live AI disabled (emergency switch)", () => {
  it("returns curated fallback and never calls the provider", async () => {
    const { provider } = mkProvider();
    const { result, telemetry } = await runLivePipeline({
      rawInput: validInput,
      provider,
      liveAiEnabled: false,
    });
    expect(result.kind).toBe("reflection");
    expect(telemetry.providerCalls).toBe(0);
    expect(telemetry.fallbackUsed).toBe(true);
    if (result.kind === "reflection") {
      expect(result.meta.aiEnabled).toBe(false);
    }
  });
});

describe("runLivePipeline — validation, retry, and fallback", () => {
  it("valid first attempt → returned as reflection, no retry", async () => {
    const goodOutput = selectDay01Reflection(validInput);
    const { provider } = mkProvider({ ok: true, raw: goodOutput });
    const { result, telemetry } = await runLivePipeline({
      rawInput: validInput,
      provider,
      liveAiEnabled: true,
    });
    expect(result.kind).toBe("reflection");
    expect(telemetry.providerCalls).toBe(1);
    expect(telemetry.retried).toBe(false);
    expect(telemetry.fallbackUsed).toBe(false);
    if (result.kind === "reflection") expect(result.meta.aiEnabled).toBe(true);
  });

  it("invalid then valid → exactly one retry, no fallback", async () => {
    const goodOutput = selectDay01Reflection(validInput);
    const { provider } = mkProvider(
      { ok: true, raw: { garbage: true } },
      { ok: true, raw: goodOutput },
    );
    const { result, telemetry } = await runLivePipeline({
      rawInput: validInput,
      provider,
      liveAiEnabled: true,
    });
    expect(result.kind).toBe("reflection");
    expect(telemetry.providerCalls).toBe(2);
    expect(telemetry.retried).toBe(true);
    expect(telemetry.fallbackUsed).toBe(false);
  });

  it("two invalid attempts → curated fallback, no third call", async () => {
    const { provider } = mkProvider(
      { ok: true, raw: { garbage: true } },
      { ok: true, raw: { still: "bad" } },
    );
    const { result, telemetry } = await runLivePipeline({
      rawInput: validInput,
      provider,
      liveAiEnabled: true,
    });
    expect(result.kind).toBe("reflection");
    expect(telemetry.providerCalls).toBe(2);
    expect(telemetry.fallbackUsed).toBe(true);
    if (result.kind === "reflection") {
      // Matches curated fallback shape (spiritual=false).
      expect(result.output.hearing).toBe(buildDay01Fallback(false).hearing);
    }
  });

  it("spiritual preference respected: model returns spiritual when disabled → treated as invalid", async () => {
    const badOutput = selectDay01Reflection({ ...validInput, spiritual: true });
    // The user asked for spiritual=false. If the model still returns a
    // spiritualReflection, the validator must reject it and the retry
    // path must be exercised.
    const goodOutput = selectDay01Reflection({ ...validInput, spiritual: false });
    const { provider } = mkProvider(
      { ok: true, raw: badOutput },
      { ok: true, raw: goodOutput },
    );
    const { result, telemetry } = await runLivePipeline({
      rawInput: { ...validInput, spiritual: false },
      provider,
      liveAiEnabled: true,
    });
    expect(telemetry.retried).toBe(true);
    expect(result.kind).toBe("reflection");
    if (result.kind === "reflection") {
      expect(result.output.spiritualReflection).toBeNull();
    }
  });

  it("invented (unknown) IDs → rejected, fallback used after retry", async () => {
    const good = selectDay01Reflection(validInput);
    const forged = { ...good, theme: { id: "t-invented", gloss: good.theme.gloss } };
    const { provider } = mkProvider(
      { ok: true, raw: forged },
      { ok: true, raw: forged },
    );
    const { result, telemetry } = await runLivePipeline({
      rawInput: validInput,
      provider,
      liveAiEnabled: true,
    });
    expect(telemetry.fallbackUsed).toBe(true);
    expect(result.kind).toBe("reflection");
  });

  it("provider network error twice → fallback, exactly two calls", async () => {
    const { provider } = mkProvider({ ok: false }, { ok: false });
    const { result, telemetry } = await runLivePipeline({
      rawInput: validInput,
      provider,
      liveAiEnabled: true,
    });
    expect(telemetry.providerCalls).toBe(2);
    expect(telemetry.fallbackUsed).toBe(true);
    expect(result.kind).toBe("reflection");
  });
});
