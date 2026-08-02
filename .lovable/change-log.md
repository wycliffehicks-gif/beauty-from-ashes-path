# Change log

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
