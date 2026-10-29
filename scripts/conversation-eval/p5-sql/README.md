# Disposable P5 database checks

29 October 2026. These developer-only runners never import application secrets,
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

## Prepared native path — database execution still unrun

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

Runner unit checks:

```sh
python3 -I scripts/conversation-eval/p5-sql/test_runner.py
```

They use explicitly labelled process doubles to test environment isolation,
refusal guards, evidence completeness and cleanup behavior. They are not SQL
execution. Repository evidence is in
`artifacts/conversation-eval/offline-validation-v9/`.

Production Auth/session/issuance wiring, active-session capacity, real cost and
settlement rules, connected migration/HTTP acceptance and live provider/device
acceptance remain unfinished. Generic cumulative fixture units are not money
or permission to dispatch. The P4 grant registry remains empty.

Primary references: [PGlite API](https://pglite.dev/docs/api),
[single-connection scope](https://pglite.dev/docs/about),
[PostgreSQL initdb](https://www.postgresql.org/docs/18/app-initdb.html), and
[server connection settings](https://www.postgresql.org/docs/18/runtime-config-connection.html).
