# Continue here — BFA, 27 October 2026

Carl authorized continued GitHub work without Lovable credits and requested durable handoff markers. Preserve completed P0–P3b, the original v5 evaluation, dependency recovery, GitHub authorization and both prior offline P5 batches. This file and the P5 checkpoint are the repository resume source.

## Current batch

Starting GitHub/Lovable commit: `77366885552dba6c4652c62e831d408ad5811e29`. The commit containing this marker adds inactive controlled voice UI and its presentation model, a real-component/service/binding browser harness, and a proposed server/session contract. It also repairs authoritative pending-input reporting and active-unmute expiry/deletion races. The saved user handoff records the resulting commit and synchronization result after the push.

Verification: 464 conversation tests across 25 files (including 113 P5 checks), full strict TypeScript, production build and full lint for the seven changed/new code/test/harness files. Twenty-five actual Chromium checks pass with fictional deferred resources and freshly built CSS, covering lifecycle distinctions, failure/retry, selected-thread fencing, keyboard focus and 390px layout. Zero real provider/microphone calls. Prior 441-test/20-focus-check and 1,916-test full-app results remain historical evidence; do not add overlapping counts or call them reruns.

Detailed scope and limits: `p5-offline-lifecycle-checkpoint.md`. Evidence and hashes: `artifacts/conversation-eval/offline-validation-v5/verification.json`. Next implementation contract: `p5-server-session-contract.md` (a proposal, not approval or implemented server authority).

No application route imports the new voice UI, coordinator, controller or capture adapter. The controlled UI requires its future host to invoke actions synchronously and publish authoritative snapshots immediately and on settlement; pending button promises never replace input/cleanup evidence. No polling or automatic connection is introduced. Live voice and participant AI remain off; nothing published. No dependency, environment, auth/database or paid-grant changes.

## Next useful work without Lovable credits

1. Verify the current connected-branch head before editing; fast-forward only with expected-head protection.
2. Use the server/session proposal to design and fixture-test the concrete developer route and server admission/expiry/accounting boundary. Verify candidate provider capabilities in official documentation before committing to a live adapter; no provider or budget has yet been selected for voice.
3. Preserve distinct ownership and evidence for capture, playback, transport and provider termination. Unknown cleanup/accounting stays visible and blocks restart; cancelled/deleted work must not re-enter context. Prepare the physical-device/listener/assistive-technology acceptance cases without claiming they have run.
4. Keep the repository marker, detailed P5 checkpoint and user's existing handoff current after each batch.

AGENTS.md requires separate exact paid-test approval. P4 manifest approval/expiry remain null and its grant registry empty. The original v5 allowance is closed. General instructions to continue do not authorize a live paid run; no new permission is needed for ordinary offline GitHub implementation, review and tests.

## Separate AWS status

All six AWS Marketplace model agreements were verified cancelled. Full AWS account closure remains incomplete because its standalone closure page returned Site Unavailable. Amazon retail and Prime Video were not changed. This app's current direct-provider preparation does not depend on AWS; do not mix unrelated AWS retries into app work.
