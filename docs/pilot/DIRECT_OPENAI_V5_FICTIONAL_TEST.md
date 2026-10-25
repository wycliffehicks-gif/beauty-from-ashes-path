# Candidate v5: two bounded fictional examples

Carl authorised these next two examples on 9 October 2026 at 19:51:11 Toronto
(23:51:11 UTC), explicitly agreeing to increase the cumulative engineering
allowance from USD 0.05 to USD 0.06 for this batch. His subsequent direction is
to continue with direct OpenAI; this test does not depend on AWS, Azure or Google
Cloud. This authorisation does not include another model, retries, later batches,
participant activation, publication, purchases or funding changes.

Use the exact prepared candidate-v5 instructions with `gpt-6-luna`, reasoning
`none`, in this order:

1. `d1-private-uncertain-off`: one private exploration of a change the person
   would wish for and why it would matter. Do not infer distress from privacy or
   uncertainty or substitute sensory orienting for the requested exploration.
2. `d3-regret-off`: the existing `step:write` choice provides an opportunity to
   test an explicit sentence opening and connected after-writing reflection:
   reread, consider what they wish had been different, and what that shows about
   what mattered. Do not presume wrongdoing, prescribe repair or add an action
   plan. Avoid mechanical framing such as "You selected writing".

Both cases have Christian reflection OFF. Preserve every source selection and
v5 instruction byte. No forced output mode, fabricated answers or new typed-input
feature. The examples Carl approved illustrate a perspective, not mandatory
wording. If a target behaviour does not appear, mark it untested or insufficient;
do not invent a pass, rewrite the actual model answer or retry to improve it.
Two examples cannot establish consistent model quality or clinical effectiveness.
SRT remains a draft foundation and Dr Fung a secondary contributing voice.

## Explicit allowance increase and retained history

This will be the SIXTH known provider batch. Retain all five prior reservations,
including the settled 429; lower estimated usage does not reclaim them:

- Unfunded v1: one settled HTTP 429; USD 0.003450375.
- Funded v1: three complete responses; USD 0.010346000.
- Candidate v2: three complete responses; USD 0.012053500.
- Candidate v3: three complete responses; USD 0.013422625.
- Candidate v4: two complete responses; USD 0.009462000.

Prior reservation totals USD 0.048734500. This batch reserves USD 0.009678000,
giving cumulative USD 0.058412500 and remaining USD 0.001587500 of the explicitly
approved USD 0.06. The shared `SMOKE_BUDGET_USD` and all v1-v4 sources retain their
original USD 0.05 behaviour. Only the new v5 command carries this dated approval.
Integer nanounits enforce its upper boundary without rounding reservations down.
These are conservative engineering reservations, not a verified bill or a
provider-enforced account-wide cap. Lovable development credits are separate.

The official Luna model documentation was rechecked on 9 October 2026. Reserve
input at USD 0.125 per million using UTF-8 bytes plus 1,024 overhead and output
at USD 0.50 per million for the complete 4,096-token limit. Each deadline remains
45 seconds. No paid diagnostic, fallback or retry is allowed.

Instruction block SHA-256:
`cb58209c5d93ded7ad155a84a8bcc8f1dab95bc20df268922fd5f0a6198e81d1`.
Whole instruction file SHA-256:
`d243c4950d8a657276f1a249db319318ef78a22731f26b077028237a46cd1f65`.
The new preflight validates both identities; historical preparation notes stay
unchanged as the record of what was prepared before this authorisation.

## Prepare, reconcile and run once

From the repository root, a default dry run reads no key, constructs no transport,
creates no attempt guard and makes no provider calls. Always use a fresh private
destination:

```sh
node --import ./scripts/direct-openai-smoke/register.mjs scripts/direct-openai-smoke/run-v5.ts --out artifacts/direct-openai-smoke/v5-dry-2026-10-09
```

Before live execution reconcile durable history and surviving artifacts against
all twelve prior request IDs. The exact receipt schema in `v5-preflight.ts`
requires the five known batches, reservations and explicit allowance approval,
plus a reconciliation timestamp. It records reported history, not reconstructed
raw evidence or verified billing. Unknown or unresolved attempts stop before key
access. Missing ignored artifacts never establish zero history.

Validate all four older markers exactly when present: `LIVE_ATTEMPTED.json`,
`LIVE_CANDIDATE_V2_ATTEMPTED.json`, `LIVE_CANDIDATE_V3_ATTEMPTED.json` and
`LIVE_CANDIDATE_V4_ATTEMPTED.json`. Never delete or reset them to authorise a run.
The fixed `LIVE_CANDIDATE_V5_ATTEMPTED.json` is created with exclusive `wx` before
transport construction or dispatch; its presence blocks another batch even with
a different destination. Neither old nor new evidence belongs in git.

```sh
node --import ./scripts/direct-openai-smoke/register.mjs scripts/direct-openai-smoke/run-v5.ts --out artifacts/direct-openai-smoke/v5-live-2026-10-09 --prior-reconciliation artifacts/direct-openai-smoke/v5-prior-reconciliation.json --run
```

Use only the existing secure server-side key through the unchanged transport.
Keep all participant switches OFF. At most two sequential calls; stop after a
failed or incomplete response or uncertain model identity. Preserve checkpoints,
input export, preflight, receipt, actual guard, exact raw output, transport
evidence and imported review before any cleanup. Unknown dispatch outcomes are
unresolved history, not permission to try again.

Imports explicitly require `V5_CASE_IDS`; never obtain required IDs from an
untrusted imported export. Preserve `imported-unverified` evidence labels and the
exact genuine output text. Synchronise these four new source files in Lovable and
GitHub without modifying earlier instructions, builders, outputs or evidence.

## Review the genuine outputs

For Day 1, check for the hoped-for change and its significance in one connected,
private invitation; no assumed change, observable-sign follow-up, probing of the
declined story, sensory fallback or generic abstract metaphor. For Day 3, check
for natural acknowledgment, an explicit sentence opening and meaningful rereading
that leads into what the person wished different and what mattered to them.
Do not assume guilt or force positive meaning, forgiveness, repair or action.

Both outputs must remain grounded in the day and actual selections, warm and
plain, specific enough to use, proportionate and private. Preserve null as
unknown, A-or-B uncertainty, selected steps as contemplated rather than completed,
faith-off boundaries and the prohibition on asking the person to share with
someone else. No extra activity menu. Record remaining misses candidly.

Carl reviews these two actual outputs before broader testing or a model choice.
Any later comparison needs an agreed, limited allowance and the same cases and
review criteria. This test does not commit the app to Luna or prove that a more
expensive model would solve a prompt-design issue.

Source: https://developers.openai.com/api/docs/models/gpt-6-luna
