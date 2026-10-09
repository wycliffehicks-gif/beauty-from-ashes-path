# Candidate v3: one bounded fictional comparison

Authorised by Carl on 9 October 2026 at 08:43 Toronto: "Okay let's do the next
test." Use the SAME three Day 1 fictional, Christian-reflection-OFF cases and
`gpt-6-luna`, reasoning `none`, to compare the revised instructions with the
preserved v1/v2 outputs. Do not expand to other days, models or faith-on cases.

The candidate adds one contextual narrative, solution-focused or dignity-informed
private thought question as an alternative for sparse input, explicitly treats
blank/null as unknown, and requires one distinct meaning/direction follow-through
after every writing opening. It does not require all three question styles to
appear in this small batch. Preserve its instruction bytes and earlier evidence.
Do not present reviewer-written corrections as actual new provider outputs.

No participant AI, publication, typed-answer feature, real participant data,
purchase, account-funding change or automatic paid refresh is included. Existing
instructions and current-day material accompany each request. SRT remains a
draft foundation; this evaluation cannot establish clinical efficacy or launch
readiness. No new Dr. Fung material or external therapy questionnaire is added.

## Retain the original allowance and every earlier attempt

This will be the FOURTH known provider batch:

- Unfunded v1: one settled HTTP 429; retain USD 0.003450375.
- Funded v1: three complete responses; retain rounded USD 0.010346.
- Candidate v2: three complete responses; retain USD 0.012053500.

Previous retained reservation: USD 0.025849875. Proposed v3 reservation:
USD 0.013422625. Cumulative after reserving v3: USD 0.039272500 of the ORIGINAL
USD 0.05; remaining USD 0.010727500. Use integer nanounits and round the new
reservation upward. Do not reset this allowance or subtract estimated lower
billing to make room for another test. This is a conservative engineering
reservation, not a verified bill or provider-enforced account cap. Lovable
development credits are separate.

Official Luna documentation was checked on 9 October 2026. Standard short-context
rates remain USD 0.10 input, 0.125 cache-write and 0.50 output per million tokens;
reasoning `none` is supported. The unchanged estimator uses the higher input
rate, UTF-8 bytes plus overhead and the full 4,096-output-token allowance. No
regional, fast-processing or tool premium is requested.

## One run after reconciliation

Use Node 24 from the repository root. The default is dry, makes no provider call
and reads no API key:

```sh
node --import ./scripts/direct-openai-smoke/register.mjs scripts/direct-openai-smoke/run-v3.ts --out artifacts/direct-openai-smoke/v3-dry-2026-10-09
```

Before live execution, reconcile surviving private artifacts and durable history
against all seven known earlier request IDs. A strictly validated receipt records
reported history, not reconstructed raw evidence or independently verified billing.
Unknown extra or unresolved attempts stop dispatch. Missing workspace artifacts
after platform cleanup are never proof of zero history.

Preserve and validate both old markers, `LIVE_ATTEMPTED.json` and
`LIVE_CANDIDATE_V2_ATTEMPTED.json`, when present. Never delete/reset them. The
new fixed `LIVE_CANDIDATE_V3_ATTEMPTED.json` is created exclusively before any
dispatch and blocks another invocation, even with a new output directory. Loss
of a workspace does not authorise another batch: reconcile durable history first.

```sh
node --import ./scripts/direct-openai-smoke/register.mjs scripts/direct-openai-smoke/run-v3.ts --out artifacts/direct-openai-smoke/v3-live-2026-10-09 --prior-reconciliation artifacts/direct-openai-smoke/v3-prior-reconciliation.json --run
```

Use only the existing securely stored key through the unchanged server-side
transport. Never print it or put it in source. All three participant switches
must stay off. At most three sequential requests, 45-second deadline, no retry or
fallback. Failure, incomplete output or uncertain model identity stops the batch.
Write checkpoints before and after each dispatch, preserve exact text/usage/IDs,
and import only against v3. Keep honest `imported-unverified` evidence labels.

Capture results, transport evidence, preflight, reconciliation and actual marker
immediately before ignored workspace files can be cleared. Keep private generated
artifacts out of git. Synchronise source code in Lovable and GitHub and verify it.

## Review

Check accurate acknowledgment without reciting labels, no invented explanation
for null or privacy, one contextually useful thought question OR one complete
writing exercise, one distinct after-writing follow-through, private expression,
faith-off boundaries and warm natural language. Acknowledgment alone can still
fit an explicit no-question/no-exercise choice. Do not force a particular lens,
affirmation or format merely to show variety. Review actual outputs before any
broader test or participant integration.

Source: https://developers.openai.com/api/docs/models/gpt-6-luna
