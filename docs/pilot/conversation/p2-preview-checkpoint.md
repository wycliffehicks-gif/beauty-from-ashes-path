# P2 — Conversation screens with a deterministic fake service

Date: 2026-10-25 · Package: P2 of the conversation foundation · Status: implemented, repaired after independent review, offline-verified

## What was built

An isolated developer preview of the accepted S1–S8 conversation experience,
using a deterministic fictional response adapter. No provider, model, network,
microphone or database is involved anywhere in this package.

| Piece | Location |
|---|---|
| Route (unlinked from participant nav) | `src/routes/conversation-preview.tsx` (`/conversation-preview`) |
| Screens S1–S8 | `src/components/conversation-preview/ConversationPreview.tsx` |
| Browser-only in-memory store/controller | `src/lib/ai/conversation/preview/store.ts` |
| Deterministic fictional reply adapter | `src/lib/ai/conversation/preview/fake-service.ts` |
| Clear-all signal (one allowed addition) | `APP_CLEAR_EVENT` in `src/lib/journey/progress.ts` |
| Store/controller tests (34) | `src/lib/ai/conversation/__tests__/preview-store.test.ts` |

## Honest limits — what this preview is NOT

- **Not an AI feature.** Replies come from a small canned table. The default
  reply says plainly that it is a fictional preview response, not an AI answer.
  A canned reply is never evidence that a model understood anything.
- **Not persistence.** "Save" is explicitly simulated and session-only.
  Everything disappears on refresh or close, and the introduction says so.
  No localStorage, sessionStorage, database or analytics writes for preview data.
- **Not voice.** The voice panel is a labelled state simulator
  (Connecting / Listening / Speaking / Paused / Disconnected, mute distinct
  from pause, explicit Resume). No `mediaDevices`, `getUserMedia`, speech
  APIs, WebRTC or recording exist in the preview modules (test-enforced).
- **Not developer identity.** The route is simply unlinked; the shared site
  password is not an identity control. The project remains unpublished.

## Behavior implemented and verified

- First-entry introduction (S1) gates everything; explains fictional replies,
  session-only saving, no AI/microphone connection, use of fictional text only.
- Freeform composer with multiple turns; Continue available before first Send.
- Send, follow-ups, Stop response; stop/cancel paths drop stale job completions
  (generation-ID guarded; test-verified).
- Simulated send failure keeps the input and shows Not sent; retry is a
  deliberate user action only.
- Christian-reflection toggle imported ONCE from the real preference at
  browser init; preview toggles never write back; turning it off cancels a
  pending simulated reply.
- Save / Save changes / Unsaved changes statuses; snapshots are immutable
  copies separate from active edits; simulated save failure changes nothing
  and blocks finish-with-save; Discard restores the exact saved snapshot;
  Cancel preserves the active draft.
- Saved conversations can be reopened, renamed, deleted; reopening never
  starts voice; switching away with unsaved changes requires a decision.
- Finish conversation: Keep open / Discard / Save & finish, with distinct
  effects (test-verified).
- Teaching share: only the exact Day Understand teaching via P1 source
  records; full exact preview before sending; Cancel shares nothing; shared
  bytes are frozen snapshots; no private writing is ever selectable.
- Journey continuation: real `useJourneyProgress` + `hasMeaningfulProgress` +
  `getJourneyDayById`; resume links to `/day/$day` with `{resume: true}`;
  conversation never changes progress or completion.
- Clear all app data (`clearJourney`) dispatches `bfa-app-clear`; the preview
  store resets and cancels pending jobs (test-verified).
- SSR safety: stable frozen empty server snapshot; browser store created
  lazily after hydration; no personal state in module singletons.

## Post-repair behavior (independent-review defects fixed)

1. **Clear-all can never resurrect.** The store carries a monotonic epoch;
   every scheduled callback (reply jobs and voice timers) captures the epoch
   and a session/generation identity and is dropped by explicit validation
   after a clear. IDs are globally monotonic and never reused across a clear.
   An adversarial regression runs the OLD callback before the NEW one after a
   clear and proves the old reply cannot fill the new request.
2. **No live placeholder is ever saved.** Save and finish-with-save are
   refused while a simulated reply is generating (`response-pending`), with a
   readable reason and Stop available; the UI disables Save during generation.
3. **One send at a time.** A second Send or a retry while a reply is
   generating is refused in the controller (`response-pending`) and the draft
   is preserved; the Send button is also disabled. No queued auto-retries.
4. **UI result handling.** All handlers check `result.ok`; failed saves show
   a visible error and change nothing; failed finish-with-save keeps the
   dialog, thread and draft (Radix auto-close is prevented on failure).
5. **Draft ownership.** Drafts are thread-scoped; unsent text makes a saved
   thread show "Unsaved changes" (never "Saved"); finish with unsent text
   requires an explicit discard acknowledgment; switching with unsent text
   requires a decision; retrying a failed message resends its own text and
   never overwrites a newer draft.
6. **S1/S6 switch flow.** The thread screen offers All conversations (browse
   without switching) and New conversation; a guarded switch opens a
   Save/Discard/Cancel dialog that completes the pending switch only after a
   successful decision. Reopening a saved thread starts with voice off and no
   carried-over draft.
7. **Dialog accessibility.** Share, finish, switch and delete confirmations
   use the app's AlertDialog primitives: focus is trapped, Escape cancels,
   focus is restored. Browser keyboard checks verified Tab containment and
   Escape; this is not screen-reader or device testing.
8. **Voice simulator lifecycle.** Pause while connecting invalidates the
   pending connection timer; preference-off, finish, delete, switch and clear
   all invalidate voice timers and end the session explicitly; an old
   connection timer can never advance a newly started session.
9. **Rename is an explicit name-only save.** For a saved thread, rename
   updates the saved snapshot's title on simulated success (message edits
   stay unsaved); simulated failure leaves everything unchanged and visible.
   `savedAt` metadata is recorded and displayed instead of createdAt.
10. **Journey status is real.** The continuation card derives
    completed/in-progress from actual `completedDays`; the resume link remains
    `/day/$day` with `{resume: true}`; no progress is ever mutated.

## Final switch-flow correction (second independent review)

11. **Failed switch-save no longer auto-closes.** The switch dialog's
    Save & continue now inspects `result.ok` and prevents the Radix default
    close on failure, so a simulated save failure keeps the dialog open,
    shows a `role="alert"` reason, and preserves the pending target, active
    thread and draft. Cancel remains the only way out without switching.
12. **Unsent text can never be silently lost by a switch-save.**
    `resolveSwitchDecision("save")` refuses with `unsent-draft` in the
    controller BEFORE any save/switch mutation whenever the composer holds
    non-whitespace text; the UI disables Save & continue in that state and
    explains: send or clear the draft first, or choose Discard & continue.
    Cancel keeps the exact draft; Discard explicitly drops it. Drafts are
    never auto-sent. An ordinary Save still saves submitted messages only
    while retaining the draft, as its wording states.

## Checks actually run

- `bunx vitest run src/lib/ai/conversation` — 5 files, 98 tests passed
  (64 P1 + 34 P2 store tests, including adversarial clear/epoch, concurrent
  send, save-during-generation, draft-ownership, rename, voice-timer and
  unsent-draft switch-save regressions).
- `bunx vitest run src/lib/journey src/lib/ai/__tests__/journey-boundary.test.ts src/content/__tests__` — 23 files, 515 tests passed (pre-repair; journey/content paths unchanged by the repair).
- Automatic build: OK after the repaired component (one typecheck error on
  the journey-progress hook shape was found by automatic diagnostics and
  fixed; the following automatic build passed). No manual tsc/build run.
- Playwright walkthrough (Chromium, 390px and 1280px), post-repair: failed
  save shows an error and changes nothing; failed finish-with-save retains
  dialog/thread/draft; Escape cancels dialogs; retry of a failed message
  preserves a newer draft; switch decision dialog opens, traps focus, and
  Cancel restores the exact draft; a clean saved thread switches without a
  dialog; share dialog Escape shares nothing; voice simulator states render.
  Screenshots reviewed.
- Playwright switch-flow correction checks (Chromium, 390px): failed
  switch-save keeps the dialog open with a visible `role="alert"` error and
  the active thread unchanged; Cancel closes and preserves; with an unsent
  draft, Save & continue is disabled with the truthful explanation, Cancel
  preserves the exact draft, Discard & continue switches and clears it; a
  clean switch with no draft completes without a dialog. Screenshots
  reviewed.

## NOT verified here (required later)

- Screen readers, 200% text zoom, reduced motion, forced colours on this
  route (browser keyboard checks are not screen-reader or device testing).
- Physical phone/tablet review by the founder.
- Anything involving a real model, real saving, or real audio.

## P1 corrections folded into the P2 turn

- `assembleConversationContext` now requires the stored preview record's own
  `previewId` to equal the referenced ID (map-key aliases fail).
- Expiry enforcement: non-null expiry requires a valid clock; timestamps are
  parsed to epoch milliseconds and compared numerically (never lexically);
  expiry at or before now is rejected; invalid timestamps fail closed.
- P1 docs corrected: original grant-kind/source lineage and semantic
  direct-follow-up issuance remain trusted server assertions owed by P3a;
  P1 fixtures do not prove them.

## Rollback

Delete the route file, `src/components/conversation-preview/`,
`src/lib/ai/conversation/preview/`, the P2 test file, and the
`APP_CLEAR_EVENT` addition in `progress.ts`. Journey stores are untouched;
no other rollback steps are needed.

## Next (per the accepted pack staging)

- **P3a** — provider-independent shared service: context assembly wiring,
  correction/cancellation semantics, grant issuance and lineage validation
  (the trusted assertions P1 assumes), against a MOCK provider. No paid
  model or voice calls.
- **P3b** — actual identity/ownership verification, persistence and durable
  usage admission (real authenticated wiring).
- Carl has authorized continuing the staged implementation; a new paid
  conversation/voice test allowance and any participant activation or
  publication remain separate decisions. Participant AI and voice remain
  OFF; project unpublished.
