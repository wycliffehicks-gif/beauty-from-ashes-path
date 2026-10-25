# P3b checkpoint — implemented boundary; acceptance blocked

Starting baseline: `978908c5b6ca0905250609be7c95a338da1f1a4a`, tree `94fec8de7e4726fffcb3f0867db9b9b81ce54f6e` (verified locally). P3b is **NOT accepted or complete**. Participant AI/real voice remain OFF; unpublished. No v5, model, voice or paid-provider command ran.

## Continuation evidence — 25 October 2026

The sections below describe the historical preparation. This continuation supersedes their implementation status, not the acceptance limitations.

- Implemented server staging adapter: Auth `getUser()` revalidated on every operation/async turn stage, expiring allowlist, explicit ownership and owner/allowlist RLS; browser history/owner/derived/grant JSON rejected. Immutable server subject, no profiles.
- Added service authority export/restore with events, derived facts, restrictions, completeness, revisions and issuer lineage/revocations. Provider requests still use `assembleConversationContext` and exact approved policy; only local mock connected.
- Active authority AES-GCM sealed server-side with generated `BFA_P3B_STATE_SECRET`, owner/thread/revision-bound and 15-minute expiry, component-memory-only. HMAC fingerprints. No server content cache or per-turn transcript writes. Only confirmed Save persists a sealed service snapshot; optimistic Save/Discard/Reopen/Delete/Cancel advance revisions. Delete nulls saved content and retains tombstone/accounting; stale requests fail closed. Browser copies/processor backups are not promised physically erased.
- Unlinked `/conversation-staging` shell adds confirmations, truthful failures and context inspection. No enrollment UI or real microphone. Clear-all removes console memory and rejects late UI responses; it does not silently delete deliberate Cloud saves.
- Applied `0002_p3b_transactional_staging_boundary.sql`: service-only create/guard/transition/reserve/claim/settle/finish, atomic integer text/voice balances, request binding and one dispatch claim, uncertain holds and idempotent receipts. `0003_p3b_no_automatic_transaction_retry.sql` replaces serialization error code with application conflict because the platform retried it; no application retry/fallback/reconnect.
- `bunx vitest run src/lib/ai/conversation`: **10 files, 242 passed**, latest 23:13:19 UTC (223 prior + 15 admission + 4 authority).
- `python3 scripts/p3b/check-transactions.py`: **9 actual database checks passed**: eight-way one-unit reserve admits one; identical identity duplicates only; changed binding denied; eight-way claim succeeds once; possible-dispatch cancellation holds uncertain balance; duplicate receipts refund once/conflict denied; voice balance separate; tombstone blocks stale reserve/save and saved content null; anonymous RPC bypass denied. Disposable non-auth UUID service tests, **not authenticated A/B acceptance**. First run timed out on platform retry; corrected forward migration and fresh run passed; uncertain evidence retained.
- Three fictional passwordless A/B/C Auth identities created without emails. Actual database guard denied B for A and non-allowlisted C; no sessions minted. All three identities deleted successfully (HTTP 200 each), allowlists disabled; only content-free evidence retained. Zero admitted accounts.
- Catalog confirms authenticated cannot execute state-changing RPCs. `/tmp/browser/p3b/check_staging.py`: normal opening agreement then signed-out denial at 390/1280 width, no overflow/page errors, screenshots viewed; **not signed-in central-flow verification**.
- Automatic diagnostic build OK at last inspection; no manual build/typecheck. Hosted checks empty and hosted report referenced older commit; current hosted TS/deployment and GitHub remote sync unverified.

### Exact blockers and remaining matrix

Disposable test-session creation is unavailable for this project through the supported CLI. Admin link minting was refused as bypassing session consent; neither was bypassed and Carl's real account was not substituted. Platform-supported fictional sessions are required for full O01–O08.

Hosted public Auth settings read: disable-signup flag false, anonymous false, every provider false. Admin config read returned 404; current HIBP setting unavailable. The configure tool requires preserving that unknown value, so no guess was written. Email was briefly enabled then immediately disabled; final OFF verified. Owner action for the unresolved flag: More → Users → Auth settings → Disable sign-up. No enrollment UI/provider enabled; allowlist closed.

| Check | Continuation evidence / open limit |
|---|---|
| O01 | Anonymous RPC and B/C database guard denied; full absent/expired/forged/wrong-owner session matrix and expiry during work BLOCKED. |
| O02 | Unit restore voice idle; authenticated A1/A2/new/reopen canaries BLOCKED. |
| O03/O04 | No journal/weekly/hidden10 import; exact private-note preview/drift/consent NOT implemented; teaching action requires registry hash. |
| O05 | Adapter/optimistic transactions implemented; actual authenticated save/failure/concurrent/UI BLOCKED. |
| O06 | Real transaction tombstone/stale denial; authenticated pending deletion/audio/summary matrix BLOCKED. |
| O07 | Prior semantics tests green; authenticated durable restore/discard BLOCKED. |
| O08 | Nine real database checks; authenticated cannot-spend/session duplicate dispatch BLOCKED; zero paid calls. |

Also open: exact excerpt integration, saved-list/reopen after reload, current separate-preference wiring and full signed-in narrow/wide/keyboard checks. No real-device/screen-reader/model/real voice evidence. P3b remains incomplete, not accepted. Cloud usage not priced/measured; no paid app calls. Normal forward autosave only. Rollback disables admission first (currently zero admitted); retain ledger/tombstones/uncertain holds, no destructive reset. Key rotation invalidates saved snapshots and is not routine rollback.

## Confirmed identity scope

Carl confirmed identity-only fictional staging accounts on 25 October 2026: immutable verified auth subject plus a server-controlled explicit allowlist. No profiles or extra personal fields; spiritual preferences remain a separate approved application setting. No product decision is pending. General signup configuration has **not yet** been verified or changed. The shared gate cookie remains a gate, not identity.

## Implemented independently of that decision

- Connected the requested Lovable Cloud integration; generated SDK clients/middleware/types and required dependencies are platform-generated. `src/start.ts` received the generated bearer attacher without replacing error middleware. No existing conversation UI/service was rewritten or switched to Cloud.
- Applied `drizzle/migrations/0000_p3b_locked_conversation_foundation.sql`: four isolated tables (`bfa_p3b_staging_accounts`, `bfa_p3b_threads`, `bfa_p3b_allowances`, `bfa_p3b_admissions`). RLS enabled on every table, service-role grants explicit, **no browser policies**, no rows/allowances seeded.
- Applied `0001_p3b_revoke_inherited_browser_grants.sql`: provisioning defaults initially inherited browser privileges; RLS with no policies already blocked row access. Explicitly revoked all anon/authenticated privileges and verified the result.
- Added `service/durable-admission.ts`: pure content-free decisions, integer fictional units only. Exact owner/thread/revision/mode/request/fingerprint binding; duplicate reserve gives no dispatch; consumed dispatch is refused; confirmed pre-dispatch cancellation refunds once; possible dispatch/timeout keeps an uncertain hold; identical receipt is idempotent, conflicting/out-of-order terminal receipt cannot reopen/refund twice. Inputs and returned records are detached. No network, database store, server principal verifier, HMAC implementation or provider adapter is implied.
- Added `__tests__/p3b-durable-admission.test.ts` (15 tests), scope memory, roadmap and architecture rule.

## Data lifetime and deletion scope

There are currently **zero application transcript writes** to Cloud. The accepted P3a preview remains browser-memory-only; refresh/close loses that memory. New tables contain no seeded personal data. The threads schema reserves a nullable field for a future deliberate validated service snapshot and a content-free deletion tombstone. Admissions permit non-content identifiers, keyed fingerprints, revision/mode, integer units, state and receipt metadata only. Actual save/delete writers, crash retention/cleanup, optimistic concurrency and late-event protections across processes remain unimplemented. No claim is made about processor logs/backups deletion. No active server-content cache or durable per-turn transcript was added.

## Evidence actually run

- `bunx vitest run src/lib/ai/conversation` — **9 files, 238 passed** on 2026-10-25T23:02Z: all prior 223 unchanged plus 15 new pure-rule tests. This is unit/application evidence, NOT O01–O08 database acceptance.
- Real database catalog query: all four tables have RLS ON, no policies; final anon/authenticated SELECT privileges false, service_role SELECT true.
- `python3 /tmp/browser/p3b/check_locked_tables.py` — actual publishable-key anonymous REST reads against each of the four Cloud tables denied (401/403, permission code 42501), no row content returned. This only establishes locked anonymous table reads; it does not establish wrong-owner/account/session-expiry handler behavior.
- Automatic diagnostic log latest inspected: **build OK at 2026-10-25T23:02:19Z**. No manual build/typecheck command ran. Hosted `lovable build status --json` still reported the baseline build SHA, so current hosted deployment/typecheck and GitHub remote synchronization are **not independently verified**.
- Activation presence check: `JOURNEY_AI_ENABLED`, `JOURNEY_AI_RELEASE_READY`, `LIVE_AI_ENABLED` absent/OFF. No activation secrets changed.
- UI unchanged; no narrow/wide/keyboard flow was claimed or rerun for this preparation. No redundant journey suites run because journey paths were unchanged.

### O01–O08 acceptance status

| Check | Actual evidence / remaining work |
| --- | --- |
| O01 | Anonymous raw table access denied only. A/B accounts, server ownership matrices, expired sessions and zero unauthorized dispatch/mutation **NOT RUN**. |
| O02 | Prior P3a evidence preserved; authenticated save/reopen/thread isolation **NOT RUN**. |
| O03/O04 | No new content import/outbound path. Real server excerpt preview/consent/drift and canary surfaces **NOT RUN**. |
| O05 | Schema preparation only; real save, stale/concurrent save, discard/cancel/refresh **NOT RUN**. |
| O06 | Schema tombstone constraint only; pending delete, failure, late-event resurrection **NOT RUN**. |
| O07 | Prior 223 conversation regressions remain green; durable restore/discard context **NOT RUN**. |
| O08 | 15 pure rule tests only; actual transactional reservation/claim/settlement/concurrency **NOT RUN**. Zero paid provider requests. |

## Remaining implementation within P3b

Verify hosted signup settings and disable public enrollment without altering unknown settings; create disposable fictional A/B accounts without sending emails; server-verified staging allowlist/ownership checks plus RLS; integrate one service authority with explicitly saved validated snapshots (not client trusted history); transactionally reserve/claim/reconcile in database; connect isolated developer UI only; run the complete actual O01–O08 matrix and keyboard/narrow/wide flows. No P4.

## Cost / sync / rollback

Credit balance observed at start 89.50; later 86.80 (2.70-credit change observed, not a final task invoice). No billing/top-up settings changed; Cloud usage may incur normal platform usage and was not measured here. No model/voice spending authorized or incurred by app calls. v5 accounting untouched.

Normal Lovable autosave forward history only; latest local preparation SHA before this document was `f3b7a07656c3cdb4a12ddb92c601eb4ba6342985`. Final SHA is reported in chat after autosave; remote GitHub sync unverified.

Rollback: keep admission disabled first (currently no staging adapter/admitted rows and all browser privileges revoked). Retain content-free ledger/tombstones and migration/evidence history. Do not drop/reset tables, delete v5 guards or rewrite Git history. Cloud connection is not undone by reverting source; no Cloud removal attempted.