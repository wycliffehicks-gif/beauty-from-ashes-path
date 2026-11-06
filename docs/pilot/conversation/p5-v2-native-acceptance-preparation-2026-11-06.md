# P5 v2 native acceptance preparation

6 November 2026, America/Toronto. Starting source checkpoint: `c3f18371d120429d10282b24a8e5face4f1937fd`, tree `f4333d6e23702af8bb7b4f37ed9f415063715231`.

**All 16 new native cases are prepared and unrun. The existing 12 admission and 9 capacity native cases also remain unrun.** Process doubles, an actual local Bun stdin/stdout bridge and sequential PGlite smoke checks do not establish independent-backend contention, native drain, hosted Auth or provider/device acceptance. No native setup probe, native PostgreSQL execution, connected SQL, route, participant activation or publication occurred in this preparation batch.

This additive path uses the existing nonroot, fresh disposable PostgreSQL cluster runner. Default execution remains the original admission path; `--capacity` remains the original capacity extension. Explicit `--v2` implies capacity and additionally requires an explicit absolute existing Bun executable via `--v2-runtime`. It never discovers, downloads or installs a runtime and never accepts a supplied database DSN, external host or existing socket. The child concurrency module is an internal component of the owned runner, not an alternative way to select a database.

## Future guarded invocation

These commands describe the prepared interface; they were not executed against native PostgreSQL in this batch:

```sh
python3 -I scripts/conversation-eval/p5-sql/run-local.py --v2 --v2-runtime /absolute/installed/bun --pg-bin /absolute/postgresql/bin --output /absolute/new-native-v2-evidence
```

Adding `--preflight` checks the existing files, literal case inventories, explicit binaries and nonroot prerequisite, records hashes, and starts no child processes. Preflight readiness is not database acceptance. An absent/nonexecutable runtime, missing source, root process or malformed inventory fails before cluster creation. The paired v2/runtime flags are required together; supplying a runtime on the default path is rejected.

The existing runner creates a new private temporary cluster and socket, rejects commas that could enable libpq multi-host fallback, uses local trust only inside that owned fixture and rejects host authentication. PostgreSQL binds no TCP address. Child commands receive a clean explicit environment with empty libpq configuration paths, fixed fixture database/user and bounded timeouts. Existing shutdown behavior remains: attempt bounded shutdown even after a partial start or interruption, confirm the server stopped before deleting its directory, and retain the owned directory with failure evidence if shutdown is unconfirmed. The new v2 child also refuses root before constructing sessions.

## Installation and execution order

The runner retains the exact P3b 0000–0005 migrations, admission/capacity draft sources and old rollback assertion suites. On the v2 path only, it then installs the four preserved legacy read/session drafts plus seven completed v2 drafts in explicit dependency order. Those sources remain outside automatic migrations and unchanged.

An exact **22-table empty inventory** is checked before any committing race: four P3b tables, ten original voice tables, six capacity tables and two v2 sidecars. A missing table cannot hide behind a replacement table with the same count; any row remaining at this stage fails. Then the unchanged 12 admission and 9 capacity native cases run, followed by the 16 v2 cases. Privilege candidate revocation occurs only in the final two v2 cases, after the legacy cases. Prior committed accounting is snapshotted and must remain byte-equivalent as new independent fixture identities are added; no final blanket empty-database claim is made after committing races.

Exact installed additional sources:

- `p5-voice-reads.sql`, `p5-voice-preissue-read.sql`, `p5-voice-session-provision.sql`, `p5-voice-session-revoke.sql`.
- `p5-voice-v2-parent-issuance.sql`, `p5-voice-v2-preissue.sql`, `p5-voice-v2-current.sql`, `p5-voice-v2-cleanup.sql`, `p5-voice-v2-proof.sql`, `p5-voice-v2-capacity.sql`, `p5-voice-v2-mark.sql`.

The v2 native module imports the preserved capacity/base driver, Session, connection guards and bounded observation facilities. It creates no new application admission layer, Auth implementation or live-provider caller. Case identities, approvals, fingerprints and Auth metadata are fictional SQL fixtures; this suite does not run the real request-bound issuer/seal boundary. That separate real-crypto/full-service composition remains prior evidence.

## Prepared exact case inventory

Every case requires distinct observer and worker backend IDs, an actually observed PostgreSQL lock wait naming its holder, complete named assertions, exact committed before/after state and retained ownership metadata. Missing, reordered, partial, failed or cleanup-error evidence is rejected; totals alone cannot pass.

| # | Exact prepared case |
| --- | --- |
| 1 | parent revocation commits before waiting v2 issuance |
| 2 | v2 issuance commits before waiting parent revocation |
| 3 | parent revocation commits before waiting v2 proof |
| 4 | v2 proof commits before waiting parent revocation |
| 5 | parent revocation commits before waiting v2 marker |
| 6 | v2 marker commits before waiting parent revocation |
| 7 | legacy revocation commits before waiting v2 issuance |
| 8 | v2 issuance commits before waiting legacy revocation |
| 9 | legacy revocation commits before waiting v2 proof |
| 10 | v2 proof commits before waiting legacy revocation |
| 11 | legacy revocation commits before waiting v2 marker |
| 12 | v2 marker commits before waiting legacy revocation |
| 13 | exact close commits before waiting v2 marker |
| 14 | v2 marker commits before waiting exact close |
| 15 | legacy enabling call already running survives EXECUTE revoke |
| 16 | drained fixture candidate denies new legacy enabling calls |

Issuance cases carry no invented later proof or marker. Proof cases retain their exact original claim proof; marker and exact-close cases retain the separate inspect proof and full marker request. Original verification start, proof expiry, immutable issuance lifetime, parent association, claim/cleanup, attempt winner and accounting are asserted without renewal or refund. Legacy cutover cases explicitly retain `parentVersion: null`, with no v2 proof/marker; old records are not relabelled or adopted into v2.

The two cutover cases deliberately distinguish EXECUTE revocation from drain. A function already executing and waiting on an owner lock can finish after its execution grant is removed. The contrasting drained case first closes its fictional admission gate, waits for the exact tracked legacy worker to complete and commit, observes that worker idle with null transaction start and zero locks, then applies the candidate. Both require new legacy enabling calls to deny and exact cleanup to remain usable. This gate/drain covers only the known runner-owned worker set. It is not an operational deployment controller or proof that an actual hosted application's unknown workers have drained.

## Existing catalog preflight reused without duplication

`cutover-native-bridge.ts` imports the unchanged `cutover-inventory.ts` manifest, SELECT and evaluator. Its only interface is bounded JSON stdin/stdout: `describe` supplies that exact query/manifest, while `evaluate` evaluates the caller's catalog with the explicit fixture owner. Input is limited to 1 MiB; malformed, oversized or unexpected input exits with a generic error and is not echoed. A catalog result always retains `deployable: false`.

The Python child invokes the explicit Bun executable with fixed `--no-env-file`, `--no-install` and one `--config=/owned/empty-bunfig.toml` argument, from an owned empty configuration directory. The environment excludes inherited runtime options and credentials, and disables telemetry. The known configuration has no preloads. Actual local bridge checks include a synthetic hostile dotenv/bunfig/preload control. The initial separated `--config`/path invocation was rejected by these checks and corrected; it had treated the empty TOML file as the entry point, producing empty stdout and failing to isolate the synthetic default preload. No repository environment file was read by the validation: the two bridge source files were copied into the owned temporary test directory.

The CLI choices are grounded in [Bun's environment-variable documentation](https://bun.com/docs/runtime/environment-variables), [runtime configuration reference](https://bun.com/docs/runtime) and [bunfig reference](https://bun.com/docs/runtime/bunfig), plus the actual local bridge checks. No package installation or native setup probing was used.

The runner hashes every installed source, the new module, preserved driver chain, existing preflight, new bridge and explicit runtime binary. The new native report's driver/bridge/preflight hashes and runtime path/hash must exactly match the runner's captured preflight values. Runtime name/version comes from the actual bridge response. Hash presence alone is insufficient. These are local source/provenance checks, not cryptographic attestation of a deployed host.

## Evidence semantics and limits

New result fields distinguish `nativeV2PhaseAttempted` from `nativeV2EvidenceAccepted`. The first is set before invoking the native child; the second only after the complete case report, identity/drain evidence, retained-accounting summary and source/runtime provenance pass. A failed or partial attempt cannot appear as an unattempted phase or an accepted result. Root refusal and preflight-only checks set neither. Process-double tests exercise these transitions using explicitly fake executables and reports; their success never means PostgreSQL ran.

The report must carry explicit protocol 2 and case inventory version 1, the exact ordered 16-case inventory, positive distinct backend IDs, observed blocker identities, immutable stage-appropriate identity/proof/marker data, before/after committed state, exact cutover event ordering and a complete retained earlier-accounting summary. It remains nondeployable. Case helpers themselves assert the SQL results and accounting; report structure cannot authenticate fabricated evidence.

Current validation and original diagnostics are recorded in `artifacts/conversation-eval/offline-validation-v35/`. The new `test_runner_v2.py` process/bridge checks are separate from unchanged `test_runner.py`; an explicit `BFA_P5_BUN_EXECUTABLE` is required for its actual local bridge cases, otherwise those cases clearly skip. No automatic runtime lookup occurs. Any sequential PGlite smoke verifies fixture SQL and source composition only, without native scheduling claims. The prior v34 2518/2518 application tests, 822 optional SQL cases, types/lint/build remain preserved historical evidence; this tooling-only batch does not relabel them as a fresh application run.

Supported hosted Auth ownership, effective current session policy and synchronous revocation/current-state serialization remain external prerequisites under the existing [Auth contract](p5-supabase-auth-contract-2026-11-03.md). Actual quiescence, deployed route/privilege cutover and provider/device acceptance remain unfinished. Another offline read loop or catalog pass cannot establish those guarantees. AI/live voice remain off, the original v5 remains complete, the P4 draft remains unapproved, and existing P3b staging/accounting closure is untouched.
