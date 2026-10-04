# Beauty from Ashes: AI input boundary and fictional test preparation

**Historical audit.** The findings below describe the inspected baseline. The later
preparation in GitHub commit `e1ef13285b0b75783811573c672c277d779139ff` replaces the
application-owned raw error reporting described here with bounded reporting and
adds dormant usage-reservation logic. See `USAGE_AND_LOGGING_PREPARATION.md` and
`OFFLINE_PREPARATION_STATUS.md` for the current evidence. Platform/provider logs
remain unverified, and the reservation logic is still not wired into live AI.
The original findings and source provenance are retained below.

Updated 4 October 2026 against local content commit `b6dd780ea352f2ce2612fa3e9f870ec17753f25c` on `improve/pilot-wording-current-2026-10-03`, based on public main `866e7a949c57bdcde4f9fd7773cda3b1b1abe7a1`. This includes the approved wording changes locally; their deployment is not established by this audit. This is a source and local-test review. It is **not** a deployed-provider, privacy-compliance, clinical-safety or launch-readiness approval. No model request, provider/account change or deployment was made.

## What is already implemented

| Area | Evidence and result |
| --- | --- |
| Current-day input only | `src/routes/day.$day.tsx` loads `answersForDay(progress, content)`, derives preference-appropriate `presentationAnswers`, and supplies only the four request fields to `JourneyAiReflection`. `useJourneyAiReflection.ts` sends that request with a separate versioned consent envelope. The Day 10 prior-days display is separate and is not included in AI grounding. |
| Strict server contract | `src/lib/ai/journey-contract.ts` accepts exactly `day`, `answerMeaningVersion`, `answers`, `spiritual`. All four are required. Unknown fields, free text, history, invalid days/versions, unknown option IDs, duplicate selections, single-choice conflicts and exclusive-option conflicts are rejected. Up to 64 string tokens are allowed; the canonical option sets impose tighter practical limits. Stable ID and supported index tokens resolve against that day's authored questions. |
| Server-owned source | `journey-grounding.ts` builds current-day teaching, question wording, selected labels and the appropriate practice from source. A caller cannot supply teaching, a prompt, a model or an arbitrary source passage. Missing answers remain unknown; a selected step is marked `reportedDone: false`. Spiritual-only selections and spiritual practice are withheld when the preference is off. |
| Separate admission and consent | `journey-boundary.ts` requires both release flags, exact envelope `{request, consent}`, current explicit AI consent, a valid request and server-verified pilot admission before creating a provider. The consent assertion is not verified identity, age or clinical consent. |
| Prompt and output limits | `journey-policy.ts` treats source as data, prohibits invented history and limits optional guidance. The server constructs the policy. `journey-generation.ts` allows one call, at most 4,096 output tokens, 45 seconds and 24,000 prepared characters. The current adapter bounds response size and blocks redirects. The plain-text output validator is heuristic, not proof of semantic or clinical safety. |
| Display and local reuse | `JourneyAiReflection.tsx` renders paragraphs as React text, not provider HTML. Storage identity includes content, policy, versions, selections and faith preference. Faith-on and faith-off results have separate local paths. The controller requires explicit generation, reuses a matching saved response and suppresses stale completions after a change, clear or consent withdrawal. Local identity is a cache-match mechanism, not authentication or anonymisation. |

The API accepts coded selections; the provider would receive server-derived labels and relevant day material. Those labels may still reveal sensitive emotional or spiritual information. The absence of name/email fields does not make a request anonymous. The policy is also used in client cache identity preparation; it is not a secret. Protection relies on server-owned construction and input validation, not hiding prompt text.

## Current gates and provider: do not infer deployment from this preparation

- Public main `866e7a9` disables the ordinary entry code by making `getGateStatus()` in `src/lib/gate.functions.ts` always return `{ required: false, unlocked: true }`. There is no `site-access.ts` flag in this implementation. The existing UI opens after that status response. `unlockSite` still validates a supplied code and can set a signed session; ordinary visitors are no longer shown that code form. Open app access does **not** authorise AI: `journey-ai.functions.ts` independently requires a configured `SITE_PASSWORD` and an unlocked signed session. Previously unlocked cookies may remain valid. Preserve this fail-closed distinction and settle a deliberate AI admission route before activation.
- `JOURNEY_AI_ENABLED` and `JOURNEY_AI_RELEASE_READY` both default false and must both permit the request. Actual deployed environment values were not inspected in this audit.
- The adapter is still `journey-transport.server.ts`, targeting Lovable's AI gateway. Its model constant currently resolves to `google/gemini-3.6-flash` in source. This is a configuration observation, not verification of that model's present external availability. Azure/AWS account tests do not migrate the app. A provider decision still requires a reviewed adapter, exact model ID, quota, account terms and cost controls.
- The disclosure still describes optional selected-answer processing through Lovable, with retention/processing details unresolved (`journey-disclosure.ts`, version `2026-09-07.2`). Any provider or material disclosure change needs an explicit version update and a renewed AI choice.
- The separate legacy `LIVE_AI_ENABLED` path must not be enabled as a shortcut around the current journey boundary.

## Logging, network and cost: confirmed limits to our claims

The reviewed AI adapter sends only its server-owned model, token cap and system/user messages. It does not add a participant IP, name, email or arbitrary client metadata to that request body. It catches ordinary provider errors and returns fixed codes rather than raw bodies or exception text.

Other application error boundaries log or forward raw errors: `src/routes/__root.tsx`, `src/start.ts`, `src/server.ts`, `src/lib/lovable-error-reporting.ts` and `src/lib/error-capture.ts`. Conditional browser hooks can receive raw exceptions, path/context or message/stack. **No participant-answer leak was observed.** Nevertheless, these unsanitised paths prevent a claim that the app has no error telemetry. Hosting access logs, network metadata, platform hooks, retention, provider logging and human access were not inspected. External font requests are present; asset requests alone do not prove reflection transmission.

Per-call token limits, a browser cache and in-tab deduplication are **not a server-enforced total spending ceiling**. No cumulative server allowance was found in this current AI boundary. Verify an enforceable allowance and provider billing controls before paid participant use.

## Prepared SRT comparison assets

- `SRT_RESPONSE_INSTRUCTIONS_v1.txt` is a proposed addition to the existing `journey-p4` policy. It adds Carl's acceptance/expression stance and explicit optional writing/speaking mechanics while preserving the existing grounding and one-invitation limit. It is **not imported or installed**.
- `fictional-ai-fixtures.v1.json` binds fictional scenarios to actual canonical IDs and the four-field request contract at the audited commit. Day 8 uses `v2`; the other days use `v1`. Metadata, reviewer expectations and selected-label explanations sit outside `request` and must never be forwarded as participant input.
- Empty answers are contract-valid. Generation is never automatic: availability, admission, consent and the explicit generate action still apply. Keep an empty-day response brief if the person chooses to generate.
- The file also contains intentionally invalid boundary probes. These are local parser tests, **never provider requests**. A faithful test rejects them without constructing a provider.
- These fixtures do not contain consent or admission assertions. A syntactically accepted request alone never authorises a paid call. No benchmark output or model-quality ranking has been produced.

Start an eventual blind comparison with `d1-overwhelm-off`, `d1-private-uncertain-off` and `d1-steady-hope-off`; expand only promising, accessible candidates. Use identical grounded source and the exact same reviewed candidate policy across candidates, recording model/version, deployment, usage, latency and cost. Keep reviewer notes out of the model prompt. All free-text examples from earlier sample work remain style references, not actual production inputs.

## Local verification

The original audit recorded 213 passing tests across seven files on the older prepared branch. That historical total included a test for an alternative gate implementation and must not be reported as a rerun against the current main implementation. The wording-only worktree separately passed 242 affected tests in seven suites; those are content tests, not provider verification.

The following repeatable check validates this fixture pack against the current local source without a provider, real consent assertion, runtime configuration change or network call:

```sh
npm test -- --no-cache src/lib/ai/__tests__/pilot-fixtures.test.ts
```

The command passed all three tests on 4 October 2026. They cover all 22 valid requests, all 12 rejection probes and the combined candidate-policy input ceiling. Each valid request is compared with its reviewed canonical source and hashes. All rejection probes must fail before the injected admission check or provider factory runs. The test stubs `fetch` to throw and asserts zero calls. It does not rank models, generate a response or install the candidate policy.

If reviewed teaching or policy changes, a hash failure is a request to review the fixture and its expectations, not a reason to refresh snapshots blindly. Preserve the reviewer checks and record the new audited content commit after reconciliation. Source metadata names the inspected code version; it is not a requirement that future documentation commits keep HEAD unchanged.

The fixture file was also checked locally: **22 valid requests accepted and 12 invalid probes rejected** by the parser. All 12 invalid probes were rejected at `runJourneyBoundary` with a fictional current consent assertion and injected admitted state; **zero provider factories were created**. Canonical labels, practice routing, source versions, faith filtering and current-policy request sizes were read back from the actual modules. The candidate addition also fits the existing 24,000-character prepared-input ceiling for these fixtures: maximum 12,847 characters, including the current policy, two separating newline characters, candidate text and grounded JSON. This is a character ceiling check, not a token or price estimate. No live app/network capture with planted journal or prior-day markers was performed. Source wiring and local parser/grounding tests support the intended boundary; they do not substitute for that final deployed check.

## Concrete work before enabling participant AI

1. Select a permitted provider and exact accessible model; resolve the current provider, retention/location, disclosure and account-cost questions in writing.
2. Review and integrate the SRT candidate policy with an explicit policy-version change, then compare real outputs using fictional fixtures and Carl's blind review.
3. Supply working server-verified AI admission without treating an open app preview as authorisation; retain default-off release locks until the release decision.
4. Add or verify server-enforced request/usage allowances before paid access. Per-request caps are helpful but insufficient for a total budget promise.
5. Minimise or redact raw error forwarding and verify deployed telemetry/log behaviour with fictional canary strings. Verify the actual outgoing request omits optional private notes and prior-day data. Do not claim zero logging or complete anonymity from this source review.

No change to the existing input parser was necessary for these preparations. The unresolved issues above should be handled deliberately before activation, rather than by adding free-text inputs, silently opening the AI endpoint or bypassing the current locks.
