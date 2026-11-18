# Focus/accessibility runner startup evidence — 18 November 2026 UTC

Status: **browser startup blocked; no UI assertion executed**.

The unchanged `scripts/conversation-ui/check-focus.cjs` was attempted once using
the newly available `/usr/bin/chromium`, the existing Playwright module and the
matching previously built production CSS. Both actual React component fixtures
bundled successfully: the runner reached `chromium.launch`, which occurs only
after its preview and staging bundle calls complete. `node --check` also passed.

The Chromium child launched, then aborted before returning a browser or creating
a context/page. The decisive diagnostic was:

```text
FATAL:chrome/browser/process_singleton_posix.cc:297
Check failed: . socket() failed: Operation not permitted (1)
process did exit: exitCode=null, signal=SIGABRT
```

An accompanying Chromium wrapper arithmetic warning and crash-handler ptrace
denial are preserved in the original log. The actual failure is distinct from
v36's missing executable/download problem. Binary availability did not establish
a usable browser runtime in this execution environment.

## Exact attempt

Working directory: `/workspace/scratch/500c5aa1eb33/v39/repo`.

```sh
BFA_PLAYWRIGHT_MODULE=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright \
BFA_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
BFA_UI_CSS=/workspace/scratch/500c5aa1eb33/v37/repo/.output/public/assets/styles-DuOMzkts.css \
node scripts/conversation-ui/check-focus.cjs /workspace/scratch/500c5aa1eb33/v39/focus-initial
```

Original stderr/stdout: `/workspace/scratch/500c5aa1eb33/v39/focus-initial.log`,
SHA-256 `c6cda3fa2edfcc971e55f61d1c52659ea684879842246457f7b071f9a98fc83e`.
The output directory contains the copied production CSS only. No screenshot or
browser `result.json` exists because launch precedes page creation and the
runner's page-level reporting block.

## Scope and source identity

| Input | SHA-256 |
| --- | --- |
| `scripts/conversation-ui/check-focus.cjs` | `96ae59ca9162db2e35d6981aa060e1001ae5e88bda00cb35ab8ae5d6f1c77c00` |
| `src/components/conversation-preview/ConversationPreview.tsx` | `82ea337206c5a873f8f665933def18a7fb5af7aad6a1088710a39ab18422e0c1` |
| `src/components/conversation-staging/StagingConsole.tsx` | `a043bd244937fa3b8d9f1ef559343f2d5ab638cd724d9df487b059c736f895da` |
| generated `styles-DuOMzkts.css` | `83f967bcb9eb8de6df69b5f08b191eb607fb0d33c7517b40c6ef94e3e1ef44f9` |

The planned 20 existing focus/layout checks and 19 additional mode probes remain
unrun in this attempt. There is no observed evidence here about controlled
root/body font enlargement, reduced motion, forced colours, keyboard traversal,
focus restoration, draft preservation, or Cancel/Keep/Stop/Retry reachability.
No UI defect was demonstrated, so no application component/style or harness
assertion was changed. No download, remote service call, account/settings
mutation, permission bypass or alternative native-browser probe was attempted.
The separate 37 native database cases remain unrun.
