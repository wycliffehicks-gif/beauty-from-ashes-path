-- PROPOSED isolated v2 capacity marker, OUTSIDE migrations. Requires the
-- unchanged shared admission/capacity and completed v2 parent, cleanup, proof
-- and capacity drafts. No schema, accounting, allowance or route is created.
-- No connected SQL, Auth/provider caller or runtime route is enabled. Complete
-- orchestration and a quiesced no-fallback route/privilege cutover remain required.
BEGIN;

CREATE FUNCTION bfa_p5_voice_v2.mark_ack(p_request jsonb,p_status text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT jsonb_build_object('protocol',2,'request',p_request,'status',p_status)
$$;

-- Called only with the exact protected original returned by take_proof. Reuse
-- the narrow cleanup observation; 'closed' does not establish provider finality.
CREATE FUNCTION bfa_p5_voice_v2.mark_denied(p_request jsonb,p bfa_p5_voice.proofs)
RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog,pg_temp AS $$
  SELECT bfa_p5_voice_v2.mark_ack(p_request,
    bfa_p5_voice_v2.capacity_denied(p_request->'proof',p)->>'status')
$$;

CREATE FUNCTION public.bfa_p5_v2_capacity_mark(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE candidate bfa_p5_voice.proofs; p bfa_p5_voice.proofs;
  c bfa_p5_voice.claim_key; v bfa_p5_voice.claims; t bfa_p5_voice.attempts;
  a bfa_p5_capacity.allocations; approval bfa_p5_voice.approvals;
  q bfa_p5_voice.quotas; route bfa_p5_capacity.routes; pool bfa_p5_capacity.pools;
  operation uuid; expected_version bigint;
BEGIN
  IF octet_length(p_request::text)>10000
    OR NOT bfa_p5_voice.exact_keys(p_request,ARRAY[
      'protocol','proof','operationId','expectedPoolVersion'])
    OR p_request->'protocol' IS DISTINCT FROM '2'::jsonb
    THEN RAISE EXCEPTION 'Unavailable'; END IF;
  operation:=bfa_p5_voice.id(p_request->'operationId');
  expected_version:=bfa_p5_voice.n(p_request->'expectedPoolVersion');
  IF operation='00000000-0000-0000-0000-000000000000'::uuid OR expected_version<1
    THEN RAISE EXCEPTION 'Unavailable'; END IF;
  candidate:=bfa_p5_voice_v2.parse_capacity_proof(p_request->'proof','inspect');
  -- This retains the common owner-first lock, exact stored tuple, single-use
  -- fence and original timing. Semantic denial consumes the matching receipt;
  -- malformed/mismatched input never adopts another receipt. Unexpected SQL
  -- exceptions or transaction rollback do not guarantee that consumption.
  p:=bfa_p5_voice_v2.take_proof(candidate);
  IF p.receipt_id IS NULL THEN RETURN bfa_p5_voice_v2.mark_ack(p_request,'denied'); END IF;
  c:=bfa_p5_voice.parse_claim(p.claim);
  IF NOT bfa_p5_voice_v2.current(p) THEN
    PERFORM bfa_p5_voice_v2.retire_if_fenced(p);
    RETURN bfa_p5_voice_v2.mark_denied(p_request,p);
  END IF;
  SELECT * INTO v FROM bfa_p5_voice.claims WHERE claim_id=p.claim_id FOR UPDATE;
  IF NOT FOUND OR v.owner_id<>c.owner_id OR v.claim IS DISTINCT FROM p.claim OR v.state<>'claimed'
    THEN RETURN bfa_p5_voice_v2.mark_denied(p_request,p); END IF;
  SELECT * INTO t FROM bfa_p5_voice.attempts
    WHERE owner_id=c.owner_id AND attempt_id=c.attempt_id FOR UPDATE;
  IF NOT FOUND OR t.retired OR t.winner_claim_id IS DISTINCT FROM p.claim_id
    THEN RETURN bfa_p5_voice_v2.mark_ack(p_request,'denied'); END IF;
  SELECT * INTO a FROM bfa_p5_capacity.allocations WHERE claim_id=p.claim_id FOR UPDATE;
  IF NOT FOUND OR a.owner_id<>c.owner_id OR a.claim IS DISTINCT FROM p.claim
    OR a.cleanup_id<>p.cleanup_id OR a.attempt_id<>c.attempt_id
    OR a.closed OR NOT a.slot_held OR a.units<>v.held_units
    THEN RETURN bfa_p5_voice_v2.mark_denied(p_request,p); END IF;
  SELECT * INTO approval FROM bfa_p5_voice.approvals WHERE approval_id=c.approval_id FOR SHARE;
  IF NOT FOUND OR approval.quota_policy_id<>v.quota_policy_id
    THEN RETURN bfa_p5_voice_v2.mark_ack(p_request,'denied'); END IF;
  SELECT * INTO q FROM bfa_p5_voice.quotas
    WHERE owner_id=c.owner_id AND policy_id=v.quota_policy_id FOR UPDATE;
  IF NOT FOUND OR NOT q.enabled OR q.reservation_units<>a.units
    THEN RETURN bfa_p5_voice_v2.mark_ack(p_request,'denied'); END IF;
  SELECT * INTO route FROM bfa_p5_capacity.routes
    WHERE owner_id=c.owner_id AND quota_policy_id=q.policy_id FOR SHARE;
  -- Establish every retained association before locking a shared pool. If the
  -- final v2 check fences this claim, retirement must use this same quota/pool,
  -- never acquire a foreign second pool in a conflicting cross-owner order.
  IF NOT FOUND OR route.pool_id<>a.pool_id
    THEN RETURN bfa_p5_voice_v2.mark_ack(p_request,'denied'); END IF;
  SELECT * INTO pool FROM bfa_p5_capacity.pools WHERE pool_id=a.pool_id FOR UPDATE;
  IF NOT FOUND THEN RETURN bfa_p5_voice_v2.mark_ack(p_request,'denied'); END IF;
  -- This exact namespace also coordinates existing legacy capacity writers.
  -- Global absent-operation identity is locked only AFTER the shared pool.
  PERFORM pg_advisory_xact_lock(hashtextextended('bfa_p5_capacity_operation:'||operation::text,0));
  -- Quota, pool and global-operation locks may wait. Original proof age and
  -- current v2 eligibility must pass after all waits, including for replay.
  IF NOT bfa_p5_voice_v2.current(p) THEN
    PERFORM bfa_p5_voice_v2.retire_if_fenced(p);
    RETURN bfa_p5_voice_v2.mark_denied(p_request,p);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM bfa_p5_voice.approvals
    WHERE approval_id=c.approval_id AND quota_policy_id=v.quota_policy_id)
    THEN RETURN bfa_p5_voice_v2.mark_ack(p_request,'denied'); END IF;
  IF pool.quarantined THEN RETURN bfa_p5_voice_v2.mark_ack(p_request,'quarantined'); END IF;
  IF NOT pool.enabled OR pool.version<>expected_version
    OR pool.occupied>pool.active_limit OR pool.held_units>pool.unit_limit
    OR pool.reservation_units<>a.units OR q.reservation_units<>a.units OR NOT q.enabled
    THEN RETURN bfa_p5_voice_v2.mark_ack(p_request,'denied'); END IF;
  -- No second reservation or debit: the original immutable allocation remains.
  -- A distinct fresh inspect proof can observe the same marker only. Neither
  -- status is permission to repeat an external create after an uncertain reply.
  IF a.operation_id IS NOT NULL THEN
    RETURN bfa_p5_voice_v2.mark_ack(p_request,
      CASE WHEN a.operation_id=operation THEN 'already-marked' ELSE 'denied' END);
  END IF;
  IF EXISTS(SELECT 1 FROM bfa_p5_capacity.allocations WHERE operation_id=operation)
    THEN RETURN bfa_p5_voice_v2.mark_ack(p_request,'denied'); END IF;
  UPDATE bfa_p5_capacity.allocations SET operation_id=operation WHERE claim_id=a.claim_id;
  RETURN bfa_p5_voice_v2.mark_ack(p_request,'marked'); -- Offline marker only.
END $$;

-- Only new declarations are changed. Legacy execution grants and exact
-- close/reconcile remain untouched; this is not a compatible live cutover.
REVOKE ALL ON FUNCTION bfa_p5_voice_v2.mark_ack(jsonb,text),
  bfa_p5_voice_v2.mark_denied(jsonb,bfa_p5_voice.proofs)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.bfa_p5_v2_capacity_mark(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_v2_capacity_mark(jsonb) TO service_role;
COMMIT;
