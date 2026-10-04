# Reserved AI request flow — offline preparation

Prepared 4 October 2026, continuing from GitHub
`6e38429aab763b6429cb220354960cb04d38774f`.

## Purpose and scope

The existing allowance decision already tests per-participant and shared
request/spending reservations. This step joins that decision to the actual
request validation and single-call generation flow in a separate dormant
entry point. The participant endpoint does not use that entry point yet.
Participant AI remains off, and the app remains unpublished.

The new entry point is `runReservedJourneyBoundary` in
`src/lib/ai/journey-reserved-flow.ts`. It reuses the extracted preflight and
dispatch functions in `journey-boundary.ts` and `journey-generation.ts`;
the existing `runJourneyBoundary` signature and participant route are retained.

The rehearsal uses fictional participants, a serialized in-memory test store
and injected provider stubs. It makes no real provider calls and incurs no
model charges. A stub satisfying the existing live-provider response contract
is still a software fixture, not model output or evidence of response quality.
The prepared SRT candidate is not installed, and no authored content, approved
correction, disclosure, client input field or current admission rule is changed.

## Order that must hold

1. Check the current activation/release locks, exact envelope, current consent,
   canonical four-field request and existing server admission.
2. Prepare the exact server-owned policy and grounded payload, and enforce its
   size ceiling before consuming allowance. Keep a copied immutable request
   across asynchronous checks.
3. Ask a trusted server port for the participant/attempt accounting context
   bound to that exact preparation and generation configuration. No identity,
   attempt, budget, pricing or clock value is accepted as a new participant
   request field.
4. Validate and snapshot the accounting context. Reserve through the existing
   atomic-store contract. A new committed reservation is the only permission
   to construct a provider.
5. Construct the provider and run the prepared generation at most once. Keep
   the existing output checks and bounded failure codes. A timeout, provider
   error, rejected output or uncertain storage acknowledgement never triggers
   an automatic refund or another dispatch.

The application endpoint retains its existing entry point; the new reserved
flow cannot be enabled by changing an environment flag alone. Its later
connection is an explicit implementation/release step.

## What the rehearsal does not supply

- A real verified participant identity or participant access/recovery flow.
  The existing shared signed pilot session is not a per-person identity.
- A server-issued attempt lifecycle or trustworthy keyed request fingerprint.
  The trusted port is an obligation for that later implementation, not proof
  that an arbitrary ID, hash or browser claim can be trusted. Retries must
  reuse their original bound attempt; unresolved completion must not silently
  mint another one.
- Durable database storage, actual multi-host serialization, persistence
  through a real restart, retention controls or administrative recovery.
  Reusing a test ledger with fresh dependencies checks protocol only.
- A verified maximum model charge, a paid testing allowance or real billing
  reconciliation. Fictional integer amounts are not prices or invoices.
- An AWS/Azure adapter, model comparison, adopted SRT policy, revised participant
  disclosure, deployed data/logging verification or participant release.

Later client integration must also present the bounded usage refusals clearly,
keep the prepared written reflection available, and respect deliberate retry
choices. A simulated accounting success is not permission to display AI or
silently wire this entry point into the participant endpoint.

The real integration must meet these obligations and the remaining checks in
`USAGE_AND_LOGGING_PREPARATION.md` and `DEPLOYED_AI_VERIFICATION.md` before
participant AI can be considered for activation.

## Verification record

Local verification used the existing pinned dependencies and Node 24.19.0.

| Check | Result and limit |
| --- | --- |
| New rehearsal | 35 cases passed. Injected handwritten provider, fictional identity/pricing and serialized memory only; global fetch was blocked and asserted unused. |
| Focused regression | 171 tests in the reserved-flow, boundary, generation and usage-reservation suites passed. This overlaps the full-suite total. |
| Full regression | 1,300 tests in 69 files passed. |
| TypeScript | `./node_modules/.bin/tsc --noEmit` exited 0, including the new tests. |
| Portable build | `bun run build:cloud` exited 0 with Bun 1.3.3 and Node 24.19.0. Generated route metadata was restored. |
| Built-server smoke | Five pages, eight hashed assets, manifest and service-worker file passed. Both compiled AI RPCs returned the disabled refusal; the child global-fetch canary recorded zero attempts. This is not a browser or full network-firewall check. |
| Independent source review | No concrete blocker found in the shared extraction, dormant flow or behavioural tests. No participant endpoint imports the new module. |

The focused command is repeatable without a model connection:

```sh
./node_modules/.bin/vitest run src/lib/ai/__tests__/journey-reserved-flow.test.ts src/lib/ai/__tests__/journey-boundary.test.ts src/lib/ai/__tests__/journey-generation.test.ts src/lib/ai/__tests__/journey-usage-reservation.test.ts
```

The cases exercise check/commit/factory ordering, exact preparation and
configuration binding, mutation during asynchronous checks, eight concurrent
same-attempt requests, a fresh handler and next-day retry against the same
ledger, conflicting participant/fingerprint/pricing, shared caps across
fictional participants, provider construction/generation/output failures,
timeout, lost commit acknowledgement and replay of a pure transaction callback.
Only one allowed dispatch occurs for a repeated attempt; failure retains its
reservation and no exception detail or source/choice text enters the ledger.

These are protocol and regression results. They do not establish a durable
database, authenticated participant, real network retry lifecycle, provider
quality or actual spend enforcement. Later Lovable/source-sync evidence is
recorded in the accompanying launch-plan checkpoint.
