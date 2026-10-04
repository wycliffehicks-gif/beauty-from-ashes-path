# Participant approval and stable request attempts

Offline preparation, 4 October 2026, Toronto. Starting GitHub revision:
`2e74eeb043460869fcb353f7115d0fa20224bd54`.

## Scope

This extends the dormant reserved-request flow with server-side preparation for
participant approval, keyed request binding and stable attempt reuse. Ordinary
app entry remains code-free. The participant endpoint, AI activation flags,
authored content, accepted corrections, candidate SRT policy and disclosure are
not changed. No participant account is created and no invitation is sent.

Authentication and approval are distinct. An eventual trusted authentication
adapter must verify its session/token and return the authenticated issuer and
subject. The new preparation uses that evidence to look up an already approved
roster entry with a stable opaque participant key. Browser IDs, client claims
and the shared pilot-gate cookie cannot substitute for that evidence. The
actual authentication service and its adapter are not installed by this work.

The new entry point is `runApprovedJourneyBoundary` in
`src/lib/ai/journey-approved-flow.server.ts`. Node-only binding lives in
`journey-request-binding.server.ts`; pure approval, attempt and transaction
decisions live in `journey-participant-attempt.ts`. No app route imports them.

## Required request sequence

1. Preserve the existing activation, consent and strict four-field request
   checks. Obtain authentication evidence only from the trusted server port.
2. Look up the approved participant in an existing pilot-control record.
   Missing, revoked, expired or malformed approval fails closed. Request
   handling cannot enrol a new person or initialise a replacement ledger.
3. Normalize the logical selection request so equivalent option identifiers
   and selection order do not manufacture new attempts. Use a keyed fingerprint
   scoped to the participant and pilot. Keep source text, raw identity claims
   and selected labels out of the accounting record.
4. Atomically find or create the server attempt for that logical request.
   Bind it separately to the exact prepared content, generation configuration,
   budget and reviewed pricing. A later retry reuses the stored attempt;
   configuration drift is not permission to allocate a replacement.
5. In the usage-reservation transaction, recheck current participant approval
   and the exact stored attempt before applying the existing usage decision.
   Provider construction is permitted only after a new reservation commits.
6. Keep attempts and reservations after errors, timeouts or lost transaction
   acknowledgements. This preparation adds no automatic refund, expiry,
replacement attempt or regeneration of a completed logical request.

Normalization applies only to a validated, detached request inside this dormant
flow. It uses stable option IDs, question order, sorted selections and the
existing spiritual-off presentation filter. It does not rewrite saved answers
or authored content. Logical equivalence does not override exact dispatch
binding: model, policy, preparation, output limits, pricing, currency, budget
and caps are all bound separately.

Changed canonical selections are a different logical request and remain
subject to the same participant and shared limits. That does not cancel an
earlier dispatched call. Revocation is an authorization check at the transaction
boundary, not a claim that already dispatched provider work can be cancelled.

## State and integration boundaries

The combined pilot-control transaction must retain roster approval, stable
attempt mappings and usage state consistently. The test implementation is
serialized memory only; it is not a production database. A later durable
adapter must preserve these semantics across concurrent hosts, restarts,
transaction retries, outages and restoration. Missing state must not become a
fresh allowance. Administrative enrolment, recovery, retention and key rotation
require explicit procedures that preserve participant and attempt history.

An attempt's reserved-day marker and its exact usage reservation are committed
together and must agree in both directions. Single-sided record loss or a
changed reservation is refused. This does not detect a coherent rollback of
both records to an earlier pre-call snapshot: the durable adapter and recovery
procedure must prevent that from restoring spent allowance.

The store is addressed by a stable pilot ID. Its existing record pins both a
key ID and a keyed continuity check; changing secret bytes under the same key ID
also refuses access. Each transaction evaluation receives authoritative server
time from its adapter. Approval expiry is rechecked at usage commit. If the UTC
day changes between attempt resolution and reservation, that request refuses
without dispatch; an explicit retry retains the same attempt. Random candidate
IDs are generated outside retriable pure callbacks and are not sign-in tokens.

The keyed hashes are pseudonymous identifiers, not an anonymity guarantee.
Production keys belong in server-side secret management and must not enter
client builds, repository history, logs or model requests. No production secret
is created or read in this rehearsal; test keys and participants are fictional.

Authentication service selection, browser session handling, origin/CSRF checks,
account recovery, participant access screens, durable database deployment,
provider integration and participant AI release remain separate work. Later
sign-in does not itself move existing browser-local journey progress or make
readable exports into restorable backups.

## Verification record

Forty-five new tests use fictional verified-principal adapters, public fixture
keys, a serialized memory store and handwritten provider responses. Global
fetch is blocked and asserted unused. These are protocol checks, not actual
authentication, durable database or model-quality results.

- Approval checks refuse unknown, revoked, expired or malformed identities and
  preserve activation/consent/request refusal before authentication or storage.
- Eight concurrent equivalent requests, aliases, reordered answers and fresh
  handler instances retain one attempt and permit only one stub dispatch.
- Existing 22 fictional fixtures across all ten days retain their prepared
  canonical meaning and practice routing after request normalization.
- Configuration/key drift, shared allowance, revocation/expiry at commit, UTC
  rollover, unknown provider outcome, lost acknowledgements, callback replay
  and both directions of partial record loss are checked.
- The full regression passed **1,345 tests in 70 files**. Independent source and
  test review found no remaining concrete blocker after the two-way consistency
  check was added. Protected live/content/dependency/configuration paths match
  the starting revision.
- The focused participant/attempt, reserved-flow, boundary and usage suites
  passed **129 tests in four files**; this overlaps the full-suite count.
  `./node_modules/.bin/tsc --noEmit` and `git diff --check` passed.

Run the new cases without a model connection:

```sh
./node_modules/.bin/vitest run src/lib/ai/__tests__/journey-participant-attempt.test.ts
```

Later Lovable build and independently verified GitHub-sync evidence are recorded
in the accompanying launch-plan checkpoint. No browser or container rerun is
claimed for these dormant server modules.

Technical references checked for this design:

- Node 24 crypto documentation: https://nodejs.org/docs/latest-v24.x/api/crypto.html
- OWASP session management guidance: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

These references inform implementation choices; they are not a security audit
or verification of an eventual authentication/database deployment.
