# Diagnostic result and proposed next step: fictional-data OpenAI smoke test

## Diagnostic findings (read-only, no changes made)

- **Repository state:** HEAD is `0e44e9526899f65524c9393d9f2e32b8cf115400` ("Work in progress" — the normal autosave/sync commit). Working tree is clean.
- **OPENAI_API_KEY:** not configured in this workspace (boolean: present=false). Configured secrets are only LOVABLE_API_KEY (managed), SESSION_SECRET and SITE_PASSWORD.
- **Participant AI switches:** JOURNEY_AI_ENABLED, JOURNEY_AI_RELEASE_READY and LIVE_AI_ENABLED are all present=false, enabled=false. Participant AI remains off; the app remains unpublished.
- **Existing fictional smoke cases:** `scripts/offline-ai/run-comparison.ts` runs the three prepared fictional cases entirely offline — it hard-blocks `fetch` and throws if any network call is attempted. It cannot be reused for a live provider call without breaking its offline-only invariant, so it stays untouched.
- **Reusable pieces:** the eval harness (`src/lib/ai/eval/harness.ts`, `fixtures.ts`) already defines allowlisted fictional fixtures, a call cap, dry-run mode and a provider interface. Only its provider (`gateway-provider.server.ts`) points at the Lovable AI Gateway; a sibling direct-OpenAI provider is the natural minimal addition.

## Simplest supported secure way to add the key

Carl adds OPENAI_API_KEY himself in Project Settings → Secrets. It then reaches server-side code as an environment variable; the value is never printed, copied or shown in chat.

## Proposed next step (only on approval)

1. Carl adds OPENAI_API_KEY in Project Settings → Secrets (no value in chat).
2. Add one new server-only file, e.g. `src/lib/ai/eval/openai-provider.server.ts`, implementing the existing `EvalProvider` interface against `https://api.openai.com/v1/chat/completions` with the same deadline/bounded-body/no-retry discipline as the existing gateway provider. No AWS, no Lovable AI Gateway fallback.
3. Add one new runner, e.g. `scripts/ai-eval/run-openai-smoke.ts`, that reuses the existing allowlisted fictional fixtures and call cap, reads the key from the server environment, and writes artifacts outside `public/`. The offline-only runner and all app source stay unchanged.
4. Run the three fictional smoke cases once; report pass/fail and token usage counts only.
5. Participant AI stays off, the app stays unpublished, no reflection-model routes are wired, nothing is purchased beyond the per-call OpenAI usage Carl authorized.

## Constraints kept

No edits in this diagnostic; no credentials in chat; no changes to the offline runner, ten-day content, server wiring, candidate policy, dependencies or build config; no publication.
