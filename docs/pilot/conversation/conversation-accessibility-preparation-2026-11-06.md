# Conversation accessibility checks — prepared, browser execution unavailable

6 November 2026, America/Toronto. Starting checkpoint: `1071a5259416c13ad7dabd08af3cf2e53c8682fe`, tree `47c53500349ae467a6321bfc844be22710957280`.

The two existing offline harnesses now prepare the enlarged-text, reduced-motion and forced-colour checks left unverified in `p2-preview-checkpoint.md`. **No new or existing browser check ran in this batch. No rendering defect or successful accessibility result is established.** Application components, styles and content remain unchanged.

## Existing fixtures extended

- `scripts/conversation-ui/check-focus.cjs` bundles the real conversation preview and fictional staging console. New cases cover narrow enlarged dialogs, keyboard containment and focus restoration, exact draft preservation, media preferences and reachable controls.
- `scripts/conversation-ui/check-voice-controls.cjs` bundles the real inactive VoiceControls, conversation service and voice binding with fictional resources. New cases cover long current labels/statuses, narrow layout, keyboard actions and shutdown/retry states under the same display modes.

Both retain their prior behavior checks. Production CSS is required for the new visual checks; empty or absent styles must fail rather than silently skip layout assertions. Reports retain the supplied CSS identity, actual computed fonts, viewport scale, media state and control geometry. A hash identifies supplied CSS; it does not prove that an arbitrary caller rebuilt current source. Rebuild immediately before future execution.

Controlled root-font enlargement doubles rem-based text. The source body size is fixed in pixels, so a separate root-and-body enlargement mode doubles the observed body size too. Reports distinguish those methods and require viewport scale to remain one. Neither technique is native browser text zoom, pinch zoom or proof of screen-reader/WCAG conformance.

Reduced-motion checks require the actual media preference and computed animation/transition behavior. Forced-colour checks require actual media state and usable keyboard focus, including an outline rather than a shadow-only indication. Future screenshots must be inspected alongside these measurements.

These fixtures intercept external transport, use fictional Auth/service/provider resources and reject real microphone access. They are not application routes or shipped bypasses. External web fonts are not loaded: future local fixture results use fallback fonts and cannot establish full hosted-route typography or physical-device behavior.

## Validation performed and concrete blocker

The production client/SSR/Nitro build passes. Its generated stylesheet is 103488 bytes, SHA-256 `83f967bcb9eb8de6df69b5f08b191eb607fb0d33c7517b40c6ef94e3e1ef44f9`. Harness syntax, scoped lint and actual esbuild bundle composition can be checked without launching a browser; the exact results and independent review are in `artifacts/conversation-eval/offline-validation-v36/`.

The installed Playwright package has no local Chromium executable. One normal official browser installation attempt failed: its archive response was not a ZIP, followed by an installer lock failure. A bounded diagnostic of that same URL returned HTTP 200 with a 195-byte HTML “Site Unavailable” response. This describes the current environment's download result, not the app's accessibility or general availability of the vendor site. A capability-only cloud-browser fallback lacked the media/viewport/harness controls required for equivalent evidence. No account/app page was opened and no substitute rendering pass is claimed.

No further setup retries, browser runs or screenshots occurred. Source inspection points to possible fixed-size button or tall-dialog issues, but these remain inspection targets. No speculative component/style repair was applied. All application source is preserved, so the previously completed ten-day journey enlargement work was not replayed.

## Exact continuation

Once a usable existing Chromium executable is confirmed, verify GitHub head/intervening changes and rebuild current production CSS. From the repository root, run the same two scripts with an installed Playwright module, the fresh stylesheet and the existing browser executable:

```sh
BFA_PLAYWRIGHT_MODULE=/absolute/installed/playwright BFA_UI_CSS=/absolute/fresh/production.css BFA_CHROMIUM_EXECUTABLE=/absolute/installed/chromium node scripts/conversation-ui/check-focus.cjs /absolute/new/focus-evidence
BFA_PLAYWRIGHT_MODULE=/absolute/installed/playwright BFA_UI_CSS=/absolute/fresh/production.css BFA_CHROMIUM_EXECUTABLE=/absolute/installed/chromium node scripts/conversation-ui/check-voice-controls.cjs /absolute/new/voice-evidence
```

Inspect the resulting screenshots, computed evidence, keyboard behavior and retained drafts. Repair only reproduced defects, then rerun affected modes and old behavior checks. Shared global styling changes would require targeted journey regression; unchanged journey source does not justify replaying its completed audit. Do not repeat the unavailable download without new environment evidence or create another generic harness.

The P2 accessibility items remain unverified. All 37 prepared native concurrency cases remain unrun. Hosted Auth/current-policy/revocation guarantees, deployed quiescence, runtime wiring and real provider/device acceptance remain separate prerequisites. AI/live voice remain off; v2 remains inactive/nondeployable. No connected SQL/settings, real Auth/model/voice/microphone call, paid edit, purchase, activation or publication occurred.
