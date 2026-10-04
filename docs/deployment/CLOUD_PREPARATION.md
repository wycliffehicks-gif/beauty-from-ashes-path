# Portable cloud preparation

Prepared 4 October 2026. The separate Node build has passed local verification.
This is not a cloud deployment or participant release. The container itself
has not been built/run because Docker is unavailable; see the evidence below.
The starting source revision is `45eaab7a35bc62d873931fb71e15c82030120e91`.

The intended arrangement keeps GitHub as the source repository and Lovable as
the development environment. The participant app, its server and the selected
AI route are intended to run on the approved cloud platform. AWS versus Azure,
the exact hosting service, account, region, accessible model and spending
allowance remain decisions to settle against provider access and Carl's
authorisation. This preparation does not create resources, deploy or publish a
site, change subscriptions, buy services, make model calls or recruit anyone.

## Prepared package and preserved behaviour

| Item | Purpose and boundary |
| --- | --- |
| `vite.config.cloud.ts` | Opt-in configuration using the existing pinned `@lovable.dev/vite-tanstack-config` helper and Nitro's `node-server` preset. The normal `vite.config.ts` and Lovable build remain unchanged. |
| Managed-build check | The cloud configuration rejects `LOVABLE_SANDBOX=1` or a present `DEV_SERVER__PROJECT_PATH`. Build this package in an external checkout or Docker; do not remove managed-environment markers to defeat this check. It prevents silently producing the managed target when Node output was requested. |
| `Dockerfile.cloud` | Multistage build with Bun 1.3.3 and Node 24. The runtime receives `.output` and the startup script, runs as the non-root `node` user, and defaults all three AI flags to false. Image digests must be pinned after a verified image build and before release. |
| `.dockerignore` | Restricts the build context to required source/build files. Credentials, local dependencies, Git metadata, evaluation output and local environment files are excluded. Never add secrets as build arguments or browser configuration. |
| Cloud startup script | Entry point for `.output/server/index.mjs`, with an AI-off guard. Any of the three AI flags set to `true` or `1` refuses startup, using the application's trimmed, case-insensitive semantics. This package has no AI-enabling command. Seven launcher tests passed, including rejection before bundle loading and bounded fatal errors. |
| Cloud scripts | Separate `build:cloud`, `start:cloud`, `check:cloud`, `test:cloud` and `smoke:cloud` commands. Observed results and remaining checks are recorded below. |

The ten-day content, Carl's corrections, code-free visitor entry and existing
AI consent/admission controls remain the baseline. The current AI adapter still
targets Lovable's gateway; **no AWS or Azure adapter is included**. Moving the
server does not integrate a different AI provider. Both current AI release
locks and the separate legacy flag remain off.

The SRT foundation remains draft v0.7. The sample responses remain
revision 3, provisionally accepted wording; the candidate SRT instructions
remain uninstalled. Do not turn source examples into new participant inputs,
model-quality results or approved clinical claims. Preserve the current-day
contract and source-derived grounding described in
[`DEPLOYED_AI_VERIFICATION.md`](../pilot/DEPLOYED_AI_VERIFICATION.md),
[`COMPARISON_RUNNER.md`](../pilot/COMPARISON_RUNNER.md) and
[`OFFLINE_PREPARATION_STATUS.md`](../pilot/OFFLINE_PREPARATION_STATUS.md).

## Environment inventory

These are the six application environment names relevant to this transfer.
They are server/runtime settings, not values to copy into Git or a client build.

| Name | Initial cloud preparation |
| --- | --- |
| `JOURNEY_AI_ENABLED` | `false`; startup refuses an enabling value. |
| `JOURNEY_AI_RELEASE_READY` | `false`; startup refuses an enabling value. |
| `LIVE_AI_ENABLED` | `false`; the legacy path must remain off. |
| `LOVABLE_API_KEY` | Omit. The AI-off package needs no model credential. Do not copy a Lovable key into the image or assume it authorises the chosen cloud provider. |
| `SITE_PASSWORD` | Not needed for ordinary code-free entry. Conditional on a separately reviewed future server admission design; it is not a participant identity or a reason to restore the visitor-code screen. |
| `SESSION_SECRET` | Conditional on use of the existing signed-session admission functions. Provision securely at runtime only if that design is retained; never disclose its value in a handoff or log. |

Runtime plumbing also uses `NODE_ENV=production`, `HOST` and `PORT`. Nitro also
accepts `NITRO_HOST`/`NITRO_PORT` with precedence; avoid conflicting settings. The Docker
runtime defaults to `HOST=0.0.0.0` and `PORT=3000`; local smoke verification binds
to loopback. `BFA_SMOKE_PORT` is an optional local test setting, not a cloud
credential. Build-environment markers above describe the builder, not required
hosting settings. Do not introduce `VITE_` secrets: browser-exposed build
variables are not a secret store. Future provider credentials need a separate
reviewed server-side configuration; this document supplies none.

## Local commands

Run from the repository root with Node 24 and Bun 1.3.3 available. Use an
external checkout without Lovable managed-build markers. A frozen install
retains the committed lockfile; a failed install is not permission to regenerate
it or substitute dependency versions.

```sh
bun install --frozen-lockfile
bun run test:cloud
bun run build:cloud
bun run check:cloud
bun run smoke:cloud
```

`check:cloud` checks arguments and the AI-off configuration only; it does not
import the bundle, confirm that build output exists or start a server.
`start:cloud` starts the built Node server for an intentional local run:

```sh
HOST=127.0.0.1 PORT=3000 bun run start:cloud
```

The smoke script launches its own child server with all AI flags false and a
minimal environment. It does not inherit credentials, proxies, Node options
or managed-build markers. It checks HTML at `/`, `/day/1`, `/day/10`, `/privacy`
and `/settings`, plus the actual `/sw.js`, `/manifest.json` and same-origin
hashed JavaScript/CSS assets discovered in the home HTML. It checks status,
content type and bounded response bodies, rejects external/query-bearing asset
targets, and stops its child. It is a loopback HTTP check, not an interactive
browser, service-worker lifecycle, physical-device or model-quality test.
Its child-only preload blocks global `fetch` and checks for zero attempts;
that canary is not a firewall for other networking APIs and is not installed
in production startup.

When Docker is available, these commands prepare and run a local image only;
they do not push it to a registry or create a cloud service:

```sh
docker build --file Dockerfile.cloud --tag beauty-from-ashes:cloud-prep .
docker run --rm --name bfa-cloud-local --publish 127.0.0.1:3000:3000 beauty-from-ashes:cloud-prep
```

Use a fresh, recorded source revision for the eventual release image. Do not
put `.env` files, model keys, session secrets or result-exchange evidence into
the build context. The image health check establishes an HTTP response only;
it does not certify safe AI processing or pilot readiness.

## Participant state and incomplete integration

Journey progress, choices, preferences and saved reflections use the
participant's browser storage. They are tied to that browser/profile and
origin. A new cloud hostname does not receive the old origin's storage;
clearing storage or changing devices also does not restore it. Existing
readable reflection exports are records to keep, **not importable backups**.
There is no implemented account-based sync or migration/restore workflow.
Do not promise that moving the hosting transfers participants' journeys.

The shared gate's signed unlocked session is a gate, not a verified participant
identity. The dormant usage-reservation logic has no production transactional
store and is not wired into generation. A cloud server or a budget alert does
not supply those missing controls. See
[`USAGE_AND_LOGGING_PREPARATION.md`](../pilot/USAGE_AND_LOGGING_PREPARATION.md)
for the durable-store, retry, identity and allowance requirements.

Before AI use, install and version a reviewed provider adapter and any adopted
SRT policy deliberately, update the disclosure for actual processing/retention
and renew the required participant AI choice. Test saved-response identity,
faith changes, errors, retries and actual outgoing requests with fictional
data. Offline simulations and imported result records do not establish live
provider behaviour. The current pilot continuation is free access; this
package adds no checkout, payment integration or price.

## Transfer sequence after an approved route is available

1. **Build and record an image.** Verify the exact source SHA, frozen dependency
   install, Node output, startup guard, tests and container runtime. Record the
   resulting immutable image digest and verification evidence.
2. **Use an approved registry.** Confirm the account/project, permissions,
   region, costs and retention before uploading the verified image. Do not
   provision a registry or host from this document alone.
3. **Configure private hosting.** Select an available AWS managed container
   route or Azure managed container route after checking the actual account.
   Keep access restricted for fictional technical verification. No particular
   service's eligibility, current price or regional capability is assumed.
4. **Supply reviewed runtime configuration.** Keep AI off. Configure the root
   path, HTTPS, health check, runtime port, secrets handling, logging and
   bounded hosting capacity. Confirm domain ownership and DNS authority before
   changing a domain. The manifest and worker expect `/`; subpath hosting is
   not prepared.
5. **Verify with fictional information.** Complete the deployed checklist,
   including server-to-provider egress when a paid test is authorised,
   admission, durable usage enforcement, disclosure, retention, error paths,
   cache/worker updates and rollback. Verify real phone/tablet behaviour.
6. **Prepare the intended pilot.** Complete Carl's blind review of actual model
   outputs and resolve pilot scope, dates, participant information, support
   availability and feedback handling. Do not silently substitute an
   authored-only pilot for the intended meaningful AI component.
7. **Make an explicit release decision.** Hosting access, model testing,
   participant AI activation and public/paid release are distinct decisions.
   Confirm actual costs, account limits and monitoring; alerts alone do not
   enforce a spending cap. Retain an AI-disable route and the previous verified
   image digest/source SHA. A rollback changes application code, not provider
   records or browser data, and must respect current consent and cache rules.

Application-owned reporting uses bounded codes. The startup guard and smoke
script are intended to avoid printing arbitrary exception text or child logs;
their observed checks are recorded below. Platform access logs, proxies,
container stdout/stderr collection, independent hooks, provider logs and
retention still require inspection. Do not infer zero logging, anonymity or
deletion from the application wrapper.

## Verification record

Local verification used Node 24.19.0 and Bun 1.3.3 with a clean install from
the committed lockfile. Earlier Lovable builds used the normal managed
configuration; the Node checks below were run separately outside Lovable.

| Item | Current evidence |
| --- | --- |
| Locked helper archive | Both the locked cache URL and public registry archive returned HTTP 200 and the same SHA-512 integrity. No lockfile change was made. |
| Startup guard and tests | `node --test scripts/deployment/start-cloud.test.mjs`: 7 passed. Each enabling flag is refused before bundle import; missing bundle and synchronous/asynchronous failures emit fixed codes. |
| Frozen install and `build:cloud` | `bun install --frozen-lockfile`: exit 0, 476 packages. `bun run build:cloud`: exit 0. `.output/nitro.json` confirms `node-server`, `server/index.mjs`, and `public`. |
| Existing regression checks | `tsc --noEmit`: exit 0. `vitest run`: 1,265 tests in 68 files passed. |
| `check:cloud` and `smoke:cloud` | `check:cloud` passed. Final loopback smoke passed: 5 HTML routes, 8 discovered hashed assets, service-worker JavaScript and root-scope manifest. Actual compiled availability and generation RPCs both returned `ai-not-activated`; child global-fetch attempts were 0, with the guard installed throughout. Only fictional fixture input was submitted. |
| Actual production browser | Not completed: Playwright is installed but Chromium is absent. One authorised installation attempt returned an unusable ZIP archive; automatic retries were stopped. Hydration, real worker lifecycle and physical phones are not verified by the HTTP smoke. |
| Docker image build/run | Unverified. Docker is absent in this execution environment; Lovable has not verified a container build. |
| Hosted production, provider adapter and AI | Not performed by this preparation. No AWS/Azure adapter is installed, no cloud deployment is made and no model is invoked. |

Primary build references (checked 4 October 2026):
- https://tanstack.com/start/latest/docs/framework/react/guide/hosting
- https://nitro.build/deploy/runtimes/node
- Installed helper 2.23.1 types/implementation and Nitro 3.0.260603-beta
  preset metadata were inspected against the exact successful build.
