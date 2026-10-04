# Offline AI preparation status

Continuation of Carl's 3 October 2026 Toronto handoff; work crossed into
4 October UTC. Later explicit corrections and permissions govern.

## Applied and independently matched

The first preparation patch is in GitHub `main` at
`e1ef13285b0b75783811573c672c277d779139ff`. The fetched GitHub tree matches the
entire reviewed local tree `6b0bb7a193d42ee984d23fc66b89622a885797d5`, not merely
its filenames. It changes 27 files relative to the accepted app baseline
`32ccf008e95856340f47f70a079c7acd80dfb30f`.

It preserves the ten-day content, Carl's corrections, mobile stylesheet fix,
ordinary code-free entry, package/lock files, current `journey-p4` policy,
activation locks, AI admission and consent, and disclosure. Candidate SRT
instructions and fixture bytes remain unchanged and the candidate is not
installed. Foundation v0.7 and provisionally accepted sample revision 3 retain
their original status; none is a live-model evaluation.

The patch adds the recovered candidate/fictional fixtures, a simulation-only
comparison and blind-review runner, bounded client waiting, dormant atomic
usage reservations, and bounded application error reporting. It also fixes
framework error-component typing and includes already-declared Node types.

## Verification and its source

| Evidence | Result and limit |
| --- | --- |
| Root local full suite | 1,223 tests / 66 files passed on the recovered dependencies. |
| Lovable matching-package verification | Reports the same full suite passing, clean full TypeScript, and successful client/server/deployment builds; package/lock files unchanged. This closes the previous reported pinned-build typing issue at that revision. |
| Offline runner | Local Node 24 smoke: 6 stubs; full: 44 stubs; no provider calls. Lovable also reports both succeeding on Node 22. Simulated output is not model-quality evidence. |
| Logging bundle | Local bundling check and Lovable server-bundle inspection report the explicit initializer retained despite `sideEffects: false`. Platform/provider telemetry remains separate. |
| Preview | Lovable reports fresh-visitor phone-width home, onboarding and Day 1 with no access-code screen or page errors. Browser emulation is not a physical-device check. |
| Publication | Project metadata independently returned `is_published: false` and an empty publication audience after the change. |
| Activation | Source remains default-off. Lovable reports the three AI switches absent in its workspace. Saved production configuration has not been independently inspected. No activation or model request was requested. |
| GitHub | Root fetched the connected repository and verified full-tree equality with the reviewed preparation. |

Lovable reported 3.4 build credits for the first preparation task. This is
separate from reflection-model usage; the offline scripts made no provider calls.
The build briefly auto-committed a generated route-tree reorder; the final tree
restored the file to the accepted baseline, with no net route-tree change.

## Additional offline follow-up

The follow-up revision adds a separate local export/import workflow for the
three fixed smoke cases. It exports exact policy/payload hashes and bounded
requests, requires every expected candidate/case result slot, preserves original
files and response text, and produces blank blind-review sheets with a separate
private key. Imported origin, model identity, usage and historical cost remain
unverified claims; unknown historical cost never becomes zero. A synthetic
roundtrip is engineering evidence only. See `COMPARISON_RUNNER.md` for commands.
The existing simulation-only runner and its fixture expectations are preserved.

It also corrects the service worker's broad, stale cache behavior. Online page
navigation checks the network; offline fallback uses only a permitted generic
home shell. Server-function, authentication, dynamic and query-bearing requests
are excluded. Only permitted static files are cached, privacy instructions are
respected, and replacement deletes only prior BFA shell caches. Missing optional
precache files no longer prevent installation. Journey choices and saved
reflections in separate browser storage are untouched. The actual worker passed
34 local VM-based behavior tests and a separate source review; installed-browser
lifecycle remains a distinct verification step.

The application source still keeps both current activation locks and the legacy
AI flag off by default. No provider adapter, candidate policy installation,
production usage-store wiring or disclosure change is included in this follow-up.

Root's full local suite for this follow-up passed **1,265 tests in 68 files**.
That total includes the prior tests, eight new result-exchange cases and 34 new
service-worker cases; focused counts must not be added to it. The new command's
synthetic roundtrip preserved six result slots: three complete, one failed, one
incomplete and one not run, with exact original bytes and unknown historical
costs. Independent source review found no remaining concrete blocker in either
addition. Full installed-dependency verification belongs to the subsequent
Lovable apply step, not to the source-only local TypeScript check.

## What can happen after a provider reply

1. Reconcile the reply against the exact account, accessible model/deployment,
   region, processing/retention terms, quota and a specifically authorised test
   allowance. Candidate nicknames alone cannot identify a model. Existing
   Lovable build-credit permission is not paid reflection-test permission.
2. Use the fixed three fictional smoke cases and exact reviewed policy/payload
   hashes for the first actual comparison. Keep imported provider evidence,
   unknown usage/cost and human judgments distinct from simulation results.
3. Run Carl's blind response review and preserve his exact corrections. The
   internal 10/12 convention is not a clinical scale or a release approval.
4. Integrate a reviewed provider transport and adopted policy/version only
   after the route is chosen. The app currently targets Lovable's gateway;
   an AWS/Azure console success does not change that app route.
5. Before participant use, settle server-verified AI admission without bringing
   back the removed visitor code, connect a durable transactional usage store
   and allowance, reconcile/version the disclosure, and complete the deployed
   fictional-data checks in `DEPLOYED_AI_VERIFICATION.md`.
6. Make an explicit release decision before changing either
   `JOURNEY_AI_RELEASE_READY` or `JOURNEY_AI_ENABLED`. Both are required. Keep
   the legacy `LIVE_AI_ENABLED` path off.

The preparation removes repeatable engineering work from that later process;
it does not mean a cloud reply alone makes participant activation ready. No
cloud resource, subscription, purchase, publication or participant message is
part of this work.

## Lovable follow-up verification (4 October 2026)

Applied the 13-file follow-up diff exactly onto `e1ef132`; no rejected hunks. This note is the only addition to that diff.

| Check | Command | Exit |
| --- | --- | --- |
| Full tests | `bunx vitest run` (68 files, 1265 tests passed) | 0 |
| TypeScript | `./node_modules/.bin/tsc --noEmit` | 0 |
| Build | `bun run build` | 0 |
| AI flags (derived booleans only) | `node` script: JOURNEY_AI_ENABLED, JOURNEY_AI_RELEASE_READY, LIVE_AI_ENABLED all present=false, enabled=false | 0 |
| Offline export | `exchange-results.ts export` to a fresh `/tmp` folder, 6 slots, zero provider calls | 0 |
| Synthetic import | `originClaim: synthetic-demonstration`; 2 complete, 1 failed, 1 incomplete, 2 not-run; originals byte-identical; all 6 historical costs `unknown` | 0 |

The generated output stayed in `/tmp` and was not committed. `src/routeTree.gen.ts` was restored from `e1ef132` after the build.

Browser limits: a fresh isolated Chromium context on the development preview opened Home and onboarding with no access-code screen and no page errors. `__root.tsx` registers `/sw.js` only outside development, so the development preview registered no service worker. Real worker registration, old-cache cleanup, uncached requests and the offline fallback are covered only by the 34 worker tests and are **unverified in a browser**. The workspace flag check does not establish saved production settings. The project stays unpublished and participant AI stays off.

## Browser verification of `public/sw.js` (2026-10-04, from `ff86efaa`)

The earlier attribution above stands: before this pass, worker behaviour was covered only by the 34 worker tests.

**Local production app: not run.** No production build output existed (`dist/` absent). One bounded `vite preview --port 4179` attempt started but returned HTTP 500 for `/` and `/sw.js` (`Cannot find module dist/server/server.js`). The full build was deliberately not rerun, because only this note changed. The server was stopped.

**Synthetic browser harness, not production app or hosting verification.** A temporary local Python server on `127.0.0.1:4181` served the unchanged `public/sw.js` bytes (sha256 `0fae2eb3dcca5456d3d0d04835f5549b017d79f387540aacc49f3b0f4797433a`) plus only fictional fixture routes: a generic home page and `/journey`, a manifest, a favicon, one hashed asset, `/api/dynamic` and an AI-like `/_serverFn/generate`, which was never a real RPC. A fresh isolated headless Chromium context gave these results:

- The seeded `bfa-shell-v1` cache was removed after activation, and the seeded `unrelated-cache` was preserved.
- The page was controlled by `/sw.js`. The `bfa-shell-v2` cache held only `/`, `/manifest.json` and `/favicon.svg`.
- Online, two root navigations returned changed fixture homes (v3, then v4), so the network was checked first.
- After a dynamic GET, an AI-like POST and GET, a query-bearing asset, a query-bearing API request and a `/?q=1` navigation, no new entries appeared in any cache.
- With the server refusing connections, `/` returned the cached v4 shell. The `/journey` deep link was redirected to `/` and showed the cached shell.
- After the fixture root switched to `Cache-Control: no-store`, the online root entry was removed from `bfa-shell-v2`. An offline `/` then returned the built-in 503 "You are offline" page instead of retained private HTML.

Playwright `set_offline` did not stop the worker's localhost fetches in a first run, so offline was simulated by having the server drop connections. Fixtures, logs and screenshots stayed in `/tmp` and were not committed.

Still unverified: real hosted production, the actual app build registering the worker, and physical iPhone and Android devices. The project stays unpublished and participant AI stays off.

## Portable hosting package — 4 October 2026

A separate Node cloud build and AI-off launcher are now prepared; the normal
Lovable build, application source, authored content and lockfile are unchanged.
See [`CLOUD_PREPARATION.md`](../deployment/CLOUD_PREPARATION.md) for commands,
environment inventory, transfer/rollback sequence and remaining gates.

A clean Bun 1.3.3 frozen install succeeded. Node 24.19.0 built Nitro's
`node-server` output successfully. TypeScript passed and all 1,265 existing
tests in 68 files passed. Seven launcher tests passed. The built local server
passed checks for five HTML routes, eight hashed assets, the manifest and
service-worker file. Both compiled Journey AI HTTP functions returned the
exact disabled refusal, with zero child global-fetch attempts under a blocking
fetch canary. This is not a claim about every networking API or hosted logs.

The Docker recipe is prepared but its image build/run remains unverified
because Docker is unavailable. An attempted local Chromium installation
returned an unusable archive; actual production-browser hydration/worker
lifecycle and physical phones remain separate checks. No cloud resources,
model calls, purchases, participant messages or publication were performed.
The AWS/Azure adapter, durable usage integration, approved disclosure and
actual model-quality review remain required before participant AI.

## Built-app browser checks and readability repairs — 4 October 2026

The earlier production-browser gaps above are historical. Chromium now
exercised both the normal built app in a local Cloudflare simulator and the
exact portable Node package. See
[`PRODUCTION_BROWSER_CHECK_2026-10-04.md`](PRODUCTION_BROWSER_CHECK_2026-10-04.md)
for measured results and limits.

Two reproduced enlarged-text defects were repaired: a Day 2 practice list
overflowing sideways, and a very tall sticky navigation bar splitting
Continue across lines. The list reflow rule now applies at every width. A
scoped container query places full-width navigation after the reading area
when text is large relative to available space. Ordinary text retains the
existing sticky layout. One obsolete “without a code” phrase was removed
from the connection-error support sentence; access logic and authored content
were preserved.

The final application revision independently fetched from GitHub main is
`bf2fa23f9e939f7a4c8e166db7a5946a9db3c10e`. The prebuilt Node package matches
that source. At 320/360/393/430px with 32px root text, the tested navigation
was full-width, in document flow, one-line and free of horizontal overflow.
Normal 320/393/768/1280px layouts retained sticky two-column navigation.
Tested fictional selections survived reload/resume, and the actual app's
worker activated and controlled the page without observed dynamic/query
requests entering its cache. TypeScript, all 1,265 tests and the normal
production build passed.

A warmed shell still requires the network for the entry check; offline
loading showed the connection/access message while preserving saved choices.
Keep the existing stay-online pilot instruction. Do not broaden worker
caching or promise a fully offline journey based on this pass.

The container image, real cloud host, physical Android/iPhone and screen-reader
checks remain open. Participant AI stays off; the project is unpublished.
No paid model calls, new purchases, cloud provisioning or participant messages
were made. All source-authority and future AI-release requirements above remain.

## Reserved request-flow rehearsal — 4 October 2026, Toronto

The previously separate usage decision is now joined to shared boundary and
generation code in a dormant `runReservedJourneyBoundary` entry point. It
validates and snapshots the current request, prepares its exact payload,
checks a trusted accounting binding, reserves allowance, then constructs and
dispatches a provider at most once. The actual participant endpoint retains
its existing entry point; this is not live limiter installation or activation.

The [rehearsal record](RESERVED_REQUEST_REHEARSAL.md) describes the API,
verification and remaining obligations. Thirty-five new simulated cases cover
concurrent duplicate attempts, shared caps, mutation barriers, rejected
bindings, factory/provider failures, timeout, lost commit acknowledgement and
transaction callback replay. Reservations remain consumed after uncertainty.
The focused run passed 171 tests; the full suite passed 1,300 tests in 69 files.
TypeScript and the portable Node production build passed. These counts overlap.

No real provider, model charge or participant data was used. No content,
candidate policy, disclosure, app entry flow, activation configuration or
dependency change was made. The existing shared checks were extracted for
reuse, and request data is now copied before asynchronous admission checks.
Independent review found no concrete blocker.

Verified participant identity, server-issued attempt/retry lifecycle, keyed
fingerprint implementation, a durable transactional store, verified pricing
and live endpoint/client integration remain required. The test store is not
durable, and a trusted port is not an implementation of those obligations.
Participant AI remains off and the app remains unpublished.

## Participant approval and stable attempts — 4 October 2026, Toronto

The earlier request-flow checkpoint is extended by a separate dormant
`runApprovedJourneyBoundary`. It consumes a trusted verified principal,
checks an existing approved roster, creates keyed bindings and finds or creates
a stable server attempt for the logical selection request. Equivalent option
aliases and reordered selections retain that attempt. Exact prepared content,
model limits, pricing and budget settings are bound separately; configuration
drift cannot silently allocate a new attempt.

Approval and expiry are checked again in the same transaction that reserves
usage. The combined store must retain roster, attempt and usage state together.
It must supply fresh authoritative time on transaction retries and commit before
returning success. There is no missing-state initialization or automatic refund.
See [the preparation record](PARTICIPANT_ATTEMPT_PREPARATION.md) for the precise
integration obligations and verification evidence.

This prepares the decision and binding code; it does not install an
authentication service, browser session, durable database or live participant
endpoint. The test identity adapter and serialized memory store use fictional
participants only. Ordinary entry, authored content, approved corrections,
candidate SRT policy, disclosure, mobile fixes and cloud configuration remain
unchanged. Participant AI remains off and the app remains unpublished.

The 45 new fictional cases and complete regression passed: **1,345 tests in
70 files**. Independent review found no remaining blocker after adding atomic
reservation markers and two-way attempt/usage consistency checks. Neither
single-sided record loss can create a fresh dispatch; coherent historical
rollback still requires a safe durable-store recovery procedure. Counts include
the new cases and are not additive. No reflection-model call, cloud resource,
new purchase or participant message was made.

TypeScript passed, and the focused four-suite run passed 129 tests (included
in the full-suite total). GitHub/Lovable sync and build evidence are recorded
in the updated launch handoff.
