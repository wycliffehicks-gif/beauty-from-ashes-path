# Independent review — scoped conversation UI fixes and status oracle

18 November 2026. Read-only review of current component/CSS/harness differences against v38, and the full hosted baseline JSON reports. No browser execution or app edit was performed by this reviewer.

The observed enlarged status box begins at y394.125 with height458, ending at852.125 in an844px viewport. Its solid2px focus outline is reported visible. Box overflow alone does not establish clipped words: padding can extend below the viewport after asynchronous content growth. The prior assertion required the whole noninteractive box within the viewport.

The corrected oracle specifically measures every rendered paragraph text range in the actual two-paragraph status component. It requires nonempty measurements, each text rectangle inside the viewport, the focused box's top/sides visible and the existing focus-visible/outline checks. The separate mode geometry checks still reject scrollWidth/clientWidth and scrollHeight/clientHeight clipping. All interactive controls retain the whole-control viewport assertion. No automatic focus movement was added, so intentional user focus remains preserved.

Independently extracted the actual new geometry predicate and checked six explicit synthetic samples: visible status text with lower padding outside passes; clipped lower text, clipped horizontal text, missing measurements, offscreen status top and offscreen interactive control all fail. Evidence: `voice-oracle-independent-check.json`. This validates the predicate's distinction only, not actual rendering, assistive technology or browser behavior. A complete new hosted run must still supply actual text ranges and screenshots.

Source fixes are narrowly scoped by conversation-ui/conversation-dialog classes, including Radix portals. Buttons may wrap and grow while their shared size minima and44px floor remain; switches are excluded from button growth. Dialogs gain bounded internal vertical scrolling without altering the existing focus trap. Forced-colour focus uses system Highlight outlines, and the switch thumb gets a system CanvasText border without disabling user colour adjustment. The shared Button/Dialog/Switch components are unchanged; no journey-specific selector or source/content is changed. VoiceControls adds only its scope class, with no action, focus, cancellation or provider semantics change. The focus harness's clipping/keyboard/media assertions remain intact.

No source-level blocker found. The switch-thumb correction and scoped CSS still require successful hosted observation; do not infer acceptance from this review. Actual text clipping remains a failure under the refined oracle, and the new content-based status check must not be reported as a UI behavior fix.

Reviewed source hashes (capture time; parent owns final freeze):
- `src/components/conversation-preview/VoiceControls.tsx`: `541a08af74577367846ac1dd28320ef215d8c8b855c23ba038dbb687232314ec`
- `src/components/conversation-preview/ConversationPreview.tsx`: `dc42b8086f2fbe2e712019a4ce164630b61bfb34aa77613b13d38e195db9ed71`
- `src/components/conversation-staging/StagingConsole.tsx`: `e7b79078d31603ad277358eb70636ee4b78b3069278f85033e8b7f9e4ecae21b`
- `src/styles.css`: `41b0dab167af44eaab0cd3665085309b30093f415ed4349876934b861d748231`
- `scripts/conversation-ui/check-voice-controls.cjs`: `54c3507a4a8976e039b4393c7c03493cb4489886f09a95c873c69638c5196933`
- `scripts/conversation-ui/check-focus.cjs`: `015d7ec0f3fc9c0a9ce34bab1d03128c838cf6140d7b89ef3faae39c0fdf4afa`
