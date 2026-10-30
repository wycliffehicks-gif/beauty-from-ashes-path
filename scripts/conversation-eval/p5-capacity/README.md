# Offline capacity and reconciliation specification

This dependency-free executable contract prepares a missing P5 boundary. It is
**not application runtime, a database store, authentication, provider evidence,
or permission to dispatch**. No application route imports it. No credits,
credentials, HTTP endpoint, model, microphone or provider SDK are used.

Run from the repository root with the existing Node installation:

```sh
node --test scripts/conversation-eval/p5-capacity/model.test.mjs scripts/conversation-eval/p5-capacity/model.review.test.mjs
```

`model.mjs` implements one in-memory pool and serialized reference transitions.
`fixtures.mjs` and both test files use fictional, normalized trusted-boundary
inputs. `freshEligibility: true` is a fixture assertion, not verified Auth.
`ended` and `not-created` stand for final evidence covering the **entire exact
create operation**, including no outstanding continuation. A close HTTP response,
404, timeout, rejected promise or missing session ID cannot supply that evidence.

The model keeps active occupancy separate from cumulative held units. It fences
close-before-create, keeps marked-but-uncertain work occupied, rejects identity
reuse, preserves holds across releases and policy changes, and permanently
quarantines a pool after contradictory trusted evidence. That quarantine also
blocks create markers for already-reserved replacements. Cleanup remains usable.
The model deliberately provides no refund, pool reset, automatic retry or expiry
garbage collection. A late historical creation acknowledgment for the same ended
session is not a new session or proof of current activity.

One test enumerates **1,120 serialized orderings** of two fictional attempts,
create markers, close and terminal evidence. Those paths test model invariants;
they are **not 1,120 database concurrency tests**. Independent adversarial tests
exercise failure and replay outcomes separately from the primary suite. All
inputs are ordinary JSON-compatible fixture objects; this tool is not a parser
or security boundary for arbitrary browser requests.

See the [capacity/reconciliation contract](../../../docs/pilot/conversation/p5-capacity-reconciliation-contract.md)
for exact finality, lock/transaction, policy and future adapter obligations.
Evidence is retained under `artifacts/conversation-eval/offline-validation-v10/`.
The native 12-case PostgreSQL suite remains separately unrun; do not repeat the
unavailable root-only setup probes. Prior 202 WASM SQL assertions and 579
application conversation tests are historical, distinct checks.

Next: translate the reviewed transitions into a proposed isolated SQL extension
and transaction fixtures, reviewing one cumulative hold per attempt, shared-pool
locking, current P3b fences and cleanup-after-deletion. Keep that extension outside
automatic migrations and the connected project. Production Auth/read/issuance,
authenticated provider reconciliation, real cost policy and actual device/voice
acceptance remain unfinished. All existing live gates stay closed.
