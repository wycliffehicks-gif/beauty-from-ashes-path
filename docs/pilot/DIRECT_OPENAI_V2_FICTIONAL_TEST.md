# Candidate v2: bounded fictional comparison

Prepared 8 October 2026, Toronto. After reviewing and correcting the first three
responses, Carl asked to continue with another fictional response test. This
separate command tests the revised candidate with the SAME three Day 1 cases and
`gpt-6-luna`, reasoning `none`, so differences can be reviewed against v1. All three
cases have Christian reflection OFF; this does not test prayer/Scripture behavior.

No participant AI, publication, real participant data, purchase or account-funding
change is included. The SRT draft and exact v1 outputs remain unchanged. Dr.
Kenneth Fung's newly located writings have not been added to these instructions.

Carl clarified at 22:52 Toronto that SRT and his voice must remain present over
time. The existing transport sends the full prepared system policy/instructions
and current-day grounded material with EVERY request. It does not rely on a
previous conversation, a one-time lesson or permanent model retraining. Preserve
that per-request guidance when participant integration is later implemented.
Review sample outputs when changing instructions or models; repeated guidance
does not by itself prove faithful voice or quality. No scheduled live testing or
automatic paid refresh is introduced.

At 22:55 Toronto, Carl emphasized avoiding unnecessary model spending and
delegated model comparison choices. Continue with Luna for this batch; consider
a different model only to investigate a concrete quality shortcoming. No extra
model comparison or additional live batch is included here.

## Preserved history and cost bounds

This is the third known batch, not a fresh account-wide allowance:

- Batch 1: one settled HTTP 429, request
  `req_a662934ce915414184fe9a276cd05909`; billing unknown. Carry USD 0.003450375.
- Batch 2: three complete v1 responses, requests
  `req_369a19eeab114dac9984c48916f66c06`,
  `req_4d42309838de4961bccfa273201f9889`,
  `req_c8edf8b555c744b68d97f9ebb4b57844`. Carry the conservative full rounded
  reservation USD 0.010346, regardless of the lower estimated reported usage.
- Previous reservation total: USD 0.013796375. Candidate v2's three-case
  reservation is approximately USD 0.0120535; cumulative approximately USD
  0.025849875, below the ORIGINAL USD 0.05 engineering allowance.

Official model/pricing documentation was rechecked on 8 October Toronto / 9
October UTC. Standard short-context rates remain USD 0.10 input, 0.125 cache write,
and 0.50 output per million tokens. The preserved estimator uses the higher input
rate, UTF-8 bytes plus overhead, and the full output-token allowance. No tool,
regional or priority processing is requested. This is a conservative engineering
estimate, not a verified bill or provider-enforced/account-wide cap. Lovable
development-task credits are separate.

## Run once after reconciliation

Use Node 24 from the repository root. The default run sends no request and reads
no credential:

```sh
node --import ./scripts/direct-openai-smoke/register.mjs scripts/direct-openai-smoke/run-v2.ts --out artifacts/direct-openai-smoke/v2-dry-2026-10-08
```

Before a live run, compare all surviving attempt records and the durable handoff
against the four known earlier requests. Do not infer no usage from missing
workspace files. Record the strictly validated prior-reconciliation receipt,
labelled `reported-history-not-reconstructed-raw-evidence`. A receipt is an
operator's reconciliation, not independent provider evidence. Unknown additional
or unresolved attempts require stopping and reconciliation before any dispatch.

```sh
node --import ./scripts/direct-openai-smoke/register.mjs scripts/direct-openai-smoke/run-v2.ts --out artifacts/direct-openai-smoke/v2-live-2026-10-08 --prior-reconciliation artifacts/direct-openai-smoke/v2-prior-reconciliation.json --run
```

Use the existing securely stored `OPENAI_API_KEY`; never place a key in source,
chat or output. All participant switches must stay off. Preserve earlier guards
and artifacts. The new fixed v2 guard is written exclusively before dispatch and
blocks repeat execution, including a retry with a different output directory.
Do not delete/reset it. A lost workspace still requires reconciling durable
history before any new run; absence of this guard cannot authorize another batch.

At most three sequential requests, no retries or fallback, 4,096 output-token
limit, 45-second deadline. Failure, incomplete output or uncertain model identity
stops the batch. Checkpoints precede and follow each dispatch. Private artifacts
record the v2 input/export hashes, exact outputs, usage, latency and attempt IDs.
Import against v2, preserving the honest `imported-unverified` evidence labels.

## Review

Compare the genuine v2 outputs with the preserved v1 texts. Check relevant
acknowledgment, accurate selected-label alternatives, one private practice at
most, connected writing follow-through, credible spoken alternatives, restraint
for privacy/no-action choices, and reduced repetition. Do not assume all three
must contain an exercise or deliberately force three different formats. Keep
Carl's corrections distinct from actual provider output. This small comparison
does not establish clinical effectiveness, faith-on behavior or launch readiness.

Sources:
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/pricing
