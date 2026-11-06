# P5 v2 cutover inventory and isolated catalog preflight

6 November 2026, America/Toronto. Source baseline: `aa5d5846cf40ef9a008c667fba10ecb415d0589f`, tree `305994c8d2e15f03d91d63bb8816b85bfa343d14`. This is an **inactive offline privilege candidate**, not a migration or completed cutover. No existing SQL draft, application route, service, policy, account, setting or accounting record changes.

The completed v2 issuer, verifier, request-owned admission and capacity marker are tested preparation. They remain INACTIVE/NONDEPLOYABLE. This batch supplies the missing exact inventory and an executable read-only catalog check; it does not establish actual hosted Auth, deployed routing, drained legacy transactions, native concurrency or provider/device acceptance.

## Fixed candidate and executable interface

[`cutover-inventory.ts`](../../../scripts/conversation-eval/p5-sql/cutover-inventory.ts) exports `P5_V2_CUTOVER_FUNCTIONS`, `P5_V2_CUTOVER_CATALOG_SQL` and `evaluateP5V2CutoverCatalog(catalog, { trustedOwnerRole })`. The manifest has 31 public RPCs and 29 private helpers. It has no connection, environment access, network operation, command-line execution, grant/revoke command, automatic migration or application import. Its SQL is one catalog-only SELECT; execute it only through an already owned, trusted disposable fixture connection with trusted catalog resolution. The result's `catalog` value is the evaluator input. A report always returns `deployable: false`; `catalogStatus: pass` means only that the supplied snapshot matches this exact candidate. It does not authenticate caller-supplied snapshot provenance.

The trusted function/private-schema owner is a required explicit option, with no `postgres` or service-role default. The fixture identifies its actual owner as `postgres`; this does not select the connected project's owner. The checker resolves every public `bfa_p5_` overload and every function in the three private schemas, denies unknown/missing/duplicate signatures, and verifies result cardinality, argument names/types/modes/defaults/variadic status, function kind, owner, SECURITY DEFINER/INVOKER and the sole fixed `search_path=pg_catalog,pg_temp` configuration. All 31 public functions are SECURITY DEFINER; all 29 helpers are SECURITY INVOKER in the frozen sources.

PUBLIC's default EXECUTE is expanded with `acldefault`/`aclexplode`; a null ACL is not assumed safe. Effective execution is checked with `has_function_privilege` for `anon`, `authenticated` and `service_role`, and both direct PUBLIC execution and service grant options are denied. Execute ACL grantees other than the exact function owner and selected service role are rejected. These three app roles must have no superuser/CREATEROLE privilege, membership in a protected owner, or any non-self role membership. The last rule is deliberately conservative: it closes NOINHERIT/SET ROLE paths without pretending to model a deployed role hierarchy. Even an otherwise harmless membership fails this isolated candidate and needs an explicitly reviewed future revision.

PUBLIC and all three app roles retain USAGE but lose CREATE on `public`; they have no USAGE or CREATE on `bfa_p5_voice`, `bfa_p5_capacity` or `bfa_p5_voice_v2`. They cannot execute private helpers. The checker does not audit arbitrary unrelated login roles, role administration outside these principals, table/RLS/default-privilege changes, schema exposure configuration or every possible wrapper in another namespace. Incoming memberships or a host authenticator able to assume these app roles are also outside this selected-role check; this is not a universal role-graph exposure certificate. Catalog checks do not authenticate function bodies; exact frozen source hashes and source review remain separate requirements.

## Exact public signatures and decisions

All signatures below are in `public`. Every entry denies PUBLIC, `anon` and `authenticated` EXECUTE. “Retain” below means the selected fixture grants `service_role` EXECUTE; “deny” means it does not. It is not participant permission. Signature-based grants in the disposable test are deliberately separate from this inert manifest.

| Exact function signature | Classification | Candidate service EXECUTE |
| --- | --- | --- |
| `bfa_p5_voice_register_generation(uuid,uuid)` | `legacy-enable` | deny |
| `bfa_p5_voice_register_issuance(uuid,uuid,uuid,bigint,text,bigint,bigint)` | `legacy-enable` | deny |
| `bfa_p5_voice_register_cleanup(uuid,jsonb)` | `legacy-enable` | deny |
| `bfa_p5_voice_register_proof(jsonb)` | `legacy-enable` | deny |
| `bfa_p5_voice_claim(uuid,jsonb)` | `legacy-enable` | deny |
| `bfa_p5_voice_inspect(uuid,jsonb)` | `legacy-enable` | deny |
| `bfa_p5_voice_close(uuid,jsonb)` | `legacy-terminal` | retain |
| `bfa_p5_capacity_claim(uuid,jsonb)` | `legacy-enable` | deny |
| `bfa_p5_capacity_mark(uuid,jsonb,uuid,bigint)` | `legacy-enable` | deny |
| `bfa_p5_capacity_close(uuid,jsonb)` | `legacy-terminal` | retain |
| `bfa_p5_capacity_reconcile(uuid,jsonb,jsonb)` | `legacy-terminal` | retain |
| `bfa_p5_capacity_policy(uuid,bigint,bigint,bigint,boolean)` | `trusted-policy-admin` | retain |
| `bfa_p5_voice_read_current_thread(uuid,uuid)` | `legacy-read` | retain |
| `bfa_p5_voice_read_session_fence(uuid,uuid)` | `legacy-read` | retain |
| `bfa_p5_voice_read_current(uuid,uuid,uuid,text)` | `legacy-read` | retain |
| `bfa_p5_voice_provision_session(uuid,uuid,bigint,bigint)` | `legacy-enable` | deny |
| `bfa_p5_voice_revoke_session(uuid,uuid)` | `legacy-terminal` | retain |
| `bfa_p5_v2_capacity_claim(jsonb)` | `v2` | retain |
| `bfa_p5_v2_voice_inspect(jsonb)` | `v2` | retain |
| `bfa_p5_v2_register_cleanup(uuid,jsonb,uuid,bigint,text,bigint,bigint)` | `v2` | retain |
| `bfa_p5_v2_read_cleanup(uuid,jsonb,uuid,bigint,text)` | `v2` | retain |
| `bfa_p5_v2_read_current(jsonb)` | `v2` | retain |
| `bfa_p5_v2_capacity_mark(jsonb)` | `v2` | retain |
| `bfa_p5_v2_observe_parent(uuid,uuid,bigint,bigint)` | `v2` | retain |
| `bfa_p5_v2_revoke_parent(uuid,uuid)` | `v2` | retain |
| `bfa_p5_v2_read_parent(uuid,uuid)` | `v2` | retain |
| `bfa_p5_v2_register_issuance(uuid,uuid,bigint,uuid,uuid,bigint,text,bigint,bigint,bigint,bigint)` | `v2` | retain |
| `bfa_p5_v2_read_issuance(uuid,uuid,bigint,text)` | `v2` | retain |
| `bfa_p5_v2_read_current_thread(uuid,uuid,bigint,uuid,bigint,bigint)` | `v2` | retain |
| `bfa_p5_v2_register_generation(uuid,uuid,bigint,uuid,bigint,text,bigint,bigint)` | `v2` | retain |
| `bfa_p5_v2_register_proof(jsonb)` | `v2` | retain |

The nine legacy enabling RPCs lose service execution only as part of a future coordinated, quiesced cutover. The four exact legacy terminal paths remain available: base close, capacity close, reconciliation and terminal session revoke. They preserve old identities, uncertain holds and cumulative usage after eligibility is lost. Retained legacy readers are an explicit choice for trusted reconciliation/diagnostics only; they cannot supply v2 authority or fallback. Capacity policy retains its service privilege solely for a separately trusted administrator path; catalog execution privileges cannot prove that host distinction. A future host that cannot keep these paths separate must remain disabled or revise the candidate under review.

Fourteen v2 RPCs remain service-only. Parent revocation is deny-only; parent/current reads are observations, not permanent lifecycle finality. Full protocol-2 cleanup/proof/capacity/marker requests and acknowledgments remain mandatory. No v2 wrapper may call a legacy enabling path. A privileged function owner can still execute denied legacy functions internally, so this privilege check alone cannot prove a replacement body is safe.

## Exact private helpers

All listed helpers deny PUBLIC and all three app roles, including `service_role`; their unchanged SECURITY INVOKER implementations run only inside protected, owner-executed RPC bodies. Every helper has the same fixed catalog/temp search path. Their owning schemas also deny app-role USAGE/CREATE.

| Exact private signature | Result |
| --- | --- |
| `bfa_p5_voice.ms()` | `bigint` |
| `bfa_p5_voice.n(jsonb)` | `bigint` |
| `bfa_p5_voice.id(jsonb)` | `uuid` |
| `bfa_p5_voice.exact_keys(jsonb,text[])` | `boolean` |
| `bfa_p5_voice.parse_claim(jsonb)` | `bfa_p5_voice.claim_key` |
| `bfa_p5_voice.lock_owner(uuid)` | `void` |
| `bfa_p5_voice.observe_now(uuid)` | `bigint` |
| `bfa_p5_voice.fence_expiry(uuid,uuid,bigint)` | `void` |
| `bfa_p5_voice.ack(jsonb,text)` | `jsonb` |
| `bfa_p5_voice.eligible(bfa_p5_voice.proofs)` | `boolean` |
| `bfa_p5_voice.use_proof(uuid,jsonb,text)` | `jsonb` |
| `bfa_p5_capacity.retire_if_fenced(jsonb)` | `void` |
| `bfa_p5_capacity.current(bfa_p5_voice.proofs)` | `boolean` |
| `bfa_p5_capacity.take_proof(uuid,jsonb,text)` | `bfa_p5_voice.proofs` |
| `bfa_p5_capacity.denied(jsonb)` | `jsonb` |
| `bfa_p5_capacity.conflict(uuid,uuid,jsonb,text)` | `void` |
| `bfa_p5_voice_v2.parse_capacity_proof(jsonb,text)` | `bfa_p5_voice.proofs` |
| `bfa_p5_voice_v2.capacity_ack(jsonb,text)` | `jsonb` |
| `bfa_p5_voice_v2.take_proof(bfa_p5_voice.proofs)` | `bfa_p5_voice.proofs` |
| `bfa_p5_voice_v2.current(bfa_p5_voice.proofs)` | `boolean` |
| `bfa_p5_voice_v2.retire_if_fenced(bfa_p5_voice.proofs)` | `void` |
| `bfa_p5_voice_v2.capacity_denied(jsonb,bfa_p5_voice.proofs)` | `jsonb` |
| `bfa_p5_voice_v2.capacity_admit(jsonb,text)` | `jsonb` |
| `bfa_p5_voice_v2.cleanup_observation(bfa_p5_voice.cleanup_owners)` | `jsonb` |
| `bfa_p5_voice_v2.mark_ack(jsonb,text)` | `jsonb` |
| `bfa_p5_voice_v2.mark_denied(jsonb,bfa_p5_voice.proofs)` | `jsonb` |
| `bfa_p5_voice_v2.parent_observation(bfa_p5_voice_v2.auth_parents)` | `jsonb` |
| `bfa_p5_voice_v2.issuance_observation(bfa_p5_voice.issuances,bfa_p5_voice_v2.issuance_auth_bindings)` | `jsonb` |
| `bfa_p5_voice_v2.eligible(bfa_p5_voice.proofs)` | `boolean` |

## Source route and import map

Paths below are repository-relative and were searched against the complete `src` tree excluding tests. No route or shipped component imports a P5 v2 issuer, verifier, admission, marker or transport. This is a source observation at the baseline, not confirmation of the connected Lovable build or a deployed runtime inventory.

| Existing entry point | Actual source path and behavior | Cutover implication |
| --- | --- | --- |
| Browser server-function authentication | `src/start.ts` registers `integrations/supabase/auth-attacher.ts`; it gets the browser session bearer and attaches it to the request. | Transport attachment is not current P5 Auth/session policy or revocation proof. Preserve generated files. |
| Generated server Auth middleware | `integrations/supabase/auth-middleware.ts` reads the exact request bearer, disables persisted sessions/auto-refresh, calls `getClaims(token)` and requires `sub`. | It does not establish current canonical session ownership, all effective session policy or transaction-coherent revocation. |
| `/conversation-staging` | `routes/conversation-staging.tsx` → `components/conversation-staging/StagingConsole.tsx` → `lib/ai/conversation/staging/staging.functions.ts` → `staging/adapter.server.ts`. The server function uses existing middleware; the adapter revalidates `getUser()` and staging allowlist, builds `ConversationService` with the mock provider and P3b RPCs. | Accepted P3b staging scope stays unchanged and closed. This is not a P5 host or live provider route. |
| `/conversation-preview` | `routes/conversation-preview.tsx` → `components/conversation-preview/ConversationPreview.tsx`, fictional mock service and session-only preview. | No P5 admission or paid/provider route. |
| Inactive v2 issuer | `service/voice-v2-issuance.server.ts` imports the v2 parent/issuance and preissue transport types; its ports must be supplied by a future trusted host. | Parent observe/read, preissue read/generation and exact issuance registration remain separate validated calls; no host composition exists. |
| Inactive v2 verifier | `service/voice-v2-authority-verifier.server.ts` uses full current/parent ports and unchanged P3b seal/HMAC boundary. | Full exact owner/session/parent/fingerprint/approval and deadlines; no legacy evidence downgrade. |
| Inactive admission and marker | `service/voice-v2-admission.server.ts` invokes the v2 verifier; owns cleanup/proof/capacity ports and optional full marker port. | Close/late/uncertain ownership and one marker attempt remain inside the private request-owned boundary; no runtime import or provider permission. |
| Preserved legacy wrappers | `service/voice-session-initializer.server.ts`, `voice-issuance.server.ts`, `voice-verification.server.ts`, `voice-store-adapter.server.ts` and their transports remain inactive historical code/tests. | Do not wire these enabling paths after cutover. No existing source is removed or repurposed by this batch. |
| Exact legacy cleanup/reconciliation | `service/voice-rpc-store.server.ts` exposes capacity close alongside old enabling methods; `voice-capacity-rpc.server.ts` exposes reconcile alongside old mark; `voice-session-revoke-rpc.server.ts` exposes terminal revoke. | A future host may capture only the exact retained terminal methods; importing a factory is not permission to call its denied enabling siblings. SQL privilege denial is independent. |

The fourteen v2 public names map one-to-one to `voice-v2-parent-issuance-rpc.server.ts` (5), `voice-v2-preissue-rpc.server.ts` (2), `voice-v2-current-rpc.server.ts` (1), `voice-v2-cleanup-rpc.server.ts` (2), `voice-v2-proof-rpc.server.ts` (1), `voice-v2-capacity-rpc.server.ts` (2) and `voice-v2-mark-rpc.server.ts` (1). The legacy read, issuance, session-provision/revoke, base-store and capacity transports preserve their old exact mappings; nothing is redirected by this inventory. All `service/` paths in this section are under `src/lib/ai/conversation/`; `routes/`, `components/` and `integrations/` are under `src/`.

## Unresolved acceptance boundaries

The [existing Auth contract](p5-supabase-auth-contract-2026-11-03.md) and [lifetime/cutover contract](p5-voice-lifetime-change-contract-2026-11-02.md) still govern. No new Auth documentation search, hosted-setting inference, native setup probe or Lovable repair was performed.

| Required evidence | Current concrete gap |
| --- | --- |
| Supported host/Auth identity and policy | Actual deployed Auth version/signing/configuration and supported exact request-bearer owner/session observation; effective timebox, inactivity, single-session, AAL and current-policy behavior are unverified. `getClaims` plus `getUser` does not supply all these facts. |
| Synchronous exclusion of revoked/current-invalid work | A supported transaction-coherent predicate/locking protocol or proven synchronous terminal-fence bridge is absent. HTTP Auth followed by SQL is finite observation; another read loop cannot make it atomic. No invented Auth-schema trigger/webhook assumption is selected. |
| Quiescence and coordinated route/privilege version | New work must be disabled and all in-flight legacy enabling transactions drained before exposing the v2 host and denying legacy execution. REVOKE does not terminate a function already executing. No actual deployment controller, host version attestation or drain evidence exists. |
| Native PostgreSQL and v2 race acceptance | The existing 12 admission + 9 capacity native cases are legacy preparation and all 21 remain unrun. Serialized PGlite checks cannot establish native lock scheduling. V2 parent/legacy-revoke ordering and cutover drain/routing need explicit native scenarios, not relabelled legacy passes. |
| Real provider/device operation | No real Auth/voice/model/device acceptance, external-create finality or microphone closure evidence exists. Marker results never authorize a provider create; marked uncertain holds remain until trusted reconciliation. |

The useful next offline preparation is narrowly bounded: add explicit **native v2 cutover race scenarios** to the existing guarded disposable harness, including both parent/legacy-revoke orderings against v2 enabling, proof/marker waits across revocation, and an already-running legacy function across EXECUTE revocation versus an actually drained cutover. These would remain prepared/unrun unless a suitable native environment becomes available; do not retry unavailable setup or claim they solve hosted Auth. Further hosted integration requires actual supported platform evidence, not another generic Auth wrapper or repeated contract research. The decision on supported Auth serialization is a real external dependency; if it cannot be established, live integration stays blocked.

## Reproduction and evidence scope

The new `p5-voice-v2-cutover-preflight-sql.test.ts` uses the existing separately supplied local PGlite module and the frozen drafts. The unchanged pre-cutover baseline must fail. Only the disposable fixture applies exact candidate grants/revokes; the candidate must pass, forbidden legacy calls must deny, and the actual v2 issuer/admission/marker plus exact cleanup must preserve lifetime and accounting behavior. Catalog negative controls include missing/extra/overloaded functions, set-return cardinality, PUBLIC/default grants, inherited and NOINHERIT membership escalation, owners, fixed paths and helper/schema isolation. Exact counts, first-run diagnostics, review and final hashes are recorded in `artifacts/conversation-eval/offline-validation-v34/`; they are not real deployment or native concurrency evidence.

The manifest is a versioned source-derived decision, not generated dynamically from whatever functions a target happens to expose. The following unchanged SQL source SHA-256 values pin the audited definitions. Runtime catalog status does not compare or authenticate body bytes.

| Frozen source | SHA-256 |
| --- | --- |
| [`p5-voice-admission.sql`](sql-drafts/p5-voice-admission.sql) | `f4358f4587af9b2997f3763ee28c1327ef930dd80ded7af12fd028d50b669a7b` |
| [`p5-voice-capacity.sql`](sql-drafts/p5-voice-capacity.sql) | `d6623e7def0d223b14b934ebb5b3cb4b8bf7ce595c6233f4aabb2a25a0ce8437` |
| [`p5-voice-preissue-read.sql`](sql-drafts/p5-voice-preissue-read.sql) | `df9cc4296df6bb1b81a2f374e4e79fde27cce173362245fde599b046cfae6f4c` |
| [`p5-voice-reads.sql`](sql-drafts/p5-voice-reads.sql) | `4cf7cc7e9fd6aeaf38a7c834990c930994e8d8cb430ab3a7c2b7e9ade1ee722c` |
| [`p5-voice-session-provision.sql`](sql-drafts/p5-voice-session-provision.sql) | `b1ca8d2c3fca056581c74168205618d4b47d5b58a03df33417b1a053571eb360` |
| [`p5-voice-session-revoke.sql`](sql-drafts/p5-voice-session-revoke.sql) | `0d476468912648de48f31ae10ec6c5d4570cda1301bec609524f931f7f05df3f` |
| [`p5-voice-v2-capacity.sql`](sql-drafts/p5-voice-v2-capacity.sql) | `4573216e9f55d6ef4e89833a90a424f1bbde9db84ad9d21ac0b67d104c40135b` |
| [`p5-voice-v2-cleanup.sql`](sql-drafts/p5-voice-v2-cleanup.sql) | `c0a345fe9bc8232e52fde4638a8c57bbcf0a41ea1320d87f246374455fdccd6c` |
| [`p5-voice-v2-current.sql`](sql-drafts/p5-voice-v2-current.sql) | `49aedde5ec95462fb98d28d4df02568355a223994f2605c91d723c406838c302` |
| [`p5-voice-v2-mark.sql`](sql-drafts/p5-voice-v2-mark.sql) | `bc38971a749b98b41daa9b42f8fff55c3f48fc540eba083492deeb31b80881ec` |
| [`p5-voice-v2-parent-issuance.sql`](sql-drafts/p5-voice-v2-parent-issuance.sql) | `8c463bb3c1953b32e83e6d90ba0b31e629bc39cca78a0fb05e013d84c5dec342` |
| [`p5-voice-v2-preissue.sql`](sql-drafts/p5-voice-v2-preissue.sql) | `93f3e2c2c85f50583a3b24c6e03a95674cdcc65078a09aa8250b018db434d564` |
| [`p5-voice-v2-proof.sql`](sql-drafts/p5-voice-v2-proof.sql) | `1c011ed347a0cd47489d2b714e583d473f45642c9f70998f3691e3bb3287c436` |
