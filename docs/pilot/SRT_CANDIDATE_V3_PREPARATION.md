# SRT candidate v3: sparse answers and meaningful follow-through

Prepared 9 October 2026, Toronto, from Carl's corrections at 01:08 and 01:10
after his review of the genuine candidate-v2 responses. This is an offline
candidate, not a new model result or a participant release.

When an answer is sparse, ambiguous or unanswered, the candidate can offer one
small private thought question connected to the day's theme and reflection.
It chooses one narrative, solution-focused or dignity-informed focus, using
original contextual wording. Possible focuses are personally meaningful story
or identity, a small preferred difference or a sign of it, or a valued quality,
role or source of meaning. These are alternatives, not a list for the participant.
The question can help someone consider where they are or a direction they value.
It must not assume a story, difficulty, relationship or desired change.

Carl's life-story and magic-wand examples describe the flavour of the invitation;
they are not required wording or a multi-part therapy interview. The candidate
does not name therapeutic approaches to participants, claim to deliver formal
therapy, copy a standard protocol, or default to death, legacy or end-of-life
questions. Dignity is intrinsic, not conditional on usefulness, achievements,
approval from others or producing a story.

A blank or `selectedLabel:null` remains unknown. In particular, an unanswered
next-step question does not mean that no step felt possible or that the person
chose no action. Explicit privacy is respected without probing what was declined;
a broader day-theme thought question can fit. An explicit request for no exercise
or no questions takes precedence. A question is never mandatory because an input
is sparse, and acknowledgment alone remains available.

With enough context, writing remains one possible private practice. **Every
writing invitation includes a specific sentence opening plus exactly one distinct
follow-through** on what the person's own word or phrase means to them, or what
it could mean for their personally chosen direction. Finishing the sentence is
not that follow-through. The model must not supply the answer or impose a meaning.
One standalone sparse-input question is an alternative to the entire writing
exercise; it does not gain a sentence opening, follow-up and extra task.

Earlier corrections remain: one practice at most, varied but day-grounded language,
no mechanical recital of labels, no repeated opt-out reminders, no suggestions to
share or talk with others, and no invented causes, history, private writing or
progress. A brief credible spoken affirmation, or an authorised faith-on prayer
or supplied verse, can stand alone. Faith-off remains fully secular. No typed
answer feature is added; private thought or writing is not submitted to the AI.

## Preserve the tested versions and participant behaviour

The v1 and v2 instruction files, fixture pack, actual outputs, evidence, previous
builders and direct OpenAI runners remain unchanged. The v3 builder validates the
original source-bound v1 pack, replaces exactly one conflicting baseline restraint
in an evaluation copy, and appends only the v3 instruction block. It does not
stack v1, v2 and v3 candidates. All 22 cases, canonical sources, selection payloads,
faith routing and 12 rejection probes stay bound to the original source checks.

The distinct identity is `journey-p4-eval-expression-v3+srt-candidate-v3`. Its
instruction hash and full-file hash accompany exports. Earlier versions cannot be
imported as v3, or vice versa. The participant policy remains `journey-p4`, with
participant AI off and the app unpublished. SRT v0.7 remains a working draft.

## Offline export and import

From the repository root using Node 24:

```sh
node --import ./scripts/offline-ai/register.mjs scripts/offline-ai/exchange-results.ts export --policy v3 --out artifacts/offline-ai/candidate-v3-01
```

The default export has no selected model (`requestedModelId:null`). Its result
template contains only `not-run` rows with no generated text. This is a source
pack for preparation and review; it makes zero provider calls and conveys no
spending or activation permission. Use a fresh output directory each time.

```sh
node --import ./scripts/offline-ai/register.mjs scripts/offline-ai/exchange-results.ts import --policy v3 --out artifacts/offline-ai/candidate-v3-review-01 --export PATH_TO_INPUT_EXPORT_JSON --results PATH_TO_RESULTS_JSON
```

Importing the untouched template demonstrates evidence compatibility only; it
does not create model responses. The CLI still defaults to v1, and explicit
`--policy v2` remains compatible. Both v3 operations require `--policy v3`.

There is no live v3 runner in this change. No earlier live command is repurposed,
no attempt guard is removed, and no prior budget reservation is reset. A later
fictional test must reconcile all earlier attempts and spending within a bounded
scope before dispatch. The model must receive the complete selected instruction
block and current-day material with each request; it does not rely on having
remembered a one-time lesson. No automatic paid reminders are introduced.

## Review before any adoption

Offline tests establish source integrity and version isolation, not model quality
or clinical effectiveness. Future genuine outputs still need review for null
interpretation, privacy, one question versus one writing exercise, meaningful
follow-through, contextual dignity, faith boundaries and concise natural wording.
Keep assistant-written examples separate from actual model outputs. Later
participant adoption requires a new policy/cache identity, integration and release
checks; preparation does not activate it.
