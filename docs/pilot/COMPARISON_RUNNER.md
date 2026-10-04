# Offline fictional comparison runner

This runner completes the comparison **plumbing**, using two handwritten deterministic simulation adapters. It produces no actual AI output and supports no model-quality ranking. It does not activate AI, install the SRT candidate, alter the app, grant consent/admission, change an account or incur provider charges. App content, `journey-p4`, candidate instructions and the existing 22-fixture pack remain unchanged.

## Run locally

Use **Node 24** from the repository root. The runner uses native TypeScript stripping and a small resolver for the existing `@/` source alias; no new package, provider SDK or credential is required. Node 24.19.0 was exercised locally. The existing application dependencies are needed for the Vitest verification command; the CLI itself imports Node built-ins and local transport-free source only.

```sh
node --import ./scripts/offline-ai/register.mjs scripts/offline-ai/run-comparison.ts --out artifacts/offline-ai-smoke
node --import ./scripts/offline-ai/register.mjs scripts/offline-ai/run-comparison.ts --full --seed carl-review-v1 --out artifacts/offline-ai-full
npm test -- --no-cache src/lib/ai/__tests__/offline-comparison.test.ts src/lib/ai/__tests__/pilot-fixtures.test.ts
```

Every run requires a **new output directory**. Existing output is never overwritten, preserving any reviewer corrections and the key. If using the default directory `artifacts/offline-ai`, choose a fresh `--out` for the next run. Generated files are research/testing artifacts, not app assets; do not place them in `public/`, deploy them or import them into app routes.

The default smoke matrix is exactly `d1-overwhelm-off`, `d1-private-uncertain-off`, and `d1-steady-hope-off` across two simulated candidates: **6 local stub calls**. `--full` covers all **22 cases × 2 stubs = 44 local stub calls**. The full option is an offline engineering check, not approval to expand any future paid benchmark. `--skip FIXTURE_ID` excludes a case; repeated flags are supported. `--seed VALUE` reproducibly randomises case aliases, response labels and review order. The fixed default seed is for reproducible engineering; keep the chosen review seed with the private key.

The CLI has no `--live`, provider, model, endpoint or arbitrary-input option and reads no credentials. It always creates only the bundled simulated adapters. It blocks `fetch`; the Node resolver rejects transport/server-module imports. These are accidental-use safeguards, **not an isolation boundary for untrusted code**. The programmatic adapter interface accepts only trusted callbacks declaring `offline-simulation`; lying callbacks are outside this contract. Do not add a real provider callback here.

## What is preserved and checked before any stub runs

All 22 requests are parsed through the existing strict journey contract. Every reviewed canonical selection, title, practice route, spiritual authorisation and `reportedDone: false` is compared with the current source. Baseline policy hashes, grounded-payload hashes and prepared character counts must match the fixture pack. Any drift stops the run; the runner never silently refreshes the expected hashes or edits the source to pass.

The full current `journey-p4` policy is joined with **only** the exact text between `BEGIN CANDIDATE INSTRUCTIONS` and `END CANDIDATE INSTRUCTIONS`. The candidate-section hash must equal the reviewed fixture hash. Headers, implementation commentary and `REVIEW NOTES — NOT MODEL INPUT` stay out of the adapter request. The combined comparison identity is `journey-p4+srt-candidate-v1`; it is a comparison version, not an app policy version. Faith-on and faith-off have separate exact policy hashes. Exact combined policies, grounded payloads, hashes, source commit and file hashes are retained in the private manifest.

The candidate header's historical reference to guide working version 1 is preserved byte-for-byte. The continuity pack's current response guide is working version 3 and its SRT foundation is draft version 0.7. This provenance clarification is documentation only; it does not change the candidate text or promote draft formulations to approved doctrine.

Only four adapter fields are passed: `systemPolicy`, `groundedPayload`, `maxOutputTokens`, `deadlineMs`. The grounded payload remains the existing source-derived current-day JSON. Fixture IDs, reviewer checks, expected outcomes, model identity, scores, previous outputs and research notes are never added to it. The existing 24,000-character input ceiling, 4,096-output-token request ceiling, 45-second deadline and output validator are reused. Token caps are request metadata in a simulation; the stubs do not run a tokenizer or model.

The 12 invalid boundary probes are verified locally and never passed to an adapter. Cases omitted by smoke mode, explicitly skipped cases and disabled candidates are recorded with no adapter call. Empty **answer selections** are different: the two all-skipped-answer fixtures are contract-valid and are exercised in an explicitly requested full simulation. This says nothing about automatic app generation, consent or pilot admission.

Each selected case/candidate gets one sequential attempt, with no retry. Exceptions are reduced to a fixed error code; raw exception messages are discarded. Incomplete, non-text and oversized outputs are not exposed as complete review responses. Existing lexical flags are recorded separately from human assessment. A deadline limits the awaited callback; JavaScript cannot cancel arbitrary malicious code. Failed/incomplete and skipped records remain visible in the private results and are listed as omitted in the key, preventing a misleading success-only denominator.

## Review files and private files

| File                                      | Purpose                                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `review/blind-review.md`                  | Human-readable sheet with canonical day context, selected labels, fixture-specific checks, randomised response IDs and empty rubric fields. |
| `review/blind-review.json`                | The same review content in structured form; all scores and hard-failure judgments begin unreviewed.                                         |
| `private/unblinding-key.json`             | Maps randomised response/case IDs to fixtures and candidates; includes the seed and omitted records.                                        |
| `private/results.json`                    | Structured outputs, fixed failures, simulated provenance, latency, usage/cost evidence and automatic flags.                                 |
| `private/policy-and-source-manifest.json` | Exact policy/payloads and their hashes, versions, source commit and local rejection-probe results.                                          |
| `private/run-summary.json`                | Counts, zero-provider-call statement, cost/usage limits and creation time.                                                                  |

Give only the `review/` files to a blind reviewer. Candidate/model names, the seed, cost and latency are absent there; keep `private/` separate until review is complete. Random labels do not guarantee that a model could never identify itself in its prose. A future real-output workflow must separately check for self-identifying responses and preserve originals rather than quietly editing them. The present stubs do not identify themselves within their prose.

The six 0–2 dimensions are grounding, acknowledgment, expression clarity, usefulness, choice/pace, and faith/dignity. **Appropriate restraint can earn full expression-clarity credit.** A next-step invitation is not required. The proposed threshold (at least 10/12, no zero dimension, no hard failure) remains an internal style-review convention, not a validated clinical scale, efficacy finding or launch certificate. Scores are never assigned automatically.

Every review response includes the guide's eight hard-failure fields: invented personal history/private writing; asserted diagnosis/hidden cause; faith-off devotional leakage; coercive expression; unsafe guidance; increased distress presented as healing evidence; conditional worth; impersonating Carl. An excellent total cannot cancel a hard failure. Record Carl's exact correction, its reason and his decision; a failed case needs revision and retesting before acceptance. The validator catches only narrow lexical patterns and cannot clear the broader human-review criteria.

## Usage, latency and cost honesty

- `latency.valueMs` is **local stub wall-time**, not real-provider latency. It is null for no-call cases and naturally varies between runs; inputs and stub output text are deterministic.
- Bundled stubs report no tokens: usage is `unknown`, with null counts. Injected test token counts are explicitly `simulated`; they are never labelled provider-reported.
- Actual **provider spending is USD 0** because no provider is invoked. This does not assert that computer time or future model use is free.
- Hypothetical model cost remains `unknown`/null unless a simulation supplies a finite non-negative estimate with currency and a stated basis. It is then labelled `estimated`, separately from actual zero provider spending. Missing usage or prices are never converted into zero model cost. No current model prices are assumed.

## Later real comparison

The adapter request shape is useful preparation for a separately reviewed provider integration. It does not authorise one, and this runner rejects non-simulation provenance. Before any live benchmark: establish accessible exact model/deployment IDs, approved fictional-test spending and controls, applicable terms, a reviewed adapter and usage accounting, and a deliberate integration decision. Keep provider response/model IDs, usage reports, latency, billing evidence and estimated versus actual cost separate. A mocked run cannot resolve any of those external requirements.

The pre-existing `scripts/ai-eval/run-eval.ts` imports a gateway adapter and can call it when configured. It remains untouched and is **not** this offline runner. Do not use it as a shortcut for this preparation.

## Verification recorded for this implementation

The new suite checks source/candidate drift, metadata exclusion, identical immutable inputs, smoke/full coverage, skipped/disabled no-call paths, deadlines, no retry, bounded errors, lexical flags, honest usage/cost states, seed reproducibility, review blindness and live-provenance rejection. It stubs network and requires zero calls. The existing fixture tests independently preserve 22 valid requests, 12 boundary rejections and combined-input size checks.
