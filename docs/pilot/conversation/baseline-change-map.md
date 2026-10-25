# Conversation P1 — Baseline and Change Map

**Date:** 2026-10-25 · **Package:** P1 — contract, candidate policy, source register and allowed-context boundary · **Status:** implemented and repaired after independent review; isolated, no live path

## Baseline (verified before editing)

- Lovable and GitHub main both at commit `4b218c45d021b4b9b3ee99f271d15e775db3576c`, tree `cdf85f22f606cb9113f6d2026becd3807139dc6c`. P1 was then reviewed at synchronized `f1fcb112e722647a0e764890246f2441717c4a2e`.
- Participant switches `JOURNEY_AI_ENABLED`, `JOURNEY_AI_RELEASE_READY`, `LIVE_AI_ENABLED`: all unset/OFF. Project unpublished.
- Active reflection chain unchanged: `day.$day.tsx` → `JourneyAiReflection` / `useJourneyAiReflection` → `journey-ai.functions.ts` → legacy transport. `journey-approved-flow.server.ts` remains dormant. No conversation namespace existed before P1.
- v5 direct test is COMPLETE (2 attempts / 2 complete, 2026-10-25; guard `153bd14d34e805e5394f2f609184190eabbb451bfa07c8bfa45dc08a24244b8a`). Nothing in P1 touches v5 prompts, runners, markers or accounting.

## What P1 added (15 new files; zero pre-existing files edited)

| Path | Purpose |
|---|---|
| `src/lib/ai/conversation/contract.ts` | Strict client turn request (message + excerpt references ONLY), trusted-principal (with authorized thread), server-context (with owner identity), server grant and excerpt-preview-record schemas; stable error codes that never echo private input; unknown fields rejected at every nesting level. |
| `src/lib/ai/conversation/grants.ts` | Persistent preference vs current restrictions vs server-owned scoped grant resolution. Narrower restriction always wins; no keyword-based devotional-consent detection. |
| `src/lib/ai/conversation/sources.ts` | Source records (exact text + SHA-256, origin, commit, review status, spiritual classification, limitations), registry with duplicate/hash-mismatch/pending-review rejection, test-only and Scripture-provenance invariants, deep-frozen records, encapsulated record map, registry-only excerpt/card resolution. |
| `src/lib/ai/conversation/context.ts` | Single allowed-context assembly (async): principal↔owner↔thread↔turn binding, server grant binding, exact excerpt-preview binding with re-hashing, revision and expiry checks, permission-gated bounded sources, structural exclusions, canary scan helper. |
| `src/lib/ai/conversation/policy.ts` | Generated: embeds the exact candidate instruction block body (guide §9) with identity `bfa-conversation-guide-v0.1`, status `candidate-not-deployed`, and its SHA-256. All metadata lives in module comments, not in the block. |
| `src/lib/ai/conversation/content/teaching.ts` | Generated: ten day-teaching records (Understand heading + body only), extracted byte-exact from `journey-days-a/b.ts`. |
| `src/lib/ai/conversation/content/index.ts` | Builds teaching source records from the generated records at snapshot commit `4b218c45d021b4b9b3ee99f271d15e775db3576c`. |
| `src/lib/ai/conversation/index.ts` | Namespace barrel. Nothing outside the namespace imports it. |
| `src/lib/ai/conversation/__tests__/{contract,grants,sources,context}.test.ts` | 58 focused tests. |
| `docs/pilot/conversation/candidate-policy-block.txt` | The exact guide §9 body (Markdown quote prefixes stripped, one trailing LF; 4,043 bytes). |
| `docs/pilot/conversation/v5-observations-change-note.md` | Carl's two v5 wording observations, parked as reviewer observations for later policy refinement. |
| `docs/pilot/conversation/baseline-change-map.md` | This file. |

## Post-repair behavior (independent-review defects fixed)

1. **Grant authority is server-owned.** The client request schema has no grant or follow-up fields; supplying them fails as `unknown-field`. Grants are validated server fixtures bound to owner, authorized thread, exact current turn, kind and permitted source ids. Replay in a new/unrelated turn, cross-owner and cross-thread grants fail with `grant-not-bound`. Direct follow-ups require a fresh server-issued grant for the current turn. **Honest limit:** original grant-kind/source lineage and semantic direct-follow-up issuance are still trusted server assertions — P1 fixtures accept the server-supplied `followUpOfTurnId` linkage without an original-grant record to check it against. Proving that lineage is a P3a obligation; nothing in P1 demonstrates it.
2. **Ownership is tied to the exact thread.** `TrustedPrincipal` carries `authorizedThreadId`; `ServerContext` carries `ownerId`. Recombination of a valid principal with another thread's state fails (`owner-mismatch` / `unauthorized-thread` / `thread-mismatch`).
3. **All current restrictions survive assembly.** `no-advice` / `no-questions` / `no-exercises` / `no-bible` / `no-prayer` are carried verbatim into the assembled context, alongside faith-on or a scoped grant. `no-bible` also blocks Scripture SOURCES, not only the permission boolean.
4. **Excerpt previews are fully bound.** Server preview records carry exact text, hash, owner/thread/turn, timestamps, optional expiry and source revision. Assembly re-hashes the server-held text (never trusts declared hashes), rejects changed timestamps, changed underlying revisions with the original client ref unchanged, expired previews, duplicates and malformed records. Assembled excerpts carry only the validated bytes plus permitted provenance, classed `untrusted-user-data`.
5. **Sources are bounded validated excerpts.** Assembly returns exact text + hash + provenance (`SourceExcerpt`) separate from display cards. Kind/classification/grant compatibility and resolved spiritual permission are enforced: a passage grant naming BFA-D01 fails; a prayer grant cannot name the Scripture fixture; `no-bible` excludes Scripture despite a named source; off + no grant cannot select Christian-classified teaching. Sources are deduplicated and capped at four.
6. **Registry invariants.** Scripture test excerpts are always test-only with exact reference/translation provenance; `verified-test-fixture-only` implies test-only; pending-review records are not admitted; records are deep-frozen; the record map is encapsulated; cards/excerpts resolve only through the validated registry (no exported record-to-card bypass). A record's hash verifies supplied bytes only — never biblical attribution.
7. **Exact policy body.** `candidate-policy-block.txt` and `CONVERSATION_POLICY_BLOCK` are exactly the guide §9 body (4,043 UTF-8 bytes, one trailing LF); metadata lives in module comments and docs.

## Recorded hashes

- Candidate policy block body (UTF-8) SHA-256: `2fe0e26df0f21abd8080e3ab860e02721febf7e643ea11c940ee383637b08c09`
- Production source snapshot (10 teaching records, full-record JSON) SHA-256: `f7ad7cc7c2174a8c97580286999660aa55abee1944061d2afa15a6e102136553`
- Evaluation source snapshot (10 teaching + WEB Classic Psalm 34:18 test fixture) SHA-256: `0cb2dc1e8ef9336c0568a4c1e1cfdb51f373c468bb4cd152cef93510dc110da6`
- WEB Classic Psalm 34:18 test fixture text SHA-256: `90de249bb42fe65090a1b552003bc552fc378556dba75f4c5be6a914a450d4bc` (matches the verified catalog)

## Test-to-requirement map (honest scope)

- **O03 (P1 portion only):** structural exclusion of journals, weekly notes, prior-day answers, hidden Day 10 material and profiles; canary scan over the assembled context; no whole-day/request/storage spread. NOT covered: live harness interception, store snapshots, real navigation flows.
- **O04 (P1 portion only):** exact preview binding, stale/changed/expired preview refusal, hostile pasted instructions remaining data, cross-thread/owner rejection. NOT covered: model prompt-injection resistance (needs a later separately authorized evaluation).
- **C08–C10 (P1 portion only):** preference off + religious mention grants nothing; narrower restrictions override preference on; scoped prayer/passage grants limited to the bound turn and validated follow-up; unrelated topics do not inherit. NOT covered: freeform intent resolution (future P3a shared service; tests supply explicit server fixtures).
- **C11–C12 (P1 portion only):** verified fixture with exact hash; missing vs unknown source branches; test-only scope; fabricated pasted Scripture can never resolve to a source. NOT covered: real retrieval, quotation comparison against model output.

No test claims mocked fixtures prove model behavior. No full O03/O04/C08–C12 pass is claimed.

## Remaining real-integration limits

- Session-authenticated principal verification, grant issuance, preview-store persistence and turn-linkage validation are P3a/P3b server wiring; P1 enforces the binding CONTRACT with fictional fixtures.
- Usage admission, delivery state and lifecycle enforcement are not part of P1.
- The offline boundary prevents unauthorized app access in these fixtures; it does not prove model prompt-injection resistance.

## Checks actually run (post-repair)

- `bunx vitest run src/lib/ai/conversation` — 58/58 passed (contract 17, grants 8, sources 15, context 18→23 after repair additions).
- `bunx vitest run src/lib/ai/__tests__/journey-boundary.test.ts src/content/__tests__` — 76/76 passed.
- Automatic build: OK. An earlier automatic typecheck flagged a zod v3 API mismatch (`z.core.$ZodIssue`); corrected to `z.ZodIssue` and re-verified by the passing suites and subsequent automatic build. No manual tsc/build command was run.

## Rollback

P1 is additive and imported by nothing outside its namespace. Rollback: revert only this package's commits (remove `src/lib/ai/conversation/` and `docs/pilot/conversation/`). Known-good prior commit: `4b218c45d021b4b9b3ee99f271d15e775db3576c`.

## Explicitly not done

No routes, screens, endpoints, stores, provider adapters, network calls, database or dependency changes. No participant endpoint activation. No paid model or voice calls. Participant AI remains OFF; project unpublished.
