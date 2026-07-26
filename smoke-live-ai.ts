import { runLivePipeline } from "./src/lib/ai/live-pipeline";
import { createLovableAiProvider } from "./src/lib/ai/live-provider.server";
import type { LiveModelProvider } from "./src/lib/ai/live-provider";
import { validateReflectionOutput } from "./src/lib/ai/validator";

const inner = createLovableAiProvider(process.env.LOVABLE_API_KEY);
const wrap: LiveModelProvider = {
  async generate(req) {
    const r = await inner.generate(req);
    if (r.ok) {
      const raw = r.raw as Record<string, unknown>;
      console.log("---RAW KEYS---", Object.keys(raw));
      console.log("---RAW---", JSON.stringify(raw, null, 2).slice(0, 4000));
      const v = validateReflectionOutput({ output: raw, spiritualPreference: false });
      console.log("---VALIDATION---", v);
    } else {
      console.log("---PROVIDER ERROR---", r.error, (r as { detail?: string }).detail);
    }
    return r;
  },
};

const { result, telemetry } = await runLivePipeline({
  rawInput: {
    dayId: "day-01",
    roadType: "not-sure",
    emotion: "numbness",
    energy: "very-little",
    notSafeNow: false,
    adultConfirmed: true,
    spiritual: false,
    region: "CA",
  },
  provider: wrap,
  liveAiEnabled: true,
});
console.log("===FINAL===", JSON.stringify({ kind: result.kind, telemetry, meta: result.kind === "reflection" ? result.meta : null }, null, 2));
