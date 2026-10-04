import type { OfflineAdapter, AdapterRequest } from "./comparison";

/** Handwritten deterministic stubs exercise plumbing, never stand in for model quality. */
function textFor(request: AdapterRequest, variant: number) {
  const source = JSON.parse(request.groundedPayload);
  const labels = source.selections.flatMap((s: { labels: string[] }) => s.labels);
  const privateOrSparse =
    labels.length === 0 || labels.some((s: string) => /private|rather not|not sure/i.test(s));
  if (privateOrSparse)
    return variant === 0
      ? "You can leave this here without explaining anything further. There is no requirement to make a selection or turn this moment into a task."
      : "There is room to keep this private or unfinished. You do not have to offer more words today.";
  return variant === 0
    ? "What you selected can receive attention without needing to become something different straight away. There is no requirement to turn this reflection into a task."
    : "There can be room for what you selected as it is today. You do not need to reach a conclusion or prove that something has changed.";
}
export function simulatedAdapters(): OfflineAdapter[] {
  return [0, 1].map((variant) => ({
    id: `simulation-${variant + 1}`,
    provenance: "offline-simulation" as const,
    version: "handwritten-stub-v1",
    modelLabel: `NO MODEL — deterministic stub ${variant + 1}`,
    async generate(request: AdapterRequest) {
      return { text: textFor(request, variant), finishReason: "complete" as const };
    },
  }));
}
