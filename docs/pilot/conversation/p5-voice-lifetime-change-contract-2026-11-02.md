# P5 voice lifetime change contract — 2 November 2026, America/Toronto

Decision: **reuse the existing immutable issuance fingerprint as the bounded voice-authority identity**, with a separate durable Auth revocation record and an immutable association between them. Do not add a voice-episode table. This is an offline change contract and executable evidence of the current limitation, not an implemented v2 or enabled voice feature. The preceding Auth review uses a 3 November UTC label; this document uses the client's Toronto date, not an earlier source revision.

Base: `8c149d84e2a5843e460e049739eb9734a4d30d47`. Read [the provider contract](p5-supabase-auth-contract-2026-11-03.md) for still-unverified deployment Auth policy, exact ownership and revocation delivery. Those requirements are not weakened here.

## Current defect reproduced

The existing `session_fences` row combines a terminal login-session fence with an immutable local expiry of at most 900000 ms. `voice-session-initializer.server.ts` and `p5-voice-session-provision.sql` cannot provision that pair again after expiry. The issuer also shortens every authority to that expiry. Refreshing the verified JWT for the same Auth session cannot change it. Earlier successful tests correctly established these rules; a returning-user flow needs a different contract.

The new `p5-voice-lifetime-contract-sql.test.ts` executes existing SQL, initializer/issuer/admission adapters and local crypto against isolated PostgreSQL/PGlite with fictional Auth. Eight cases cover:

1. Initial permission and a later fresh token remain capped by the original fence.
2. At the exact original expiry, fresh same-login metadata cannot re-enter or change the row.
3. The privileged issuance-registration RPC can store a fresh fingerprint after parent expiry because its arguments have no Auth-session binding; issuer/admission still deny. A stored issuance is not permission.
4. Terminal parent revocation blocks several already-issued authorities and new issuance.
5. Expired-parent denial retains an existing lease's usage holds; deliberate exact cleanup frees only the appropriate unmarked capacity slot, without refunding cumulative usage.
6. A lost committed provisioning acknowledgment retains the original lifetime and does not justify a new one.
7. Issuance committed before a late reply remains dormant after expiry; no success or replacement permission is inferred.
8. Revoke-before-first-use retains a terminal tombstone despite fresh same-login metadata.

These are current-v1 counterexamples and preservation checks. They do not test a v2 implementation. The fixture clock is controlled at boundaries; no time advance refreshes real Auth. Sequential committed records, accounting snapshots and both closed engines are evidence; native concurrency, HTTP loss and provider behavior are not.

## Why reuse issuance identity

| Option | Consequence | Decision |
| --- | --- | --- |
| Extend/delete/reset existing session fence, invent Auth ID, or force re-login | Reopens terminal identity or changes user flow without resolving provenance. | Reject. |
| New episode table and episode identifier | Duplicates existing immutable fingerprint/expiry and adds another identity to proofs, cleanup and accounting. | Unnecessary for this bounded requirement. |
| Durable Auth deny record + immutable binding to existing issuance | Existing fingerprint already identifies exact sealed bytes with bounded lifetime. Add the missing Auth association while keeping shared accounting. | Selected for isolated v2 development, subject to the complete cutover below. |

The selection does not imply automatic repeated sessions, approval, new budgets or provider dispatch. A later visit still needs fresh verified Auth, trusted service state, current thread/allowlist, applicable approval/quota and capacity. It cannot take over an earlier claim/attempt or consume an uncertain operation's retained slot. No new UI policy or continuous voice duration is approved by this contract.

## Proposed data contract

Use an additive private `bfa_p5_voice_v2` namespace for two proposed tables only; **do not duplicate quota, approval, attempt, claim, cleanup or capacity tables**.

| Record | Immutable association and permitted transitions |
| --- | --- |
| `auth_parents` | Key `(owner_id, auth_session_id)` with safe integer `version` and terminal `revoked`. No renewable eligibility deadline. Absent may become observed-clear version 0 only through trusted verified metadata. Revoke absent creates terminal tombstone; clear becomes revoked with saturating version increment; revoked never clears. Its existence/nonrevocation is solely a negative fence, never proof of active Auth. No cascade from Auth/user deletion. |
| `issuance_auth_bindings` | Key `fingerprint`, protocol exactly 2, exact owner/Auth-session/parent-version association, referencing the existing bounded issuance. Register a **new** issuance and its binding atomically; never attach an existing v1 fingerprint or partial orphan. Exact retries may observe only the same complete original tuple, never extend lifetime or reset revocation. A lost acknowledgment does not trigger automatic replay. |
| Existing `issuances` | Keep current fingerprint, owner/thread/incarnation/revision, issued/expiry and revoked fields. Lifetime remains positive and at most 900000 ms, bounded by the verified current eligibility and configured authority cap. No updates to expiry; no new child version is needed for an immutable fingerprint. |
| Existing `cleanup_owners`, `proofs` | V2 cleanup registration binds actual Auth session/version and issuance fingerprint at creation. No null-to-new-parent adoption of legacy cleanup. V2 proof registration requires that exact cleanup/claim binding and an existing protocol-2 issuance association. Receipt and request protocols are explicit and cannot fall back to v1. |

Parent creation must deny any retained v1 `session_fences` row for that pair, including active rows. **Every v2 enabling/eligibility gate repeats this check**, so a later legacy deny-only revocation also blocks v2 without relying on a changed v2 version. No legacy expiry is converted into an active v2 parent. Reusing a login with v1 history therefore remains denied; no automatic migration or override is selected. This conservative rule is feasible for preparation because no P5 SQL has been applied to the connected project.

Preserve owner-first locking shared with the existing package. Parent, issuance, cleanup, proof, attempt, quota and capacity locks need a single reviewed order; proposed sidecars do not bypass it. Revocation must not depend on current allowlist/Auth success or clock eligibility. Unknown Auth/network evidence denies current work without manufacturing permanent revocation. Ban/unban and account-change policy remains as specified in the provider contract, not inferred from a failed lookup.

## Eligibility and lifetime

At each authority/proof/claim/inspect/capacity gate, require the same verified Auth owner/session, current nonrevoked parent/version and no legacy fence. Require the exact protocol-2 fingerprint association once issuance exists, and the applicable current issuance/thread/allowlist/approval/quota/capacity facts at their existing stages. Pre-issuance must not require a not-yet-created issuance or later approval/capacity admission. A clear parent supplies **no time allowance**. Obtain the time ceiling from fresh independently established Auth/policy and the bounded authority. Later observations can only shorten eligibility.

Keep conservative verification age strictly below 30000 ms in orchestration and the existing SQL timing/high-water protections. Preserve proof freshness, single consumption and immutable attempt winner. All affected helpers must use the new predicate; routing capacity through the old `eligible()` still imposes the obsolete fence expiry. Neither local cancellation nor parent revocation proves provider termination or releases cumulative holds. Authenticated whole-operation finality remains necessary for marked allocations.

The exact fingerprint registration can bind sealed bytes to Auth without modifying completed P3b's shared envelope/parser. New P5 RPC/wire contracts must require protocol 2, exact parent and bound fingerprint, and reject missing/unbound/v1 records. Do not accept an old/browser-supplied envelope for retroactive registration. The trusted issuer must create the authority from its owned service snapshot. If later engineering requires an envelope change, isolate it to P5 and review separately.

## Cross-file implementation impact

| Existing boundary | Required v2 change; preserved invariant |
| --- | --- |
| `sql-drafts/p5-voice-session-provision.sql`, `p5-voice-session-revoke.sql`; initializer and session RPC adapters | Preserve v1 unchanged. Add distinct parent observe/revoke primitives; never reinterpret v1 expiry/version. Real Auth identity remains mandatory. |
| `sql-drafts/p5-voice-admission.sql` registration and `issuances` | Atomically insert new bounded issuance + parent association under shared owner lock. Keep original ordinal columns; positional `INSERT ... VALUES` makes casual column additions unsafe. No existing-fingerprint backfill. |
| `service/voice-issuance.server.ts`, `voice-issuance-rpc.server.ts` | New versioned path carries exact Auth-parent binding through registration and final checks; parent is no longer an expiry source. Preserve snapshot ownership, same identity across waits, local seal/HMAC, shortening ceilings and retained uncertain writes. |
| `p5-voice-reads.sql`, `p5-voice-preissue-read.sql`; read/preissue adapters | Versioned observations distinguish negative parent fence from current Auth eligibility and bound authority; no v1 fallback. |
| `service/voice-verification.server.ts`, `voice-store-adapter.server.ts`, `voice-rpc-store.server.ts` | Exact protocol-2 request/receipt, parent/version/fingerprint and cleanup association. Keep authentic request checks, one proof per operation, exact claim/cleanup and one-attempt capacity marker. |
| `p5-voice-admission.sql`: `eligible`, proof registration, claim, inspect | V2 predicate joins parent + issuance association, excludes any legacy fence, checks current policy and immutable cleanup/claim. Keep shared quotas/attempt winners/held units and thread incarnation rules. |
| `p5-voice-capacity.sql`: `current`, `take_proof`, claim, mark | Versioned path uses the same v2 eligibility before and after waits/locks and consumes fresh proof once. Retain existing pools, allocations, cumulative units, operation identities and exact reconciliation. |
| `voice-admission.server.ts`, `voice-service-binding.ts`, `voice-capacity-rpc.server.ts` | Audit provenance through closures and wire boundaries; retain shrink-only lifetime, synchronous cancellation, uncertain-operation evidence and no caller-supplied raw dispatch authority. |
| Existing close/reconcile/revoke + future host routing | Cleanup remains possible after expiry/revocation without renewed Auth eligibility. Preserve all legacy deny/cleanup paths, their exact retained identities and accounting. No new model/voice caller. |

This is a complete impact contract, not permission to connect a partially converted path. Generated Supabase Auth files, all P3b runtime/SQL and ten-day journey remain outside the implementation change.

## Mandatory compatibility cutover — future, not performed

Sidecars alone are insufficient: a callable old provisioning/proof path could bypass new assumptions. Before any deployment, keep new work disabled, quiesce and drain in-flight legacy enabling transactions, then verify one coordinated versioned route/privilege cutover. Revoking EXECUTE alone does not stop an already-running function.

Remove service execution of legacy enabling RPCs: session provisioning; generation/issuance/cleanup/proof registration; base claim/inspect; capacity claim/mark. PUBLIC/anon/authenticated must remain denied. No public v2 wrapper may expose an old enabling path or fallback. Keep existing exact base/capacity close, capacity reconcile, and terminal session revoke available to their trusted server paths; read-only legacy observations may remain for reconciliation, never as v2 authority. Capacity policy administration remains a separate trusted operation, not a participant grant.

Use shared attempt, quota and capacity records so protocol choice cannot spend a balance twice. Existing/uncertain operations retain their original cleanup and finality semantics; no backfill, rebind, refund, cascade or reset. Recheck legacy fence exclusion under the same owner lock as legacy revocation. v2 revoke must close the v2 parent even before observation; late legacy revoke must also deny all v2 gates through the retained v1 tombstone. Prove roles/routing and both race orderings before claiming compatibility. Native cross-backend race acceptance remains unrun.

Preserve close-before-register precedence: an exact close can already have created a terminal cleanup with null Auth/fingerprint fields. V2 registration must deny without binding or reopening it. Exact cleanup remains usable after Auth expiry/revocation; it does not require a new eligibility observation or replacement parent.

## Next bounded implementation

Implement **only the isolated additive v2 parent/issuance-association SQL draft and its exact nonretrying transport tests**, outside migrations. It should observe/revoke a terminal Auth parent, atomically register a new <=15-minute existing-format issuance plus immutable parent binding, and expose a content-free exact read for these records. Use explicitly fictional verified Auth/policy, service-role execution, current shared locks/time checks and committed-state assertions. Cover two sequential bounded issuances under one clear parent, old authority expiry, all parent/legacy revocation orderings, no rebinding, lost/malformed replies, role denial and unchanged accounting. Leave v1 and connected source behavior intact; label the slice nondeployable until the entire read/proof/cleanup/capacity chain and cutover contract are implemented and reviewed. Do not add a generic runtime wrapper or real Auth/provider caller.

The deployment contract remains incomplete until actual Auth ownership/policy and synchronous revocation/current-state serialization are established. This offline slice cannot certify them. Real authenticated acceptance needs a separately bounded plan; original P3b accounts/staging remain closed. No new approval, paid call, participant AI/live voice activation or publication is authorized here.
