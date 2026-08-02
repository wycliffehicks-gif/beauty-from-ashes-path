# Change log

## 2026-08-02 — Bounded Day 7 content, safety and branch-accuracy revision

Day 7 (“A More Compassionate Way to Hold It”) only; Days 1–6 and 8–10 untouched.
No route, component, storage, resume, completion, reflection-mechanics, AI,
spiritual-preference or other shared-system change. `src/routeTree.gen.ts`
unchanged. Still private and unpublished. Identity is preserved: day 7, title,
motif “compassion”, shape `standard`, question IDs `tone`/`need`, step ID `step`,
the nine-screen order (arrive → understand → q.tone → e.tone → q.need → practise
→ step → reflection → close), and every existing option ID in its existing
positional order, with new IDs appended only.

- **Identity**: theme “Truth, context, dignity and responsibility held together
  without self-attack.”; descriptor “Holding truth without self-attack · about 12
  minutes”. Central movement: face what is true without turning yourself into the
  enemy.
- **Arrive**: new lead and body separating facing truth from self-attack and from
  praise or pretence; compassion defined as truth, context, dignity and
  appropriate responsibility with no required feeling. Settling is inclusive,
  outward-first, and explicitly requires no touch, posture, breathing change,
  relaxation or settled feeling.
- **Listen**: `understand.label` “Listen”; heading “Compassion can be honest
  without becoming cruel”. Defines an inner response in ordinary language
  including wordless forms; states that accurate compassion neither flatters nor
  excuses harm and holds only responsibility within the person’s influence;
  states that harshness may feel like honesty but may add shame, without claiming
  it always does, that the person is “defended”, or that compassion guarantees
  change; distinguishes chosen action from grief, illness, disability,
  caregiving, discrimination, unsafe conditions and limited resources; states
  that nothing today requires forgiveness, confession, disclosure, repair,
  confrontation, changed behaviour, a changed feeling or a decision. New
  InfoNotes: “What does ‘hold it’ mean?”, “What if compassion feels false or
  undeserved?”, “What if I have hurt someone?”.
- **Question 1 (`tone`)**: now single-select, reworded in place for the seven
  existing IDs, with `none`, `unclear`, `private` appended as exclusive choices.
  Echo heading “What you noticed about the inner response”; every echo mirrors
  only the selected present response and infers no origin, motive, history or
  unselected opposite. All prior causal/origin stories (borrowed voice, somebody
  spoke that way first, trained to minimise, bounce-back expectations, harm
  prevention, kindness never modelled, reserve-tracking, “tone was learned
  somewhere”) removed.
- **Question 2 (`need`)**: ID retained but reframed as a chosen less-punishing way
  of holding this rather than an underlying need identified by the app; now
  single-select, with `none` and `private` appended.
- **Practise**: equal-depth paths on one screen; “either, both or neither”,
  read-only and stop-at-any-point consent. Nonreligious “Reflection Practice —
  truth without self-attack” has seven steps separating observation from verdict,
  adding context without excusing harm, keeping responsibility specific and only
  where it exists, offering an accurate less-punishing response with a wordless
  accessible alternative, and reorienting outward. Christian “Scripture &
  Spiritual Reflection — gentleness without abandoning truth” has six steps and
  now quotes the complete World English Bible wording of Isaiah 42:3 including
  “He will faithfully bring justice.”, with a note that it does not explain
  suffering, excuse harm, promise a feeling or describe the reader as damaged. The
  “damaged things”, “deserved to break”, “wick should try harder”, “handled
  carefully rather than corrected” and “barely holding on” readings are removed.
- **One Honest Step**: same five IDs and order, reworded so all five are internal,
  safe, reversible and non-performative; the former “let one kindness from
  someone else land” is now “let one fair sentence remain … without forcing
  belief”, leaving relational reconnection to Day 8.
- **Personalized reflection** (mechanism unchanged): openings removed from
  `hearing`, `care` and `next` so partial and fully skipped paths never claim the
  person noticed or considered anything. Every existing and appended option ID has
  a nonempty mapped line; branch boundaries respected for `rest` (availability not
  assumed), `notalone` (no person, contact or disclosure), `permission` (the app
  grants nothing and no action is required), `safety` (no reason assumed),
  `forgiveness` (accountability without self-punishment, no forgiveness required)
  and `unsure`/`none`/`private` (uncertainty, absence and privacy left intact).
  Private branches acknowledge the locally stored structured choice and never say
  nothing was recorded. New closing states the selections establish no cause,
  desert or outcome.
- **Close**: “Truth without contempt”, with a whether-or-not opening, a statement
  that compassion erases neither harm, consequence, grief, boundaries, limits nor
  responsibility, and a Day 8 signpost (no “tomorrow”). Carry-forward: “I can face
  what is true without turning myself into the enemy.”
- **Tests**: focused “Day 7 revision” block appended to
  `src/lib/journey/__tests__/selection.test.ts` covering identity/shape/screen
  order, single-select on both questions, exact positional option ID arrays,
  “Listen” label and newcomer definitions, inclusive arrival, full echo coverage
  with no inference, both practices’ depth and consent plus the exact Isaiah
  wording and wordless alternative, absent section openings with substantive
  fallbacks and complete line coverage, a fully skipped reflection that invents
  nothing, private/unclear/none accuracy without “nothing was recorded”, a single
  answered positional path excluding adjacent options, a guard list for the
  removed inferential/outcome-promising/time-dependent phrases, and a Day 8
  snapshot check. Full suite 353 tests passing.
- **Unchanged known shared issues** (out of scope): reflection reveal/bypass and
  saved-response restoration, positional answer storage migration, duplicate
  “Show me how” accessible labels, inactive spiritual setting.

## 2026-08-02 — Bounded Day 6 content-and-safety revision

Day 6 (“What It Is Costing Now”) only; Days 1–5 and 7–10 untouched. No route,
component, storage, resume, completion, reflection-mechanics, AI, spiritual-
preference or other shared-system change. `src/routeTree.gen.ts` unchanged.
Still private and unpublished. The nine-screen notice-first order (arrive →
cost → Explore → Listen → protects → practise → step → reflection → close),
title, day number, motif “cost”, question IDs `cost`/`protects` and step ID
`step` are preserved, with every existing option ID kept in its existing order
and new IDs appended only.

- **Identity**: descriptor now “Noticing one present-day cost · about 12
  minutes”; theme states cost noticed without blame, forced choice or invented
  causes.
- **Arrive**: removed “Yesterday”, jaw/tongue, full-weight and prescribed
  settling copy; new lead separates seeing a cost from self-blame or a decision
  to change; settling is optional, inclusive and outward-first.
- **Question 1 (cost)**: now single-select with revised descriptive labels and
  appended `none`, `unclear`, `private`; carries the Days 2–3 physical-symptom
  note verbatim; echoes are descriptive and noncausal.
- **Listen**: new label and teaching that something can help and cost at the
  same time, naming illness, disability, caregiving, discrimination, financial
  pressure, unsafe conditions and limited support as possible sources; two info
  notes on real circumstances and why cost is examined at all.
- **Question 2 (protects)**: now single-select, reframed as what may help this
  continue or make change difficult; appended `belonging`, `limits`, `ongoing`,
  `unclear`, `private`.
- **Practise**: reflection path holds one cost beside what is also true and
  distinguishes influence, needed support and what cannot be changed now; the
  Christian path uses the complete verified World English Bible wording of
  Matthew 11:28–30 (“gentle and humble in heart”) with an explicit note that it
  is not a promise of immediate change and not “just give it to God”.
- **One Honest Step**: all steps safe and reversible; `ask` and `return` are
  preparatory with nothing sent or done today; `ask` and `support` carry safety
  notes.
- **Personalized reflection**: openings removed from `hearing`, `protected` and
  `next` so partial and fully skipped paths never say “You named…”; new care
  section distinguishes own choices, needed support and what may be grieved or
  carried differently; closing reaches no conclusion about cause or change.
- **Close**: “Seen clearly, held gently” with an honest whether-or-not opening,
  a Day 7 signpost and the carry-forward line about noticing cost without
  self-condemnation.
- **Tests**: focused Day 6 block in `src/lib/journey/__tests__/selection.test.ts`
  covering identity/shape/screen order, single-select on both questions, option
  ID order and appended IDs, inclusive arrival, shared physical-symptom note,
  both practices and the Matthew wording, step safety notes, absent section
  openings, honest fully skipped reflection, none/unclear/private accuracy,
  selected-only answered mapping, and absence of forbidden inferential phrasing.
  Full suite 339 tests passing, standalone typecheck clean, production build
  succeeded.
- **Wording note**: two founder sentences were adjusted by three words to satisfy
  the existing global safety guard forbidding directive “you should” phrasing —
  “what you should change” → “what to change”, and “what you should do” →
  “what to do”. Meaning unchanged.
- **Final branch-consistency clarification (same day)**: the nonreligious
  reflection practice Step 1 no longer supplies substitute wording that would
  manufacture a cost when none was named, so `none`, `unclear`, `private` and
  fully unanswered paths may simply let the absence remain true or hold a
  general strain without linking it to this response; the carry-forward is now
  branch-neutral — “I can stay honest about what is clear and unclear without
  condemning myself or ignoring what is still real.”
- **Unchanged known shared issues** (out of scope, not fixed): reflection
  reveal/bypass and saved-response restoration, positional answer storage
  migration, duplicate “Show me how” accessible labels, inactive spiritual
  setting.

## 2026-08-01 — Bounded Day 5 content-and-safety revision

Day 5 (“The Two Pulls Within You”) only; Days 1–4 and 6–10 untouched. No route,
component, storage, resume, reflection-mechanics, AI or other shared-system
change. Still private and unpublished. The nine-screen order (arrive → understand
→ forward → Explore → holdback → practise → step → reflection → close) is
preserved, as are all existing option IDs and their order.

- **Descriptor/theme**: “Making room for mixed feelings · about 10 minutes”;
  theme now states that movement and caution can be present together without a
  decision being required.
- **Arrive**: certainty, prescribed nose/mouth breathing, flat feet and “stand
  up” language removed. Three inclusive settling steps (any workable position,
  outward orientation first, optional body/breath only if comfortable).
- **Understand (“Listen”)**: newcomer explanations of mixed feelings, what each
  pull may point toward, and that listening is not obeying, deciding or treating
  both as equally right. Two info notes: “What is ambivalence?” and “What does
  ‘a part of me’ mean here?”
- **Question 1 (`forward`)**: now single-select; refined labels, a no-contact
  note on `repair`, and appended `none` and `private`. The Explore screen
  (“What may be drawing you forward”) echoes only the selected wish and supplies
  no unselected fear, history, cause or meaning.
- **Question 2 (`holdback`)**: no longer asks what the pull is protecting
  (Day 4’s work). Now single-select, asking what concern it might carry, with
  appended `ongoing`, `none`, `private` and an info note “What if the concern is
  about something still real?”
- **Practise**: “either, both, or neither” explicit. Nonreligious path is a
  six-step sentence-stem practice with outward start, no forced gratitude or
  agreement, an explicit stop-and-reorient permission, and accurate
  “you do not need to write or save anything” wording. Christian path keeps
  Mark 9:24 (WEB) and states plainly that the person’s caution is not being
  equated with unbelief and that faith does not require overriding safety,
  limits, responsibilities or current reality.
- **One Honest Step**: same five IDs, new labels focused on listening rather than
  deciding; “without giving it the final vote” and outward-action framing removed;
  `talk` carries a safe-person note.
- **Reflection copy** (mechanism unchanged): four sections — descriptive
  `hearing`, tentative `protected` (no assumed history, survival or identity
  verdict; `ongoing` respected without urging override), an answer-neutral
  `care` paragraph, and an accurate `next`. No personalized openings on
  answer-driven sections, so skipped/none/private paths read truthfully. New
  closing on ambivalence as information, not a verdict.
- **Close**: “Room for more than one truth”; accurate on answered, partial,
  private, none and fully skipped paths; points to Day 6 rather than “tomorrow”.
  Carry-forward: “More than one truth can be present, and I can choose my pace.”
- **Tests**: new “Day 5 revision” block in
  `src/lib/journey/__tests__/selection.test.ts`.

- **Final wording clarification (same day)**: the care section is retitled
  “What may need room” and its closing sentence is now “No single pull has to
  decide today,” so the section stays truthful on one-pull, `none`, `private` and
  fully skipped paths; the `holdback` `energy` line now reads “a real practical
  concern that deserves respect,” removing the defensive “not an excuse”.

## 2026-08-01 — Bounded Day 4 content-and-safety revision

Day 4 (“What It May Have Protected”) only; Days 1–3 and 5–10 untouched. No
routing, storage, AI, shared reflection-mechanics or other shared-system change.
Still private and unpublished.

- **Shape/descriptor**: shape is now `standard` (all questions before the
  practice); descriptor “Understanding one response · about 12 minutes”.
- **Arrive**: new lead and body — one familiar response, and what it may have
  tried to prevent, preserve or provide; states plainly that no origin proof,
  reliving or giving up is asked. Settling directions rewritten as inclusive of
  any position, outward-first, with contact optional.
- **Listen**: phase label “Listen”; heading “A familiar response may have had a
  job to do”; pattern defined as a response, not an identity; protection framed
  as one lens, not a verdict, including protection that may still be responding
  to something real; understanding does not excuse effects or remove
  responsibility. Info notes: “What does ‘pattern’ mean here?”, a descriptive
  “What is overfunctioning?” with no hidden cause, and “What if protection does
  not fit?”
- **Question 1 (`response`)**: now single-select with natural labels for the nine
  existing ids, plus `unsure` and `private`. Explore screen retitled “What you
  chose to explore”; every echo describes the selection only and states it does
  not tell us why; closing separates response from identity.
- **Question 2**: the historical “then” question is replaced by `doorway` —
  when the response is most likely to show up — with exclusive `unclear` and
  `private`.
- **Question 3 (`purpose`)**: new wondering question about what it may have tried
  to prevent, preserve or provide, including `stillreal`, `other`, and exclusive
  `notfit`, `unsure`, `private`.
- **Practise**: nonreligious “Then / Now, with room for what is still true” with
  six outward-first steps and no assumption the protection is obsolete;
  Christian path “loved before readiness” now uses Mark 10:21 (WEB), states
  explicitly that no equation with possessions, sin label or surrender is
  intended, and offers an optional prayer.
- **One Honest Step**: new prompt, hint and five options (`notice`, `sentence`,
  `reminder`, `prepare-share` with a “no need to send or say it today” note,
  `settle`). “Loosen it five percent” removed — pattern change belongs to Day 9.
- **Reflection copy** (mechanism unchanged): descriptive `hearing`, context-only
  `underneath` (“a context is not a cause”), tentative `protected`, a general
  `care` paragraph on compassion, responsibility and ongoing realities, and an
  accurate `next`. No personalized openings on the answer-driven sections, so
  skipped paths read truthfully. New closing.
- **Close**: heading “Understanding before change”; no “tomorrow”; carry-forward
  is “A pattern may be part of my story; it is not the whole of who I am.”
- **Tests**: new “Day 4 revision” block in
  `src/lib/journey/__tests__/selection.test.ts`.

- **Final wording clarification (same day)**: the response echo and the
  reflection `hearing` line for `private` no longer claim nothing was recorded;
  they now read “You chose not to name a response here…”, since the choice is a
  structured answer saved locally.

## 2026-08-01 — Bounded Day 3 content-and-safety revision

Day 3 (“Name What You're Carrying”) only; Days 1–2 and 4–10 untouched. No
redesign, no routing/storage/AI change, no publication.

- **Arrive**: added the “one broad word — or no word today” invitation; settling
  directions rewritten as explicitly optional and inclusive of pain or limited
  mobility, with an outward colour alternative.
- **Listen**: educational screen now carries the phase label “Listen”; the three
  body paragraphs replaced with non-causal, identity-separating wording; the
  diagnosis note states plainly that this app does not assess or diagnose; added
  “What does ‘carrying’ mean here?”; “unresolved hurt” rewritten.
- **Name**: new prompt and hint; redundant “Several at once, tangled together”
  removed; added `regret` and an exclusive `private` (“I would rather not name it
  here today”); every echo replaced with descriptive, tentative wording; closing
  now “You are not what you carry.”
- **Locate**: new prompt and hint; body option no longer mentions illness; added
  an exclusive `unclear` option and the “A note about physical symptoms” note.
- **Practise**: nonreligious path is now “One Honest Sentence” with sentence
  stems, an outward alternative to body attention and no “let it go”; Christian
  lament path and Psalm 13:1–2 (WEB) preserved with revised steps and notes.
- **One Honest Step**: new prompt, hint and options, including a safety note on
  telling a trusted person.
- **Reflection copy** (mechanism unchanged): removed the openings that asserted
  “You put words…” / “You noticed…”, so skipped paths read honestly; all lines,
  care paragraph and closing replaced with non-causal wording.
- **Close**: heading is now “One honest beginning”; no “tomorrow”; carry-forward is
  “What I carry is real, but it is not all that is real about me.”
- **Final wording refinement (same day)**: `unsure` marked exclusive alongside
  `private`; public-facing “Unresolved hurt” replaced everywhere with “Hurt that
  still affects me” (id `hurt` retained) across choice, info note, echo and
  reflection line; Locate prompt now “In what parts of life, if any, does this word
  feel relevant right now?” with a non-shared-cause hint, physical-symptom note
  kept, and the reflection section retitled “What you noticed alongside it”; One
  Honest Sentence gained a breadth/no-identifying-details boundary, revised
  sentence stems (“Something I regret is…”, “What feels heaviest today is…”) and an
  any-sense outward alternative; One Honest Step `hold` and `tell` labels, note and
  reflection lines revised; Christian-path `notRequired` allows remaining with
  question, anger, doubt or silence; skipped/no-outward-step reflection line
  rewritten.
- **Tests**: Day 3 coverage added to `src/lib/journey/__tests__/selection.test.ts`,
  including `unsure` exclusivity in both directions, absence of “Unresolved hurt”,
  Locate wording, practice wording and the new close heading.

## 2026-08-01 — Bounded Day 2 content-and-safety revision

Day 2 (“Notice What Is Here”) only; Days 1 and 3–10 untouched. No redesign,
no new services, no live AI, no storage change, still private and unpublished.

- **Arrive**: settling directions rewritten so bodily movement and inward body
  attention are explicitly optional and inclusive of pain, disability or limited
  mobility. Outward visual orientation kept.
- **Notice**: new prompt and hint; “Nothing much registers right now” is now
  mutually exclusive with the other sensation choices; added the point-of-need
  note “A note about physical symptoms”.
- **Explore**: heading “What you noticed”; every body echo replaced with neutral
  description — no inferred psychological or medical cause. New closing line.
- **Listen**: educational screen now carries the phase label “Listen”; the
  four distinctions preserved with a non-promissory framing; numbness
  explanation replaced with the approved wording.
- **Sort**: hint updated; redundant “Several of these at once” option removed.
- **Practise**: both pathways and Psalm 42 preserved; the nonreligious practice
  now offers an equally complete outward route (noticing five neutral things)
  and no longer requires inward attention or calming.
- **One Honest Step**: “Keep one word…” replaced with “Write down one word and
  leave the reflection there for today”; added “Share one honest sentence with
  someone I trust” with a safety note.
- **Prototype reflection copy**: Day 2 fallback lines made descriptive rather
  than causal; removed the deleted “mixed” line; added a line for the new
  sharing step; closing replaced with “Only you know the fuller context…”.
- **Carry forward**: no longer refers to “tomorrow”; valid whether or not the
  person selected anything. Carry-forward sentence preserved.

Supporting code (smallest change): optional `exclusive` metadata on `Choice`,
optional `understand.label`, a shared `toggleSelection` helper, and tests.

Files changed: `src/content/journey-days-a.ts`,
`src/content/journey-types.ts`, `src/routes/day.$day.tsx`,
`src/lib/journey/selection.ts` (new),
`src/lib/journey/__tests__/selection.test.ts` (new), `.lovable/change-log.md`.
