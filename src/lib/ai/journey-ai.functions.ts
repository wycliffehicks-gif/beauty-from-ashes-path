// The participant-facing server boundary for the current ten-day AI reflection.
//
// It accepts only the canonical four-field day request plus a separately
// validated consent envelope. Source material, policy, model, caps and
// provenance are ALL rebuilt on the server; a caller can supply none of them.
//
// Activation is OFF by default, so with nothing configured this function makes
// no gateway call and returns a fixed refusal.

import { createServerFn } from "@tanstack/react-start";

import {
  readJourneyAiAvailability,
  runJourneyBoundary,
  type JourneyAiAvailability,
  type JourneyBoundaryResult,
  type PilotAdmission,
} from "@/lib/ai/journey-boundary";

export type { JourneyAiAvailability, JourneyBoundaryResult } from "@/lib/ai/journey-boundary";

function env(): Record<string, string | undefined> | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
}

async function verifyPilotAdmission(): Promise<PilotAdmission> {
  const expected = env()?.["SITE_PASSWORD"];
  if (!expected || !expected.trim()) return { ok: false, reason: "unavailable" };
  try {
    const { getGateSession } = await import("@/lib/gate.server");
    const session = await getGateSession();
    return session.data.unlocked === true ? { ok: true } : { ok: false, reason: "not-verified" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** No answers or credentials are returned, and this path cannot create a provider. */
export const getJourneyAiAvailability = createServerFn({ method: "GET" }).handler(
  async (): Promise<JourneyAiAvailability> =>
    readJourneyAiAvailability({ env: env(), verifyPilotAdmission }),
);

export const generateJourneyAiReflection = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data)
  .handler(async ({ data }): Promise<JourneyBoundaryResult> => {
    return runJourneyBoundary(data, {
      env: env(),
      // Missing pilot protection, an invalid cookie or any error fails closed.
      verifyPilotAdmission,
      // Loaded only at this point, so a refused request never even
      // constructs a transport or touches the gateway module.
      createProvider: async () => {
        const mod = await import("@/lib/ai/journey-transport.server");
        return mod.createJourneyLiveTransport({ apiKey: env()?.["LOVABLE_API_KEY"] });
      },
    });
  });
