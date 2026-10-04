# Participant information review — 4 October 2026, Toronto

## Scope and preserved authority

This preparation reconciles participant instructions with the current app, and
corrects factual help/privacy text. It does not recruit participants, approve
sensitive-data use, choose a provider or activate AI. The target remains a
meaningful AI-enabled journey, subject to the existing release requirements.
The ten-day teaching, Carl’s corrections, optional expression and faith choices,
ordinary code-free entry, saved progress and earlier keyboard/mobile repairs are
preserved. SRT master v0.7 remains DRAFT; sample set revision 3 is provisionally
accepted; candidate SRT instructions remain uninstalled.

Starting GitHub/Lovable revision: `e1b234aae44db10d69066dd434c6eedcb48ffa3e`.
Carl’s standing instruction is to keep Lovable and GitHub equally updated for
all repository changes. Apply through the connected workflow and independently
compare the complete GitHub tree against reviewed source before reporting sync.
Do not rewrite published history or publish the app as part of preparation.

The existing owner-reviewed participant pack is updated in place, not copied
into a second repository-owned participant document:
`BFA_Pilot_Participant_Pack_2026-10-03_DRAFT.txt` (updated 4 October).
SHA-256 of the revised draft: `11974c886d3ca5a229d926e933bbc56483f63b61ca3f2f42df24604c889d1430`.
The launch plan records the final sync revision and remaining release decisions.

## Claim-to-source reconciliation

| Topic | Current evidence / participant explanation | Relevant source |
| --- | --- | --- |
| Entry and connectivity | Ordinary visitor-code entry remains removed. Opening the journey still needs a server access check; an installed shortcut is not a fully offline app. | `src/lib/gate.server.ts`, `src/lib/gate.functions.ts`, `src/routes/_shell.settings.tsx` |
| Saving and privacy | Browser-local choices, progress and preferences depend on available storage. No account, automatic cross-device restore or guaranteed retention. Hosting/fonts still involve technical web requests. | `src/lib/prefs.ts`, `src/lib/journey/progress.ts`, `src/routes/privacy.tsx` |
| Private expression | Ordinary paper, notebook, phone notes, speaking privately and quiet options remain available. Daily answer choices are not typed journalling. Shifted-page typed notes are unsaved and excluded from export and AI. | `src/routes/_shell.shifted.tsx`, existing ten-day authored material |
| Export | Home offers export after all ten days; Shifted also offers finished-day exports. Output reflects finished days and the current Scripture setting. It is a readable copy, not an importable backup. Printing or sharing creates separate copies. | `src/components/LandingPage.tsx`, `src/routes/_shell.shifted.tsx`, `src/lib/journey/export.ts` |
| Clearing | Clear requests removal of this app’s local journey information in this browser and reports an unconfirmed removal. It does not remove other-device records, downloaded/printed/shared copies, external-service records or notification permission. | `src/lib/journey/progress.ts`, `src/routes/_shell.settings.tsx`, `src/content/settings.ts` |
| Session information | A restored browser session may restore session storage; closing a browser is not a deletion guarantee. | `src/routes/privacy.tsx`; MDN reference below |
| Reminders | Optional one-at-a-time reminder while the app is open. No closed-app delivery or recurring daily service is promised. | `src/lib/journey/reminder.ts`, `src/routes/_shell.settings.tsx` |
| Present AI | New participant generation remains unavailable. Availability checks do not send reflection answers. Dormant transport is still Lovable; AWS/Azure are not represented as integrated. | `src/lib/ai/journey-disclosure.ts`, current boundary and gateway modules |
| Future AI input | Current contract is day, answer-meaning version, current-day selections and spiritual preference. Server grounding resolves readable choices plus approved teaching/practice. Private notes and earlier-day answers are excluded. Consent is a separate envelope. | `src/lib/ai/journey-consent.ts`, boundary/preparation modules and existing AI-boundary review |
| Support and feedback | Practical support instructions no longer require a potentially lossy refresh. No continuous monitoring or response-time promise. Future free-days/pricing commitments are not asserted. | `src/routes/contact-support.tsx`, `src/routes/pilot-feedback.tsx` |

The pack keeps the invitation voice and seven voluntary feedback questions, with
owner-only sections clearly separated from proposed participant copy. It does
not promise anonymity for email feedback, clinical effectiveness, a final
provider, processing geography, no provider records, or full privacy compliance.

## Versioned acknowledgement and retained data

`LEGAL_BUNDLE_VERSION` and `JOURNEY_AI_DISCLOSURE_VERSION` both become
`2026-10-04.1`. The Privacy Notice and Important Information dates are refreshed
alongside the factual wording, not silently applied under an old acknowledgement.

The immediate predecessor legal version is `2026-08-16.1`; its acknowledgement
is no longer current. Reading that state does not delete it. Fresh acceptance
merges the existing preferences and preserves spiritual choice and saved progress.
The immediate predecessor AI disclosure is `2026-09-07.2`; old consent is stale.
An older saved AI response remains in raw storage but fails the current matching
response check, so is not presented or exported as current AI. Fresh consent
alone does not make that response current. The selected-AI export path reports
unavailability rather than silently substituting authored text. The authored
reflection remains a separate choice. No regeneration is enabled.

## Verification and boundaries

Independent source and participant-copy review found no substantive blocker.
Existing exact-copy regression expectations were updated to the clarified facts;
the actual storage, consent and response matching algorithms are unchanged.
The final local suite passed 1,363 tests in 72 files, including two added
predecessor-version preservation regressions (37 tests in their targeted suite).
Installed TypeScript passed. The portable Node production build and local HTTP
smoke passed: five pages, nine assets, manifest/worker files, both compiled AI-off
refusals and zero child global-fetch attempts. The two test-only additions landed
after that build; production source was unchanged. This canary does not cover
every networking API. The launch plan records Lovable’s normal-build result and
the independently verified sync revision. Tests use fictional local data only.

Physical-phone interaction, actual screen-reader use, container execution and
the chosen deployed host remain separate open checks. Earlier all-ten-day
keyboard and enlarged-text evidence is preserved, not represented as rerun by
this wording-only task. Participant AI stays off and the project stays unpublished.

## Still required for the participant version

- Confirm the pilot scope, stable link, dates, final support contact and realistic
  support availability; feedback recipients, storage and retention/deletion.
- Verify the actual host, provider/model, locations, technical/network/logging
  paths, retention/deletion/training/review terms and privacy request process.
- Install and verify real authentication/session and durable transactional-store
  adapters, then deliberately integrate the prepared approval/usage logic.
- Approve a specific model-test allowance, evaluate actual fictional outputs,
  obtain Carl’s substantive review and deliberately adopt/version the policy.
- Update the actual deployed AI notice/choice before activation; complete the
  existing privacy review and pilot/release gates. An AWS/Azure reply alone does
  not install a connection or authorize participant AI.

A useful subsequent offline task is to prepare the concrete durable-store and
session-adapter acceptance contract: transaction/recovery obligations, minimum
records and fictional integration checks, without provisioning a service or
pretending those adapters are installed. Do not replace the AI goal with an
authored-only pilot without Carl’s decision.

## Reference checks

Checked 4 October 2026:

- [OPC meaningful-consent guidance](https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/appropriate-handling-of-personal-information/collecting-personal-information-and-consent/consent/gl_omc_201805/): a plain-language review framework for information, recipients, purposes and consequences, not a determination of applicable law or compliance.
- [Canada 9-8-8](https://988.ca/) and [Public Health Agency of Canada support page](https://www.canada.ca/en/public-health/services/mental-health-services/mental-health-get-help.html): participant crisis-contact details. These services are separate from the pilot inbox; recheck before release.
- [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage): page sessions survive reloads/restores; no stronger deletion assurance is made.

The SRT source reading was targeted to its handoff, latest corrections and
Section 20, not claimed as a new complete scholarly review or clinical validation.
