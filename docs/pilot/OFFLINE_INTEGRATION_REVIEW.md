# Offline integration review — 4 October 2026 UTC

**Later verification:** Lovable applied this reviewed preparation and synced it
to GitHub `e1ef13285b0b75783811573c672c277d779139ff`. The fetched commit's complete
tree matched local reviewed commit `6b0bb7a193d42ee984d23fc66b89622a885797d5`.
Lovable reports 1,223 tests in 66 files passing, a clean full TypeScript check,
and successful client/server/deployment builds with unchanged dependency files.
This supersedes the local missing-package/build limitation below; those local
observations remain as historical evidence. See `OFFLINE_PREPARATION_STATUS.md`
for attribution and the remaining release work.

Status: local preparation and simulated regression evidence. No live model output, participant use, deployment, provider change, or AI activation is established by these checks. The authored content, Carl's corrections, instructions and participant disclosure were not changed in this review.

## Scope and evidence

The existing current-journey controller, response store, reflection component, generation core and transport correction tests were inspected before adding coverage. Thirteen additional cases extend the existing controller/component harnesses. They exercise the actual controller and component with controlled React hooks, an in-memory storage substitute and simulated server-function results. They do not run a browser, React's real scheduler, a deployed server or a model.

The successful response envelopes use the `live-model` identity required by the controller solely to simulate the server contract. The response text is fictional test text; this is not model provenance or evidence about model quality. The controller suite forbids `fetch` and asserts it was never called.

| Concern | Existing evidence retained | Additional check in this review |
|---|---|---|
| Loading and explicit generation | Availability loading and generation withhold Continue; disclosure and consent alone make no request | A rejected availability check settles to unavailable without generation; a busy Generate button is disabled while the explicit written-reflection option remains available |
| Timeout and retry | Transport deadlines cover fetch/body operations that ignore abort; generation core performs no automatic retry | A returned timeout shows a failure, saves no response, leaves Continue unavailable for AI, and issues another request only after explicit generation |
| Request rejection | Generation core and boundary normalize failures | A rejected server-function promise produces a generic connection message without its private error detail; a deliberate retry can succeed |
| Interruption | Faith preference changes, clearing and consent removal prevent stale response resurrection; remounts deduplicate a pending request | Unmounting before completion prevents a late save; selecting the written reflection ignores a late response; an abandoned pending call must settle before a replacement begins |
| Response identity | Exact identity and provenance checks in response storage | A successful envelope carrying another day's identity is rejected with no saved response or automatic authored substitution |
| Saved response | Exact selected saved text used for display/export; AI-off retains matching saved response; failed writes retain an in-tab overlay | A successful retry survives remount and never regenerates on restoration |
| Faith preference/cache | Ten days retain independent on/off entries; synchronous guard withholds old on-path text on switching off | Switching both ways and remounting returns each exact saved path without regeneration |
| Failure controls | Written reflection is a participant choice | Component displays the generic failure and triggers retry only on explicit Generate |
| Client requests that never settle | Provider transport watchdog does not cover every possible client/server-function stall | Fake timers verify the new 10-second availability deadline and shared 60-second generation deadline, ignored late success/rejection, no duplicate during unresolved work, and explicit retry after settlement |

## Bounded client wait correction

Review found a concrete remaining gap: availability and server-function promises could keep the client waiting even though the provider transport has its own deadline. The controller now stops waiting for availability after ten seconds, makes generation unavailable and leaves the prepared written reflection accessible; late availability success is ignored for that mount.

Generation now has a sixty-second client deadline, longer than the existing forty-five-second server transport deadline. The deadline belongs to the shared in-tab attempt, so a remount does not reset the waiting window. On expiry, the spinner stops and a distinct message explains that request completion is unknown and the written reflection is available. The attempt remains reserved until the underlying server-function promise settles. Repeated Generate clicks or same-tab remounts cannot issue a duplicate request during that uncertainty. Late results are neither displayed nor saved. Once the underlying request settles, a participant may explicitly retry.

The fake-timer checks cover the remount race where one observer begins waiting fifty seconds after the original request: both stop at the original sixty-second deadline, and a later success or rejection cannot leave the new observer stuck generating. Client expiry does not prove cancellation, refund, absence of processing or absence of provider cost. No automatic retry was added.

Verified command:

```sh
npm test -- --no-cache src/lib/ai/__tests__/journey-cache-controller-behavior.test.ts src/lib/ai/__tests__/journey-reflection-component-behavior.test.ts src/lib/ai/__tests__/journey-generation.test.ts src/lib/ai/__tests__/journey-server-corrections.test.ts
```

Result: **141 tests passed in four files**. This includes the thirteen new cases. Do not add this number to overlapping full-suite or earlier test counts.

## Root error-boundary typing investigation

The handoff reported a root error-boundary typing error on the pinned build. The recovered local installation does not match the repository pins:

| Package | Repository manifest/lock | Recovered installation |
|---|---|---|
| `@tanstack/react-router` | `1.170.41` | `1.170.16` |
| `@tanstack/router-core` | Lock: `1.171.34` | `1.171.13` |
| `@tanstack/react-start` | `1.168.60` | `1.168.26` |
| `@lovable.dev/vite-tanstack-config` | `2.23.1` | Missing from the linked installation |

The initial normal `npx tsc --noEmit` produced missing Node ambient types and missing Lovable config-module errors. It did not reproduce the reported root-boundary mismatch under the older router types. Other recovered dependency trees also contained the older router. A bounded attempt to obtain the exact type packages was rejected by automatic approval review because a registry download fell outside the offline task; it was not retried or bypassed.

The root component now uses the framework-exported `ErrorComponentProps` instead of a handwritten props shape. This follows the installed framework's error boundary contract without a cast. Its raw `console.error(error)` was also replaced by the coordinated fixed-code logging helper, inside the existing effect.

Final root review also explicitly included the already-declared Node ambient types in `tsconfig.json` (`types: ["vite/client", "node"]`). The source and tests import Node modules, but the previous explicit type list excluded their globals. No dependency was added. The normal TypeScript command then reduced to one remaining error: the locally missing `@lovable.dev/vite-tanstack-config` module in `vite.config.ts`. This does not verify the exact pinned router or production build.

A temporary source-only TypeScript configuration, outside the repository, explicitly included the available Node and Vite types and excluded `vite.config.ts`; `tsc --noEmit` then passed for `src/**/*.ts` and `src/**/*.tsx` with the recovered dependency versions. No declaration shim, dependency-pin change or lockfile change was used. This is **not** a clean pinned build, and **does not close** the handoff's exact-version TypeScript issue. Re-run the normal TypeScript command and preview build in a matching dependency environment before accepting that issue as resolved.

## Remaining limits

- The new wait deadline and reservation are in-tab controls. A document reload, separate tab or new session does not retain the in-memory pending registry. They do not provide a durable cumulative usage allowance or replace server-side reservation and spending enforcement. Verify the selected deployed route before live pilot acceptance.
- A browser document reload, real React effect scheduling, focus/screen reader behavior, mobile native controls and physical-device text scaling were not exercised by the controlled-hook harness. The prior handoff's device-check limitations remain.
- No network request, credential, provider quota, cost, cloud retention setting or live participant admission was verified by the simulated suite. Server usage controls and logging review have separate evidence and deployment requirements.
- Candidate SRT policy installation, actual output fit, pricing and provider choice remain distinct work. No approved sample was replaced and no live legacy route was enabled.
