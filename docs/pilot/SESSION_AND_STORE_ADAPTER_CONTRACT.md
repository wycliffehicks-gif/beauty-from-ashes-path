# Session and durable-store adapter acceptance

Prepared 4 October 2026, Toronto. Starting Lovable/GitHub revision:
`1ad357f7c91ac75668b713440e44c29b20a3c3f5`.

## Purpose and limits

This is the implementation/acceptance contract for connecting the existing
`runApprovedJourneyBoundary` to a real authentication service and durable store.
The business decisions are already implemented and tested; this document and
its reusable store scenarios prepare the still-missing adapters. No route is
connected here, no account/database is created, and participant AI stays off.

Keep ordinary entry code-free. Authentication for an optional future AI request
must not silently become the removed shared visitor-code gate or transfer local
journey data into a cloud record. No private writing, selections or reflection
text is added to the accounting store. The authored journey, Carl's corrections,
SRT draft/approval distinctions, notice versions and browser progress are intact.

A passing SIMULATED reference fixture establishes that the acceptance checks
run. It does not establish database durability, credential verification,
multi-host isolation, backup safety, deployed security or permission to release.

## Existing integration points

| Boundary | Existing contract | Remaining implementation |
| --- | --- | --- |
| Identity | Request-scoped `ApprovedJourneyDeps.verifyPrincipal()` returns verified issuer/subject or refuses. | Selected service's server verification, browser/session handling, recovery and request protection. |
| Approval | Existing roster maps keyed identity to stable participant key, approval/revocation and expiry. | Restricted administrative enrolment/revocation; no automatic enrolment on a generation request. |
| Accounting | `AtomicPilotControlStore.transact(pilotId, decide)` owns one serializable decision across roster, attempts and usage. | Durable adapter with commit acknowledgement, retries, shared isolation, bounded failures and safe recovery. |
| Dispatch | Existing approved/reserved flow constructs a provider only after a new reservation succeeds. | Deliberate future route/provider integration and deployed fictional verification; never in a retried database callback. |

The accepted client reflection request still has four fields: day,
answer-meaning version, current-day selections and spiritual preference. The
consent envelope remains separate. Client identity, participant/attempt IDs,
spending estimates or timestamps must not become trusted accounting evidence.

## Request-bound session acceptance

Use the chosen service/framework's maintained verification implementation.
Do not write a custom sign-in system or treat decoded claims as authentication.
The following evidence is required from the actual adapter and final route,
using fictional accounts in an isolated test environment:

| Case | Required result / evidence |
| --- | --- |
| Valid request | Trusted verification binds one issuer/subject to this server request; only those two fields reach the principal port. |
| Missing, malformed or altered credential | Refuse before control-store or provider work. Shape-valid issuer/subject supplied by a browser is insufficient. |
| Wrong issuer/audience or applicable tenant | Refuse using the selected service's verified policy. Check signature, expiry and not-before conditions where tokens are used. |
| Expired/revoked session; logout | Server refuses subsequent requests; record actual expiry/revocation semantics and any propagation delay. |
| Interleaved participants | Concurrent requests for two fictional people retain their own identity, approval and allowance. No module-global current-user variable or reusable principal closure. |
| Injected body/query/header identity | Participant IDs or untrusted forwarded identity cannot override the verified principal. Only a documented trusted-proxy verification path may supply identity. |
| Browser request protection | Verify the final framework's CSRF/origin policy and secure cookie configuration against the stable participant origin and trusted proxy setup. Test rejected cross-origin requests; SameSite alone is not the acceptance proof. |
| Verification outage or deadline | Generic refusal with no store/provider work; no stale-claim fallback, credential dump or exception-body echo. Test the actual adapter's deadline, not merely a stub that rejects immediately. |
| Session renewal/account recovery | Maintain the existing issuer/subject-to-participant relationship, or use a reviewed administrative migration. Recovery must not create a second allowance automatically. |

These session cases are specified, not falsely marked as passed. The reusable
store fixture does not implement or verify them. Existing core tests cover
malformed principal results, wrong issuer and thrown verification errors.

Timing matters: the current core verifies the session once during admission.
It rechecks ROSTER approval/expiry atomically at reservation, but does not reverify
session expiry/logout at that later point. A session ending during an already
admitted request is not an implemented cancellation mechanism. If stricter
semantics are required, implement and test them deliberately before release.
Never promise that logout can undo an already dispatched model request.

The current core has no deadline around authentication or store awaits; its
provider-generation deadline is a different control. Choose and test bounded
verification/transaction deadlines in the actual adapters. After an uncertain
commit, return unavailable; a timeout cannot establish that no write occurred.
A late commit must not lead to a late provider dispatch after refusal.

## Minimum durable state and storage obligations

`PilotControlState` and `UsageLedger` remain the authoritative domain shapes.
Do not add fields to those exact runtime-validated objects casually.

| Record | Minimum retained information | Purpose |
| --- | --- | --- |
| Pilot | Stable pilot ID, schema version, HMAC key ID and keyed continuity check. | Refuse missing state or changed key lineage; no silent fresh namespace. |
| Roster | Keyed identity, stable participant key, approved/revoked status and server expiry. | Keep identity distinct from permission; preserve revoked mappings needed by historical attempts. |
| Attempt | Stable attempt ID, keyed logical request, exact dispatch fingerprint, identity/participant binding, budget/currency/pricing/worst-case reservation and reserved UTC day. | Reuse the original attempt for retries and reject changed dispatch configuration. |
| Usage | Matching reservations with attempt/participant/fingerprint/day/pricing/spend. | Enforce participant and shared caps; retain uncertain outcomes conservatively. |
| Storage envelope | Adapter schema/revision and concurrency metadata outside the exact domain object. | Detect conflicting writes and execute one serializable commit. This is not rollback protection by itself. |

The existing hashes are pseudonymous, not anonymous. Keep credential/session
material, raw identity claims, names/emails, request/response text, selected
labels and HMAC secret bytes out of these accounting records and their logs.
The authentication service may hold its own identity records; those need their
own disclosed purpose, access and retention arrangements.

Required adapter properties:

- Address state by the same stable pilot ID across all hosts and reconnects.
  Use authoritative reads; per-process locking or eventual read-then-write is
  insufficient for shared caps. A missing/unreadable record refuses safely.
- At usage reservation, recheck current roster approval and the exact stored
  attempt in the same serializable transaction, then commit the reserved-day
  marker and matching usage together. Earlier attempt creation may commit
  separately; it must not authorize dispatch. Do not split the reservation into
  independent writes or participant/global counters that can disagree.
  A callback is pure and may be evaluated again.
- Supply fresh authoritative time for each real transaction evaluation/retry.
  Refuse unavailable/invalid time. Do not reuse browser time or the first
  callback's timestamp when a conflict causes later evaluation.
- Give callbacks detached snapshots and commit only an explicit next state.
  Exceptions, discarded retries and accidental snapshot mutation cannot leak
  partial changes into committed storage. Isolate returned values too.
- Return success only after a complete acknowledged commit. Preserve committed
  reservations if acknowledgement is lost; do not refund or allocate a new
  attempt automatically. Reconnect/read/retry must see the retained state.
- Administrative seed, revoke, retention, key rotation and restoration procedures
  need restricted access and audit evidence. Fixture seed/remove/fault controls
  are test equipment and must never be exposed as participant endpoints.

## Recovery that cannot restore spent allowance

Current domain validation catches one-sided attempt/usage loss. It cannot detect
an internally consistent old snapshot of both records. Restoring such a snapshot
could restore an already spent allowance. Reopening simulated memory does not
solve this, and neither does a revision marker restored from the same backup.

Before accepting a durable adapter, document and rehearse this procedure:

1. Keep AI dispatch disabled after restoration, missing-state discovery or an
   uncertain database recovery. Stop old writers and quarantine the recovered
   namespace; do not bootstrap an empty replacement or change pilot/key IDs.
2. Establish continuity using independently retained authoritative reservation
   evidence or a trusted recovery authority outside that rollback's scope.
   Record what proves that post-snapshot reservations cannot be forgotten.
3. Reconcile conservatively. If charge/dispatch is uncertain, preserve the
   reservation. Without sufficient evidence, keep AI disabled; do not grant
   fresh allowance by assuming the lost requests never happened.
4. Validate complete roster/attempt/usage consistency, stable identity/key
   mappings and enforced caps. Run the acceptance cases against the recovered
   store and inspect provider dispatch counts with fictional requests.
5. Record the exact restore source, evidence, verification and authorized release
   decision before allowing dispatch again. Normal app availability need not
   imply that AI is enabled.

The independent recovery evidence and operational quarantine are release
requirements, not new mechanisms installed by this preparation. Record the
actual design for the chosen database; do not claim cross-region or failover
safety from a local fixture run.

## Reusable checks and evidence needed next

The companion test-only runner accepts a future adapter harness with isolated
seed/read, independently opened handles, close/reopen, controlled clock and
commit/retry fault injection. Its SIMULATED memory driver exercises the checks
now. The future database must supply its own harness and run the same checks
against a disposable non-production namespace with fictional data only.

The runner is `src/lib/ai/testing/pilot-store-acceptance.ts`; the explicitly
simulated driver is `pilot-store-simulated.ts`. The existing test file runs the
named scenarios plus deliberate bad-adapter controls:

```sh
./node_modules/.bin/vitest run src/lib/ai/__tests__/pilot-store-adapter-acceptance.test.ts
```

A future test file imports `pilotStoreAcceptanceScenarios` and
`runPilotStoreAcceptanceScenario`. For each scenario, call the runner with the
real adapter's isolated `PilotStoreHarnessFactory` and the scenario name. It
creates fresh fixture state and disposes resources after the case. Keep a test
runner deadline; this is not the adapter's production timeout implementation.

| Test-only harness control | Obligation |
| --- | --- |
| `connect` / `close` | Open independent adapter instances against the same isolated storage; close the handle, not the shared state. |
| `seed` / `remove` / `readCommitted` | Administrative fixture setup and authoritative inspection; represent a missing fixture record as `undefined`. Never call these from participant requests. |
| `setTime` / `retryNextEvaluation` | Control the test clock/conflict seam and exercise the actual adapter's new callback evaluation against fresh time/state. Do not alter a production system clock. |
| `holdNextCommit` | Signal that the write reached its pre-commit barrier; keep it held until released so assertions do not depend on a long sleep. |
| `failNextCommit` | Inject failure before commit or loss of acknowledgement after commit at the actual adapter boundary. |
| `dispose` | Release held gates and close test resources after success/failure; supply suitable runner/process cleanup for hung infrastructure too. |

Do not make a future adapter appear to pass by implementing these hooks as a
second memory store around it. Faults and inspection must reach its real
transaction boundary; record how each hook maps to the chosen database.
Simulated close/reopen shares one memory fixture and is explicitly not a real
process crash, restart, network partition or backup restore.

Acceptance requires two layers: the adapter scenarios AND the existing approved
request-flow tests running with the real adapter and a stub provider. Passing
store calls alone is not proof of the final HTTP/session/dispatch integration.
Do not expose fault controls in the app or run destructive fixture setup against
an actual pilot namespace. Record the precise service/version/isolation settings,
source revision, scenario results and limitations. No blanket security or
compliance certification follows from a passing suite.

The following must remain PENDING until observed with the actual implementations:

- Cryptographic/server session verification and browser request protection.
- Independent process/host concurrency and real process termination/restart.
- Real commit failure, lost acknowledgement, outage and adapter deadlines.
- Backup restoration, rollback quarantine and independently verified continuity.
- Deployed identity/approval/cost-control integration and actual outgoing data.

## Completed offline verification

The simulated reference passed all 11 reusable scenarios. Three deliberately
broken drivers were rejected for separate per-handle ledgers, success before
commit and mutation of committed callback data: 14 checks in the new test file.
The complete local regression passed **1,377 tests in 73 files**, and installed
TypeScript passed. These counts overlap. Global fetch was forbidden/asserted
unused in the new rehearsal, which has no provider or credential connection.

Independent review led to precise improvements in the checks: requiring the
correct losing cap refusal and both retained attempts; holding the actual
reservation commit; cleanup on failure before a gate; testing shared write/result
aliases; accepting safely frozen snapshots and missing-record refusal; and
allowing additional retries while requiring fresh time. No remaining concrete
blocker was identified after bounded re-review.

All existing runtime source, application content, routes, activation/notice
settings, dependencies and build configuration remain at the starting revision.
Only the test-only acceptance package and engineering records change here.
No browser or portable-build rerun is claimed for these test/document changes.
The launch plan records Lovable's normal build and independent final GitHub
complete-tree comparison. No production adapter is installed by a passing check.

## References checked 4 October 2026

The session/security requirements above use these primary guidance sources;
application-specific transaction and recovery requirements come from the
existing code and the identified adapter gap:

- OWASP Session Management: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP CSRF Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP REST Security: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html

These sources inform acceptance criteria. They do not verify an unchosen service,
settle privacy terms or replace the existing participant-release requirements.
