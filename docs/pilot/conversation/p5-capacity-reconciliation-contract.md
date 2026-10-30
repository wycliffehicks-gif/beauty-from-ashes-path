# P5 active-session capacity and reconciliation — offline contract

29 October 2026 • America/Toronto. Starting source: `94e25ba1532fe969a93c0c7b5077f02468204d3c`.

This draft resolves a specific remaining design gap: a concurrent-session slot may eventually be released, while cumulative held usage must remain intact. It is accompanied by a dependency-free executable reference model and fictional failure fixtures in `scripts/conversation-eval/p5-capacity/`. That model is a development specification, not a runtime store, authenticated provider adapter, distributed lock or dispatch capability. No application route imports it. No SQL migration, real provider, paid budget or live allowance is selected or enabled here.

The existing admission SQL still implements cumulative generic reservation only. Its 202 single-connection PostgreSQL WASM assertions are separate historical evidence; the 12 native multi-session case bodies remain unrun. This contract does not silently add concurrency capacity to that SQL or make the existing admission lease permission to dispatch. Production implementation must satisfy both this contract and [the atomic admission contract](p5-atomic-voice-store-contract.md), with the shared service/P1 boundary still owning all provider context.

## 1. Distinct records and invariants

| Record or quantity | Meaning | When it may change |
| --- | --- | --- |
| Admission eligibility | Current permission to proceed to further checks | Stop/Delete, revocation and expiry fence it; the original and shortest observed deadlines never extend. |
| Capacity occupancy | A reserved or possibly active session consumes one slot in a server-selected pool | Acquisition consumes one; exact proven never-started or terminal reconciliation releases one. Unknown outcomes retain occupancy. |
| Cumulative held units | Lifetime reservation under an explicit generic-unit policy | A new accepted attempt adds its immutable units once. **No operation in this contract subtracts units.** |
| Provider termination evidence | A trusted, exact, final observation about one create operation and its resulting session, if any | Validated observations append facts; duplicate facts do not repeat side effects. Browser closure, timeout and admission closure are not this evidence. |
| Pool quarantine | Capacity can no longer be trusted after contradictory trusted evidence | A conflict latches it. It blocks new allocation and new create markers; cleanup remains available. This contract has no automatic or manual reset operation. |

Capacity is reserved before a provider-session creation attempt. It is intentionally conservative: pending setup and uncertain provider work occupy slots alongside confirmed sessions. A number labelled “active” must not omit pending or uncertain occupancy. This is a bound on admitted operations under the stated assumptions, not a measurement of all real provider work.

Capacity limits and cumulative-unit limits are separate controls. A released slot permits another deliberate, independently authorized attempt only if all other gates and the remaining cumulative budget permit it. Repeated start/stop must not recycle cumulative units into unlimited work. No fixture unit is currency, a provider token count, a charge, an invoice or a refund.

Server-owned pool identity and policy version must remain stable across updates. Decreasing capacity below current occupancy preserves every existing allocation, denies additional allocation and does not pretend to terminate a session. Decreasing a cumulative ceiling below already-held units similarly denies additions without erasing history. Missing, disabled or zero-capacity policy denies. Changing a policy identifier must not create a fresh counter that bypasses prior held usage; a future policy rollover requires a separately reviewed aggregation rule.

## 2. Exact identity and the proposed lifecycle

Each record retains the exact server-derived owner, thread, incarnation, revision, attempt, admission claim and voice approval/digest binding. It also pins the capacity pool, immutable reservation units and policy identity/version used at acquisition. An owner/attempt cannot obtain a second allocation by changing thread, revision, incarnation, claim or policy. A server allocation ID cannot be reused with different bytes. An exact duplicate can observe its existing outcome but cannot acquire another slot or hold.

The create operation has its own immutable server identifier, bound to that allocation before any external I/O. It is not a browser token, authority receipt or retry allowance. One allocation supports at most one possible create operation. Reconnect and retries must not create another session under the same marker. Within the selected provider/account/pool namespace, a session identity cannot belong to two operations. The executable model has one pool and requires its normalized session IDs to be unique in that namespace; a real adapter must establish the provider/account scope before mapping those IDs. A production design that allows multiple provider operations needs a separate model before use.

| Durable state | Capacity | Allowed next outcomes |
| --- | --- | --- |
| Reserved, no create marker | Occupied | One create marker, or terminal close establishing never-started status and releasing this slot. |
| Create marker committed; acknowledgment absent | Occupied; provider outcome unknown | Bind an exact returned session; record cleanup request; reconcile exact final evidence. A lost reply does not mean rollback or absence. |
| Exact session known | Occupied | Cleanup can be requested; only qualifying final evidence releases the slot. |
| Released: never started | Released; cumulative hold retained | Idempotent cleanup/inspection only. The permanent fence rejects a late marker. |
| Released: final provider outcome | Released; cumulative hold retained | Idempotent matching evidence only. No restart or reuse of this allocation. |
| Conflict observed | Existing records retained; pool quarantined | Exact cleanup and evidence retention only; no new allocation or create marker in that pool. |

Admission closure and capacity release are separate facts even when a safe pre-dispatch close commits both in one transaction. A possibly-started allocation may be admission-closed while still occupying capacity indefinitely. Thread/content deletion never deletes its cleanup identity, create marker, hold, evidence or release tombstone.

## 3. Safe acquisition, dispatch marking and close

Acquisition must atomically recheck the exact current admission and voice approval, server pool/policy, capacity and cumulative limits, then insert one allocation, attempt winner, occupancy and hold. All arithmetic uses bounded, checked nonnegative integers. Denial and binding conflict create no additional hold. Exact duplicate outcomes must not depend on subtracting and re-adding counters.

The existing admission SQL already reserves cumulative units. The model's `reserve` represents the proposed **combined** admission/capacity transition, not a second debit after that SQL succeeds. The later extension must commit admission, capacity and exactly one original cumulative hold in one transaction, with capacity denial before commit. If a separately reviewed path attaches capacity to an existing claim, it must reference that exact immutable original hold, verify its binding/policy and add no second debit. Missing or mismatched hold evidence denies; existing P3b rows and historical holds must not be retroactively rewritten or repurposed. This model does not implement that attachment path.

Immediately before any future external create operation, the trusted dispatcher must obtain one durable create marker under compatible locks, rechecking current authority, the shortest deadline and the pool quarantine state. Only the invocation that successfully commits the new marker can proceed toward that one operation; an idempotent marker replay is not permission to send again. The reference model simulates this transition but returns no usable provider capability.

The create marker is a conservative “possibly started” boundary. A crash after committing it but before sending the request still retains occupancy. This can reduce availability; it prevents an unobserved late sender or lost response from being treated as safely absent. The design makes no cross-system atomicity claim between PostgreSQL and a provider. It cannot eliminate the interval between a committed marker, a later Stop and external network activity. A future concrete dispatcher needs defined fencing, revocation and terminal-reconciliation semantics for that interval.

Two serialized orders determine safe close:

1. **Close commits before the marker.** It terminally fences this allocation and releases its slot as never started. A delayed dispatcher fails its marker transition and must perform no create call. This outcome requires all dispatchers to use the same durable marker gate; merely not seeing a provider ID is insufficient.
2. **Marker commits before close.** Close fences admission and records cleanup responsibility, but retains occupancy and all held units. It cannot infer that the send failed, that a returned session is the only possible session, or that the provider stopped. Reconciliation needs qualifying exact evidence.

Expiration, account change, deletion, socket closure, browser microphone shutdown, an `AbortSignal`, a rejected promise, an empty provider lookup or a local “stop requested” flag is not permission to release possibly-started capacity. Expiry can close eligibility; it cannot prove external termination. In the reference model, a fresh eligibility denial or observed expiry can terminally fence and release an allocation only when it still has no create marker, using the same never-started proof as close. There is no background expiry timer. A trusted cleanup path may operate after foreground Auth expires without restoring admission or reading private content.

## 4. Reconciliation evidence and conflicting observations

Production evidence must be authenticated under a selected provider/adapter contract and bound to the immutable allocation and create-operation identity. Any session reference must match its registered provider/account scope and that operation. The adapter must verify signature/source, finality and scope; parsing an object or setting a `trusted` boolean supplies none of those guarantees. The fictional fixture inputs stand in for this missing port and cannot be exposed as a browser RPC.

A qualifying terminal observation establishes one of the following:

- The exact create operation has completed without creating any session and cannot still create one later. A timeout, transient not-found response or absent acknowledgment is insufficient.
- The exact operation has completed and every session it can create under the selected single-create contract is definitively terminated. A callback for an unrelated session, or termination of one session while a create continuation/retry could produce another, is insufficient.

If the create acknowledgment was lost and the session ID is unknown, terminal evidence must still resolve the exact server operation. No inference from “there is no local session ID” is allowed. If the chosen provider cannot establish that exact outcome, keep occupancy uncertain. This draft does not invent an idempotency or lookup guarantee for an unselected provider.

Each trusted observation retains a stable evidence ID, exact operation binding, evidence kind and bounded content-free facts. One evidence ID may not be overwritten or reused for another binding/outcome. Duplicate identical observations are idempotent; a replay cannot release a replacement allocation or subtract cumulative units. The model's `created` event means a historical creation acknowledgment, not evidence that a session is currently running. Therefore a delayed `created` acknowledgment for the same already-ended session is compatible and cannot resurrect its old slot. An observation of genuinely new activity after final termination would be a different contradiction that the real adapter must fail closed; it must not normalize that observation into an ordinary historical `created` event. Evidence ordering/finality must be established by the future adapter, not by arrival time or a client clock.

New contradictory trusted evidence, including an incompatible session identity, conflicting terminal outcomes or evidence-ID reuse with different bytes, latches pool quarantine. Keep the original outcome and conflict evidence; never rewrite history to make the counters look consistent. A released allocation is not reopened and no replacement allocation is mutated. The conflict means physical capacity is unknown, so new allocations and even create markers for already-reserved allocations in that pool are denied. Other exact terminal cleanup may still release its own slots; it cannot clear quarantine. There is no timeout-based, operator-click or automatic retry escape hatch in this batch. A future recovery contract needs authoritative reconciliation of the whole affected pool and a separately reviewed fence before unquarantining it.

Rejected untrusted/malformed observations cannot manufacture a terminal fact or release occupancy. A production unauthenticated caller must also be unable to quarantine a pool by injecting arbitrary conflicts. Quarantine is a response to verified but contradictory trusted evidence, or a trusted internal invariant failure, not a public error-report endpoint.

## 5. Durable implementation boundary

The reference model applies one transition at a time in process memory. It explores serialized event orders and checks state invariants. It does **not** prove concurrent database commits, database rollback, exactly-once network execution, Auth revocation, cryptographic callback authentication, provider finality, real charges or actual resource termination.

The exact offline command boundary is `CapacityModel.apply(command)`; `snapshot()` returns a detached frozen copy. Its one fixed pool uses `activeLimit`, `totalUnitLimit`, immutable `unitsPerAttempt`, `enabled` and a checked policy `version`. Model IDs are bounded fictional labels, not production UUID parsers or browser capabilities.

| Command | Modeled fact or transition |
| --- | --- |
| `policy` | Compare the expected version, then advance it by one; retain the same pool and units definition, all holdings and quarantine. |
| `reserve` | Atomically model one slot plus one cumulative hold for an exact claim; `freshEligibility`, `now` and `policyVersion` are fictional trusted-boundary inputs. |
| `mark-create` | Assign one immutable `operationId` after fresh modeled eligibility/current-policy checks; `already-marked` is observation only, never a second send allowance. |
| `close` | Terminally close the exact claim; release only an unmarked reservation. It requires no fresh eligibility and changes no held units. |
| `observe` with `created` | Bind a historical creation acknowledgment to the exact operation and session. |
| `observe` with `ended` | Assert that the entire one-create operation is final and its exact session has definitively ended. This is a fixture assertion, not an authenticated raw callback. |
| `observe` with `not-created` | Assert that the entire operation is final without a session and cannot create one later. A 404, timeout or rejected create request is not automatically this fact. |
| `observe` with `unknown` | Retain unresolved outcome with no release or refund. |

Model admission checks keep a clock high-water mark and deny backward clock observations. A trusted eligibility loss on an existing reservation still persists its terminal fence when the clock also moves backward; later clock recovery cannot revive that reservation. Their `freshEligibility` boolean is explicitly a fixture assertion. No command authenticates an owner, computes actual revocation, establishes real provider finality or makes a network request. All provider- and Auth-dependent facts remain mandatory production-port obligations. The executable snapshot uses `slot: held | released`, a separate closed flag and terminal outcome; the conceptual lifecycle table above does not introduce another runtime authority. An `unknown` observation after a previously established terminal outcome is recorded as late evidence without downgrading finality.

A later SQL extension must preserve the established P3b owner advisory lock and current-thread fences. Proposed compatible order is: owner lock; applicable identity/allowlist/approval and current thread/generation rows in the established order; exact claim/attempt/allocation records; cumulative quota record; capacity pool record; then final clock/fence/policy checks. Every operation that adds or releases occupancy and every marker/evidence writer must follow the same ordering. Absent allocation rows require the owner/attempt fence before insertion, not a row lock on an empty query.

A pool shared by owners must be locked as a shared capacity aggregate. Per-owner locks alone cannot protect its last slot. A policy update that only changes a pool row must never hold that row and then request an owner lock. A future bulk operation must acquire all necessary owners in stable order before shared aggregate locks, or use a separately reviewed scheme; no inverse lock order is implied. No external Auth or provider request belongs inside database locks.

Acquisition, marker commit, never-started close and terminal reconciliation must each update their exact records and aggregate counts in one transaction. A failed transaction must leave every counter and fact unchanged. A lost acknowledgment preserves the possible committed outcome; retries may inspect/reconcile the same identity but must not automatically issue another create. Uniqueness constraints are required alongside locking for allocation, owner/attempt, operation and evidence identities. Shared-pool/global uniqueness and conflict handling must be tested with actual independent backends.

Reconciliation must use a separate trusted exact-cleanup path that remains available after deletion or Auth expiry. It may read content-free bindings, operation/evidence facts, holds and tombstones. It must not unseal saved conversations, load journals, restore transcripts or retain provider payloads/audio. No existing P3b hold is migrated, reduced or reclassified by this new contract. Cost settlement, currency, invoice reconciliation, dispute handling, retention duration and deletion of durable fences remain separate unfinished designs.

## 6. Fictional acceptance matrix

The companion fixtures exercise these distinctions against the reference model. A passing local case is model evidence only; each transaction-sensitive row also needs future SQL/HTTP acceptance.

| Scenario | Required observation |
| --- | --- |
| Two distinct attempts compete for the final slot | One accepted allocation; rejected attempt adds no occupancy or hold. |
| Exact duplicate and changed-binding reuse | Exact duplicate adds nothing; mismatched allocation/attempt reuse denies. |
| Slot released, cumulative ceiling reached | A later attempt is denied despite free capacity; held units remain unchanged. |
| Close then delayed create marker | Slot released as never started; delayed marker cannot authorize sending. |
| Create marker then close, with lost reply | Admission closed; capacity occupied and all units held. |
| Crash before or after external send | Marker outcome remains uncertain until qualifying exact evidence; no automatic resend. |
| Expiry/Delete/account change/browser closure | No release of possibly-started occupancy; exact cleanup still available. |
| Known session termination and lost-create acknowledgment | Release only on exact final evidence covering the immutable operation. |
| Timeout/not-found/unknown outcome | Occupancy and hold retained. |
| Duplicate terminal evidence | One release, no negative occupancy, no refund and no reopened allocation. |
| Late stale evidence for an old operation | No effect on replacement allocation or context. |
| New contradictory evidence after release | Original facts retained; pool quarantined; replacement create marker denied. |
| Cross-owner/operation/session evidence or evidence-ID reuse | No release of the wrong slot; verified contradiction fails closed. |
| Capacity or cumulative limit lowered below current usage | Existing occupancy/holds retained; new allocation denied. |
| Malformed numbers, unsafe arithmetic or missing policy | No partial acquisition, counter drift or fallback budget. |
| Cleanup after deletion | Content-free exact reconciliation; no conversation reconstruction. |

The independent review should also vary ordering around close, marker, session acknowledgment, terminal evidence and duplicate delivery. It should assert cumulative units never fall, one attempt never owns multiple slots, released identities never resume, capacity is reusable only after the specified proof, and quarantine never clears as a side effect. Enumerated orderings are not concurrent-backend evidence.

## 7. Continuation and unchanged gates

After this model/contract batch, the next implementation is an isolated capacity/reconciliation SQL extension with transaction fixtures, preserving the existing admission SQL and P3b accounting semantics. It must be reviewed with the exact production Auth/session-fence, trusted issuance and snapshot ports before a live route. Run the already-prepared native 12-case admission suite only when an ordinary nonroot PostgreSQL environment is available; do not repeat failed environment probes.

The ten-day journey, freeform preparation, exact response policies, private-writing and chosen-faith boundaries, ecosystem source/draft distinctions, and completed P0–P3b/P5 evidence are unchanged. Original v5 is complete and closed. The separate P4 nine-turn draft still has null approval/expiry and an empty grant registry. P3b fictional accounts/staging remain closed with their ledger holds preserved. Participant AI/live voice and publication remain off. Provider selection, paid calls, actual authenticated/device/listener/screen-reader acceptance and publication require their separate later work and authority.
