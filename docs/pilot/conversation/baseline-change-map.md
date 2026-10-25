# Conversation P1 — Baseline and Change Map

**Date:** 2026-10-25 · **Package:** P1 — contract, candidate policy, source register and allowed-context boundary · **Status:** implemented, isolated, no live path

## Baseline (verified before editing)

- Lovable and GitHub main both at commit `4b218c45d021b4b9b3ee99f271d15e775db3576c`, tree `cdf85f22f606cb9113f6d2026becd3807139dc6c`.
- Participant switches `JOURNEY_AI_ENABLED`, `JOURNEY_AI_RELEASE_READY`, `LIVE_AI_ENABLED`: all unset/OFF. Project unpublished.
- Active reflection chain unchanged: `day.$day.tsx` → `JourneyAiReflection` / `useJourneyAiReflection` → `journey-ai.functions.ts` → legacy transport. `journey-approved-flow.server.ts` remains dormant. No conversation namespace existed.
- v5 direct test is COMPLETE (2 attempts / 2 complete, 2026-10-25; guard `153bd14d34e805e5394f2f609184190eabbb451bfa07c8bfa45dc08a24244b8a`). Nothing in P1 touches v5 prompts, runners, markers or accounting.

## What P1 added (new files only; zero existing files edited)

| Path | Purpose |
|---|---|
| `src/lib/ai/conversation/contract.ts` | Strict client turn request, trusted-principal and server-context schemas; stable error codes that never echo private input; unknown fields rejected at every nesting level. |
| `src/lib/ai/conversation/grants.ts` | Persistent preference vs current restrictions vs scoped grant resolution. Narrower restriction always wins; no keyword-based devotional-consent detection. |
| `src/lib/ai/conversation/sources.ts` | Source records (exact text + SHA-256, origin, commit, review status, spiritual classification, limitations), registry with duplicate/hash-mismatch rejection, registry-only source cards, test-only scope enforcement. |
| `src/lib/ai/conversation/context.ts` | Single allowed-context assembly: verified principal/owner/thread binding, exact excerpt-preview binding (stale/changed preview refused, never widened), grant follow-up rules, registry-resolved sources, structural exclusions, canary scan helper. |
| `src/lib/ai/conversation/policy.ts` | Generated: embeds the candidate instruction block (guide §9) with identity `bfa-conversation-guide-v0.1`, status `candidate-not-deployed`, and its SHA-256. |
| `src/lib/ai/conversation/content/teaching.ts` | Generated: ten day-teaching records (Understand heading + body only), extracted byte-exact from `journey-days-a/b.ts`. |
| `src/lib/ai/conversation/content/index.ts` | Builds teaching source records from the generated records at snapshot commit `4b218c45d021b4b9b3ee99f271d15e775db3576c`. |
| `src/lib/ai/conversation/index.ts` | Namespace barrel. Nothing outside the namespace imports it. |
| `src/lib/ai/conversation/__tests__/{contract,grants,sources,context}.test.ts` | 44 focused tests. |
| `docs/pilot/conversation/candidate-policy-block.txt` | The guide §9 block, Markdown quote prefixes stripped, wording unchanged. |
| `docs/pilot/conversation/v5-observations-change-note.md` | Carl's two v5 wording observations, parked for later policy refinement. |
| `docs/pilot/conversation/baseline-change-map.md` | This file. |

## Recorded hashes

- Candidate policy block (`candidate-policy-block.txt`, UTF-8) SHA-256: `900cb04a84a3fac022f8fb7d0fabb4903f36b5ae702262708cecdf1f94f85ad6`
- Selected source snapshot (sorted `sourceKey:textSha256` lines, 11 records) SHA-256: `f5749f2c7807a0340739b84c456c3e527c26460533a339a60cc4f74e0a90f6c3`
- WEB Classic Psalm 34:18 test fixture text SHA-256: `90de249bb42fe65090a1b552003bc552fc378556dba75f4c5be6a914a450d4bc` (matches the verified catalog)

## Test-to-requirement map (honest scope)

- **O03 (P1 portion):** structural exclusion of journals, weekly notes, prior-day answers, hidden Day 10 material and profiles; canary scan over the assembled context; no whole-day/request/storage spread. Remaining: live harness interception and store snapshots are integration work.
- **O04 (P1 portion):** exact preview binding, stale/changed preview refusal, hostile pasted instructions remaining data, cross-thread/owner rejection, no retraction semantics. Remaining: model prompt-injection resistance needs a later separately authorized evaluation.
- **C08–C10 (P1 portion):** preference off + religious mention grants nothing; narrower restrictions override preference on; scoped prayer/passage grant limited to the current reply and validated direct follow-up; unrelated topics do not inherit. Remaining: freeform intent resolution is a later shared service; tests supply explicit fixtures.
- **C11–C12 (P1 portion):** verified fixture with exact hash; missing vs unknown source branches; test-only scope; fabricated pasted Scripture can never resolve to a source card. Remaining: real retrieval and quotation comparison are integration work.

No test claims mocked fixtures prove model behavior.

## Trust checks deferred to P3b (real server wiring)

- Session-authenticated principal verification (P1 uses fictional verified fixtures; a TypeScript literal is not authentication).
- Persistent, server-owned preview store with expiry; P1 validates against a supplied in-memory map.
- Turn-linkage validation for direct follow-ups (P1 requires the server to re-attach the original grant and rejects follow-up claims without it).
- Usage admission, delivery state and lifecycle enforcement.

## Rollback

P1 is additive and imported by nothing outside its namespace. Rollback: revert only this package's commit (remove `src/lib/ai/conversation/` and `docs/pilot/conversation/`). Known-good prior commit: `4b218c45d021b4b9b3ee99f271d15e775db3576c`.

## Explicitly not done

No routes, screens, endpoints, stores, provider adapters, network calls, database or dependency changes. No participant endpoint activation. No paid model or voice calls. Participant AI remains OFF; project unpublished.
