# Disposable P5 database checks

30 October 2026. These developer-only runners never import application secrets,
select a production database, create real Auth accounts or activate AI/voice.
They install exact P3b migrations 0000–0005 into a fresh fixture database, with
fictional NOLOGIN roles and an `auth.uid()` stub that always returns NULL, then
install the proposed SQL outside the automatic migration journal. Historical
temporary P3b acceptance helpers are not installed. This is not reopening P3b
staging or establishing a production Auth boundary.

## Executed single-connection path

Install the pinned free test engine into a separate scratch directory, not the
app's package files:

```sh
npm install --prefix /absolute/scratch/p5-engine --ignore-scripts --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.12
node scripts/conversation-eval/p5-sql/run-wasm.mjs --module /absolute/scratch/p5-engine/node_modules/@electric-sql/pglite/dist/index.js --output /absolute/new-evidence-directory
```

The runner creates a fresh in-memory cluster, creates `bfa_p5_offline_fixture`,
then uses PGlite's documented dump/load and database option to select it. It
does not weaken the SQL database-name guard or open a TCP listener. The only
fixture text adaptation removes the exact psql `ON_ERROR_STOP` directive;
PGlite throws on SQL errors. Unexpected psql directives fail closed. Sources,
SHA-256 hashes, SQL command tags, notices and errors are retained in JSON. The
output directory must not already exist. The package is loaded from the supplied
local path; runtime uses no remote database or package installation.

Current evidence: PostgreSQL **18.6 (PGlite 0.5.12)** installed the draft and
passed **57 sequential assertions + 145 actual role checks = 202 checks**.
These are assertion invocations, not 202 separate transactions. Each fixture
suite rolls back; the runner verifies all ten P5 and four P3b tables are empty.
Both in-memory instances are closed. Initial execution exposed and repaired
two fixture defects (RESTRICT error-code handling and an ambiguous variable);
the admission algorithms were unchanged.

PGlite has one exclusive connection. Its successful sequential execution cannot
prove native backend locking, concurrent commits, HTTP permissions, production
Auth/revocation, provider calls or real-device behavior. Never use a proxy or
multiplexer to relabel this run as independent concurrent PostgreSQL backends.

## Executed capacity/reconciliation extension — 30 October

```sh
node scripts/conversation-eval/p5-sql/run-capacity-wasm.mjs --module /absolute/scratch/p5-engine/node_modules/@electric-sql/pglite/dist/index.js --output /absolute/new-capacity-evidence-directory
```

This separate runner first executes the unchanged admission package and its
**202 checks**, then installs `p5-voice-capacity.sql` and executes **129 capacity
assertions + 116 actual role checks = 245 new checks (447 total invocations)**.
It checks the exact 14-table inventory before extension installation and all
20 tables afterward; every fixture suite rolls back and both instances close.
The package remains scratch-only and pinned to PGlite 0.5.12. The original
`run-wasm.mjs`, native runner and admission SQL are unchanged.

The extension combines one original quota debit with a shared capacity slot and
cumulative pool hold in one transaction. Exact cleanup safely releases only an
unmarked slot; a committed operation marker retains uncertain occupancy until
trusted whole-operation finality. Conflicting evidence permanently quarantines
the pool. All cumulative held units remain retained. New tests cover denied
capacity without a partial original claim/debit, policy reductions, changed
approval quota binding, modeled missing create acknowledgments, duplicate/conflicting evidence,
revocation with backward clocks, deletion cleanup and actual SQL rollback.
The role suite actually switches to anon, authenticated and service_role and
checks SQLSTATE 42501, service-only RPCs, inaccessible helpers/direct DML, fixed
definer paths and a successful service-role flow.

Execution found an ambiguous reconciliation variable, which was repaired.
Independent review also found that a marker needed to compare its original
hold policy with the current approval policy. Its new regression failed against
a separate copy with that check removed, then passed with the repair. Evidence,
source hashes and both findings are retained in
`artifacts/conversation-eval/offline-validation-v11/`.

These are single-connection PostgreSQL checks with fictional protected records,
not native lock contention, real Auth, HTTP or authenticated provider evidence.
The SQL does not validate a provider signature or establish that a session
really ended. No real provider/device call, connected database or seed allowance
is involved. The native runner now has the explicit `--capacity` path described below.
Its 12 admission and nine capacity cases remain unrun; use only a suitable
nonroot PostgreSQL environment.
Do not repeat failed setup probes or relabel serial execution as concurrency.

## Prepared native capacity path — nine cases still unrun

```sh
python3 -I scripts/conversation-eval/p5-sql/run-local.py --capacity --pg-bin /absolute/postgresql/bin --output /absolute/new-native-capacity-evidence-directory
```

The default command below remains admission-only. Explicit `--capacity` installs
the extension after the base rollback suites, checks the exact empty 20-table
inventory, runs its 129 sequential + 116 actual-role assertions and checks each
rollback. Only then do the 12 original admission and nine new capacity cases
run. Concurrency cases intentionally commit fictional records, so no blanket
empty-database claim is made after those cases.

`capacity_concurrency.py` reuses the guarded native driver with nine named cases:
shared last slot across owners; close-before-marker; marker-before-close;
duplicate finality; contradiction versus a waiting replacement; cross-pool
operation-ID collision; claim/pool expiry; marker/pool expiry; and marker/operation
expiry. Each case records distinct backend IDs and an observed blocker relation.
Expiry cases require an observed lock before the database clock crosses the
eligibility deadline. The case report must contain the exact ordered inventory,
nonempty assertions, valid lock evidence and successful cleanup; totals alone
cannot pass. Global operation contention checks the advisory wait event.

**All 21 native cases remain unexecuted.** This batch does not repeat the known
unavailable-environment probes. Source review and Python syntax checks cannot
establish actual native locking, concurrency, Auth/HTTP or provider acceptance.
The updated runner's **27 tests** use explicit process doubles: 17 previous and
10 new safeguard tests, including invalid/missing evidence and cleanup failures.

The new generated table-inventory SQL has its own narrow executed check:

```sh
node scripts/conversation-eval/p5-sql/check-inventory-wasm.mjs --module /absolute/scratch/p5-engine/node_modules/@electric-sql/pglite/dist/index.js --output /absolute/new-inventory-evidence-directory
```

It runs six checks in pinned PostgreSQL WASM: valid empty 14/20-table inventories,
unexpected extension in base mode, an equal-count renamed/missing table, a dirty
fixture row and empty tables after the negative-case rollbacks. It imports the
runner only to extract the exact SQL; it never starts a native server. This is
not a rerun of the historical 447 database assertions or a concurrency test.
Source hashes, process-double log and inventory SQL results are retained in
`artifacts/conversation-eval/offline-validation-v12/`.

## Prepared native admission path — database execution still unrun

Use a normal nonroot OS account with installed PostgreSQL binaries:

```sh
python3 -I scripts/conversation-eval/p5-sql/run-local.py --pg-bin /absolute/postgresql/bin --output /absolute/new-native-evidence-directory
```

Optional `--preflight` checks prerequisites only. An unavailable run exits 2;
a failed run exits 1. Neither counts as passing database tests. The runner
accepts no DSN, existing data directory, host, port, database or credential
override. It creates a private temporary cluster and Unix socket, sets
`listen_addresses=''`, clears inherited connection/configuration variables,
and retains logs. It attempts shutdown even after partial startup/failure and
removes only its own temporary cluster after stop is confirmed. An unconfirmed
shutdown fails the run and retains that directory for deliberate investigation.

`concurrency.py` is an internal runner component. Its 12 named cases prepare
same-attempt races, the final cumulative quota unit, both claim/close orders,
owner/thread/quota waits past expiry, current session/allowlist/thread fences,
shortened approval persistence and deliberately discarded SQL replies. Worker
identities and `pg_blocking_pids`/wait events establish barriers; the database
clock establishes expiry. Row-only lock holders deliberately inject contention;
production writers must still use the owner-first order. Discarding a result
models a missing acknowledgment, not a broken HTTP/network connection.

Native execution was unavailable in this workspace: no native PostgreSQL tools,
only UID/GID 0 mapped, and ordinary nonroot/nested namespace setup refused.
No root-check bypass, connected database, remote credentials, or production
account was used. The prepared native cases need their first real run.

Runner safeguard checks (process doubles, not native SQL):

```sh
python3 -I scripts/conversation-eval/p5-sql/test_runner.py
```

They use explicitly labelled process doubles to test environment isolation,
refusal guards, evidence completeness and cleanup behavior. They are not SQL
execution. Repository evidence is in
`artifacts/conversation-eval/offline-validation-v9/`.

Production Auth/session/issuance wiring, integration of the draft capacity store,
real cost and settlement rules, connected migration/HTTP acceptance and live
provider/device acceptance remain unfinished. Generic cumulative fixture units are not money
or permission to dispatch. The P4 grant registry remains empty.

Primary references: [PGlite API](https://pglite.dev/docs/api),
[single-connection scope](https://pglite.dev/docs/about),
[PostgreSQL initdb](https://www.postgresql.org/docs/18/app-initdb.html), and
[server connection settings](https://www.postgresql.org/docs/18/runtime-config-connection.html).
