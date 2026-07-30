// Server-only Lovable AI Gateway provider for the Week 1 session reflection.
//
// Separate from the Day 1 provider so neither can affect the other. The
// `.server.ts` filename triggers the client-bundle guard.

import {
  LIVE_MODEL_ID,
  type LiveModelProvider,
  type LiveProviderRequest,
  type LiveProviderResult,
} from "@/lib/ai/live-provider";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function buildUserInstruction(correctionNote?: string): string {
  if (correctionNote) {
    return [
      "The previous attempt failed one validation rule and must be corrected.",
      `Failed rule (internal code): ${correctionNote}.`,
      "Correct ONLY that rule. Keep every id from the approved CONTENT PACK and keep all six sections.",
      "Return strict JSON only — no prose, no markdown, no code fences.",
    ].join(" ");
  }
  return [
    "Produce the Week 1 session Compassionate Attunement reflection now.",
    "Return strict JSON with exactly the six keys: hearing, pulls, protection, cost, holding, support.",
    "Every id must be copied exactly from the provided CONTENT PACK. No spiritual or religious content.",
  ].join(" ");
}

export function createSessionAiProvider(apiKey: string | undefined): LiveModelProvider {
  return {
    async generate(req: LiveProviderRequest): Promise<LiveProviderResult> {
      if (!apiKey) return { ok: false, error: "missing-key" };

      const body = {
        model: LIVE_MODEL_ID,
        temperature: 0.3,
        top_p: 0.8,
        response_format: { type: "json_object" as const },
        messages: [
          { role: "system", content: req.systemPolicy },
          {
            role: "system",
            content:
              "APPROVED CONTENT PACK (never invent new ids — reference only these):\n" +
              req.packPayload,
          },
          { role: "user", content: buildUserInstruction(req.correctionNote) },
        ],
      };

      let res: Response;
      try {
        res = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch {
        return { ok: false, error: "network" };
      }

      if (!res.ok) {
        // Never log the request body or any user data.
        return { ok: false, error: "http", detail: String(res.status) };
      }

      let data: { choices?: Array<{ message?: { content?: string } }> };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        return { ok: false, error: "parse" };
      }

      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) return { ok: false, error: "empty" };

      try {
        return { ok: true, raw: JSON.parse(content) as unknown };
      } catch {
        return { ok: false, error: "parse" };
      }
    },
  };
}
