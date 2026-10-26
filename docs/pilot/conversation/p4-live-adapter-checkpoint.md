# P4 checkpoint — 26 October 2026 UTC: local repair tested, NOT APPLIED remotely

P4 implements a direct OpenAI adapter and a controlled, offline-default evaluator. It does not enable participant AI, voice, or the staging route's real provider. P3b remains accepted for isolated fictional staging, with admissions closed. The app remains unpublished. No real OpenAI request, credential read, authentication change or database mutation was performed in this P4 pass. The completed v5 and its closed USD 0.06 allowance were not reused.

Baseline was synchronized commit `cc9070eb27dced51ac5ede0a6b5896f7bfb37f09`. The initial implementation at `b21347e0d2bb8fbb1e0c675643291e6a393cd4ce` passed its ordinary tests but failed independent edge-case review. Lovable's partial repair at `3551aa7d13115e4eafb3ae6a2188ee500b3b33c2` left a ledger type error and unfinished runner work. A continuation request was rejected because the workspace was out of credits. Repairs were then completed and tested locally for synchronization through the connected GitHub branch, without rewriting history.

**Remote application is blocked:** GitHub rejected `create_tree` with HTTP 403, “Resource not accessible by integration”; no write was made. Remote Lovable/GitHub remains at `3551aa7d13115e4eafb3ae6a2188ee500b3b33c2`, including its unfinished repair/type error. The tested forward patch must be applied using restored Lovable credits or write-enabled GitHub, then build and synchronization verified. Do not claim remote P4 acceptance.

## Implemented behavior in the tested local repair

- The existing conversation service remains the authority for policy, admitted context, same-thread history, shared excerpts and cancellation. Only neutral provider type imports changed in existing service/mock code. The approved 4,043-byte policy and SHA-256 `2fe0e26df0f21abd8080e3ab860e02721febf7e643ea11c940ee383637b08c09` are unchanged. Mock fixture directives are never serialized.
- The server adapter uses raw fetch and the Responses API with strict `{text, sourceIds}` output, explicit `gpt-6-luna`, reasoning `none`, tier `default`, `store:false`, `background:false`, `stream:false` and disabled truncation. No tools, search, provider conversation memory, retries, fallback or cache prewarming. Reported model and tier must match exactly. Pre-aborted requests make no call; caller cancellation and deadline cover the entire response body and fence late success.
- The complete serialized UTF-8 POST body—including instructions, policy, input, escaping, format note and schema—is bounded and hashed before transport. Decoded and nested Unicode-escaped credential/NUL leakage is rejected. Provider errors are reduced to codes. Unknown, malformed, over-bound or inconsistent usage is not trusted.
- A manifest cannot approve itself. A separate server-controlled grant must bind the exact manifest bytes, run and approved limits. The shipped registry is empty. The manifest binds exact catalog text, model, policy/source hashes, accounting locations, input/output limits, prices, dates and cap. Approval, expiry and price freshness are checked before credential access and each dispatch. Test-only grant injection requires an explicitly injected test transport.
- The single-host shared-file ledger uses exclusive locking, fsynced atomic writes, exact cap/run/manifest/count binding, permanent catalog-turn identities and unique provider receipt IDs. Count and money survive restarts; a changed output directory cannot authorize replay. Missing receipts, cancellation, unknown usage and accounting conflicts retain conservative holds. This is not a distributed production ledger.
- Admitted request bodies and hashes, request-start evidence, parsed response text, sanitized usage/receipt metadata and stop records are saved per attempt. Failure prevents subsequent turns. Prior evidence survives a later accounting failure. Actual transport calls are distinguished from claimed dispatches; cost fields are conservative estimates, never invoices.
- The actual default CLI chooses a fresh non-overwriting evidence directory. Explicit existing output directories fail closed. Invalid manifests exit nonzero. Default validation does not read credentials or use network access.

## Unapproved first live test

The nine fictional catalog turns are C04 (2 practical constraints), C05 (2 grief/no-advice), C07 (3 correction/recall) and C08 (2 religious hurt/no-verse). Each case starts a fresh thread, spiritual preference off. The proposed run uses `gpt-6-luna`, reasoning none, default tier, max nine transport attempts, no retries/fallback, output cap 1,200 and 45-second deadline per attempt.

The proposed total cap is **USD 0.10**, not authorized or spent. The full-wire input cap is **64,000 UTF-8 bytes**, plus a **4,096-token engineering allowance** for provider-added framing. Byte-level BPE text tokens cannot exceed input bytes; the extra framing allowance is an engineering reservation, not a provider billing guarantee. At the reviewed input/cache-write worst rate of USD 0.125/M and output USD 0.50/M: `ceil(68,096 × 0.125) + 600 = 9,112` micro-USD per attempt; nine attempts reserve **82,008 micro-USD (USD 0.082008)**. This replaces the invalid initial characters/2 estimate. Out-of-bound usage stops the run and retains the hold.

The reviewed standard price snapshot, dated 26 October 2026, lists input USD 0.10/M, cached input USD 0.01/M, cache-write USD 0.125/M and output USD 0.50/M. Live mode rejects a changed or stale snapshot (14-day maximum age). Reverify current prices before eventual execution. Draft approval and expiry are null; no grant has been recorded. The nine replies must later be reviewed against `scripts/conversation-eval/rubric.md`; simulated replies do not establish model quality.

## Verification and provenance

Final local source verification used Node 24.22.1, TypeScript 5.9.3 and Vitest 4.1.10:

- `node node_modules/vitest/vitest.mjs run --reporter=json --outputFile=p4-final-vitest.json`: **398/398 assertions in 24 test files**. This comprises 351 repository checks plus 47 unchanged independent diagnostics retained from P3. The new P4 coverage is **79 tests**: provider 27, service 4, manifest 12, ledger 20, CLI 4 and runner 12.
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.p4-verification.json`: clean, strict scoped check of conversation/P4 code; this is not a full production build.
- Actual CLI run through Node+tsx: `node --import tsx scripts/conversation-eval/run.ts --out artifacts/conversation-eval/offline-validation-v2`: structural pass, approval absent, zero credential reads and zero real provider calls. Tests also execute the bare command, invalid live admission and existing-output rejection.
- Simulated full nine-turn success captures all exact bodies and hashes before transport. Failure tests cover refusal, invalid usage, missing/replayed receipts, expiry, forged grants, tiny input allowance, restart replay and accounting-lock evidence preservation. Ledger tests use separate OS processes for reservation, claim and final-slot races.
- Separate independent adapter review passed **11/11** diagnostics, including the six previously failing cancellation/tier/decoded-key cases and positive context/Stop/Delete controls. Separate ledger review passed eight behavior groups and 16-process reserve/claim controls. Separate independent runner review passed **12/12**, including an authorized simulated nine-call positive control. Results are recorded in the accompanying verification summary.

The initial Lovable response reported 1,831 full-suite tests and 51 new tests, but its source contained only 42 new tests. Those initial claims are historical and are not carried forward as final verification. No earlier assertion was weakened to make repaired code pass.

**Limitations:** native Bun was not available locally. Full current production-build verification was unavailable: Supabase, Drizzle and Postgres packages were missing, and cached Lovable configuration was 2.23.1 versus required 2.26.5. Older source/builds do not validate this result. Lovable may rebuild synchronized changes, but a ready project status alone is not proof of a full test run. No real-device, microphone, voice, current signed-in session or model-quality acceptance was attempted. Semantic fixture matching remains scaffolding and is not represented as general language understanding.

`store:false` disables response retrieval storage; it is not a zero-retention guarantee. Foreground abort does not prove zero provider cost. An admitted source ID does not establish quote accuracy.

P4 development usage reported by Lovable: **23.4 credits = 18.4 initial +5.0 partial repair**. The rejected continuation did not run. This is not a project total or remaining balance. The local repair added no Lovable build request. New real OpenAI/voice calls: zero.

## Resume

Preserve this implementation and all completed P0–P3b/v5 history. Confirm synchronized source/build availability, then obtain the separate concrete paid-test approval required by the approved Step 3 plan. Fill the approved manifest/grant only after that approval. Execute one bounded nine-turn run, review each response and retain its accounting evidence. Participant activation and real voice remain separate later work.
