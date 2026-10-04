# Keyboard and page focus review — 4 October 2026

## Scope

This continues from GitHub `982b515f6acad4f23d2775dde0dc64a77aae8682`.
The review uses fictional browser information, with participant AI off and the
project unpublished. It covers keyboard operation and focus within the built
app. It is not a physical-device test, screen-reader interaction study or full
accessibility conformance assessment.

## Focus repairs

The existing day screens already track genuine client transitions and focus
their ready heading. General pages and the first client entry into onboarding
did not share that handling. The new `usePageFocus` hook uses the same transition
record, with an explicit identity owned by the content actually rendered.
It waits for the router to settle and for page-specific readiness. In
particular, Home waits for stored progress and does not focus a temporary
loading surface.

The hook is attached to Landing/Home, Settings, Practices and its detail page,
Support, Shifted, shared legal pages and onboarding. It does not consume focus
inside admission/agreement holding screens. It leaves ordinary direct document
loads alone and suppresses intermediate onboarding history entries once
acceptance starts. Day/resume readiness and the reflection's separate focus
ownership remain unchanged. There is no unconditional root focus effect.

The inline Clear or restart confirmation now focuses **Keep my journey** when
opened. Keep or Escape inside the confirmation returns focus to its original
trigger. The group is labelled by its existing question. It remains an inline
confirmation, with no modal role or focus trap. Its text and actual clearing
operation are unchanged.

The shared day shell and onboarding main now also handle keyboard focus that
would be hidden by the sticky dock. After native focus scrolling, a one-shot
animation-frame callback rechecks the exact connected, active, keyboard-visible
target and measures its overlap with the currently visible sticky dock. It
scrolls only the necessary distance with eight pixels for the outline, limited
so that a tall control is not pushed farther above the viewport. Targets without
`:focus-visible`, static docks, unobscured targets and stale callbacks do
nothing; tested pointer clicks remain stationary. This focus
repair changes no CSS or existing sticky/static layout rule.

Question-choice lists now sit within a group labelled by their existing prompt
and described by their existing hint. Their list semantics, native toggle
buttons, optional deselection, selection limits, stored values and wording are
preserved. There is no conversion to radios or new arrow-key selection model.

## Local verification

- Five lifecycle regressions exercise the actual hook with controlled router
  states and effect commits: hydration, pending navigation, repeated effects,
  same-page invalidation, onboarding history collapse and reused legal pages.
  They are not browser or screen-reader tests.
- Eleven additional handler cases cover measured overlap and the mouse/static/
  stale-focus/no-overlap/tall-control boundaries using controlled DOM geometry.
- Final focused handler/lifecycle/transition/onboarding/selection regression:
  **172 tests in five files**. An earlier navigation/resume/removal pass also
  passed 60 tests; those runs overlap.
- Complete regression: **1,361 tests in 72 files**. The focused and new tests
  are included in that total, not additional to it.
- Installed TypeScript and `git diff --check` passed. Independent source review
  found no remaining blocker after adding the router-idle guard against an
  outgoing page consuming focus meant for the incoming page.
- Node 24.19.0 / Bun 1.3.3 portable production build passed. Generated route
  metadata was restored. HTTP smoke passed five pages, nine hashed assets,
  manifest/worker files and both compiled AI-off refusals, with zero child
  global-fetch attempts. This does not establish every possible network path.
- At the keyboard-source revision, authored content, selection/storage rules,
  reflection generation, AI modules, dependencies, public assets, CSS and
  hosting configuration are unchanged. The later narrow CSS follow-up is
  identified separately below.
  Day markup gains only the question grouping; the shared shell gains the
  focus-clearance handler without changing its focus-ownership algorithm.

## Browser evidence

### Before the repair

Lovable's read-only audit used its normal production build (exit 0), served
locally by Wrangler 4.76.0 at `127.0.0.1:4179`, with Chromium 141.0.7390.37.
Fresh isolated contexts contained fictional choices only. External requests
were blocked; Google Fonts was the only observed external attempt. No
notification permission was granted and no page errors were reported. The
server was stopped and the generated route file restored to baseline.

At 1280×900, Day 1's question “As you sit down with this…” reproduced a fully
obscured keyboard target: after six Tabs, “Steadier than usual” occupied
vertical coordinates 798–855 while the sticky dock began at 798. The next
answer was similarly hidden. The same class of obstruction affected question,
practice, step and closing controls across the ten days, including normal-text
320×640. At 320×800 with 32px root text, the existing static dock avoided this
obstruction. Manual reachability alone had not caught the keyboard problem.

Opening the clear confirmation and cancelling it both left focus on BODY.
Returning Home from a day closing screen also left focus on BODY. Existing
in-day stage changes and Home-to-Day entry focused the new heading correctly.
All ten days could be completed with keyboard input despite the obstruction.
Onboarding, agreement checkboxes, Settings spiritual switch, practice expanders
and access to Home/Journey/Settings/Practices/Support/Important Information/
Privacy/Terms/Resources were exercised. No Generate button or horizontal
overflow was reported in that audit.

The audit also noted unnamed question-choice groups; the patch adds their
accessible question association while preserving native toggle buttons. A lack
of radio-style arrow navigation is not itself a failure of that button pattern:
the existing optional selections can be deselected, and use Tab, Space and Enter.
No radio conversion or selection-rule change is part of this work.

A third segment of the native reminder time control produced an inconsistent
outline measurement. A bounded recheck on the already-running development
server found one Tab stop and a visible two-pixel whole-control outline at
desktop/light, narrow/light and desktop/dark settings; native arrow editing,
Tab onward and Shift+Tab return worked. That finding did not justify a source
repair. Because the original build output was no longer available, this was a
development check, not evidence that production behaves identically. The final
Node retest includes the control. No skip link and repeated links were
observations, not automatically established failures.

The simulator reported skipped startup imports for
`server/_ssr/prefs-CU763jGF.mjs` and `server/_runtime.mjs`. This supplies the
previously missing attribution; it does not erase the simulator's difference
from a real deployed host. The final retest uses the separately built Node
package to avoid relying on that simulator alone.

### After the repair

The exact prebuilt Node archive was produced from local source
`8384d72d230b343598c9597bee4d2b247a024148`, based on `982b515`, using Node
24.19.0 and Bun 1.3.3. It contains 90 provenance file hashes, including the
reviewed 16-file source patch and the AI-off launcher. Archive SHA-256:
`d0089ebdeb8f2c605bd4d3cf01e20758d74de22b9fa6579ad803bad57b70d530`.
Server-entry SHA-256:
`f6cfd4a0192785442d8dc46932fbd35bc80790cc6a89a8db65024baba5d3954d`.

The archive, all 90 file hashes and the server-entry hash matched in Lovable.
The exact package ran under installed Node 22.22.0 at `127.0.0.1:4179`, with
fresh fictional contexts in Chromium 141.0.7390.37. It was built with Node
24.19.0; this does not establish the Node 24 container image. The server was
stopped after the pass. All external requests were blocked; the only observed
attempts were 11 Google Fonts requests. There were no page errors.

| Check | Observed result |
| --- | --- |
| All ten days, normal text | Every stage was traversed with the keyboard at 1280×900 and 320×640. No focused control overlapped the dock after scrolling settled, including Shift+Tab back from the dock. Days 5–10 remained available through Continue the journey. |
| Original Day 1 defect | “Steadier than usual” measured 720–777 with dock top 785 on desktop, and 460–517 with dock top 525 at 320px: eight pixels of clearance in both. |
| Question choices | Each day exposed 3–4 groups named by their question. Space and Enter selected and deselected existing native toggle buttons. |
| Enlarged-text layout | Day 2 at 320×800/root 32px retained its static, full-width, single-column dock and no horizontal overflow. Normal text retained the sticky two-column dock at 320/1280px. |
| Pointer and expansion | A real press/release toggled the lowest visible answer without moving it or scrolling the page. Show me how opened/closed with Enter, Space and pointer input, updating its expanded state. |
| Page navigation | Settings, Support, Privacy, Terms, practice detail, Back to Practices and every closing-to-Home transition focused the new main heading. Direct loads/reloads did not focus a heading. Saved Day 2 resume and browser Back/Forward focused the correct heading once. |
| Onboarding | Keyboard steps and Back/Forward worked; Space checked both agreements. Begin focused Your Journey, and browser Back after acceptance stayed on Home. The existing opening splash remained nonfocusable for about three seconds before ordinary focus worked. |
| Clear confirmation | Enter focused Keep my journey. Keep and scoped Escape each restored the original trigger. The group used the existing question as its name; saved progress was retained, and deletion was never confirmed. |
| Production reminder control | The whole native time input showed a visible two-pixel navy/light or gold/dark outline at desktop and narrow widths. Native segment navigation worked with Tab/Shift+Tab. No reminder was enabled, permission was not granted and no notification was sent. No reminder-style repair was needed. |
| Saved content and AI | Saved answers and the Scripture preference survived reload. Authored reflections appeared and no Generate button appeared. All three workspace AI flags were absent/disabled; the project stayed unpublished. |

Lovable also passed installed TypeScript, all **1,361 tests in 72 files** and
its normal production build. Generated route metadata was restored. GitHub
`939c5d3b8b6a5519dc0efd9e80f1b86efde86abc` was independently fetched and its
complete tree exactly matched local source `8384d72`. No verification notes
or build artifacts were included in that application sync.

### Narrow enlarged-text follow-up

The final pass additionally found a pre-existing 34px horizontal overflow on
Day 4's understand screen at 320px/root 32px. Its expandable term heading
“What is overfunctioning?” contains a word longer than the available width.
The existing general long-word rule omitted `summary` elements. A scoped
`.journey-main details > summary { overflow-wrap: anywhere; }` rule adds
wrapping when necessary, with no wording, font-size, spacing or dock change.
Independent source review found no blocker. The separate portable build and
HTTP smoke passed again: five pages, nine hashed assets, manifest/worker files,
both compiled AI-off refusals and zero child global-fetch attempts.

This one-file CSS follow-up is local source
`4fa0d2ed041b5a6593c5b689eaa9806203a24bfa`, based on the verified `939c5d3`
tree. Its rebuilt archive SHA-256 is
`26b59f050544b9ed783794027047af7ba5c69928184a0142bdfddb0544442821`, with
91 provenance file hashes; server-entry SHA-256 is
`ef35b4459879e0f8258573d6de3c4bb776bb396211b2da2017e6d0ac2e7d1b55`.

All archive/patch/server/provenance hashes matched. Lovable's normal build
passed and generated route metadata was restored; no full-suite or TypeScript
rerun was needed for this CSS-only declaration. The exact supplied package
ran under Node 22.22.0 and Chromium 141.0.7390.37 on loopback only.

- Day 4 at 320×800/root 32px: document width was 320/320px both closed and
  open. The heading measured 158px wide with right edge 239px, within its
  240px disclosure. Its text wrapped fully; Enter opened and Space closed it.
- Day 4 at ordinary 320/1280px: document widths were 320/320 and 1280/1280px.
  The native disclosure remained intact and keyboard-operable. Sticky dock
  columns remained 134+134px and 313+313px respectively.
- Day 2 practice/closing at 320px/root 32px: document width remained 320/320px;
  the dock stayed static, single-column and 240px wide; Continue stayed on one
  visual line.
- Day 1 normal 320px: the original Steadier than usual target retained 8.27px
  dock clearance after focus settled, with working Space select/deselect and
  no overflow.

There were no page errors. Ten Google Fonts attempts were blocked and no other
outside traffic was reported. The temporary server stopped; all three workspace
AI flags remained absent/disabled and the project stayed unpublished. No
notification, model call, purchase, provisioning or participant message occurred.

Final application GitHub revision
`5ada000f690be3c0b13b0fc7c3f54f0dc1c1cce1` was independently fetched and its
complete tree matched local `4fa0d2e`. Only `src/styles.css` differs from the
verified keyboard application revision `939c5d3`. The later documentation
sync records these results without changing application behaviour.

## Guidance and remaining boundaries

The review uses the W3C explanations for keyboard operation, logical focus
order, visible focus and focus not being obscured. These guide targeted
checks; passing this work does not establish whole-app WCAG conformance.

- https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html
- https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html
- https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
- https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
- https://www.w3.org/WAI/ARIA/apg/patterns/button/
- https://www.w3.org/WAI/tutorials/forms/grouping/

Physical Android/iPhone checks, actual screen-reader interaction, the container
image and the eventual cloud host remain separate verification tasks. The
existing stay-online pilot instruction, draft/provisional source distinctions,
AI release requirements and November 30 target remain unchanged.
