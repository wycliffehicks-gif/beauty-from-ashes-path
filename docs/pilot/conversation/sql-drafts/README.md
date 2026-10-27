# Proposed P5 voice admission SQL package

27 October 2026 • **offline draft; unapplied and not executed against PostgreSQL**.

`p5-voice-admission.sql` is proposed SQL outside `drizzle/migrations/` and its journal. It creates a private `bfa_p5_voice` namespace and seven service-only public RPCs. It does not modify existing P3b functions, permissions, ledger rows or settings. Do not run it on the connected project under general offline-development authorization. No voice admission, grant, quota balance or session is seeded.

`p5-voice-admission-fixtures.sql` is a future executable rollback fixture script. It refuses any database not named `bfa_p5_offline_fixture`; it still requires an isolated local installation of the P3b schema/roles and this draft first. Its direct record inserts are fictional infrastructure fixtures, not verified Auth, approved grants or real accounting. It is a sequential SQL suite, not a concurrency test. This authoring environment has no PostgreSQL server/client; the SQL has not been executed or transaction-tested here. Static review and TypeScript adapter fixture results must not be relabelled SQL execution.

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

Independent source review is complete. It found and corrected timestamp-only generation binding, lifetime shortening lost on semantic denial, backward-clock revival, missing durable session continuity, nullable partial session tuples, overly broad function-ACL selection and fixture variable/cast/assignment defects. The final source review identified no remaining blocker; this is a review finding, not proof that PostgreSQL accepts or executes the SQL.

The sequential rollback script contains 39 textual assertion sites covering registration rejection, exact receipt/operation/replay behavior, attempt/quota denial, close-before-registration, wrong immutable claim bytes, current P3b fencing, observed source expiry/re-extension, simulated clock watermark and cleanup after revocation. They are supplied for future execution, not asserted passes. The looped privilege assertions are not 39 independent runtime tests, and no count of executed SQL assertions is claimed.

The exact next bounded task is to obtain a disposable local PostgreSQL environment, install isolated P3b prerequisites and roles plus this draft, execute the rollback script, and repair actual syntax/type/transaction failures. Then add two-connection/process tests with actual barriers for owner/thread/quota lock expiry, duplicate claims, close-before-late-commit, revocation and transport loss. Run real service-role/HTTP-boundary tests separately; catalog privilege checks alone are narrower. Preserve raw local results and the exact SQL hash. Do not point the runner at the connected database or apply this draft to its migration journal.

Before production use, implement and accept the distinct concurrent-session-capacity limit, real provider accounting policy, trusted issuance/Auth/revocation/transport bridges and downstream dispatch gate. Production migration application, authenticated voice acceptance, provider selection/credentials/calls, physical-device/listener/screen-reader acceptance and publication remain separate unfinished gates.

The primary PostgreSQL references reviewed on 27 October 2026 were [explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html), [current-time functions](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT), and [safe SECURITY DEFINER functions](https://www.postgresql.org/docs/18/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY). These support transaction advisory locks, actual-clock checks and privilege/search-path precautions. They do not establish the deployed PostgreSQL version or substitute for executing this proposed package.
