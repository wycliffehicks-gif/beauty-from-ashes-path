import { afterEach, describe, expect, it } from "vitest";
import { liveAiEnabled, LIVE_AI_ENABLED_DEFAULT } from "@/lib/ai-reflection.functions";

const KEY = "LIVE_AI_ENABLED";
const original = process.env[KEY];

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
});

describe("liveAiEnabled() feature flag", () => {
  it("defaults to enabled (true) when the env var is absent (private founder test)", () => {
    delete process.env[KEY];
    expect(LIVE_AI_ENABLED_DEFAULT).toBe(true);
    expect(liveAiEnabled()).toBe(true);
  });

  it("is disabled when set to 'false'", () => {
    process.env[KEY] = "false";
    expect(liveAiEnabled()).toBe(false);
  });

  it("is disabled when set to '0'", () => {
    process.env[KEY] = "0";
    expect(liveAiEnabled()).toBe(false);
  });

  it("is disabled when set to 'FALSE' (case-insensitive)", () => {
    process.env[KEY] = "FALSE";
    expect(liveAiEnabled()).toBe(false);
  });

  it("is enabled when set to 'true'", () => {
    process.env[KEY] = "true";
    expect(liveAiEnabled()).toBe(true);
  });

  it("is enabled when set to '1'", () => {
    process.env[KEY] = "1";
    expect(liveAiEnabled()).toBe(true);
  });
});
