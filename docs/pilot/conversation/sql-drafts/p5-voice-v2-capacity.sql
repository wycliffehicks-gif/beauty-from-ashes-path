-- PROPOSED isolated v2 capacity admission, OUTSIDE migrations. Requires base
-- admission/capacity and completed v2 parent, cleanup and proof drafts. Reuses
-- their shared accounting; no table, allowance, route or approval is created.
-- No connected SQL, Auth verifier, capacity mark, provider call or runtime
-- route is enabled. Complete versioned mark/orchestration and a quiesced
-- no-fallback route/privilege cutover remain required before deployment.
BEGIN;

-- Parse the complete original registration receipt. This does not register,
-- renew or authenticate it; take_proof must match the protected stored row.
CREATE FUNCTION bfa_p5_voice_v2.parse_capacity_proof(p_proof jsonb,p_operation text)
RETURNS bfa_p5_voice.proofs LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,pg_temp AS $$
DECLARE p bfa_p5_voice.proofs; c bfa_p5_voice.claim_key;
BEGIN
  IF octet_length(p_proof::text)>8192
    OR NOT bfa_p5_voice.exact_keys(p_proof,ARRAY[
      'protocol','receiptId','operation','claim','cleanupId','authSessionId',
      'parentVersion','authorityFingerprint','identityExpiresAt','verifiedAt',
      'expiresAt','effectiveExpiresAt'])
    OR p_proof->'protocol' IS DISTINCT FROM '2'::jsonb
    OR p_operation IS NULL OR p_operation NOT IN ('claim','inspect')
    OR jsonb_typeof(p_proof->'operation') IS DISTINCT FROM 'string'
    OR p_proof->>'operation' IS DISTINCT FROM p_operation
    OR jsonb_typeof(p_proof->'authorityFingerprint') IS DISTINCT FROM 'string'
    OR (p_proof->>'authorityFingerprint') !~ '^[0-9a-f]{64}$'
    THEN RAISE EXCEPTION 'Unavailable'; END IF;
  c:=bfa_p5_voice.parse_claim(p_proof->'claim');
  p.protocol:=2; p.operation:=p_operation;
  p.receipt_id:=bfa_p5_voice.id(p_proof->'receiptId');
  p.cleanup_id:=bfa_p5_voice.id(p_proof->'cleanupId');
  p.claim_id:=bfa_p5_voice.id(p_proof->'claim'->'claimId');
  p.owner_id:=c.owner_id; p.claim:=p_proof->'claim';
  p.session_id:=bfa_p5_voice.id(p_proof->'authSessionId');
  p.session_version:=bfa_p5_voice.n(p_proof->'parentVersion');
  p.authority_fingerprint:=p_proof->>'authorityFingerprint';
  p.identity_expires_ms:=bfa_p5_voice.n(p_proof->'identityExpiresAt');
  p.verified_ms:=bfa_p5_voice.n(p_proof->'verifiedAt');
  p.expires_ms:=bfa_p5_voice.n(p_proof->'expiresAt');
  p.effective_expires_ms:=bfa_p5_voice.n(p_proof->'effectiveExpiresAt');
  IF '00000000-0000-0000-0000-000000000000'::uuid=ANY(ARRAY[
      p.receipt_id,p.cleanup_id,p.claim_id,p.owner_id,p.session_id,c.thread_id,
      c.incarnation,c.attempt_id,c.approval_id])
    OR p.identity_expires_ms<=p.verified_ms
    OR p.expires_ms-p.verified_ms NOT BETWEEN 1 AND 30000
    OR p.expires_ms>p.effective_expires_ms
    OR p.effective_expires_ms>p.identity_expires_ms
    OR p.effective_expires_ms>c.expires_ms
    THEN RAISE EXCEPTION 'Unavailable'; END IF;
  RETURN p;
END $$;

CREATE FUNCTION bfa_p5_voice_v2.capacity_ack(p_proof jsonb,p_status text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT jsonb_build_object('protocol',2,'proof',p_proof,'status',p_status)
$$;

-- This private primitive owns only the stored receipt and one consumption
-- transition. Current policy is checked separately on its retained local row.
-- No input mismatch, v1 row or previously consumed receipt is adopted/burned.
CREATE FUNCTION bfa_p5_voice_v2.take_proof(candidate bfa_p5_voice.proofs)
RETURNS bfa_p5_voice.proofs LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp AS $$
DECLARE p bfa_p5_voice.proofs; n bigint; prior bigint;
BEGIN
  PERFORM bfa_p5_voice.lock_owner(candidate.owner_id);
  PERFORM pg_advisory_xact_lock(hashtext('bfa-p5-v2-proof-receipt'),hashtext(candidate.receipt_id::text));
  SELECT * INTO p FROM bfa_p5_voice.proofs
    WHERE receipt_id=candidate.receipt_id FOR UPDATE;
  IF NOT FOUND OR p.protocol IS DISTINCT FROM 2
    OR p.consumed_ms IS NOT NULL OR p IS DISTINCT FROM candidate THEN RETURN NULL; END IF;
  SELECT observed_ms INTO prior FROM bfa_p5_voice.owner_clocks
    WHERE owner_id=p.owner_id FOR UPDATE;
  n:=bfa_p5_voice.ms();
  -- For protocol 2, zero on an unsafe/unavailable clock is explicitly only a
  -- non-null consumption fence, not a known consumption time or Auth freshness.
  -- Returning denial commits that fence; SQL exceptions/transaction rollback
  -- remain uncertain and must never be described as a guaranteed consumption.
  UPDATE bfa_p5_voice.proofs SET consumed_ms=
    CASE WHEN n BETWEEN 0 AND 9007199254740991 THEN n ELSE 0 END
    WHERE receipt_id=p.receipt_id;
  IF n IS NULL OR n NOT BETWEEN 0 AND 9007199254740991 THEN RETURN NULL; END IF;
  IF prior IS NOT NULL AND n<prior THEN RETURN NULL; END IF;
  -- Retain this safe observation too: a rollback between consumption and the
  -- later eligibility sample cannot hide below an older registration clock.
  INSERT INTO bfa_p5_voice.owner_clocks VALUES(p.owner_id,n)
    ON CONFLICT(owner_id) DO UPDATE SET observed_ms=
      greatest(bfa_p5_voice.owner_clocks.observed_ms,excluded.observed_ms);
  -- Deliberately no RETURNING into p: stored state is consumed, while the local
  -- exact original composite remains unconsumed for the shared v2 predicate.
  -- Its original verification, proof and effective deadlines never change.
  RETURN p;
END $$;

-- Always re-run the completed v2 predicate, including post-lock monotonic time,
-- exact current parent/legacy exclusion, issuance, cleanup, claim and winner.
-- A missing/revoked parent or missing protected row denies without inventing
-- permanent Auth revocation. No v1 enabling predicate or deadline is consulted.
CREATE FUNCTION bfa_p5_voice_v2.current(p bfa_p5_voice.proofs)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  RETURN coalesce(bfa_p5_voice_v2.eligible(p),false);
END $$;

-- Retire only this exact already-terminal capacity allocation. Unlike the old
-- helper, validate its cleanup/Auth binding and allocation cleanup identity
-- before changing anything. Inconsistent/missing accounting is denied rather
-- than underflowing or releasing another hold. No cumulative units are refunded.
CREATE FUNCTION bfa_p5_voice_v2.retire_if_fenced(p bfa_p5_voice.proofs)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE c bfa_p5_voice.claim_key; k bfa_p5_voice.cleanup_owners;
  v bfa_p5_voice.claims; a bfa_p5_capacity.allocations;
  q bfa_p5_voice.quotas; pool bfa_p5_capacity.pools;
BEGIN
  c:=bfa_p5_voice.parse_claim(p.claim); PERFORM bfa_p5_voice.lock_owner(c.owner_id);
  SELECT * INTO k FROM bfa_p5_voice.cleanup_owners
    WHERE cleanup_id=p.cleanup_id AND claim_id=p.claim_id FOR UPDATE;
  IF NOT FOUND OR k.protocol IS DISTINCT FROM 2 OR k.owner_id<>c.owner_id
    OR k.claim IS DISTINCT FROM p.claim OR k.session_id IS DISTINCT FROM p.session_id
    OR k.session_version IS DISTINCT FROM p.session_version
    OR k.authority_fingerprint IS DISTINCT FROM p.authority_fingerprint THEN RETURN; END IF;
  SELECT * INTO v FROM bfa_p5_voice.claims WHERE claim_id=p.claim_id FOR UPDATE;
  IF NOT FOUND OR v.owner_id<>c.owner_id OR v.claim IS DISTINCT FROM p.claim THEN RETURN; END IF;
  IF k.closed_ms IS NULL AND k.expired_ms IS NULL AND k.invalidated_ms IS NULL
    AND v.state='claimed' THEN RETURN; END IF;
  SELECT * INTO a FROM bfa_p5_capacity.allocations WHERE claim_id=p.claim_id FOR UPDATE;
  IF NOT FOUND OR a.owner_id<>c.owner_id OR a.claim IS DISTINCT FROM p.claim
    OR a.cleanup_id<>p.cleanup_id OR a.attempt_id<>c.attempt_id
    OR a.units<>v.held_units THEN RETURN; END IF;
  SELECT * INTO q FROM bfa_p5_voice.quotas
    WHERE owner_id=c.owner_id AND policy_id=v.quota_policy_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO pool FROM bfa_p5_capacity.pools WHERE pool_id=a.pool_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF a.slot_held AND a.operation_id IS NULL THEN
    IF pool.occupied<1 THEN RETURN; END IF;
    UPDATE bfa_p5_capacity.pools SET occupied=occupied-1 WHERE pool_id=a.pool_id;
    UPDATE bfa_p5_capacity.allocations SET closed=true,slot_held=false WHERE claim_id=a.claim_id;
  ELSIF NOT a.closed THEN
    -- A marked uncertain operation retains its slot until exact authenticated
    -- whole-operation finality reaches the unchanged reconciliation boundary.
    UPDATE bfa_p5_capacity.allocations SET closed=true WHERE claim_id=a.claim_id;
  END IF;
END $$;

-- Called only after take_proof matched the complete protected original tuple.
-- 'closed' observes an exact terminal cleanup; it is not evidence of provider
-- finality, a refund, or successful completion of an uncertain transport call.
CREATE FUNCTION bfa_p5_voice_v2.capacity_denied(p_proof jsonb,p bfa_p5_voice.proofs)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  RETURN bfa_p5_voice_v2.capacity_ack(p_proof,CASE WHEN EXISTS(
    SELECT 1 FROM bfa_p5_voice.cleanup_owners k
    WHERE k.cleanup_id=p.cleanup_id AND k.claim_id=p.claim_id AND k.owner_id=p.owner_id
      AND k.protocol=2 AND k.claim=p.claim AND k.session_id=p.session_id
      AND k.session_version=p.session_version AND k.authority_fingerprint=p.authority_fingerprint
      AND k.closed_ms IS NOT NULL) THEN 'closed' ELSE 'denied' END);
END $$;

-- One versioned path for atomic capacity claim and existing-claim inspection.
-- Inspection never creates a claim/attempt/allocation or performs a quota debit.
-- Neither a standalone base claim nor a legacy/unbound cleanup can be attached.
CREATE FUNCTION bfa_p5_voice_v2.capacity_admit(p_proof jsonb,p_operation text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE candidate bfa_p5_voice.proofs; p bfa_p5_voice.proofs;
  c bfa_p5_voice.claim_key; v bfa_p5_voice.claims; t bfa_p5_voice.attempts;
  approval bfa_p5_voice.approvals; q bfa_p5_voice.quotas;
  a bfa_p5_capacity.allocations; route bfa_p5_capacity.routes; pool bfa_p5_capacity.pools;
BEGIN
  candidate:=bfa_p5_voice_v2.parse_capacity_proof(p_proof,p_operation);
  p:=bfa_p5_voice_v2.take_proof(candidate);
  IF p.receipt_id IS NULL THEN RETURN bfa_p5_voice_v2.capacity_ack(p_proof,'denied'); END IF;
  c:=bfa_p5_voice.parse_claim(p.claim);
  IF NOT bfa_p5_voice_v2.current(p) THEN
    PERFORM bfa_p5_voice_v2.retire_if_fenced(p);
    RETURN bfa_p5_voice_v2.capacity_denied(p_proof,p);
  END IF;
  SELECT * INTO v FROM bfa_p5_voice.claims WHERE claim_id=p.claim_id FOR UPDATE;
  IF FOUND AND (v.claim IS DISTINCT FROM p.claim OR v.owner_id<>c.owner_id OR v.state<>'claimed')
    THEN RETURN bfa_p5_voice_v2.capacity_denied(p_proof,p); END IF;
  SELECT * INTO t FROM bfa_p5_voice.attempts
    WHERE owner_id=c.owner_id AND attempt_id=c.attempt_id FOR UPDATE;
  IF FOUND AND (t.retired OR t.winner_claim_id IS DISTINCT FROM p.claim_id)
    THEN RETURN bfa_p5_voice_v2.capacity_ack(p_proof,'denied'); END IF;
  SELECT * INTO a FROM bfa_p5_capacity.allocations WHERE claim_id=p.claim_id FOR UPDATE;
  IF v.claim_id IS NOT NULL THEN
    IF a.claim_id IS NULL OR a.owner_id<>c.owner_id OR a.claim IS DISTINCT FROM p.claim
      OR a.cleanup_id<>p.cleanup_id OR a.attempt_id<>c.attempt_id
      OR a.closed OR NOT a.slot_held OR a.units<>v.held_units
      OR t.winner_claim_id IS DISTINCT FROM p.claim_id
      THEN RETURN bfa_p5_voice_v2.capacity_denied(p_proof,p); END IF;
  ELSIF p_operation<>'claim' OR a.claim_id IS NOT NULL OR t.owner_id IS NOT NULL THEN
    RETURN bfa_p5_voice_v2.capacity_ack(p_proof,'denied');
  END IF;
  SELECT * INTO approval FROM bfa_p5_voice.approvals WHERE approval_id=c.approval_id FOR SHARE;
  IF NOT FOUND THEN RETURN bfa_p5_voice_v2.capacity_ack(p_proof,'denied'); END IF;
  IF v.claim_id IS NOT NULL AND v.quota_policy_id<>approval.quota_policy_id
    THEN RETURN bfa_p5_voice_v2.capacity_ack(p_proof,'denied'); END IF;
  SELECT * INTO q FROM bfa_p5_voice.quotas
    WHERE owner_id=c.owner_id AND policy_id=approval.quota_policy_id FOR UPDATE;
  IF NOT FOUND OR NOT q.enabled THEN RETURN bfa_p5_voice_v2.capacity_ack(p_proof,'denied'); END IF;
  IF v.claim_id IS NOT NULL AND a.units<>q.reservation_units
    THEN RETURN bfa_p5_voice_v2.capacity_ack(p_proof,'denied'); END IF;
  SELECT * INTO route FROM bfa_p5_capacity.routes
    WHERE owner_id=c.owner_id AND quota_policy_id=q.policy_id FOR SHARE;
  IF NOT FOUND THEN RETURN bfa_p5_voice_v2.capacity_ack(p_proof,'denied'); END IF;
  -- Refuse rebinding before any shared-pool lock. A later negative recheck may
  -- retire the retained allocation, which must use this same pool lock rather
  -- than acquire a second pool in a conflicting cross-owner order.
  IF v.claim_id IS NOT NULL AND a.pool_id<>route.pool_id
    THEN RETURN bfa_p5_voice_v2.capacity_ack(p_proof,'denied'); END IF;
  SELECT * INTO pool FROM bfa_p5_capacity.pools WHERE pool_id=route.pool_id FOR UPDATE;
  IF NOT FOUND THEN RETURN bfa_p5_voice_v2.capacity_ack(p_proof,'denied'); END IF;
  -- A quota or shared-pool lock can wait. Revalidate protected v2 state and
  -- original proof time after every such wait before any positive observation.
  IF NOT bfa_p5_voice_v2.current(p) THEN
    PERFORM bfa_p5_voice_v2.retire_if_fenced(p);
    RETURN bfa_p5_voice_v2.capacity_denied(p_proof,p);
  END IF;
  IF NOT pool.enabled OR pool.quarantined OR q.reservation_units<>pool.reservation_units
    OR pool.occupied>pool.active_limit OR pool.held_units>pool.unit_limit
    THEN RETURN bfa_p5_voice_v2.capacity_ack(p_proof,'denied'); END IF;
  IF v.claim_id IS NOT NULL THEN
    IF a.pool_id<>pool.pool_id OR a.units<>pool.reservation_units OR v.quota_policy_id<>q.policy_id
      THEN RETURN bfa_p5_voice_v2.capacity_ack(p_proof,'denied'); END IF;
    -- The original debit already committed. At-limit pools and zero remaining
    -- quota do not charge again; this observation never permits external create.
    RETURN bfa_p5_voice_v2.capacity_ack(p_proof,'claimed');
  END IF;
  IF p_operation<>'claim' OR q.remaining_units<q.reservation_units
    OR pool.occupied>=pool.active_limit
    OR pool.reservation_units>pool.unit_limit-pool.held_units
    THEN RETURN bfa_p5_voice_v2.capacity_ack(p_proof,'denied'); END IF;
  INSERT INTO bfa_p5_voice.attempts VALUES(c.owner_id,c.attempt_id,p.claim_id,false);
  UPDATE bfa_p5_voice.quotas SET remaining_units=remaining_units-q.reservation_units
    WHERE owner_id=q.owner_id AND policy_id=q.policy_id;
  INSERT INTO bfa_p5_voice.claims
    VALUES(p.claim_id,c.owner_id,p.claim,p.effective_expires_ms,'claimed',q.policy_id,q.reservation_units);
  INSERT INTO bfa_p5_capacity.allocations(claim_id,owner_id,attempt_id,claim,cleanup_id,pool_id,pool_version,units)
    VALUES(p.claim_id,c.owner_id,c.attempt_id,p.claim,p.cleanup_id,pool.pool_id,pool.version,q.reservation_units);
  UPDATE bfa_p5_capacity.pools SET occupied=occupied+1,held_units=held_units+q.reservation_units
    WHERE pool_id=pool.pool_id;
  RETURN bfa_p5_voice_v2.capacity_ack(p_proof,'claimed');
END $$;

CREATE FUNCTION public.bfa_p5_v2_capacity_claim(p_proof jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN RETURN bfa_p5_voice_v2.capacity_admit(p_proof,'claim'); END $$;

CREATE FUNCTION public.bfa_p5_v2_voice_inspect(p_proof jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN RETURN bfa_p5_voice_v2.capacity_admit(p_proof,'inspect'); END $$;

-- Revoke only the new functions. All existing sources/functions/grants remain
-- unchanged, so this isolated preparation is not a compatible live cutover.
REVOKE ALL ON FUNCTION bfa_p5_voice_v2.parse_capacity_proof(jsonb,text),
  bfa_p5_voice_v2.capacity_ack(jsonb,text),
  bfa_p5_voice_v2.take_proof(bfa_p5_voice.proofs),
  bfa_p5_voice_v2.current(bfa_p5_voice.proofs),
  bfa_p5_voice_v2.retire_if_fenced(bfa_p5_voice.proofs),
  bfa_p5_voice_v2.capacity_denied(jsonb,bfa_p5_voice.proofs),
  bfa_p5_voice_v2.capacity_admit(jsonb,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.bfa_p5_v2_capacity_claim(jsonb),public.bfa_p5_v2_voice_inspect(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_v2_capacity_claim(jsonb),public.bfa_p5_v2_voice_inspect(jsonb)
  TO service_role;
COMMIT;
