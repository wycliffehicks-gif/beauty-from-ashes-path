# Proposed P5 voice admission SQL package

Updated 30 October 2026 • **offline draft; sequentially executed in PostgreSQL WASM, never applied to the connected project**.

`p5-voice-admission.sql` is proposed SQL outside `drizzle/migrations/` and its journal. It creates a private `bfa_p5_voice` namespace and seven service-only public RPCs. It does not modify existing P3b functions, permissions, ledger rows or settings. Do not run it on the connected project under general offline-development authorization. No voice admission, grant, quota balance or session is seeded.

`p5-voice-admission-fixtures.sql` is a sequential rollback fixture script. It refuses any database not named `bfa_p5_offline_fixture`; it still requires an isolated local installation of the P3b schema/roles and this draft first. Its direct record inserts are fictional infrastructure fixtures, not verified Auth, approved grants or real accounting. It is a sequential SQL suite, not a concurrency test. The native PostgreSQL server/client remain unavailable in this root-only environment. A separate in-memory PostgreSQL 18.6 WASM build (`@electric-sql/pglite@0.5.12`) now executes installation, sequential rollback and role checks. This establishes single-connection SQL execution, not native concurrent transactions, network authentication or HTTP acceptance. See [the repeatable local harness](../../../../scripts/conversation-eval/p5-sql/README.md).

## Separate capacity/reconciliation extension — 30 October 2026

`p5-voice-capacity.sql` installs only after the unchanged admission draft. It adds
six private `bfa_p5_capacity` tables and five service-only RPCs, outside automatic
migrations. It seeds no pool, route, allowance or session and changes no P3b/base
function. Missing trusted provisioning denies. Use the separate capacity WASM
runner in [the local harness](../../../../scripts/conversation-eval/p5-sql/README.md).

| RPC | Inputs | Purpose |
| --- | --- | --- |
| `bfa_p5_capacity_claim` | Exact claim receipt and claim | Atomically reserve one base quota hold, one pool slot and the matching cumulative pool hold. An existing base-only claim cannot be lazily attached or charged again. |
| `bfa_p5_capacity_mark` | Fresh inspect receipt, exact claim, immutable operation UUID, expected pool version | Recheck current authority, retained quota-policy binding and pool limits before recording one create marker. An already-marked reply never authorizes another external request. |
| `bfa_p5_capacity_close` | Retained exact cleanup UUID and claim | Terminally fence admission; release only a never-marked slot, with all cumulative units retained. |
| `bfa_p5_capacity_reconcile` | Exact cleanup UUID/claim and normalized observation | Record exact operation evidence; release a slot only for whole-operation finality; permanently quarantine trusted contradictions. |
| `bfa_p5_capacity_policy` | Existing pool UUID, expected version, active/unit limits, enabled boolean | Versioned limits only; no seed, refund, counter reset, unit-definition change, route rebind or quarantine clear. |

The observation has exactly `evidenceId`, `operationId`, `kind` and `sessionId`.
Kinds are `created`, `ended`, `not-created` and `unknown`; created/ended require
a bounded normalized session ID, the other kinds require JSON null. The future
trusted adapter must authenticate provenance, normalize provider/account/pool
scope and establish finality of the **entire immutable create operation**.
An HTTP acknowledgment, timeout, abort or not-found response alone is not such
proof. This SQL supplies no provider verifier or paid dispatch authority.

Operations take the owner lock first. Claim/mark then lock proof and cleanup,
current eligibility rows, claim/attempt/allocation, quota and shared pool, followed
by the global operation fence for mark. Authority and
actual time are checked again after waits. Pool routes and unit definitions are
immutable provisioning assumptions; no application writer is provided. The
pool policy RPC locks only its pool. Native cross-backend contention and
multi-operation transaction/deadlock behavior remain untested.

**447 single-connection PostgreSQL assertions pass: 202 unchanged admission
checks, 129 new capacity checks and 116 actual-role checks.** All 20 tables are
empty after rollback; the in-memory database closes. The fixture guards require
`bfa_p5_offline_fixture`. Actual execution repaired a reconciliation variable
ambiguity. Independent review found a current-approval quota-policy mismatch;
a regression reproduced the missing guard and passed after repair. Evidence is
`artifacts/conversation-eval/offline-validation-v11/`. These results do not
establish production Auth/revocation, native concurrency, transport, provider
termination/cost or real-device acceptance. The native harness now has an explicit `--capacity` mode with nine prepared
contention cases in addition to the original 12 admission cases. All 21 remain
unrun; 27 process-double runner checks and six executed WASM inventory-guard
checks in `offline-validation-v12` do not establish concurrent SQL behavior.

The sections below describe the original admission package and its historical
review. Statements about its lack of separate capacity apply to that base file;
this new, inactive draft supplies the bounded extension described above.

## Proposed RPC wire contract

All UUID JSON values must be lowercase canonical UUID strings. Counts and Unix-millisecond numbers must be nonnegative integers no greater than JavaScript's safe integer limit; deadlines must be positive. JSON strings containing numbers, missing fields, JSON nulls, unknown fields and coercible non-string fingerprints are rejected. Claims retain the exact existing `VoiceAdmissionClaim` shape, including immutable original `expiresAt` and exact voice scope/digest/binding.

| RPC | Inputs | Successful result |
| --- | --- | --- |
| `bfa_p5_voice_register_generation` | Trusted `p_owner`, `p_thread` | Server-generated incarnation UUID for the permanently registered thread identity. |
| `bfa_p5_voice_register_issuance` | Trusted owner/thread/incarnation/revision, exact keyed fingerprint, trusted issued/expiry milliseconds | `true` only for the exact current issuance, at most 15 minutes, no later extension. |
| `bfa_p5_voice_register_cleanup` | Preallocated server `p_cleanup_id`, exact `p_claim` | `{cleanupId, claim}`; never reopens a previously closed cleanup identity. |
| `bfa_p5_voice_register_proof` | Strict `p_proof` below | `{receiptId, operation, claim, expiresAt, effectiveExpiresAt}`; expected stale/revoked/expired evidence returns null so conservative fences can commit. |
| `bfa_p5_voice_claim` | `p_receipt_id`, exact `p_claim` | Existing `VoiceAdmissionAck`, own claim echoed, state `claimed`, `denied`, `replayed` or `closed`. |
| `bfa_p5_voice_inspect` | `p_receipt_id`, exact `p_claim` | Exact existing acknowledgment; cannot create a claim/hold. |
| `bfa_p5_voice_close` | Retained server `p_cleanup_id`, exact `p_claim` | Exact `closed` acknowledgment only after the terminal admission fence commits. |

The protected proof record has exactly these keys:

```text
receiptId, operation (claim | inspect), claim, cleanupId,
ownerSessionId, sessionVersion, authorityFingerprint,
identityExpiresAt, verifiedAt, expiresAt, effectiveExpiresAt
```

`expiresAt` is a one-operation receipt deadline, no more than 30 seconds after trusted verification and no later than the eligibility ceiling. `effectiveExpiresAt` is the independently shortening admission lifetime, bounded by the original claim, Auth identity/session fence, allowlist, issuance and exact approval. Renewing a receipt never renews that lifetime. A receipt is single-use for its exact operation/claim. A wrong operation cannot consume another operation's receipt; a valid consumed receipt cannot mutate again. No browser receives or supplies these receipts.

The current server adapter uses mandatory trusted ports; production implementations remain absent. Only the future verified issuer may call issuance registration; a presented client seal must never create/backfill its own registration. SQL does not cryptographically unseal an envelope or verify an external Auth service. Those are mandatory preconditions at the server bridge, backed by the existing verifier. An RPC's service-role privilege is not evidence that a generic HTTP caller was authenticated.

## Authority and lifecycle constraints

Every relevant operation uses the same owner advisory lock as P3b migration 0004. Eligibility locks and checks the **actual current** P3b staging and thread rows, so existing Stop/Delete revision/deletion fences cannot be bypassed by a stale shadow revision. Current thread state, generation, session fence, exact issuance and exact per-attempt voice approval are checked again after locks, including the quota lock. No transaction-start `now()` is used as expiry authority.

This bounded proposal **prohibits physical reuse of a registered P3b thread ID**. A permanent generation row has a noncascading foreign key to the P3b thread and a permanent owner/thread unique key. The server UUID in that row is the incarnation; `created_at` is only an additional consistency check. The registration function refuses a retired or mismatched existing identity. Observed deletion retires the generation. Existing permitted P3b operations do not reset a deleted row; restoring deleted rows, removing generation tombstones or creating new generations for the same ID is outside this contract. If a future product genuinely requires ID reuse, implement a creation/fencing bridge with an authoritative incarnation in the real lifecycle instead of weakening these checks.

The first admitted proof pins its Auth session, session-fence version and exact envelope fingerprint to the retained cleanup identity. Later processes cannot inherit that claim with another session/envelope. Session-fence provisioning/revocation and grant/quota administration have no writer RPC here. A future trusted bridge must maintain them under the same owner-first locking order; missing records deny. External Auth and database revocation cannot become atomic merely because these tables exist. The production revocation boundary and transport remain unintegrated and need their own acceptance.

Trusted shorter eligibility observations persist on the exact cleanup identity even if proof registration or inspection subsequently denies. Observed expiry produces a terminal expiry fence without returning a hold. An owner clock high-water record prevents a backward database-clock movement from reviving previously observed time; admission checks deny while the current clock is below that high-water mark. Cleanup remains available independently of fresh Auth, expiry or clock eligibility.

## Exact cleanup, attempts and accounting

Claim and close acquire the owner lock before checking or creating an absent row. Close can insert an exact tombstone using its retained preallocated cleanup ID even if registration was lost or has not finished. A late registration leaves that tombstone intact. An unused owner/attempt slot is retired by close without a hold; if another claim already won the attempt, its identity and hold are untouched. Different claim IDs cannot obtain multiple holds for one owner/attempt, including across thread revisions/incarnations.

One enabled server-selected quota policy atomically decrements checked integer units. No policy or insufficient units denies. This draft supplies **cumulative reservation only**; it does not implement a distinct concurrent-session-capacity limit or real billing policy. These generic units are not a selected provider's currency or sufficient production cost/concurrency controls. Those separate limits remain required before live use. No paid provider, dispatch permit, refund, settlement or provider-termination function is supplied. Closing admission leaves held units retained. Missing/ambiguous transport results must retain their exact handles and evidence for deliberate cleanup; do not automatically retry a mutation with new IDs.

All private tables enable RLS with no browser policies and revoke direct DML/usage from the browser and service role. Only the reviewed public `SECURITY DEFINER` RPCs receive service-role EXECUTE; PUBLIC/anon/authenticated EXECUTE is revoked in the same creation transaction. Search paths contain only `pg_catalog,pg_temp` and application objects are qualified. The installing trusted owner retains administrative authority; it must not expose generic SQL or arbitrary service-role invocation to browsers.

No cascade cleanup or time-based garbage collection exists. Retain content-free proof/attempt/claim/generation/close evidence until a separately reviewed retention rule can prove no delayed worker, replay or receipt can use that identity. P3b accounting and the completed v5/P4 grant boundaries remain untouched.

## Review completed and verification still required

Independent source review is complete. It found and corrected timestamp-only generation binding, lifetime shortening lost on semantic denial, backward-clock revival, missing durable session continuity, nullable partial session tuples, overly broad function-ACL selection and fixture variable/cast/assignment defects. The final source review identified no remaining blocker. Subsequent single-connection PostgreSQL WASM execution now also passes; native concurrent execution remains unrun.

The sequential rollback suite executed **57 assertion invocations** (39 textual sites including a loop over seven RPC signatures). Separate actual `SET ROLE` execution passed **145 checks**: anonymous/authenticated RPC denial, private SELECT/INSERT/UPDATE/DELETE and helper denial for all three roles, and a successful service-role generation/issuance/cleanup/proof/claim/inspect/close flow with retained held units. Denials must be SQLSTATE 42501, and role switches check `current_user`. Both suites rolled back, leaving all 14 P3b/P5 tables empty; the in-memory database closed. These 202 checks are narrower than server transport or production Auth evidence.

Actual execution found two test-harness defects: the FK RESTRICT case returned SQLSTATE 23001 whereas the original fixture caught only 23503; the new role fixture had an ambiguous local `claim` identifier. Both were corrected and rerun. No behavioral change to the proposed admission SQL was required (only its evidence-status comment changed). Preserve these findings rather than reporting that the first execution passed.

The native runner creates its own disposable cluster and private Unix socket, rejects root or missing binaries, clears inherited connection/configuration variables, disables TCP listening and verifies shutdown before removing its own temporary directory. Its separate `concurrency.py` prepares 12 named cases with observed database lock barriers, not sleep-based scheduling assumptions. The native case bodies are **unexecuted** here. Harness guard/cleanup unit tests use process doubles and cannot establish database concurrency. A discarded SQL return value case is a missing-acknowledgment model, not a network transport-fault test.

The next database step is to run that existing native harness under an ordinary nonroot OS user with PostgreSQL installed, inspect actual installation/role/lock/expiry/close/replay results and repair any failures. Do not repeat unavailable-engine probes or treat WASM connection multiplexing as independent backends. Until such an environment is available, useful offline work can proceed on the remaining concurrent-capacity, reconciliation and trusted-port contracts. Keep this draft outside the automatic migration journal and never run the harness on the connected project or recreate closed P3b accounts.

Before production use, integrate and accept the distinct concurrent-session-capacity draft, real provider accounting policy, trusted issuance/Auth/revocation/transport bridges and downstream dispatch gate. Production migration application, authenticated voice acceptance, provider selection/credentials/calls, physical-device/listener/screen-reader acceptance and publication remain separate unfinished gates.

The primary PostgreSQL references reviewed on 27 October 2026 were [explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html), [current-time functions](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT), and [safe SECURITY DEFINER functions](https://www.postgresql.org/docs/18/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY). These support transaction advisory locks, actual-clock checks and privilege/search-path precautions. They do not establish the deployed PostgreSQL version or substitute for executing this proposed package.
