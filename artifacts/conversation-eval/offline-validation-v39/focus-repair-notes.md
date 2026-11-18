# Focus/layout repair and hosted browser evidence

## Final confirmed result — supersedes the candidate status below

[Hosted job 134819148124, run 44309353470](https://github.com/wycliffehicks-gif/beauty-from-ashes-path/actions/runs/44309353470/job/134819148124)
passed **39/39 focus checks** on the final scoped candidate. The decoded actual
result, rather than only GitHub's job conclusion, has no page errors, blocked
requests, forbidden API calls or accessibility probe failures. Compact evidence
and input/screenshot hashes are in `focus-hosted-final.json`.

At a 390×844 viewport, controlled root/body fonts measured 16→32px and 18→36px;
visual viewport scale remained 1. Both enlarged pages measured exactly 390px
document width. The long enlarged dialogs stayed within x=32..358 and y=32..812,
with equal 324px scroll/client widths. Keyboard containment, restoration,
Cancel/Keep/Stop/Retry reachability, exact draft preservation and original button
minimum-size checks all passed. Reduced-motion modal animation/transition
durations measured 0.001ms. Forced-colour controls had actual solid 2px outlines
contrasting with their backgrounds, with automatic colour adjustment. Both
switch states had a visible 1px black system-colour thumb border on white, without
depending on shadows.

Three original retained PNGs were inspected through the image viewer:

- `focus_controlled-font-200-preview-finish-keep.png`: enlarged text and long
  button labels wrap within the narrow page, and the fictional unsent draft is
  still visible. This is a full-page image after Keep working closes the dialog;
  it does not itself show modal bounds or prove keyboard behavior.
- `focus_staging-390px-dialog.png`: the ordinary-size Delete confirmation fits
  within the page, with legible content and both Confirm delete and Cancel visible.
- `focus_forced-colours-staging-switch-focus.png`: the focused switch has a
  visible surrounding ring and discernible thumb. The PNG retains branded colours
  despite the recorded forced-colour media/computed-style observations, so it is
  not used as proof of the forced-colour palette. Those claims rely on the actual
  recorded media and computed styles.

Final generated CSS SHA-256:
`9295b83111acff9cd4658f72044be87acc49b8096a0e08a21abbbfa30b2b1af3`.
The claims remain scoped to the tested Chrome fixture, controlled font sizing
and emulated media, not native browser zoom, WCAG conformance, assistive
technology, real-device, authenticated staging or live-provider acceptance.

The local startup block in `focus-startup-evidence.md` remains an accurate record
of that local attempt. The separate public GitHub runner subsequently executed
the actual fixtures: run `44307873870`, job `134814036352`, source
`150730614b3b99cc31b34f2676407f58823018a0`, Chrome `157.0.8103.50`.
This is new browser evidence, not a reinterpretation of the blocked local run.

The complete focus result was recovered from prefixed ordinary job logs and is
summarized in `focus-hosted-baseline.json`. All 20 pre-existing checks passed;
six reduced-motion probes and the enlarged preview Retry/Stop probe also passed.
Twelve additional probes failed: five enlarged-layout checks and seven
forced-colour focus checks. Page errors, blocked requests and forbidden API
attempts were empty. The baseline freshly generated CSS hash exactly matched the
prior local generated CSS. Screenshot hashes were logged, but no PNG bytes were
emitted, so no screenshot inspection is claimed here.

The observed causes were concrete:

- At 390px with root/body font sizes doubled, staging's document width was
  457px and preview's was 604px. Long buttons retained `white-space: nowrap`.
- The enlarged staging navigation dialog had scroll/client widths 412/388px.
  The preview switch dialog measured top -11px, bottom 855px in an 844px-high
  viewport, and scroll/client widths 511/388px.
- Forced-colour focused controls had `outline-style: none` and `box-shadow: none`.
  The existing shadow-based utility focus ring therefore supplied no visible
  outline.

The candidate adds explicit conversation-only scopes to the preview/staging
mains and their Radix portal content. Scoped styles let button labels wrap and
their heights grow, limit dialog dimensions and permit internal vertical
scrolling, and supply a system `Highlight` outline in forced colours. Switch
geometry is excluded from the wrapping rule. Generic Button/Dialog components,
content/policy wording, focus/lifecycle logic and harness assertions are unchanged.
The VoiceControls owner also uses the shared conversation scope for its separately
observed forced-colour defect; that component's changes are documented separately.

Local production build passes, producing `styles-B8AAdSv6.css` with SHA-256
`d4a83921f99281639a3b59abd3d1716e50d1e28c60c7b12d8d2afc13f92f9376`.
Scoped semantic lint exits successfully with zero errors and four warnings at
unchanged existing StagingConsole hook locations. Unrelated formatting/hooks were
not changed. Hosted rerun is still required to establish that these candidates
resolve the observed browser failures; build/lint alone cannot establish that.

This fixture evidence is not native browser zoom, WCAG conformance, screen-reader
or physical-device acceptance, authenticated staging, or real voice/provider
acceptance. Controlled font sizes and emulated media retain their stated limits.

## Second hosted observation and remaining correction

Job `134816684481` executed the first scoped candidate and passed **38 of 39**
focus checks. Both enlarged pages now measured 390px scroll width in the 390px
viewport. Enlarged portals fit within bounds and their scroll/client widths
matched. All seven prior forced-colour focus failures passed with an actual
system-colour solid outline; the checks still require visible keyboard focus,
contrasting outline/background and automatic forced-colour adjustment.

The remaining probe reached a previously unobserved switch appearance check:
track and thumb backgrounds were both white, thumb border width was zero and
shadow was none. This now demonstrates a real loss of the visible switch thumb.
`focus-hosted-second.json` preserves the compact actual result.

The next candidate adds only a scoped forced-colour `1px solid CanvasText` thumb
border. It leaves user colour adjustment enabled. The existing probe is
strengthened to check both unchecked and checked states through keyboard input;
no assertion is removed or weakened.

The scoped `height: auto` rule also now retains the shared Button's h-8/h-9/h-10
size as a corresponding 2/2.25/2.5rem minimum, together with the existing 44px
ordinary-size target floor. The w-9 icon size retains its 2.25rem minimum width.
This protects the original target sizes while allowing long labels to expand.
Keyboard evidence now records and checks these original minima.

The final candidate passes production build, Node syntax and full focus-harness
ESLint. One initial formatting-only lint diagnostic was corrected and retained
outside the repository. It still requires a hosted rerun; **38/39 is the actual
latest observed focus result at this point**, not a claim that the final candidate
has passed.

- Styles SHA-256: `41b0dab167af44eaab0cd3665085309b30093f415ed4349876934b861d748231`.
- Focus harness SHA-256: `015d7ec0f3fc9c0a9ce34bab1d03128c838cf6140d7b89ef3faae39c0fdf4afa`.
