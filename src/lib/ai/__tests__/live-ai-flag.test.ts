// The dormant AI modules must FAIL CLOSED. Nothing in the customer-facing
// First Journey imports or calls them; these tests exist so a future accidental
// activation is impossible without a deliberate, documented env value.

import { afterEach, describe, expect, it } from "vitest";
import {
  liveAiEnabled,
  LIVE_AI_ENABLED_DEFAULT,
  LIVE_AI_ENABLED_VALUES,
} from "@/lib/ai-reflection.functions";
import { sessionLiveAiEnabled } from "@/lib/session-reflection.functions";

const KEY = "LIVE_AI_ENABLED";
const original = process.env[KEY];

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
});

const readers: [string, () => boolean][] = [
  ["liveAiEnabled", liveAiEnabled],
  ["sessionLiveAiEnabled", sessionLiveAiEnabled],
];

describe("dormant AI flag fails closed", () => {
  it("documents exactly two enabling values", () => {
    expect(LIVE_AI_ENABLED_DEFAULT).toBe(false);
    expect([...LIVE_AI_ENABLED_VALUES]).toEqual(["true", "1"]);
  });

  for (const [name, read] of readers) {
    describe(name, () => {
      it("is disabled when the env var is absent", () => {
        delete process.env[KEY];
        expect(read()).toBe(false);
      });

      for (const value of ["", "   ", "false", "FALSE", "0", "no", "off", "yes", "on", "2", "truthy", "tru"]) {
        it(`is disabled for ${JSON.stringify(value)}`, () => {
          process.env[KEY] = value;
          expect(read()).toBe(false);
        });
      }

      for (const value of ["true", "TRUE", " True ", "1", " 1 "]) {
        it(`is enabled only for the documented value ${JSON.stringify(value)}`, () => {
          process.env[KEY] = value;
          expect(read()).toBe(true);
        });
      }
    });
  }
});
