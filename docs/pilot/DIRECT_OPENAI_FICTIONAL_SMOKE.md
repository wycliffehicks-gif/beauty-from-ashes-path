# Direct OpenAI fictional smoke test

Prepared 7 October 2026. This is a separate developer command for Carl's requested
Lovable + OpenAI trial. It uses the current three fictional Day 1 smoke cases and
the already prepared `journey-p4+srt-candidate-v1` instructions. The SRT candidate
remains a draft under evaluation; this does not install it in participant routes.

Carl explicitly approved the private fictional test and restoring the previous
build settings on 7 October 2026 at 16:30 Toronto time. The earlier approval blocks
below are historical. Apply the reviewed changes through Lovable and verify the
GitHub tree before the test. A missing API key must still be entered by Carl in
the secure form. Approval does not activate participant AI or authorize purchases.

## What this changes

One direct Responses API adapter and a bounded test command. No AWS, model gateway,
new dependency, public endpoint, participant interface, storage, content or AI
activation change. Existing offline-only commands and source hashes stay intact.

The test model is `gpt-6-luna`, reasoning `none`, standard service tier, at most
4,096 output tokens including reasoning, and a 45-second whole-response deadline.
It sends only the prepared policy and canonical current-day fictional payload.
There are no tools, conversation history, private writing, retries or model fallback.
The three smoke cases all use the spiritual preference OFF; this is not full faith-mode coverage.

## Secure prerequisite

Add `OPENAI_API_KEY` through Lovable's secure Secrets form. Do not send a key in
chat, put it in source, name it with a client-exposed prefix, or log its value.
The OpenAI API account needs access to the requested model and usable API billing.
No balance top-up, purchase or auto-reload is authorized by this script.

The read-only Lovable diagnostic on 7 October reported this key missing and all
three participant switches absent. Actual model/account access is unverified.
Lovable paused at `plan--show` for `.lovable/plan.md`; Carl has now supplied the
required human decision. This reviewed implementation uses the newer source-bound
three-case fixtures and Responses API, replacing the earlier plan's suggested
legacy eval adapter. Preserve the approved scope when resuming that pause.

## Earlier preparation verification and synchronization blocks

- 68 focused transport, orchestration and existing offline comparison/exchange
  checks passed; TypeScript and diff checks passed.
- The actual Node command completed its dry run with the existing three cases,
  zero provider calls, and an estimated total reservation of USD 0.010346.
- Independent code review found no blocker for this bounded private test.
- Lovable's diagnostic automatically advanced main to `bd5eb2939b60de8dbb159db3a3ec3bab4a1c8e98`,
  updated its plan and upgraded build dependencies/regenerated route ordering.
  The prepared corrective commit `e794e87` restores ONLY package.json, bun.lock
  and src/routeTree.gen.ts to the verified `b815c180` bytes. It retains Git history
  and leaves the pending Lovable plan intact. No day content or AI flags changed.
- Automatic approval review rejected pushing that corrective commit to main,
  stating that the shared/default-branch change needs explicit approval. It has
  not been applied to main. The separate test code is likewise a review proposal
  until the pending approval is resolved and the exact code is synchronized.
- Saving a separate review branch also did not succeed: shell Git has no push
  credential, and the connected GitHub integration rejected tree creation with
  HTTP 403, Resource not accessible by integration. These are separate access
  limitations; no attempt was made to bypass the rejected main-branch action.
  The reviewed code is committed locally on `direct-openai-fictional-test`.
- This is preparation evidence only: no API response, model access, paid call,
  provider billing, participant integration or live readiness has been verified.

## Run

Use Node 24 from the repository root. The default command sends no request and
does not read a credential:

```sh
node --import ./scripts/direct-openai-smoke/register.mjs scripts/direct-openai-smoke/run.ts --out artifacts/direct-openai-smoke/preflight-01
```

After secure key setup, code review/sync and the bounded fictional test decision:

```sh
node --import ./scripts/direct-openai-smoke/register.mjs scripts/direct-openai-smoke/run.ts --out artifacts/direct-openai-smoke/live-01 --run
```

The output directory must be new and below the git-ignored private artifact path.
The separate `LIVE_ATTEMPTED.json` marker prevents another live batch in the same
workspace. Do not delete it to retry an uncertain request. A workspace reset can
lose local markers; reconcile prior attempts before rerunning elsewhere.
All participant AI switches must stay off, even for this isolated command.

## Bounds and evidence

At most three requests, sequentially, one per case. A failed/incomplete response,
missing model identity or identity mismatch stops the remaining cases. Each
attempt is recorded before dispatch, and each result checkpoint precedes the
next call. The transport limits response bytes, refuses redirects, discards raw
errors and never stores reasoning text. `store:false` disables Responses storage;
it is not a promise of zero provider retention or zero abuse-monitoring records.

Prices checked on 7 October 2026: USD .10 input, .125 cache write, .50 output per
million tokens. The command reserves using UTF-8 bytes plus 1,024 overhead tokens
and the higher .125 input rate. The three-case reservation must fit USD .05.
This is a conservative engineering estimate, not a provider-enforced account cap.
Timeouts can still be billed, and missing usage means unknown cost, never zero.
Recheck prices before a later live run. Cost does not include account funding,
tax, currency conversion or Lovable development/hosting charges.

Private artifacts preserve requested/reported model, response/request IDs,
reported numeric usage, measured latency, input hashes and estimated costs.
The existing importer creates a blind review sheet, preserving its honest
`imported-unverified` labels. Transport records are supporting evidence, not an
independent verification of vendor model identity, billing or response quality.

An actual run in Lovable establishes only that private developer test connection.
It does not establish participant-route integration, permissions for sensitive
information, deployment readiness, durable usage controls or approval to publish.

Sources:

- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/guides/reasoning
- https://developers.openai.com/api/docs/guides/prompt-caching
- https://developers.openai.com/api/docs/guides/your-data
- https://docs.lovable.dev/features/ai
