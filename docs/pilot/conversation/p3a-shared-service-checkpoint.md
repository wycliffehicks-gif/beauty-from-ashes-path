# P3a checkpoint — shared conversation service (MOCK provider)

Base: `e174235c76d75e1f066668de5b1eeb275c245839` (tree `9eaf348f…`). Participant AI and voice OFF; unpublished. The v5 two-example test stays complete and must not be rerun. No provider, model, voice, microphone, network, database or new dependency was used.

## What was built

- `src/lib/ai/conversation/service/service.ts`: `ConversationService`. It runs one in-memory fixture repository. For each thread it holds event history, derived items (user report / intention / correction / current restriction / AI interpretation, each with source event ID, SHA-256 evidence, origin, fixture case and supersedes link), issued grants and the preference/restriction revisions. Every request goes through the P1 `assembleConversationContext` boundary (client turn schema unchanged, policy `bfa-conversation-guide-v0.1` / hash `2fe0e26d…`, registry admission, grant binding, spiritual access). The service adds only authorized active-thread delivered events, the current restrictions and shared sources resolved from the registry.
- `service/semantic-fixtures.ts`: a FIXTURE-ONLY resolver. It uses an exact sentence table with no keyword or regex matching. Unknown text is unclassified user-reported text. Religious mentions, negated requests, quoted requests and embedded instructions are listed explicitly and resolve to no grant.
- `service/grant-issuer.ts`: a service-owned grant map. Each grant is bound to owner, thread, turn, message event and hash, and the preference and restriction revisions. It records the original grant and turn, the immediate parent, the kind, and pinned source key/hash/commit. Validation requires the identical issued record and walks the whole chain.
- `service/mock-provider.ts`: a deterministic mock. Every reply is prefixed "Fictional preview reply (mock provider, not AI)". It can be set to ignore abort, delay results or errors, return invalid sources, or make operational claims.
- `service/mock-voice.ts`: the mock voice lifecycle. It tracks session IDs, a segment ledger (generated / queued / played / cancelled), provisional / obsolete / final transcript fragments, Pause with confirmed or failed mock shutdown, no auto-resume, and a private-practice gate.
- The P2 store (`preview/store.ts`) has an optional service. The browser default attaches it after hydration, never during SSR. Confirmed create/send/stop/retry/save/discard/delete/clear/open/preference/share/voice changes are routed to the service. Replies commit through one synchronous commit point that both sides must accept.
- The UI keeps the P2 layout and adds:
  - a developer "Context used by this preview" inspector;
  - "Not answered" states;
  - registry source cards;
  - review controls for preference failure, voice shutdown failure, missing history and the fixture-sentence picker;
  - developer voice fixtures (mark played, provisional/final transcript, network recovered, private practice).

## Lifecycle identities

The service checks a ticket after every async stage: registry-ready, message-hashed, fixture-resolved, grant-issued, context-assembled, before-dispatch, provider-returned and before-commit. The ticket covers service epoch, thread record identity, thread generation, preference revision, restriction revision and whether the user event is still delivered. AbortController is used but never relied on alone. Grants issued during cancelled or stale work are revoked. The store keeps its P2 job/epoch checks. The mock voice uses session IDs and shutdown tokens.

## Evidence (application/mock only)

Commands: `bunx vitest run src/lib/ai/conversation` → 7 files, **188 tests passed**. That is the 98 prior tests (12 contract, 8 grants, 29 context, 15 sources, 34 preview-store), all unchanged, plus 79 in `p3a-service.test.ts` and 11 in `p3a-store-integration.test.ts`.

Covered as partial application evidence (not catalog passes):
- **O02:** A1 / new / A2 / reopen-A1 canaries; microphone off on reopen.
- **O06:** stop / delete / discard / clear / preference / switch at each of the 8 stages (48 cases). Also a provider that ignores abort, a delayed error, and delete removing saved, derived, grant and queued voice state.
- **O07** (no summarizer): the "tired, not angry" correction, an intention kept as an intention, no-questions persisting, an unanchored cross-thread correction, discard removing derived items, and a missing-history gap being reported.
- **C07–C12 application variants:** scoped prayer → revision → unrelated topic with preference still off; lineage forgery and mismatch failures; the C09 restriction overriding preference ON; C11 exact passage from the harness-only fixture plus the absent-fixture variant; C12 pasted wording never becoming a source.
- **Mocked O10–O13:** mute, stop answer, pause confirm/fail, network recovery ignored, resume with a new session, transcript states, preference-off cancelling queued speech, only played segments being heard, and the private-practice gate.
- Provider text and claims never change save, delete, preference or microphone state.

Browser (Playwright Chromium at 1280 and 390 wide, isolated localhost origin): passed for:
- the correction/intention/recall flow and inspector provenance;
- exact Day 2 share with focus kept inside the dialog;
- the registry source card;
- Stop and preference-off cancellation;
- failed switch-save with the newer draft kept after Escape;
- discard/reopen excluding the discarded turn;
- voice pause failure → retry → confirmed, then the private practice offered only after confirmation.

There were no page errors and no external requests. This was not screen-reader or real-device testing.

## Limits

- The owner is a fixed developer-preview fixture, not authentication. The shared pilot cookie is not identity.
- Meaning comes from fixtures, not understanding.
- Memory only; all of it is lost on refresh.
- No public endpoint, real model, summarizer, audio, billing or provider evidence.
- The Scripture fixture stays harness-only and is not in the preview menus.
- A stopped turn keeps its submitted user message as unclassified text with no derived items.
- The store transcript is a UI projection kept in step with the service at each confirmed change; the integration test checks they agree after discard.

## Rollback

To return to the P2 fake service, revert forward to `e174235c` or remove `createService` in `getBrowserStore()`. With no service the store uses the P2 path unchanged. Do not rewrite history.

## Next

P3b covers real identity, ownership, persistence and durable admission. It is a separate stage; it needs no new paid-test allowance and does not activate participants.
