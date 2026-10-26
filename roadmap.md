# Roadmap

- [x] Use “Continue” with the persistent “Answering is optional.” helper on shared question screens.
- [x] Add visible, mobile-safe Home, Settings, Back, and Support labels to existing header controls.
- [x] Add the current stage label and accessible value text above existing progress ticks.
- [x] Add `PILOT_FOLLOW_UP.md` with the owner-approved evidence checklist and deferred decisions.
- [x] Add focused regression coverage and run the requested tests, typecheck, build, and browser layout checks.
- [x] Keep the project private and unpublished; preserve content, state, identity, and runtime settings.

## P3b — isolated fictional staging
- [x] Assess remaining blockers: Cloud healthy and local preview opens without page errors; HISTORICAL (resolved 26 Oct): fictional sessions and locked-thread test were then blocked; both later completed. No denied action retried.
- [x] Fence cancelled navigation, use confirmed same-thread reopen revisions, show modal failure and reconcile initial preference without retry loops; offline component checks remain separate from signed-in evidence (HISTORICAL: Auth acceptance was then blocked; resolved).
- [x] Reject noncanonical sealed-token segments/encoding/IVs; preserve active/saved behavior (268 conversation tests passing).
- [x] Repair reusable per-thread authority export; independent round-trip/revoked-lineage regressions pass (262 conversation tests).
- [x] Verify the approved baseline and connect required Cloud infrastructure.
- [x] Implement staging-only verified identity; identity-only default within approved scope, no profiles (HISTORICAL: real-session evidence was then blocked; resolved).
- [x] Implement owned server snapshot/deletion adapter and transactional non-content admission ledger (HISTORICAL: authenticated acceptance was then blocked; resolved).
- [x] Apply locked schema and verify anonymous denial; add 15 pure fictional admission-rule regressions.
- [x] Connect isolated staging adapter to existing service authority; participant/model/real voice remain off.
- [x] Verify O01–O08 against real fictional staging accounts and database concurrency (completion pass 26 Oct 2026 UTC: handler 6/6, HTTP 26 + UI 22 = 48, thread-row-lock expiry, closure probe).
- [x] Record coherent current checkpoint and labelled historical evidence, limits and rollback; retain all prior work.
- [x] HISTORICAL (resolved): supported fictional sessions obtained via temporary email sign-in with public sign-up closed.
- [x] HISTORICAL (resolved): sign-up closed with Carl's approval; menu route was unavailable and is no longer needed.
- [x] Implement exact fictional excerpt preview/drift, owned saved-list/reopen and existing separate-settings wiring.
- [x] Repair saved equivalence, auth/clear fences, pending Stop/Delete, unsaved switch decisions, draft preservation and lost-response recovery.
- [x] Run conversation/server-double regressions and actual service-record database concurrency/argument checks.
- [x] Authenticated O01–O08 (23/23) and signed-in 390/1280 keyboard UI (14/14) passed with fictional A/B/C, 26 Oct ~02:30 UTC; accounts deleted, admissions closed, email sign-in OFF.
- [x] Thread-row-lock expiry (temporary helper 0008, removed 0009) and real-session dispatched-then-Delete/Stop uncertain hold passed.
- [x] P3b technical gate accepted for isolated fictional staging after independent review (26 Oct 2026). Not covered: real devices, screen readers, microphone/audio, real model, RAW provider payload capture, login-screen UX. Later, separate scope: content/tone review, paid new model/voice tests, participant activation.
- [x] Deterministic locked-owner expiry-wait check passed via Carl-authorized temporary service-only helper (0006), removed in 0007 (26 October).
- [x] HISTORICAL (resolved): public sign-up was open; closed before any account was created.

## P4 — direct provider adapter + controlled evaluator (implemented 26 Oct 2026 UTC)
- [x] Extract the neutral provider contract from the mock (`service/provider.ts`); service depends on it; mock names kept as aliases.
- [x] Add server-only direct Responses API provider (`openai-provider.server.ts`): strict {text, sourceIds} schema, effort none, tier default, store/background/stream false, truncation disabled, no tools/memory/retry; approved policy body byte-identical with a separate transport note; pre-abort zero calls; bounded body deadline; coded errors without secret/body leakage.
- [x] Add offline-default evaluator (`scripts/conversation-eval/`): exact 9-turn catalog, manifest admission (hashes, verbatim turns, limits, price basis, approval, stop conditions), durable single-host fail-closed ledger, conservative micro-USD receipts.
- [x] Ship the live DRAFT manifest unapproved (approval null): 9 turns, cap USD 0.10, worst case $0.03915; validation only executed — no credential read, no provider call, no paid evaluation.
- [x] Offline evidence: 1831 tests pass (51 new), tsgo clean, real CLI validate run committed to `artifacts/conversation-eval/offline-validation-v1/`.
- [ ] Later, separate authorized scope: approve a live manifest, run the 9-turn evaluation, apply the rubric, reconcile the ledger. Participant AI, real voice and publication remain OFF.
