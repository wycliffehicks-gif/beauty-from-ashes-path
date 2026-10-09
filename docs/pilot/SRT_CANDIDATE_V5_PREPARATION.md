# SRT candidate v5: change-and-why and meaningful writing follow-through

Prepared 9 October 2026, Toronto, after Carl approved the latest reflection
paradigm on reading the two genuine candidate-v4 fictional responses. This is an
offline candidate, not a model result or participant release. The genuine v4
texts and their review remain unchanged evidence.

## Correction 1: Day 1 uncertain or private selections

When Day 1 (Begin Where You Are) selections are uncertain, sparse or private, the
candidate may give ONE private, future-facing invitation: imagine one change the
person would wish for in their life right now, and consider why that change would
matter to them. Carl's illustration, which is not a universal script: "Imagine you
could change one thing in your life right now. What would you want to be
different, and why would that change matter to you?"

- The person may choose a direction privately; the response must not pretend one
  has already been chosen, or assume what the change is or that one exists.
- v4 wording that required an already-supported preferred direction for this
  initial exploration is removed. An observable sign of change fits only after a
  direction is actually known from supplied selections and is never stacked onto
  the initial change-and-why focus.
- Blank or null stays unknown. Privacy and uncertainty do not imply distress or
  dysregulation, so the candidate must not default to sensory orientation (a
  colour, shape or sound), body awareness or grounding for sparse, uncertain or
  private input. This is contextual guidance, not a rejection of somatic
  approaches in SRT where the supplied day material calls for them.
- A future-facing focus must not probe a declined story. Explicit no-question or
  no-exercise choices still prevail, and acknowledgment alone remains available.

## Correction 2: writing follow-through

Every writing invitation offers an explicit sentence opening plus ONE connected
after-writing exploration. For regret the linked focus is: reread what was
written, notice what they wish had been different, and consider what that shows
about what mattered to them and why. Carl's illustration, not a mandatory script:
"You could write, 'Something I regret is...' and finish the sentence in your own
words. Read it back slowly. What do you wish had been different, and what does
that tell you about what mattered to you?"

This is one coherent reflection, not a question-mark count. Regret does not
establish wrongdoing or culpability; the candidate must not require repair,
forgiveness, confession or action, or supply what mattered. Other themes adapt
the same movement from the person's words to what matters, without reusing regret
wording. A selected writing step is introduced naturally, not with mechanical
framing such as "You selected writing".

## Preserved corrections

Current-day source grounding, variety tied to actual selections, warmth, intrinsic
dignity, one manageable practice (never a menu), null and A-or-B uncertainty,
private writing never treated as input, faith-off fully secular, faith-on limited
to supplied approved material, and no prompts to contact or share with another
person all remain. No typed-answer feature is added. Dr Fung remains a secondary
contributing voice; no booklet material or new doctrine is injected. To stay
within the unchanged 24,000-character preparation ceiling, some repeated v4
wording about opt-out reminders, quiet reflection, practice stacking, memory and
proportion was condensed without changing its meaning.

## Version and source preservation

The v5 builder validates the original source-bound v1 pack, replaces exactly the
original journey-p4 question-OR-step restraint in an evaluation copy, and appends
ONLY v5. Earlier candidate text is not stacked. All 22 cases and 12 rejection
probes stay bound to their original sources. The identity is
`journey-p4-eval-expression-v5+srt-candidate-v5`, with pinned instruction-block
and full-file hashes in exports. Versions cannot be imported as each other.
The participant policy remains journey-p4, participant AI stays off, and the app
remains unpublished.

## Offline export and import

```sh
node --import ./scripts/offline-ai/register.mjs scripts/offline-ai/exchange-results.ts export --policy v5 --out artifacts/offline-ai/candidate-v5-01
node --import ./scripts/offline-ai/register.mjs scripts/offline-ai/exchange-results.ts import --policy v5 --out artifacts/offline-ai/candidate-v5-review-01 --export PATH_TO_INPUT_EXPORT_JSON --results PATH_TO_RESULTS_JSON
```

The default export has `requestedModelId:null` and a template of `not-run` rows.
It makes zero provider calls. The CLI still defaults to v1, with v2, v3 and v4
retained; v5 requires `--policy v5`.

## Proposed next test (not run, no runner created)

A future bounded test could use the same two source cases, `d1-private-uncertain-off`
and `d3-regret-off`, with `gpt-6-luna` and reasoning `none`, to see whether v5
yields a change-and-why invitation for Day 1 and a reread/what-mattered writing
follow-through for regret. Neither behaviour is guaranteed; anything absent is
reported as untested.

Five known provider batches (the initial 429 plus four completed response sets)
retain a cumulative reservation of USD 0.048734500 of the original USD 0.05,
leaving USD 0.001265500. That is too little for a conservative two-case
reservation. Reservations are never reclaimed or reset. Any paid test needs
Carl's explicit approval of an allowance and a full reconciliation of all five
batches. This preparation is not approval for a paid test.
