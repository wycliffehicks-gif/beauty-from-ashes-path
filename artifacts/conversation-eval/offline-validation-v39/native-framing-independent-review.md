# Independent review — native v2 psql framing and partial-result retention

18 November 2026. This review follows the first hosted native attempt recorded in `native-job-134814036965.log` and its parsed JSON. It changes only two focused regressions in the existing `test_runner_v2.py`; the SQL agent owns the narrow `v2_concurrency.py` repair. No application/SQL-policy, original driver, old test, account, environment setting or remote record was changed by this reviewer.

## Observed defect and narrow repair

The hosted PostgreSQL log shows the unchanged driver-neutral catalog SELECT immediately followed by a GRANT in the same SQL statement. The SELECT did not end with a semicolon, so interactive psql reached the Session echo marker without executing it. Its scalar call had no result; a later GRANT completed the buffered statement and caused a syntax error. With ON_ERROR_STOP, the observer process exited. The terminal report then queried that dead observer for server_version and raised BrokenPipeError before writing the accumulated v2 cases.

The source repair adds a statement terminator only at the interactive psql call boundary, preserving the shared catalog query and evaluator. It captures server_version before the cases, so final report construction does not need a live observer. A failed case still fails; no fallback session, retry, fabricated lock evidence, recovered acceptance or weakened cleanup is introduced. Other complete scalar/query/start call sites were checked by the source author and already terminate their SQL.

The hosted attempt's 21 legacy cases and confirmed cluster cleanup remain separate evidence. Its missing v2 report cannot establish accepted v2 case counts; this review does not manufacture such results.

## Two focused regressions

1. `test_catalog_select_executes_before_interactive_psql_echo` extracts the actual reviewed SELECT and invokes the real `V2Driver.catalog_report` through actual `Session.start/finish/scalar` code. An explicitly fictional stdin/queue simulates only the statement-before-echo boundary. The test proves the SELECT receives its result before a separate subsequent command and the evaluator receives the exact parsed catalog. It starts no process and executes no SQL.
2. `test_failed_observer_retains_completed_cases_and_failure_report` uses the real `main` and per-case `run` with explicit synthetic observer/worker doubles. Fourteen synthetic successes precede the observer-loss case and a subsequent broken-pipe case. The report retains all sixteen names, both precise errors, 14/2 synthetic counts, the previously observed server version, retained=false and deployable=false. Every owned worker and observer closes; outer validation rejects this failed evidence. These numbers are process-double behavior, not native cases.

The first local regression attempt exposed an incomplete test double: the observer lacked its PID and the synthetic cases lacked the required worker identities. That test-only setup was completed without changing production guards. The original diagnostic is preserved in `native-reporting-regressions-initial-diagnostic.log`.

Both completed regressions were then run against an isolated copy containing the untouched v38 module (SHA-256 `2d1ea49a2011fefe573b77e9b49363ba9cb5b66febe6b6c1028fe8d388bfa007`). Both fail for the observed reasons: empty scalar result and terminal BrokenPipeError. Evidence: `native-reporting-regressions-baseline.log`. The same tests pass against the repaired module: `native-reporting-regressions-fixed.log` (2/2).

## Final local checks

- Unchanged legacy guard/process-double suite: 27/27 pass, no skips (`native-legacy-guard-review.log`).
- Updated v2 guard/process suite: 27 discovered, 23 pass, four actual Bun bridge checks explicitly skip because BFA_P5_BUN_EXECUTABLE was not configured (`native-v2-guard-review.log`). Do not describe this as 27 executed passes.
- Two focused regressions are included in those 23 passing v2 cases; the separate focused rerun overlaps and is not an additional unique total.
- Python compilation passes. No local database, native PostgreSQL setup or real Bun bridge execution was performed by this review.

No remaining blocker found for the narrow source repair. Actual hosted rerun, complete native case/report validation and confirmed cluster cleanup remain necessary before reporting the v2 suite passed. A failed or incomplete run must stay failed even if some case evidence is retained.

## Frozen source identity

- `scripts/conversation-eval/p5-sql/v2_concurrency.py`: `374dd1f4138c042ff11909a971a10212b96fdbb51f40e7bff061749620652728`
- `scripts/conversation-eval/p5-sql/test_runner_v2.py`: `c1930e5992c12d5cd918f260b2c7ef66bfe8fc2c473bc3bb4e2bd05a0a90ec73`
- `scripts/conversation-eval/p5-sql/test_runner.py`: `ea83ca8b2f625b06acfc543efbd4a4a963d4a25488a694e543acef83ff833b7b`

## Final explicit-Bun rerun

The parent's already installed Bun was supplied explicitly through BFA_P5_BUN_EXECUTABLE: `/workspace/scratch/205dbad31641/p5-rpc-work/test-tools/node_modules/@oven/bun-linux-x64/bin/bun` (version `1.4.4`, SHA-256 `10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235`). No runtime was downloaded or installed. On unchanged frozen source, the old guard suite passes **27/27 with zero skips** (7.829s), and the updated v2 suite passes **27/27 with zero skips** (9.754s). The latter includes all four actual local Bun bridge checks as well as the two new process-double regressions. Logs: `native-legacy-guard-review-final.log` and `native-v2-guard-review-final.log`. These 54 checks are not native PostgreSQL execution. The earlier skipped run remains diagnostic history, not the final result.
