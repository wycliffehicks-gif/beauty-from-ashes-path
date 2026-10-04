# Participant refusal and recovery preparation

4 October 2026, Toronto. Participant AI remains off; the app remains unpublished.

## Prepared behaviour

The reflection screen now uses a shared, bounded message and action policy.
It does not display raw errors, provider output rejected by validation, account
identifiers or implementation codes. A matching saved AI reflection retains
priority. The written reflection remains an explicit choice, including during
an interrupted request or an availability recheck.

| Reported outcome | Participant explanation and permitted recovery |
| --- | --- |
| AI off, not released or otherwise unavailable | AI is unavailable; use the written reflection. |
| Access not verified | Access could not be confirmed; offer an answer-free availability check and the written reflection. Expired and unapproved access are not distinguishable from this code. |
| Access/availability check unavailable | The check could not finish; offer an answer-free recheck and the written reflection. |
| Consent missing, invalid or stale | Read the current explanation and explicitly accept it. Acceptance does not generate a reflection. |
| Participant daily or total allowance reached | Explain the applicable allowance; offer the written reflection. Do not promise a reset time or refund. |
| Shared daily or total allowance reached | Explain the shared pilot allowance; offer the written reflection. Do not blame the participant. |
| Attempt already reserved or accounting state uncertain | Do not restart the request; offer the written reflection. A reservation is not proof of a completed or saved response. |
| Timeout, network rejection, provider exception or unknown completion | Completion cannot be confirmed; offer the written reflection without suggesting another generation. |
| Busy provider, rejected/incomplete/mismatched output or unknown failure | Show a fixed explanation and the written choice. No automatic replacement, raw exception or rejected response is shown. |

The pre-generation sentence also names the Scripture/spiritual-reflection
preference, matching the existing disclosure and actual request boundary.
Notice versions and the ten-day authored content are unchanged.

## Controller safeguards and limits

A generation refusal or an abandoned request's uncertain outcome is retained
for its exact request identity in memory in the current browser window.
Switching reflection modes or leaving the screen before the outcome arrives
does not make generation available again after that request settles.
Provider, allowance and uncertain-outcome holds cannot be cleared by a
successful availability check. Only a known pre-provider access hold can be
cleared by an explicit, successful answer-free check. Consent holds require
current local consent plus the explicit acknowledgement flow.

The existing pending-request deduplication, original waiting deadline, request
identity checks, invalidation and late-response protections remain. No new
browser persistence is added. Explicit clearing of the relevant local AI store
also clears local warnings; a cleared request's late outcome cannot resurrect
warnings or content, preserving the existing removal behaviour.

These in-memory holds are a user-interface safeguard, **not durable accounting**.
They do not survive a full reload and do not authorize bypassing a server
reservation by clearing data, changing answers or opening another browser.
Durable limits and real participant identity still require the selected cloud
integration and the [session/store acceptance work](SESSION_AND_STORE_ADAPTER_CONTRACT.md).

## Current route versus future integration

The current server endpoint and its activation gates are unchanged. The prepared
approved-participant/reserved-generation path remains dormant. Recognising its
`usage-*` codes in the interface does not connect that path or install a session,
database or cloud-provider adapter. Availability rechecks call only the existing
answer-free availability endpoint; they do not call generation or transmit the
day's selections.

No reflection-model calls, cloud provisioning, purchases, notification actions,
publication or participant messages are part of this preparation. SRT foundation
v0.7 remains draft, sample revision 3 provisionally accepted and candidate
instructions uninstalled. Carl's corrections, code-free ordinary entry, optional
choices, local progress and earlier keyboard/mobile repairs are preserved.

## Verification

The final local full suite passed **1,401 tests in 74 files**; installed
TypeScript and whitespace validation passed. The 56 focused checks (34 actual
controller checks with controlled hooks and stubbed endpoints, 3 policy checks
and 19 component checks with a mocked controller) are included in that total.
There are 24 additional checks relative to the preceding 1,377-test baseline.

Coverage includes answer-free rechecks with zero generation calls, consent
recovery without automatic generation, retained progress/preferences and saved
responses, refusal holds across modes/remounts, leave-before-settlement with
late success/refusal/rejection, and explicit clear without warning/content
resurrection. Existing pending-remount sharing and deadline checks remain.
Independent review identified and closed the abandoned-request retry gap and
the provisional-success warning masking a known validation refusal. Final
review found no remaining blocker in this bounded change.

These fictional simulations are not evidence from live cloud adapters, actual
screen readers or physical phones. No new portable-build browser pass is
claimed. The launch work plan records Lovable's normal build, the final
independently matched Lovable/GitHub revision and remaining release gates.
