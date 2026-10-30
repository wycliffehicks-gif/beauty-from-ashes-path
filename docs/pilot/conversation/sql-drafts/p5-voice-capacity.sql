-- PROPOSED EXTENSION; apply only to a new isolated offline fixture database.
-- Requires the unchanged p5-voice-admission.sql. No connected migration, live
-- route, Auth/provider adapter, seed allowance or provider call is enabled.
-- One immutable pool is one normalized provider/account identity namespace.
BEGIN;
CREATE SCHEMA bfa_p5_capacity;
REVOKE ALL ON SCHEMA bfa_p5_capacity FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE bfa_p5_capacity.pools (
 pool_id uuid PRIMARY KEY,
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 active_limit bigint NOT NULL CHECK(active_limit BETWEEN 0 AND 9007199254740991),
 unit_limit bigint NOT NULL CHECK(unit_limit BETWEEN 0 AND 9007199254740991),
 reservation_units bigint NOT NULL CHECK(reservation_units BETWEEN 1 AND 9007199254740991),
 occupied bigint NOT NULL DEFAULT 0 CHECK(occupied BETWEEN 0 AND 9007199254740991),
 held_units bigint NOT NULL DEFAULT 0 CHECK(held_units BETWEEN 0 AND 9007199254740991),
 enabled boolean NOT NULL DEFAULT false,
 quarantined boolean NOT NULL DEFAULT false
);
-- Only future reviewed provisioning may create pools/routes. No RPC seeds them,
-- rebinds a route or resets a counter. Policy updates preserve pool identity.
CREATE TABLE bfa_p5_capacity.routes (
 owner_id uuid NOT NULL, quota_policy_id uuid NOT NULL,
 pool_id uuid NOT NULL REFERENCES bfa_p5_capacity.pools(pool_id) ON DELETE RESTRICT,
 PRIMARY KEY(owner_id,quota_policy_id),
 FOREIGN KEY(owner_id,quota_policy_id) REFERENCES bfa_p5_voice.quotas(owner_id,policy_id) ON DELETE RESTRICT
);
CREATE TABLE bfa_p5_capacity.allocations (
 claim_id uuid PRIMARY KEY REFERENCES bfa_p5_voice.claims(claim_id) ON DELETE RESTRICT,
 owner_id uuid NOT NULL, attempt_id uuid NOT NULL,
 claim jsonb NOT NULL,
 cleanup_id uuid NOT NULL UNIQUE REFERENCES bfa_p5_voice.cleanup_owners(cleanup_id) ON DELETE RESTRICT,
 pool_id uuid NOT NULL REFERENCES bfa_p5_capacity.pools(pool_id) ON DELETE RESTRICT,
 pool_version bigint NOT NULL CHECK(pool_version BETWEEN 1 AND 9007199254740991),
 units bigint NOT NULL CHECK(units BETWEEN 1 AND 9007199254740991),
 slot_held boolean NOT NULL DEFAULT true,
 closed boolean NOT NULL DEFAULT false,
 operation_id uuid UNIQUE,
 session_id text CHECK(session_id ~ '^[A-Za-z0-9:_-]{1,160}$'),
 terminal text CHECK(terminal IN ('ended','not-created')),
 UNIQUE(owner_id,attempt_id),
 CHECK(terminal IS NULL OR (closed AND NOT slot_held AND operation_id IS NOT NULL)),
 CHECK(operation_id IS NOT NULL OR (session_id IS NULL AND terminal IS NULL)),
 CHECK(slot_held OR operation_id IS NULL OR terminal IS NOT NULL),
 CHECK(terminal IS DISTINCT FROM 'ended' OR session_id IS NOT NULL),
 CHECK(terminal IS DISTINCT FROM 'not-created' OR session_id IS NULL)
);
CREATE TABLE bfa_p5_capacity.sessions (
 pool_id uuid NOT NULL REFERENCES bfa_p5_capacity.pools(pool_id) ON DELETE RESTRICT,
 session_id text NOT NULL CHECK(session_id ~ '^[A-Za-z0-9:_-]{1,160}$'),
 operation_id uuid NOT NULL,
 PRIMARY KEY(pool_id,session_id)
);
CREATE TABLE bfa_p5_capacity.evidence (
 pool_id uuid NOT NULL REFERENCES bfa_p5_capacity.pools(pool_id) ON DELETE RESTRICT,
 evidence_id uuid NOT NULL, observation jsonb NOT NULL,
 PRIMARY KEY(pool_id,evidence_id)
);
CREATE TABLE bfa_p5_capacity.conflicts (
 pool_id uuid NOT NULL REFERENCES bfa_p5_capacity.pools(pool_id) ON DELETE RESTRICT,
 evidence_id uuid NOT NULL, observation jsonb NOT NULL, reason text NOT NULL,
 UNIQUE(pool_id,evidence_id,observation,reason)
);

-- Release only an exact allocation whose admission is already terminal and
-- whose external-create marker was never committed. Held units never change.
-- Caller has owner lock. Lock allocation, its quota, then shared pool.
CREATE FUNCTION bfa_p5_capacity.retire_if_fenced(p_claim jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE c bfa_p5_voice.claim_key; k bfa_p5_voice.cleanup_owners;
 a bfa_p5_capacity.allocations; v bfa_p5_voice.claims;
BEGIN
 c:=bfa_p5_voice.parse_claim(p_claim); PERFORM bfa_p5_voice.lock_owner(c.owner_id);
 SELECT * INTO k FROM bfa_p5_voice.cleanup_owners WHERE claim_id=(p_claim->>'claimId')::uuid AND owner_id=c.owner_id;
 IF NOT FOUND OR k.claim<>p_claim THEN RETURN; END IF;
 SELECT * INTO v FROM bfa_p5_voice.claims WHERE claim_id=k.claim_id AND owner_id=c.owner_id;
 IF k.closed_ms IS NULL AND k.expired_ms IS NULL AND k.invalidated_ms IS NULL
   AND (v.claim_id IS NULL OR v.state='claimed') THEN RETURN; END IF;
 SELECT * INTO a FROM bfa_p5_capacity.allocations WHERE claim_id=k.claim_id FOR UPDATE;
 IF NOT FOUND OR a.claim<>p_claim OR a.owner_id<>c.owner_id THEN RETURN; END IF;
 PERFORM 1 FROM bfa_p5_voice.quotas WHERE owner_id=c.owner_id AND policy_id=v.quota_policy_id FOR UPDATE;
 PERFORM 1 FROM bfa_p5_capacity.pools WHERE pool_id=a.pool_id FOR UPDATE;
 IF a.slot_held AND a.operation_id IS NULL THEN
  UPDATE bfa_p5_capacity.pools SET occupied=occupied-1 WHERE pool_id=a.pool_id;
  UPDATE bfa_p5_capacity.allocations SET closed=true,slot_held=false WHERE claim_id=a.claim_id;
 ELSE
  UPDATE bfa_p5_capacity.allocations SET closed=true WHERE claim_id=a.claim_id;
 END IF;
END $$;

-- Revalidate a previously loaded, exact protected proof. This does NOT accept
-- arbitrary browser JSON or authenticate an external Auth/provider service.
-- Call eligible BEFORE returning on a bad clock so current revocation persists.
CREATE FUNCTION bfa_p5_capacity.current(p bfa_p5_voice.proofs) RETURNS boolean
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE c bfa_p5_voice.claim_key; k bfa_p5_voice.cleanup_owners;
 ok boolean; missing boolean; n bigint;
BEGIN
 c:=bfa_p5_voice.parse_claim(p.claim);
 ok:=bfa_p5_voice.eligible(p);
 missing:=NOT EXISTS(SELECT 1 FROM public.bfa_p3b_staging_accounts WHERE user_id=c.owner_id)
  OR NOT EXISTS(SELECT 1 FROM public.bfa_p3b_threads WHERE id=c.thread_id AND owner_id=c.owner_id)
  OR NOT EXISTS(SELECT 1 FROM bfa_p5_voice.generations WHERE incarnation=c.incarnation AND owner_id=c.owner_id AND thread_id=c.thread_id)
  OR NOT EXISTS(SELECT 1 FROM bfa_p5_voice.session_fences WHERE owner_id=c.owner_id AND session_id=p.session_id)
  OR NOT EXISTS(SELECT 1 FROM bfa_p5_voice.issuances WHERE fingerprint=p.authority_fingerprint)
  OR NOT EXISTS(SELECT 1 FROM bfa_p5_voice.approvals WHERE approval_id=c.approval_id);
 IF missing THEN
  UPDATE bfa_p5_voice.cleanup_owners SET invalidated_ms=coalesce(invalidated_ms,bfa_p5_voice.ms())
   WHERE claim_id=p.claim_id AND owner_id=c.owner_id;
  UPDATE bfa_p5_voice.claims SET state='invalidated' WHERE claim_id=p.claim_id AND owner_id=c.owner_id AND state='claimed';
 END IF;
 n:=bfa_p5_voice.observe_now(c.owner_id);
 IF n IS NOT NULL THEN PERFORM bfa_p5_voice.fence_expiry(p.claim_id,c.owner_id,n); END IF;
 SELECT * INTO k FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id=p.cleanup_id AND claim_id=p.claim_id;
 IF NOT FOUND THEN RETURN false; END IF;
 RETURN coalesce(ok,false) AND NOT missing AND n IS NOT NULL
  AND k.claim=p.claim AND k.owner_id=c.owner_id
  AND k.closed_ms IS NULL AND k.expired_ms IS NULL AND k.invalidated_ms IS NULL
  AND k.session_id IS NOT DISTINCT FROM p.session_id
  AND k.session_version IS NOT DISTINCT FROM p.session_version
  AND k.authority_fingerprint IS NOT DISTINCT FROM p.authority_fingerprint
  AND n<k.effective_expires_ms AND n<p.expires_ms AND n<p.effective_expires_ms
  AND p.effective_expires_ms<=k.effective_expires_ms;
END $$;

CREATE FUNCTION bfa_p5_capacity.take_proof(p_receipt_id uuid,p_claim jsonb,p_operation text)
RETURNS bfa_p5_voice.proofs LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE c bfa_p5_voice.claim_key; p bfa_p5_voice.proofs; k bfa_p5_voice.cleanup_owners;
BEGIN
 c:=bfa_p5_voice.parse_claim(p_claim); PERFORM bfa_p5_voice.lock_owner(c.owner_id);
 SELECT * INTO p FROM bfa_p5_voice.proofs WHERE receipt_id=p_receipt_id FOR UPDATE;
 IF NOT FOUND OR p.owner_id<>c.owner_id OR p.claim_id<>(p_claim->>'claimId')::uuid
  OR p.claim<>p_claim OR p.operation<>p_operation OR p.consumed_ms IS NOT NULL THEN RETURN NULL; END IF;
 UPDATE bfa_p5_voice.proofs SET consumed_ms=bfa_p5_voice.ms() WHERE receipt_id=p.receipt_id;
 SELECT * INTO k FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id=p.cleanup_id AND claim_id=p.claim_id FOR UPDATE;
 IF NOT FOUND OR k.claim<>p_claim OR k.owner_id<>c.owner_id THEN RETURN NULL; END IF;
 IF k.closed_ms IS NOT NULL OR k.expired_ms IS NOT NULL OR k.invalidated_ms IS NOT NULL THEN
  PERFORM bfa_p5_capacity.retire_if_fenced(p_claim); RETURN NULL;
 END IF;
 IF k.session_id IS DISTINCT FROM p.session_id OR k.session_version IS DISTINCT FROM p.session_version
   OR k.authority_fingerprint IS DISTINCT FROM p.authority_fingerprint THEN RETURN NULL; END IF;
 IF NOT bfa_p5_capacity.current(p) THEN
  PERFORM bfa_p5_capacity.retire_if_fenced(p_claim); RETURN NULL;
 END IF;
 RETURN p;
END $$;

CREATE FUNCTION bfa_p5_capacity.denied(p_claim jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 RETURN bfa_p5_voice.ack(p_claim,CASE WHEN EXISTS(SELECT 1 FROM bfa_p5_voice.cleanup_owners
  WHERE claim_id=(p_claim->>'claimId')::uuid AND claim=p_claim AND closed_ms IS NOT NULL)
  THEN 'closed' ELSE 'denied' END);
END $$;

-- Atomic combined admission, exactly one existing cumulative quota hold, and
-- capacity allocation. No successful base claim followed by a partial denial.
-- Existing base-only claims cannot be lazily attached or charged a second time.
CREATE FUNCTION public.bfa_p5_capacity_claim(p_receipt_id uuid,p_claim jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c bfa_p5_voice.claim_key; p bfa_p5_voice.proofs; v bfa_p5_voice.claims;
 t bfa_p5_voice.attempts; approval bfa_p5_voice.approvals; q bfa_p5_voice.quotas;
 a bfa_p5_capacity.allocations; route bfa_p5_capacity.routes; pool bfa_p5_capacity.pools;
 id uuid;
BEGIN
 c:=bfa_p5_voice.parse_claim(p_claim); id:=(p_claim->>'claimId')::uuid;
 p:=bfa_p5_capacity.take_proof(p_receipt_id,p_claim,'claim');
 IF p.receipt_id IS NULL THEN RETURN bfa_p5_capacity.denied(p_claim); END IF;
 SELECT * INTO v FROM bfa_p5_voice.claims WHERE claim_id=id FOR UPDATE;
 IF FOUND AND (v.claim<>p_claim OR v.owner_id<>c.owner_id) THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 SELECT * INTO t FROM bfa_p5_voice.attempts WHERE owner_id=c.owner_id AND attempt_id=c.attempt_id FOR UPDATE;
 IF FOUND AND (t.retired OR t.winner_claim_id IS DISTINCT FROM id) THEN
  RETURN bfa_p5_voice.ack(p_claim,CASE WHEN t.retired THEN 'denied' ELSE 'replayed' END);
 END IF;
 SELECT * INTO a FROM bfa_p5_capacity.allocations WHERE claim_id=id FOR UPDATE;
 IF v.claim_id IS NOT NULL AND (a.claim_id IS NULL OR a.claim<>p_claim OR a.owner_id<>c.owner_id
  OR a.cleanup_id<>p.cleanup_id OR v.state<>'claimed' OR a.closed OR NOT a.slot_held
  OR t.winner_claim_id IS DISTINCT FROM id OR a.units<>v.held_units) THEN
  RETURN bfa_p5_capacity.denied(p_claim);
 END IF;
 IF v.claim_id IS NULL AND a.claim_id IS NOT NULL THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 SELECT * INTO approval FROM bfa_p5_voice.approvals WHERE approval_id=c.approval_id;
 SELECT * INTO q FROM bfa_p5_voice.quotas WHERE owner_id=c.owner_id AND policy_id=approval.quota_policy_id FOR UPDATE;
 IF NOT FOUND OR NOT q.enabled THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 SELECT * INTO route FROM bfa_p5_capacity.routes WHERE owner_id=c.owner_id AND quota_policy_id=q.policy_id FOR SHARE;
 IF NOT FOUND THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 SELECT * INTO pool FROM bfa_p5_capacity.pools WHERE pool_id=route.pool_id FOR UPDATE;
 IF NOT FOUND THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 -- The shared pool can wait behind another owner's last-slot transition.
 IF NOT bfa_p5_capacity.current(p) THEN
  PERFORM bfa_p5_capacity.retire_if_fenced(p_claim); RETURN bfa_p5_capacity.denied(p_claim);
 END IF;
 IF NOT pool.enabled OR pool.quarantined OR q.reservation_units<>pool.reservation_units THEN
  RETURN bfa_p5_voice.ack(p_claim,'denied');
 END IF;
 IF v.claim_id IS NOT NULL THEN
  IF a.pool_id<>pool.pool_id OR a.units<>pool.reservation_units OR v.quota_policy_id<>q.policy_id THEN
   RETURN bfa_p5_voice.ack(p_claim,'denied');
  END IF;
  RETURN bfa_p5_voice.ack(p_claim,'claimed'); -- Never a second debit or create permit.
 END IF;
 IF q.remaining_units<q.reservation_units OR pool.occupied>=pool.active_limit
  OR pool.reservation_units>pool.unit_limit-pool.held_units THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 INSERT INTO bfa_p5_voice.attempts VALUES(c.owner_id,c.attempt_id,id,false);
 UPDATE bfa_p5_voice.quotas SET remaining_units=remaining_units-q.reservation_units WHERE owner_id=q.owner_id AND policy_id=q.policy_id;
 INSERT INTO bfa_p5_voice.claims VALUES(id,c.owner_id,p_claim,p.effective_expires_ms,'claimed',q.policy_id,q.reservation_units);
 INSERT INTO bfa_p5_capacity.allocations(claim_id,owner_id,attempt_id,claim,cleanup_id,pool_id,pool_version,units)
  VALUES(id,c.owner_id,c.attempt_id,p_claim,p.cleanup_id,pool.pool_id,pool.version,q.reservation_units);
 UPDATE bfa_p5_capacity.pools SET occupied=occupied+1,held_units=held_units+q.reservation_units WHERE pool_id=pool.pool_id;
 RETURN bfa_p5_voice.ack(p_claim,'claimed');
END $$;

CREATE FUNCTION public.bfa_p5_capacity_mark(p_receipt_id uuid,p_claim jsonb,p_operation_id uuid,p_expected_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c bfa_p5_voice.claim_key; p bfa_p5_voice.proofs; v bfa_p5_voice.claims;
 a bfa_p5_capacity.allocations; q bfa_p5_voice.quotas; pool bfa_p5_capacity.pools; route bfa_p5_capacity.routes;
BEGIN
 c:=bfa_p5_voice.parse_claim(p_claim);
 IF p_operation_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Unavailable'; END IF;
 p:=bfa_p5_capacity.take_proof(p_receipt_id,p_claim,'inspect');
 IF p.receipt_id IS NULL THEN RETURN bfa_p5_capacity.denied(p_claim); END IF;
 SELECT * INTO v FROM bfa_p5_voice.claims WHERE claim_id=p.claim_id FOR UPDATE;
 IF NOT FOUND OR v.claim<>p_claim OR v.owner_id<>c.owner_id OR v.state<>'claimed' THEN RETURN bfa_p5_capacity.denied(p_claim); END IF;
 PERFORM 1 FROM bfa_p5_voice.attempts WHERE owner_id=c.owner_id AND attempt_id=c.attempt_id AND winner_claim_id=p.claim_id AND NOT retired FOR UPDATE;
 IF NOT FOUND THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 SELECT * INTO a FROM bfa_p5_capacity.allocations WHERE claim_id=p.claim_id FOR UPDATE;
 IF NOT FOUND OR a.claim<>p_claim OR a.owner_id<>c.owner_id OR a.cleanup_id<>p.cleanup_id
  OR a.closed OR NOT a.slot_held OR a.units<>v.held_units THEN RETURN bfa_p5_capacity.denied(p_claim); END IF;
 SELECT * INTO q FROM bfa_p5_voice.quotas WHERE owner_id=c.owner_id AND policy_id=v.quota_policy_id FOR UPDATE;
 IF NOT FOUND OR NOT q.enabled THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 SELECT * INTO route FROM bfa_p5_capacity.routes WHERE owner_id=c.owner_id AND quota_policy_id=q.policy_id FOR SHARE;
 IF NOT FOUND OR route.pool_id<>a.pool_id THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 SELECT * INTO pool FROM bfa_p5_capacity.pools WHERE pool_id=a.pool_id FOR UPDATE;
 IF NOT FOUND THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 -- A separate global operation fence protects absent cross-owner operation IDs.
 -- It is acquired only after owner/record/quota/pool locks, never in reverse.
 PERFORM pg_advisory_xact_lock(hashtextextended('bfa_p5_capacity_operation:'||p_operation_id::text,0));
 IF NOT bfa_p5_capacity.current(p) THEN
  PERFORM bfa_p5_capacity.retire_if_fenced(p_claim); RETURN bfa_p5_capacity.denied(p_claim);
 END IF;
 -- The retained hold cannot authorize create under an approval rebound to a
 -- different current quota policy, even when its original quota stays enabled.
 IF NOT EXISTS(SELECT 1 FROM bfa_p5_voice.approvals WHERE approval_id=c.approval_id
  AND quota_policy_id=v.quota_policy_id) THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 IF pool.quarantined THEN RETURN bfa_p5_voice.ack(p_claim,'quarantined'); END IF;
 IF NOT pool.enabled OR pool.version<>p_expected_version OR pool.occupied>pool.active_limit
  OR pool.held_units>pool.unit_limit OR pool.reservation_units<>a.units OR q.reservation_units<>a.units THEN
  RETURN bfa_p5_voice.ack(p_claim,'denied');
 END IF;
 -- Even marker replay requires current policy/limits; already-marked is an
 -- observation only and must never authorize repeating an external request.
 IF a.operation_id IS NOT NULL THEN
  RETURN bfa_p5_voice.ack(p_claim,CASE WHEN a.operation_id=p_operation_id THEN 'already-marked' ELSE 'denied' END);
 END IF;
 IF EXISTS(SELECT 1 FROM bfa_p5_capacity.allocations WHERE operation_id=p_operation_id) THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 UPDATE bfa_p5_capacity.allocations SET operation_id=p_operation_id WHERE claim_id=a.claim_id;
 RETURN bfa_p5_voice.ack(p_claim,'marked'); -- Only an offline marker, never a provider call.
END $$;

CREATE FUNCTION public.bfa_p5_capacity_close(p_cleanup_id uuid,p_claim jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 -- Base close preserves exact cleanup, loser isolation and absent-attempt fence.
 result:=public.bfa_p5_voice_close(p_cleanup_id,p_claim);
 PERFORM bfa_p5_capacity.retire_if_fenced(p_claim);
 RETURN result;
END $$;

CREATE FUNCTION bfa_p5_capacity.conflict(p_pool uuid,p_evidence uuid,p_observation jsonb,p_reason text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 UPDATE bfa_p5_capacity.pools SET quarantined=true WHERE pool_id=p_pool;
 INSERT INTO bfa_p5_capacity.conflicts VALUES(p_pool,p_evidence,p_observation,p_reason) ON CONFLICT DO NOTHING;
END $$;

-- Input is an ALREADY AUTHENTICATED and normalized future provider observation.
-- ended/not-created must attest finality of the entire immutable create operation,
-- not just an HTTP ACK/404/timeout. This SQL cannot authenticate that external fact.
-- The trusted reconciler retains the exact cleanup identity after deletion/Auth expiry.
CREATE FUNCTION public.bfa_p5_capacity_reconcile(p_cleanup_id uuid,p_claim jsonb,p_observation jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c bfa_p5_voice.claim_key; k bfa_p5_voice.cleanup_owners; v bfa_p5_voice.claims;
 a bfa_p5_capacity.allocations; old bfa_p5_capacity.evidence;
 operation uuid; v_evidence uuid; kind text; session text; session_operation uuid; normalized jsonb;
BEGIN
 c:=bfa_p5_voice.parse_claim(p_claim);
 IF p_cleanup_id IS NULL OR NOT bfa_p5_voice.exact_keys(p_observation,ARRAY['evidenceId','operationId','kind','sessionId'])
  OR octet_length(p_observation::text)>1024 THEN RAISE EXCEPTION 'Unavailable'; END IF;
 operation:=bfa_p5_voice.id(p_observation->'operationId'); v_evidence:=bfa_p5_voice.id(p_observation->'evidenceId');
 kind:=p_observation->>'kind'; session:=p_observation->>'sessionId';
 IF jsonb_typeof(p_observation->'kind') IS DISTINCT FROM 'string' OR kind NOT IN ('created','ended','not-created','unknown')
  OR (kind IN ('created','ended') AND (jsonb_typeof(p_observation->'sessionId') IS DISTINCT FROM 'string' OR session !~ '^[A-Za-z0-9:_-]{1,160}$'))
  OR (kind IN ('not-created','unknown') AND p_observation->'sessionId'<>'null'::jsonb) THEN RAISE EXCEPTION 'Unavailable'; END IF;
 PERFORM bfa_p5_voice.lock_owner(c.owner_id);
 SELECT * INTO k FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id=p_cleanup_id AND claim_id=(p_claim->>'claimId')::uuid FOR UPDATE;
 IF NOT FOUND OR k.claim<>p_claim OR k.owner_id<>c.owner_id THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 SELECT * INTO v FROM bfa_p5_voice.claims WHERE claim_id=k.claim_id FOR UPDATE;
 IF NOT FOUND OR v.claim<>p_claim OR v.owner_id<>c.owner_id THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 SELECT * INTO a FROM bfa_p5_capacity.allocations WHERE claim_id=k.claim_id FOR UPDATE;
 IF NOT FOUND OR a.claim<>p_claim OR a.owner_id<>c.owner_id OR a.cleanup_id<>p_cleanup_id
  OR a.operation_id IS DISTINCT FROM operation THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 PERFORM 1 FROM bfa_p5_voice.quotas WHERE owner_id=c.owner_id AND policy_id=v.quota_policy_id FOR UPDATE;
 PERFORM 1 FROM bfa_p5_capacity.pools WHERE pool_id=a.pool_id FOR UPDATE;
 normalized:=jsonb_build_object('claim',p_claim,'observation',p_observation);
 SELECT * INTO old FROM bfa_p5_capacity.evidence WHERE pool_id=a.pool_id AND evidence_id=v_evidence;
 IF FOUND THEN
  IF old.observation=normalized THEN RETURN bfa_p5_voice.ack(p_claim,'duplicate-evidence'); END IF;
  PERFORM bfa_p5_capacity.conflict(a.pool_id,v_evidence,normalized,'evidence-rebound');
  RETURN bfa_p5_voice.ack(p_claim,'quarantined');
 END IF;
 INSERT INTO bfa_p5_capacity.evidence VALUES(a.pool_id,v_evidence,normalized);
 IF kind='unknown' THEN
  RETURN bfa_p5_voice.ack(p_claim,CASE WHEN a.terminal IS NULL THEN 'uncertain' ELSE 'late-evidence' END);
 END IF;
 IF session IS NOT NULL THEN
  SELECT operation_id INTO session_operation FROM bfa_p5_capacity.sessions WHERE pool_id=a.pool_id AND session_id=session;
  IF FOUND AND session_operation<>operation THEN
   PERFORM bfa_p5_capacity.conflict(a.pool_id,v_evidence,normalized,'session-rebound');
   RETURN bfa_p5_voice.ack(p_claim,'quarantined');
  END IF;
  INSERT INTO bfa_p5_capacity.sessions VALUES(a.pool_id,session,operation) ON CONFLICT DO NOTHING;
 END IF;
 IF kind='created' THEN
  IF a.terminal='not-created' OR (a.session_id IS NOT NULL AND a.session_id<>session) THEN
   PERFORM bfa_p5_capacity.conflict(a.pool_id,v_evidence,normalized,'session-contradiction');
   RETURN bfa_p5_voice.ack(p_claim,'quarantined');
  END IF;
  UPDATE bfa_p5_capacity.allocations SET session_id=session WHERE claim_id=a.claim_id;
  RETURN bfa_p5_voice.ack(p_claim,CASE WHEN a.terminal='ended' THEN 'late-evidence' ELSE 'creation-observed' END);
 END IF;
 IF (a.terminal IS NOT NULL AND a.terminal<>kind)
  OR (kind='not-created' AND a.session_id IS NOT NULL)
  OR (kind='ended' AND a.session_id IS NOT NULL AND a.session_id<>session) THEN
  PERFORM bfa_p5_capacity.conflict(a.pool_id,v_evidence,normalized,'terminal-contradiction');
  RETURN bfa_p5_voice.ack(p_claim,'quarantined');
 END IF;
 -- Terminal admission fencing and one capacity release commit together. Never
 -- decrease either base held_units or cumulative pool held_units.
 UPDATE bfa_p5_voice.cleanup_owners SET closed_ms=coalesce(closed_ms,bfa_p5_voice.ms()) WHERE cleanup_id=p_cleanup_id;
 UPDATE bfa_p5_voice.claims SET state='closed' WHERE claim_id=a.claim_id;
 IF a.slot_held THEN UPDATE bfa_p5_capacity.pools SET occupied=occupied-1 WHERE pool_id=a.pool_id; END IF;
 UPDATE bfa_p5_capacity.allocations SET closed=true,slot_held=false,terminal=kind,session_id=session WHERE claim_id=a.claim_id;
 RETURN bfa_p5_voice.ack(p_claim,'terminal-recorded');
END $$;

-- Updates only an already-provisioned pool. No initial allowance, route change,
-- unit-definition change, refund, counter reset or quarantine-clear operation.
CREATE FUNCTION public.bfa_p5_capacity_policy(p_pool_id uuid,p_expected_version bigint,p_active_limit bigint,p_unit_limit bigint,p_enabled boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE pool bfa_p5_capacity.pools;
BEGIN
 IF p_pool_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740990
  OR p_active_limit IS NULL OR p_active_limit NOT BETWEEN 0 AND 9007199254740991
  OR p_unit_limit IS NULL OR p_unit_limit NOT BETWEEN 0 AND 9007199254740991 OR p_enabled IS NULL THEN RAISE EXCEPTION 'Unavailable'; END IF;
 SELECT * INTO pool FROM bfa_p5_capacity.pools WHERE pool_id=p_pool_id FOR UPDATE;
 IF NOT FOUND OR pool.version<>p_expected_version THEN RETURN false; END IF;
 UPDATE bfa_p5_capacity.pools SET version=version+1,active_limit=p_active_limit,unit_limit=p_unit_limit,enabled=p_enabled WHERE pool_id=p_pool_id;
 RETURN true;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA bfa_p5_capacity FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA bfa_p5_capacity FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE f record; sig regprocedure; BEGIN
 FOREACH sig IN ARRAY ARRAY[
  'public.bfa_p5_capacity_claim(uuid,jsonb)'::regprocedure,
  'public.bfa_p5_capacity_mark(uuid,jsonb,uuid,bigint)'::regprocedure,
  'public.bfa_p5_capacity_close(uuid,jsonb)'::regprocedure,
  'public.bfa_p5_capacity_reconcile(uuid,jsonb,jsonb)'::regprocedure,
  'public.bfa_p5_capacity_policy(uuid,bigint,bigint,bigint,boolean)'::regprocedure] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',sig);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',sig);
 END LOOP;
 FOR f IN SELECT tablename FROM pg_tables WHERE schemaname='bfa_p5_capacity' LOOP
  EXECUTE format('ALTER TABLE bfa_p5_capacity.%I ENABLE ROW LEVEL SECURITY',f.tablename);
 END LOOP;
END $$;
COMMIT;
