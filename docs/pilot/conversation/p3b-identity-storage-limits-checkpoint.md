# P3b checkpoint — partial, locked preparation

Starting baseline: `978908c5b6ca0905250609be7c95a338da1f1a4a`, tree `94fec8de7e4726fffcb3f0867db9b9b81ce54f6e` (verified locally). P3b is **NOT accepted or complete**. Participant AI/real voice remain OFF; unpublished. No v5, model, voice or paid-provider command ran.

## Required decision

The required profile-data question was asked before any application authentication code: whether staging identity needs display names, avatars or other profile data. Answer pending. No profiles, sign-in/sign-up UI, test accounts, staging permissions, owned server functions or staging admission were implemented. General signup configuration has **not** been verified or changed; there is no app signup affordance or admitted staging account. The shared gate cookie remains a gate, not identity.

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

After the profile decision: verify hosted signup settings and disable public enrollment without altering unknown settings; create disposable fictional A/B accounts without emails; server-verified staging allowlist/ownership checks plus RLS; integrate one service authority with explicitly saved validated snapshots (not client trusted history); transactionally reserve/claim/reconcile in database; connect isolated developer UI only; run the complete actual O01–O08 matrix and keyboard/narrow/wide flows. No P4.

## Cost / sync / rollback

Credit balance observed at start 89.50; later 86.80 (2.70-credit change observed, not a final task invoice). No billing/top-up settings changed; Cloud usage may incur normal platform usage and was not measured here. No model/voice spending authorized or incurred by app calls. v5 accounting untouched.

Normal Lovable autosave forward history only; latest local preparation SHA before this document was `f3b7a07656c3cdb4a12ddb92c601eb4ba6342985`. Final SHA is reported in chat after autosave; remote GitHub sync unverified.

Rollback: keep admission disabled first (currently no staging adapter/admitted rows and all browser privileges revoked). Retain content-free ledger/tombstones and migration/evidence history. Do not drop/reset tables, delete v5 guards or rewrite Git history. Cloud connection is not undone by reverting source; no Cloud removal attempted.