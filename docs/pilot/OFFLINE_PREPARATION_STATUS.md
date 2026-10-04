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
