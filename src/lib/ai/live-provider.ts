// Client-safe interface for a live model provider.
//
// The concrete implementation lives in `live-provider.server.ts` and is
// dynamically imported inside the server function handler so no provider
// call code, no policy string, and no API key ever ships to the browser.

export interface LiveProviderRequest {
  systemPolicy: string;
  packPayload: string;
  correctionNote?: string;
}

export type LiveProviderResult =
  | { ok: true; raw: unknown }
  | { ok: false; error: "http" | "empty" | "parse" | "network" | "missing-key"; detail?: string };

export interface LiveModelProvider {
  generate(req: LiveProviderRequest): Promise<LiveProviderResult>;
}

export const LIVE_MODEL_ID = "google/gemini-3.6-flash";
export const LIVE_PROVIDER_VERSION = "2026-07-25.1";
