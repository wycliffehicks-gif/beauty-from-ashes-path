# P5 durable atomic voice admission store — draft contract

27 October 2026 • America/Toronto. Source reviewed: `35409ac701ea2d068318aa7d275798620b9df397`.

**Design and acceptance requirements only. No store, schema migration, Auth integration, route, provider session or paid allowance is implemented or enabled by this document.** The companion offline verification adapter checks injected server snapshots and authenticated sealed authority; its fixture results do not establish production issuance, atomic persistence or deployed authentication. P3b fictional-account acceptance is complete and closed. Its tables, migrations 0000–0009, retained fictional-unit holds and reconciliation history remain unchanged.

This contract specifies how to meet the requirements of [the P5 server/session proposal](p5-server-session-contract.md) at the durable-store boundary. `VoiceAdmissionClaim` and `VoiceAdmissionAck` in `service/voice-admission.server.ts` are the existing content-free orchestration interface. An admission is eligibility for subsequent checks, never permission to create a provider session, dispatch a request or issue a client capability. A later dispatch transaction and a separately approved live manifest remain necessary.

## 1. Authority and legacy envelopes

The store must derive the principal from verified server Auth and use server-controlled current state. Client owner IDs, incarnation values, revisions, attempt IDs, clocks and visible controls are claims to compare, never authority. The requested attempt ID is an idempotency identity; it is not a secret or an authorization token.

The current P3b active AES-GCM envelope authenticates owner, thread, revision, expiry and service authority. It has **no incarnation or issuance time**. Matching it against a newly created row with the same ID/revision is insufficient. Do not derive issuance time by subtracting 15 minutes from its expiry, and do not regard valid decryption as caller authentication.

The selected compatibility design is an exact, server-created issuance registration:

1. Trusted thread creation/recreation establishes a fresh, never-reused incarnation using an independent server UUID; neither the client UUID nor a timestamp is the incarnation. Later token issuance/restore uses that existing current incarnation and exact current revision; issuing a token does not itself create another generation.
2. The trusted issuer seals the active authority and computes its existing keyed envelope fingerprint. Before returning that token, it registers the exact fingerprint, owner, thread, incarnation, revision and original expiry against the still-current locked thread. If fencing or expiry wins during encryption/registration, do not issue the token.
3. Verification requires the matching pre-existing registration and authenticated unseal result. The registration is content-free; neither raw tokens nor decrypted authority are stored in it. The fingerprint identifies an issued opaque seal, not private journal text, audio or another content source.
4. A client-presented token must never create, repair or backfill its own registration. An unregistered legacy token is denied for voice even if P3b can decrypt it. A future controlled issuance path is required; this draft does not reopen staging or change existing saved snapshots.
5. A saved snapshot is not active voice authority. A deliberate future restore must produce and register fresh active authority through the established service boundary; it cannot revive an expired active token or an old incarnation.

Issuance registration prevents generation confusion; it is not approval. Each voice attempt also requires an exact separate, server-controlled voice grant binding owner, thread, incarnation, revision, attempt, scope `developer-voice-session`, approval ID, approval digest and original deadline. No wildcard grants, caller-selected grants or grant renewal by retries. The current P4 text manifest and empty grant registry remain unchanged and supply no voice grant.

Preserve the established active-authority maximum of 15 minutes from trusted issuance unless a later design explicitly changes it. Registration, verification, retries and receipt renewal may never extend the original seal's expiry. Only a deliberate permitted service transition may issue a new active envelope; a new envelope still requires current generation/revision, separate approval and quota checks.

## 2. Proposed content-free records

Names below are conceptual, not SQL, generated types or migration instructions. A future migration must select an isolated namespace and review its grants/RLS explicitly. Existing `bfa_p3b_*` admissions and fictional units must not be repurposed as paid voice accounting.

| Record | Required fields and constraints |
| --- | --- |
| Thread generation | Server owner/thread/incarnation; current revision; terminal deletion/fence state. Incarnation immutable and never reused. Lifecycle changes serialize with admission. Keep a non-content tombstone after deletion. |
| Active issuance | Keyed envelope fingerprint; exact owner/thread/incarnation/revision; original authority expiry; terminal revocation/fence state. Registration created only by trusted issuance. No token, snapshot or text payload. |
| Voice approval | Immutable ID/digest/scope and exact binding; original approval expiry; revocation state; explicit quota-policy version. No implicit approved rows or default budget. |
| Attempt slot | Unique `(owner, attempt)` across threads, revisions and incarnations. Either one immutable winning claim ID/binding or a terminal denial tombstone. Reuse cannot acquire another hold. |
| Claim record | Globally unique server claim ID; immutable exact binding and original `expiresAt`; separately monotone effective deadline; admission state; content-free quota-hold reference, if any. Claim-ID reuse with different bytes is rejected. |
| Close tombstone | Exact claim ID/binding/original expiry; terminal close time and fence version. May exist before a claim commit. It must not be cascade-deleted with content, the user account, grant or thread. |
| Quota/usage evidence | Server-selected policy/version/unit definition; limits and reservation; separately recorded dispatch uncertainty, reconciliation identity and settlement. Counts and amounts use checked integers with bounded arithmetic. No message/audio/raw provider payload. |

The attempt key deliberately omits thread/revision so changing those fields cannot turn the same owner/attempt into a fresh operation. Different owners have separate attempt namespaces. Claim IDs remain globally unique, and all bindings are compared rather than inferred from the ID.

There is no chosen provider, real-time quota unit, paid budget or live concurrency allowance in this contract. Missing policy or zero capacity denies admission. Quota reservations are engineering controls, not verified charges. A concurrent-capacity limit alone is insufficient for future paid work: a separately defined cumulative-attempt/cost limit is also required. Denied/replayed claims acquire no second hold.

## 3. The missing transaction proof bridge

The existing `claimAdmission(claim)` signature carries no Auth session or active seal. **Parsing a claim or trusting an earlier verification boolean cannot satisfy independent transaction checks.** A production store adapter must also receive an unforgeable, invocation-scoped server proof context, or a bounded transaction-verifiable receipt, that ties the claim to:

- The freshly verified Auth principal/session, verification time and identity expiry.
- The exact issuance registration, thread generation/revision and original authority expiry.
- The current allowlist entry, exact voice grant/digest/scope and relevant revocation versions.
- The exact immutable claim, allowed operation and proof expiry.

The receipt must be created only by trusted server verification, never accepted as arbitrary browser JSON. Its signature/issuer or protected durable record must be verified before privileged use. It must not contain the raw seal or conversation authority, and must not introduce a transcript/content cache. Any server invocation memory is bounded to that operation and released afterward. Do not use a shared mutable "last verified" context: concurrent requests must not overwrite, inherit or reuse another invocation's proof. A claim alone is never an alternate receipt.

External Auth verification cannot be made atomically consistent with a database transaction merely by holding a thread row lock. The production design must define its revocation boundary: verify Auth immediately before entering the transaction and recheck a transaction-visible, server-maintained session/revocation fence plus expiry under lock. If that fence cannot cover the selected Auth lifecycle, the claimed guarantee must be narrowed and reviewed before a live route is enabled; no fixture can supply the missing synchronization. Do not hold database locks while calling external Auth/provider services. Do not infer verified token expiry from unsigned client claims.

All eligibility checks are repeated around waits. When any earlier proof has a shorter deadline, later evidence may not extend it. Original claim bytes remain immutable for exact cleanup acknowledgments; keep an additional effective deadline if refreshed evidence shortens eligibility. At exact expiry the claim is unusable. Server and database clocks, clock skew allowance and checked integer-millisecond conversion require explicit production acceptance; a backward clock step must never renew an already expired/revoked lease.

## 4. Serialization and lock order

The P3b precedent is migration 0004: serialize an owner with the same transaction advisory lock, lock the current thread, then recheck using the actual clock after waits. Its earlier transaction-start-time checks were superseded. The new implementation must preserve that established order if it shares P3b thread lifecycle authority; adding an unrelated lock namespace would not serialize against existing Stop/Delete.

PostgreSQL's [locking documentation](https://www.postgresql.org/docs/18/explicit-locking.html) confirms that row locks protect returned rows, advisory locking depends on consistent application use, and transaction advisory locks release at transaction end. Its [time-function documentation](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT) distinguishes actual `clock_timestamp()` from transaction-start `now()`. These semantics were checked on 27 October 2026; they do not establish the deployed database version or validate this proposed transaction design.

Proposed order for every operation that touches a given owner's admission state:

1. Acquire the established owner transaction lock. Reject missing/malformed owner before constructing a lock key.
2. Lock applicable identity/revocation/allowlist and approval rows in a fixed documented order; lock the thread generation/current thread row before attempt/claim/quota rows. Bulk operations sort keys consistently.
3. Lock/read the exact attempt slot, exact claim/close tombstone and server quota rows. Database uniqueness constraints remain mandatory in addition to advisory locks.
4. Re-read all current binding, revocation and deadline conditions after the last potentially blocking lock and immediately before committing an admission or dispatch transition. Use actual database time, not a transaction-start timestamp.
5. Apply all claim/slot/hold changes in one transaction. Any failure rolls back the entire transition. No automatic retry of an ambiguous mutation or conflict.

Every creator, lifecycle fence, revoker, quota updater, close operation and reconciler must obey a compatible locking discipline. A single correctly locked claim function is insufficient if deletion or approval revocation can race outside it. Global grant revocation that affects multiple owners needs a reviewed lock strategy without a reverse lock order; the current draft requires exact per-attempt grants and selects no global mutable grant mechanism.

Deletion/Stop need not wait for provider cleanup. Their database fence advances the locked current revision or terminally deletes the generation, invalidates issuance/admission eligibility and purges permitted saved content in the same lifecycle transaction. It preserves content-free claims/tombstones/holds. Already possibly dispatched work becomes uncertain rather than refunded. The existing P3b fence behavior must not be weakened or replayed as a new staging test.

## 5. Atomic operation semantics

The pseudocode below defines transaction outcomes, not executable SQL. No function is deployed by this document.

### Claim

```text
validate trusted invocation proof and exact immutable claim
begin transaction; acquire the agreed locks
if exact claim ID exists with different binding/original expiry: reject
if exact close tombstone exists: return owned closed acknowledgment
recheck current Auth fence, allowlist, issuance, thread generation/revision,
  exact voice grant, every earlier deadline, and current database time
if attempt slot is retired: return owned denied acknowledgment
if attempt slot has a different winner: return owned replayed acknowledgment
if the same claim is already current: inspect it; never reserve again
if policy missing, capacity exhausted or any check fails: deny without hold
otherwise atomically create attempt winner, claim and one quota hold
commit; return exact owned claimed acknowledgment
```

The server chooses hold units and policy; the browser cannot request a cheaper reservation. Decreasing a remaining balance must fail atomically if insufficient and must not overflow either direction. A different winner must never be exposed as the losing caller's cleanup claim. A replay acknowledgment echoes only the losing caller's exact claim identity with state `replayed`; it conveys no authority over the winner.

No optimistic success before durable commit. A transport error or malformed/lost response after a possible commit leaves the caller owning an invalid/uncertain handle and the server retaining its durable state. The caller must close that exact claim. Do not retry with a fresh ID automatically, treat absence of a reply as a rollback, or free the reservation on timeout.

### Inspect

Inspect validates the trusted principal/context and exact claim, takes compatible locks, and returns `claimed` only while the exact winner, grant, generation/revision, identity fence, allowlist and effective deadline remain current. The acknowledgment carries the immutable original claim; it cannot replace its expiry with a later one. Absence, changed binding, terminal state or unavailable authority fails closed. No hold, grant, issuance, capability or provider connection is created by inspection.

Inspection is a linearized eligibility observation. It does not reserve a future provider action against revocation after that observation. The existing admission orchestrator performs fresh verification after inspection as another eligibility check; the later dispatch transaction must still decide independently.

### Close, including close before claim

Close runs through a dedicated trusted cleanup path for a server-retained exact claim identity. It must remain available after the identity expires, staging is revoked, a thread is deleted or the foreground account changes. That does **not** make it a browser RPC accepting arbitrary owner/claim IDs. A narrowly scoped authenticated cleanup mechanism must establish exact retained ownership without requiring still-active admission authority.

```text
validate trusted exact cleanup ownership; begin transaction; acquire owner lock
reject a reused claim ID whose immutable binding/original expiry differs
insert or retain the exact terminal close tombstone
if this claim exists: terminally fence only this claim's admission
if attempt has a different committed winner: leave that winner and hold intact
if attempt has no winner: create terminal retired-attempt denial tombstone
commit; return the exact caller-owned closed acknowledgment
```

The retired attempt is denial evidence only: it grants no ownership, creates no quota hold and authorizes no dispatch. With the same owner lock, either the earlier winning claim commits before close and is observed, or close commits first and a later claimant sees a terminal fence. A late claim for the closed ID can never reopen it. A close for a losing replay claim must never cancel the already committed winner, even when their attempt IDs match.

The owner lock covers the absent-row case: claim and close must take it **before** testing or inserting either an attempt slot or tombstone. A `SELECT ... FOR UPDATE` that finds no claim row is not the absent-key fence in this design. Uniqueness conflicts must be handled as terminal conflicts or exact idempotent outcomes after rereading under the agreed locks, never by overwriting an existing binding. Tombstones/retired attempt identities must not be purged merely because admission expired or content was deleted. Any future compaction needs a reviewed retention rule proving that no delayed worker, replay or retained receipt can still use that identity; absent that proof, retain the non-content fence. This draft does not establish a production retention period.

Close acknowledges terminal **admission** closure only. It neither deletes accounting evidence nor proves transport/provider termination or returns a refund. Repeated exact closes are idempotent. A lost close response remains unconfirmed locally until deliberate retry or trusted reconciliation obtains durable exact evidence; no automatic Start/Resume or reacquisition follows.

### Separate accounting and reconciliation

Admission closure, capacity release, possible dispatch, confirmed provider termination and usage settlement are different facts. Record them separately. Where a later provider might have received work, keep the cost/capacity hold uncertain until the reviewed reconciliation rules establish what can be released. A local AbortSignal, browser track stop, disconnected transport or closed admission is insufficient evidence.

A trusted reconciler may run after deletion/revocation without loading personal content. It accepts a content-free exact session/attempt/receipt identity and authenticated provider evidence, applies a single permitted settlement transition and treats identical receipts idempotently. Conflicting receipts, missing evidence or out-of-order events do not reopen admission or silently release a hold. No real provider exists in this batch, so no actual termination/accounting claim follows from these rules.

P3b's six uncertain held fictional units and one reserved row-lock control unit are existing separate evidence, not paid charges or funds for this design. Leave them unchanged. P4's single-host evaluator ledger is not this distributed store and cannot substitute for its transactions.

## 6. Required database and boundary acceptance

These are future tests, **not passed checks**. Unit fixtures can demonstrate adapter decisions and acknowledgment handling; concurrency acceptance needs at least two independent database connections/processes against the exact proposed migrations with transport faults and controlled lock waits. Do not reopen the completed P3b accounts to run them under this offline instruction.

| Case | Required durable observation |
| --- | --- |
| Two concurrent claims, same owner/attempt and different claim IDs | Exactly one winner and one hold; loser cleans only itself. |
| Same attempt with changed thread, revision or incarnation | No second admission or hold; binding conflict/replay cannot become new work. |
| Repeated exact claim after lost response | No second reservation or dispatch; ownership remains exact and inspect/close can reconcile. |
| Close wins before delayed claim starts/commits | Exact terminal tombstone and retired attempt prevent later activation; no hold is created by close. |
| Winner commits before a different losing close | Winning claim/hold unchanged; only losing claim is fenced. |
| Close response lost; deliberate retry | One terminal close outcome, no refund or reacquisition by retry. |
| Identity, allowlist, issuance or grant expires during each possible lock wait | No usable claim/dispatch after the wait; earlier shorter deadline never extends. |
| Auth/allowlist/grant revoked while an operation is waiting | Recheck rejects under the specified revocation boundary; evidence names its actual scope. |
| Thread deleted/advanced while claim waits | Lifecycle fence wins according to lock order; stale claim cannot activate or restore content. |
| Same visible thread/revision recreated | Old incarnation/registration cannot match the replacement; no inherited voice authority. |
| Valid legacy seal without issuance registration | Denied with no registration backfill, hold or provider work. |
| Forged, expired, replayed or cross-request verification receipt | No privileged mutation; receipt binding is checked independently of shape. |
| Parallel final quota slot, cross-thread and cross-instance | Atomic capacity/budget limit; no negative or overflowing arithmetic. |
| Database/transport failure after possible claim/close commit | Durable uncertainty preserved; no automatic retry, rollback inference or refund. |
| Close after deletion/Auth expiry/account switch | Trusted exact cleanup works without reading content; arbitrary browser closure denied. |
| Delayed/duplicate/conflicting settlement evidence | At most one settlement; uncertainty and tombstones survive; no reactivation. |
| Browser/anonymous/direct RPC access | No writes, privileged reads or proof minting through client-supplied identities. |
| Reconciliation after content deletion | Only non-content evidence read; no snapshot restoration, transcript or audio logging. |

At the actual HTTP boundary, inspect semantic results as well as status codes: prior P3b transport can serialize a denial with HTTP 200. Keep direct-handler tests, HTTP tests, database concurrency evidence and device/provider evidence distinct.

## 7. Next implementation boundary

The next useful offline step is to turn this reviewed contract into a proposed, isolated migration/RPC package and adapter implementation with database-independent failure fixtures, then review lock ordering, privileges and proof issuance together. Keep proposed SQL outside the automatically applied migration journal until an actual database-integration batch is authorized and prepared. No mock store or SQL text can establish the acceptance matrix above.

Before any future live route: implement trusted issuance registration and Auth revocation integration; execute real transaction/HTTP acceptance; define exact provider/session/capability/retention/termination semantics; obtain separate bounded voice-call approval; and collect physical-device, listener and screen-reader evidence. The ten-day journey, candidate policy, private-writing/spiritual boundaries, closed v5 allowance and unapproved P4 nine-turn draft remain unchanged.


## 8. Proposed package and bridge now prepared — 27 October 2026

The offline next step above is completed at draft scope by [the SQL package](sql-drafts/README.md) and `service/voice-store-adapter.server.ts`. The package is outside the migration journal, unapplied and unexecuted. Its sequential SQL fixture script is also unrun. The adapter's 20 primary and 23 independent tests use trusted-port doubles and local cryptography; they are not this section 6 database acceptance matrix.

The bounded generation design now prohibits physical reuse of a registered thread ID through permanent generation uniqueness and a noncascading FK to the real P3b row. A timestamp is only a consistency check; retired identities cannot be rebound. Product-level ID reuse would require a separately implemented authoritative creation/fencing bridge. The draft pins the first session/version/fingerprint, persists shortening from both receipts and current protected records before denial, and retains terminal expiry/invalidation plus an owner clock high-water record. Actual compatibility, concurrency and rollback semantics still need PostgreSQL execution.

The draft's quota is cumulative generic reservation, not a separate active-session capacity limit, real cost policy or provider accounting. Trusted Auth/revocation/read/write integration, explicit concurrent capacity, settlement and retention remain outstanding. None of these preparation changes alters existing P3b migrations/accounts/holds, the closed v5 allowance, the unapproved P4 manifest, exact response policy or source doctrine. Next bounded work is the disposable local PostgreSQL harness and failure acceptance, not connected migration application or a live route.



## 9. Capacity/reconciliation follow-up — 29 October 2026

The separate capacity/release design is now specified in [p5-capacity-reconciliation-contract.md](p5-capacity-reconciliation-contract.md), with an offline executable model and 44 fictional tests including 1,120 serial orderings. It preserves cumulative units, distinguishes never-started release from exact whole-operation finality, and quarantines conflicting trusted evidence. This completes contract/model preparation only; the existing SQL still supplies cumulative reservation without separate capacity or provider settlement. A later extension must combine or attach to the original immutable hold without double-debiting it. No SQL, runtime or current accounting is changed by this follow-up.

The earlier blanket unexecuted-SQL wording is historical: 202 single-connection PostgreSQL WASM assertions passed in the prior harness batch. Native multi-session execution, production Auth/HTTP and provider/device evidence remain absent. See the current continuation marker and offline-validation-v9/v10 for the distinct evidence scopes.
