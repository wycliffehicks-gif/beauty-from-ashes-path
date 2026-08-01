# Change log

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
