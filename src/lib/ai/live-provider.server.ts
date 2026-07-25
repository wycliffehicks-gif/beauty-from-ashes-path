// Server-only Lovable AI Gateway provider.
//
// Never imported at module scope from any *.functions.ts or route file.
// The `.server.ts` filename triggers the client-bundle guard so a stray
// import from the client would fail the build.

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
      "Correct ONLY that rule. Keep everything else within the approved content pack and the system policy.",
      "Return strict JSON matching the six-section schema. No prose, no markdown, no code fences.",
    ].join(" ");
  }
  return [
    "Produce the Day 1 personalized reflection now.",
    "Return strict JSON matching the six-section schema — no prose, no markdown, no code fences.",
    "Use only IDs that exist in the provided CONTENT PACK.",
  ].join(" ");
}

export function createLovableAiProvider(apiKey: string | undefined): LiveModelProvider {
  return {
    async generate(req: LiveProviderRequest): Promise<LiveProviderResult> {
      if (!apiKey) return { ok: false, error: "missing-key" };

      const body = {
        model: LIVE_MODEL_ID,
        temperature: 0.2,
        top_p: 0.8,
        response_format: { type: "json_object" as const },
        messages: [
          { role: "system", content: req.systemPolicy },
          {
            role: "system",
            content:
              "APPROVED CONTENT PACK (never invent new IDs — reference only these):\n" +
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
        // Intentionally do NOT log the request body or user data.
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
