# Candidate v4: two bounded fictional examples

Authorised by Carl on 9 October 2026 at 12:49:55 Toronto: "Okay so let's I guess
do some more test examples." Use the prepared candidate-v4 instructions with
`gpt-6-luna`, reasoning `none`, in exactly this order:

1. `d1-private-uncertain-off`: a practical, private reflection focus that respects
   sparse input and privacy without inventing a story or explaining a blank.
2. `d3-regret-off`: the existing fictional choice `step:write` provides a natural
   opportunity to test a concrete writing opening and a distinct after-writing
   direction anchored to the person's own words.

Both cases have Christian reflection OFF. Preserve all source selections and
v4 instruction bytes. Do not add a forced output mode or fictitious new answers.
The second case does not guarantee a writing response. If Luna chooses another
practice, report writing follow-through as untested; do not retry or claim a pass.
These examples are not a universal script, a clinical efficacy finding or launch
approval. SRT remains a draft foundation. No real participant data, participant
activation, publication, new typed-answer feature, purchase or account funding
change is included. Development credits in Lovable are separate from API usage.

## Original allowance and reported history

This is the FIFTH known provider batch when run. Retain reservations from all
four earlier batches, including the settled 429; estimated lower usage does not
reclaim any reservation:

- Unfunded v1: one settled HTTP 429; USD 0.003450375 retained.
- Funded v1: three complete responses; USD 0.010346000 retained.
- Candidate v2: three complete responses; USD 0.012053500 retained.
- Candidate v3: three complete responses; USD 0.013422625 retained.

Prior reservation is USD 0.039272500. The two new reservations are USD 0.004705750
and USD 0.004756250, totalling USD 0.009462000. Cumulative reservation is
USD 0.048734500 of the ORIGINAL USD 0.05; remaining USD 0.001265500. Integer
nanounits retain the original hard cap without rounding down. These are
conservative engineering reservations, not a verified bill or provider-enforced
account-wide cap. Official Luna documentation was checked on 9 October 2026.
Unchanged rates reserve input at USD 0.125 per million, using UTF-8 bytes plus
1,024 overhead, and output at USD 0.50 per million for the full 4,096-token limit.
The deadline remains 45 seconds. No paid diagnostic or model fallback is allowed.

## Prepare and run once

From the repository root, default dry execution reads no API key and constructs
no transport. Use a fresh private directory every time:

```sh
node --import ./scripts/direct-openai-smoke/register.mjs scripts/direct-openai-smoke/run-v4.ts --out artifacts/direct-openai-smoke/v4-dry-2026-10-09
```

Before live execution reconcile durable history and surviving artifacts against
all ten prior request IDs. The strictly validated receipt is reported history,
not reconstructed raw evidence or verified billing. Unknown or unresolved
attempts stop before credential access. Missing ignored artifacts after workspace
cleanup never establish zero prior history or authorise a replacement batch.
Validate all three prior markers exactly when present: `LIVE_ATTEMPTED.json`,
`LIVE_CANDIDATE_V2_ATTEMPTED.json`, `LIVE_CANDIDATE_V3_ATTEMPTED.json`. Never delete
or reset them. The new fixed `LIVE_CANDIDATE_V4_ATTEMPTED.json` is created with
exclusive `wx` before transport construction and every dispatch. An existing v4
marker blocks another batch even with a different output directory.

```sh
node --import ./scripts/direct-openai-smoke/register.mjs scripts/direct-openai-smoke/run-v4.ts --out artifacts/direct-openai-smoke/v4-live-2026-10-09 --prior-reconciliation artifacts/direct-openai-smoke/v4-prior-reconciliation.json --run
```

Use only the existing secure server-side key through the unchanged transport.
Keep all three participant switches off. At most two sequential calls; stop on
failure, incomplete response or uncertain model identity. No retry. Persist
before/after checkpoints and capture exact results, transport evidence, input
export, preflight, receipt and actual marker immediately before ignored artifacts
can be cleared. Private generated artifacts must stay out of git.

The shared file exchange accepts an optional trusted caller-selected source case
subset; its default three-case smoke matrix and CLI remain unchanged. Imports
for this runner explicitly require `V4_CASE_IDS` as the fourth `importResults`
argument. Never derive required IDs from an untrusted imported export. Preserve
`imported-unverified` evidence labels and exact genuine output text. Synchronise
these source changes in Lovable and GitHub, preserving earlier work.

## Review the genuine outputs

Look for one concrete anchor and one linked exploration tied to the day and actual
selections. Quiet reflection needs a specific focus and clear instruction. Every
writing invitation needs a sentence opening plus one distinct after-writing
follow-through. Avoid abstract prompts such as "what would beginning here mean?"
without a practical anchor, assumed memories or causes, literal copying of Carl's
hope example into every context, or activities stacked into a menu. Maintain
A-or-B uncertainty, null as unknown, faith-off boundaries, private expression,
warm natural language and the existing boundary against asking the person to
share with somebody else. If a required behaviour does not appear, mark it
untested rather than inferred. Review these two outputs before any broader test.

Source: https://developers.openai.com/api/docs/models/gpt-6-luna
