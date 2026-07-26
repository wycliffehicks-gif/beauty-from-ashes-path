import { runLivePipeline } from "./src/lib/ai/live-pipeline";
import { createLovableAiProvider } from "./src/lib/ai/live-provider.server";

const provider = createLovableAiProvider(process.env.LOVABLE_API_KEY);
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
  provider,
  liveAiEnabled: true,
});

// Print only non-sensitive metadata/telemetry — never the free text or generated body.
console.log(JSON.stringify({
  kind: result.kind,
  meta: result.kind === "reflection" ? result.meta : null,
  telemetry,
  outputShape: result.kind === "reflection" ? {
    hearingLen: result.output.hearing?.length ?? 0,
    themeId: result.output.theme?.id ?? null,
    nextStepsCount: result.output.nextSteps?.length ?? 0,
    oneHonestStepId: result.output.oneHonestStep?.id ?? null,
    spiritualNull: result.output.spiritualReflection === null,
    whenMoreSupportLen: result.output.whenMoreSupport?.length ?? 0,
  } : null,
}, null, 2));
