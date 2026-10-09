# SRT candidate v2: private reflection revision

Prepared 8 October 2026, Toronto, from Carl's review of the first three fictional
OpenAI responses and his corrections at 22:26, 22:29 and 22:33. This candidate is
ready for offline export and review. It has not produced a new model response.

The opening explains once that a participant can answer, leave a sentence
unfinished or continue without answering. The revised candidate avoids repeated
permissions. It offers at most one private practice that fits the current day,
the actual selections and the reflection before it:

- Writing: a specific sentence opening with one connected reflection on the
  person's word or phrase, such as its meaning or when it appears.
- Speaking: a short, credible affirmation; with spiritual reflection on, a
  source-grounded prayer or the supplied verse to read aloud can fit instead.
- Acknowledgment alone when privacy, uncertainty or the person's choices make
  that the appropriate response.

These are alternatives for the model to choose between, not a menu or a set of
tasks for the participant. Do not suggest speaking or sharing with another person.
Writing is not mandatory or the default for every response. Faith-off reflections
remain fully secular; faith-on content uses only the supplied spiritual material.

The guiding aims across the journey are acceptance, acknowledgment, feeling heard
and validated, emotional expression, awareness, meaning and a personally chosen
direction. Do not turn them into a checklist for each reflection, infer hidden
causes or promise safety, healing or progress.

## Preserve the earlier work

The v1 instructions, source-bound fixtures, original three outputs and direct
OpenAI runner remain intact for historical reproduction. Candidate v2 first
validates that unchanged pack, then replaces exactly one conflicting restraint
sentence in an evaluation copy and appends only the v2 candidate. The resulting
identity is `journey-p4-eval-expression-v2+srt-candidate-v2`; it cannot be imported
as v1. Current-day payloads, selection meanings and faith controls are unchanged.

The participant policy remains `journey-p4`. The SRT foundation remains v0.7 draft.
Participant AI stays off and the app remains unpublished. This revision authorises
no provider calls, purchases, participant data use or release.

## Offline export and import

From the repository root with Node 24:

```sh
node --import ./scripts/offline-ai/register.mjs scripts/offline-ai/exchange-results.ts export --policy v2 --out artifacts/offline-ai/candidate-v2-01 --candidate candidate-a=MODEL_ID_TO_REVIEW
```

This prepares the existing three-case fictional smoke set with a placeholder model identifier;
it does not select a provider, establish access or make a call. Use a new output
directory for each run. Replace the placeholder only after choosing an exact
model for a separately bounded test. Future results must retain the export's
identity and hashes:

```sh
node --import ./scripts/offline-ai/register.mjs scripts/offline-ai/exchange-results.ts import --policy v2 --out artifacts/offline-ai/candidate-v2-review-01 --export PATH_TO_INPUT_EXPORT_JSON --results PATH_TO_RESULTS_JSON
```

The CLI still defaults to v1 for existing evidence. `--policy v2` must be explicit
for both export and import. The unchanged direct OpenAI smoke runner still uses
v1 and is not a way to test v2. Carl's requested next comparison now has a
[separate bounded v2 command](DIRECT_OPENAI_V2_FICTIONAL_TEST.md), preserving the
old command and records. It uses the same three cases and model, carries the
earlier reservations against the original allowance, and requires prior-attempt
reconciliation plus a distinct fixed guard. Do not delete or bypass an earlier
attempt marker. Later broader comparisons still need their own bounded scope.

## Next review

Check genuine v2 model outputs for relevant acknowledgment, one coherent private
practice at most, useful writing follow-through, credible spoken wording, correct
faith boundaries, no repeated opt-out endings, no sharing suggestions, and variety
grounded in each day's material. Check sparse and no-action cases and both faith
settings. Passing offline tests proves preparation and evidence compatibility,
not response quality or clinical effectiveness. Carl's review remains necessary.

Carl also asked whether responses can avoid being identical each time. Review
variety in fresh generations, including bounded repeat-input samples in a later
approved test; a prompt cannot guarantee unique wording. Preserve a saved
reflection when it is reopened. No refresh/regenerate feature, sampling-setting
change or extra paid run is introduced by this revision.

Adoption in participant routes is a later change with a new policy/cache identity,
integration and release checks. Nothing here activates participant AI.
