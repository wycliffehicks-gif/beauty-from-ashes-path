# Built-app browser checks — 4 October 2026

## Scope and evidence

This pass continues the cloud preparation at GitHub baseline
`03bea3a29c47e7c110fee75d96d873c3e76155bb`. It uses fictional choices in fresh
browser contexts, with participant AI off and the project unpublished. It is
not a participant pilot, model-quality evaluation, physical-phone check or
verification of the eventual AWS/Azure host.

The normal Lovable production build succeeded. `vite preview` could not run
that Cloudflare-targeted output. A local-only Wrangler/workerd simulator then
served the real built app at `http://127.0.0.1:4179`; no login, cloud resources
or deployment were used. Chromium 141.0.7390.37 and Playwright exercised the
app. The browser test reported external requests blocked (a Google Fonts
request was attempted). Local runtime warnings about two skipped startup
imports limit equivalence with hosted production; they need exact attribution.
The temporary Wrangler log was no longer available in the final pass, so the
two filenames could not be recovered. The later Node check below uses the
portable package directly and does not depend on that simulator.

## Observed before the focused repair

- Home, onboarding, Days 1–2, Settings and Practices loaded without fatal page
  errors. Ordinary entry requested no access code.
- Fictional Day 1 coded selections survived Home and reload. Continue restored
  the saved screen. The spiritual preference stayed on after reload and the
  selections remained. The authored reflection appeared without a Generate
  button. No saved AI response appeared; this was not a seeded stale-AI-response
  invalidation test.
- At 320/360/393-pixel widths with 200% root-font size, the tested final Day 2
  choice and navigation controls were usable. A Day 2 practice list at 393px
  produced a confirmed 34px horizontal overflow. Its long flex-item text did
  not receive the existing reflow rule, which was limited to a 24rem viewport.
  Apparent sticky-dock overlap required a separate scroll/reachability check.
- The real production app registered `/sw.js`, activated `bfa-shell-v2` with
  root scope and became controlled after reload. Observed cache entries were
  the home shell, manifest, favicon and hashed assets. The observed read-only
  server-function requests and query-bearing addresses were absent from that
  cache inventory. This does not substitute for the existing boundary tests.
- After warming online and stopping the local server, Home, Day 1, Settings
  and `/journey` displayed the connection/access-check message. Saved state
  was not cleared. A cached shell does not provide the full offline journey:
  the current entry check still needs the network. Settings already asks
  participants to stay online during the pilot. Keep that instruction.

## Focused repair

Move the existing journey-list reflow rule outside its viewport media query;
leave the narrow-phone chrome/dock rules in place. Keep text wrapping instead
of clipping, hiding overflow, shrinking type or changing authored content.
Remove the obsolete words “without a code” from the connection-error support
sentence, preserving all access-check logic and the code-free ordinary entry.

The first repair synced as `f4e6e664cb9ae93f66220359af12560d21482aad`.
It passed Chromium checks at 320/360/393/430/768/1280px, normal and 200% root
text, with zero horizontal overflow and working tested choices/controls.
TypeScript, the normal build and all 1,265 existing tests passed.

That pass also confirmed a second usability defect: at 320px/200% the sticky
question dock grew to about 350px and split “Continue” across several lines.
Controls remained clickable, but the large bar crowded the reading area.

A focused follow-up adds a named inline-size container to the existing day
shell. When its content width is at most 16 times the current root font size,
the navigation becomes full-width rows in document flow. The hint remains
full width and the empty placeholder is removed; text is not reduced. The
ordinary 320px layout has about 280px content width versus a 256px threshold,
so normal-size sticky navigation remains. An `em` query was deliberately
avoided because the inherited body font is fixed at 18px.

The exact follow-up source was built outside Lovable with Node 24.19.0 and
Bun 1.3.3. HTTP smoke again passed five pages, eight assets, two actual AI-off
RPC refusals and zero child global-fetch attempts. A prebuilt verification
archive was prepared for the installed browser environment; no managed build
markers are changed to generate a Node target inside Lovable.
Archive SHA-256:
`340f2d7376d74e443d41f6378e5e18d3a992fe6c6e1e9ba1b43debcb1e10a58f`.
## Portable Node browser result and final source

The supplied archive hash and all 87 provenance file hashes matched. Its
server entry hash was
`1acf08f2402d7c66edb1ce0a48fab59de55c2a8779ccb303c7239d8b3a2f6f97`.
The exact prebuilt package ran on installed Node 22.22.0, listening only on
`127.0.0.1:4179`, with a fresh fictional browser context and external requests
blocked. It was built with Node 24.19.0 outside Lovable; this browser pass does
not verify the Node 24 container image. The temporary server was stopped.

| Check | Observed result |
| --- | --- |
| Enlarged text | At 320/360/393/430px with 32px root text, the container content widths were 240/280/313/350px. The dock was static and single-column; Continue stayed on one visual line. Horizontal overflow was 0px. |
| Ordinary text | At 320/393/768/1280px with 16px root text, the existing sticky two-column dock and one-line Continue remained; horizontal overflow was 0px. |
| Reading and controls | Headings and final choices could be scrolled clear. Final choices and navigation buttons were clickable. This is emulator evidence, not a physical-device or screen-reader check. |
| Saved progress | Three fictional Day 2 choices persisted. Reload and resume returned to `/day/2?s=practise`. No Generate button or AI storage appeared. |
| Real app worker | `/sw.js` activated and controlled the root scope after reload. The observed `bfa-shell-v2` inventory contained no server-function, API or query-bearing URLs. |
| Regression checks | Installed TypeScript and the normal Lovable production build exited 0; all 1,265 tests in 68 files passed. Generated route metadata was restored. |
| Release state | All three workspace AI flags were absent/disabled. Project metadata reported ready and unpublished. No provider calls, purchases, provisioning or participant messages occurred. |

The final application revision independently fetched from GitHub main is
`bf2fa23f9e939f7a4c8e166db7a5946a9db3c10e`. The two-file diff from `f4e6e66`
exactly matches the reviewed follow-up patch used for the portable build.
Authored content, public assets, default build configuration, dependencies and
lockfiles were unchanged. Documentation added after this revision records the
evidence without changing application behaviour.

## Remaining checks

- Actual container image build/run, including the intended Node 24 runtime.
- Chosen cloud's HTTPS, origin, session behaviour, access logs, secrets and
  outgoing-data checks with fictional information.
- Physical Android/iPhone: native text enlargement, touch, safe areas,
  keyboard, installation and return to the stable participant address.
- Screen-reader interaction and the later approved provider/model evaluation.

All source corrections, the SRT draft/provisional distinctions, the four-field
AI input boundary and participant-AI pause continue to apply. No offline-use
promise, broader caching permission or AI release is introduced by this work.
