# Native PostgreSQL acceptance — 18 November 2026

The corrected hosted `database` job **134816683992**, run **44308642352**, at source commit `8bb6d096b1e02830d6ef93925804b9e2d409c627` passed all **37 native cases**: 12 admission, nine capacity, and 16 v2. This is actual separate-backend PostgreSQL execution, with preserved per-case evidence. It also passed the four existing sequential/role suites: 57 + 145 + 129 + 116 = **447 assertions**. Those assertions are separate from the 37 native-case count.

Execution used Ubuntu 24.04, PostgreSQL 16.15 and Bun 1.4.4. The existing guarded runner created a new nonroot, Unix-socket-only disposable cluster; the database was `bfa_p5_offline_fixture`, with fictional fixtures. The accepted result records successful server shutdown and removal. The `pg_ctl status` exit code 3 in the phase ledger is the expected no-server-running confirmation, not a cleanup failure.

## Initial diagnostic and correction

Initial job **134814036965**, run **44307873870**, passed the 21 legacy native cases and all 447 sequential/role assertions, then failed in the v2 phase. The bridge's driver-neutral catalog SELECT lacked a semicolon. Interactive psql buffered it, so the following GRANT was appended and produced a syntax error. The final server-version query then hit the dead observer and prevented the v2 report from being written. Individual v2 outcomes from that attempt are unknown; no zero-attempt or v2-pass claim is made.

Only `scripts/conversation-eval/p5-sql/v2_concurrency.py` changed in this lane: terminate the catalog query at the interactive call site, and capture server version before the cases so a broken observer cannot erase report assembly. The baseline source hash matched the initial hosted run exactly. All other query/start/scalar call sites were inspected for completed statement framing. SQL drafts, migrations, product code and deadlines were unchanged.

Reviewer-owned deterministic regressions use the actual Session framing and actual native driver/report code with explicit process/observer doubles. Both regressions fail the original module and pass the correction. The old 27 runner safeguards pass; the expanded runner suite reports 23 passes and four explicit local bridge skips because that local Bun runtime was absent. Those are process-double tests, not additional native cases. The corrected hosted native run separately executes the actual Bun bridge and records its version/hash.

## Evidence integrity

The corrected job emitted four complete gzip reports through `BFA_FILE` / `BFA_PART` console framing. All 14 chunks were assembled without gaps or duplicates. Every compressed byte length and SHA256 matched its emitted header before decompression. All decoded JSON is preserved under `native-134816683992/`, alongside the original gzip files and a shaped `verification.json`.

The preserved capacity evidence, v2 evidence, and v2 provenance validators pass again on the downloaded reports. All 30 installed source hashes match the frozen local source. The v2 module hash is `374dd1f4138c042ff11909a971a10212b96fdbb51f40e7bff061749620652728`. `extract-native-evidence.py` records the exact decoding and validation procedure; `native-134816683992-verification.log` retains its result. Full initial and corrected job logs are retained separately.

## What the individual cases establish

All 16 v2 cases retain exact original issuance/ownership identities, before-and-after committed state, distinct observer/worker backend PIDs and observed lock blockers. Parent and legacy revocation are exercised in both orders against issuance, proof registration and marking; exact close is exercised in both orders against marking. Original proof associations and selected single consumption are recorded.

Marker-first paths retain uncertain marked occupancy and the cumulative hold after later revoke/close. Revoke/close-first paths release only unmarked occupancy; the cumulative hold remains. The earlier committed accounting rows in all 18 tracked private tables remain unchanged.

The already-running legacy call is observed active with a live transaction and two locks after EXECUTE revocation, then completes. The contrasting drained case observes its exact tracked worker idle, with null transaction start and zero locks, before revocation. Both deny new legacy enabling calls and preserve exact cleanup. Their catalog baselines fail and their fixture-local candidates pass the unchanged catalog evaluator.

These observations establish the bounded fictional native fixtures only. They do not establish supported hosted Auth/session ownership/current policy/synchronous revocation, real issuer seal provenance for these SQL-native fixtures, all deployed workers draining, connected privilege/route cutover, actual provider/device acceptance or release permission. No connected SQL, real Auth/model/voice/microphone, participant activation or publication occurred in this lane.

## Repository evidence files

`native-result.json` is the complete final runner ledger; `native-concurrency.json`, `native-capacity-concurrency.json` and `native-v2-concurrency.json` are the complete individual case reports. They are compact JSON with unchanged parsed values. `native-verification.json` records transport hashes, source provenance and per-case summaries. `native-initial-result.json`, `native-initial-errors.json` and `native-initial-diagnostic.json` preserve the earlier failure separately. Compressed transport copies and full job logs remain in the working evidence directory; the complete structured ledgers are included here for Git history.
