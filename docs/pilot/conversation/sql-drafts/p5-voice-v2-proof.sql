-- PROPOSED isolated v2 proof storage, OUTSIDE migrations; never applied to the
-- connected project. Requires base admission, v2 parent/issuance and v2 cleanup
-- drafts. No proof consumption, admission, capacity, Auth bridge or dispatch.
-- Legacy enabling paths remain non-v2-aware: complete versioned consumers and
-- a quiesced no-fallback route/privilege cutover are required before deployment.
BEGIN;

-- Retained legacy rows stay NULL. The old register_proof's table-rowtype
-- INSERT SELECT p.* still supplies NULL here; no legacy proof is backfilled.
ALTER TABLE bfa_p5_voice.proofs ADD COLUMN protocol integer;
ALTER TABLE bfa_p5_voice.proofs ADD CONSTRAINT proof_protocol_v2_binding
  CHECK(protocol IS NULL OR (protocol=2
    AND receipt_id<>'00000000-0000-0000-0000-000000000000'::uuid
    AND cleanup_id<>'00000000-0000-0000-0000-000000000000'::uuid
    AND claim_id<>'00000000-0000-0000-0000-000000000000'::uuid
    AND owner_id<>'00000000-0000-0000-0000-000000000000'::uuid
    AND session_id<>'00000000-0000-0000-0000-000000000000'::uuid));

-- Private current predicate. A future versioned consumer must still own its
-- exact proof/operation and consumption transaction; this helper is no grant.
-- Only exact cleanup/claim negative lifetime evidence may change here. No
-- parent revocation is inferred from uncertainty, and no generation, attempt,
-- held units, quota, capacity or provider-finality record is changed.
CREATE FUNCTION bfa_p5_voice_v2.eligible(p bfa_p5_voice.proofs)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE c bfa_p5_voice.claim_key; k bfa_p5_voice.cleanup_owners;
  parent bfa_p5_voice_v2.auth_parents; b bfa_p5_voice_v2.issuance_auth_bindings;
  i bfa_p5_voice.issuances; g bfa_p5_voice.generations; v bfa_p5_voice.approvals;
  x bfa_p5_voice.claims; attempt bfa_p5_voice.attempts; a record; t record;
  had_claim boolean; had_attempt boolean; n bigint; allow_epoch numeric;
  allow_ms bigint; ceiling bigint; invalid boolean;
BEGIN
  IF p.protocol IS DISTINCT FROM 2 OR p.consumed_ms IS NOT NULL THEN RETURN false; END IF;
  c:=bfa_p5_voice.parse_claim(p.claim);
  IF p.owner_id IS DISTINCT FROM c.owner_id
    OR p.claim_id IS DISTINCT FROM bfa_p5_voice.id(p.claim->'claimId')
    OR p.operation IS NULL OR p.operation NOT IN ('claim','inspect')
    OR p.session_id IS NULL OR p.session_version IS NULL
    OR p.authority_fingerprint IS NULL OR p.authority_fingerprint !~ '^[0-9a-f]{64}$'
    OR p.verified_ms IS NULL OR p.verified_ms NOT BETWEEN 0 AND 9007199254740991
    OR p.identity_expires_ms IS NULL OR p.identity_expires_ms NOT BETWEEN 1 AND 9007199254740991
    OR p.expires_ms IS NULL OR p.expires_ms NOT BETWEEN 1 AND 9007199254740991
    OR p.effective_expires_ms IS NULL OR p.effective_expires_ms NOT BETWEEN 1 AND 9007199254740991
    OR p.session_version NOT BETWEEN 0 AND 9007199254740991
    OR p.identity_expires_ms<=p.verified_ms
    OR p.expires_ms-p.verified_ms NOT BETWEEN 1 AND 30000
    OR p.expires_ms>p.effective_expires_ms
    OR p.effective_expires_ms>p.identity_expires_ms OR p.effective_expires_ms>c.expires_ms
    THEN RETURN false; END IF;
  IF '00000000-0000-0000-0000-000000000000'::uuid=ANY(ARRAY[
    p.receipt_id,p.cleanup_id,p.claim_id,p.owner_id,p.session_id,c.thread_id,
    c.incarnation,c.attempt_id,c.approval_id])
    OR p.receipt_id IS NULL OR p.cleanup_id IS NULL THEN RETURN false; END IF;

  PERFORM bfa_p5_voice.lock_owner(c.owner_id);
  PERFORM 1 FROM bfa_p5_voice.session_fences
    WHERE owner_id=c.owner_id AND session_id=p.session_id FOR SHARE;
  IF FOUND THEN RETURN false; END IF;
  SELECT * INTO parent FROM bfa_p5_voice_v2.auth_parents
    WHERE owner_id=c.owner_id AND auth_session_id=p.session_id FOR SHARE;
  IF NOT FOUND OR parent.revoked IS DISTINCT FROM false
    OR parent.version<>p.session_version THEN RETURN false; END IF;
  SELECT user_id,admitted,expires_at INTO a FROM public.bfa_p3b_staging_accounts
    WHERE user_id=c.owner_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT th.id,th.owner_id,th.revision,th.created_at,th.deleted_at INTO t
    FROM public.bfa_p3b_threads AS th
    WHERE th.id=c.thread_id AND th.owner_id=c.owner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO g FROM bfa_p5_voice.generations WHERE thread_id=c.thread_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO i FROM bfa_p5_voice.issuances
    WHERE fingerprint=p.authority_fingerprint FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO b FROM bfa_p5_voice_v2.issuance_auth_bindings
    WHERE fingerprint=p.authority_fingerprint FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO v FROM bfa_p5_voice.approvals
    WHERE approval_id=c.approval_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO k FROM bfa_p5_voice.cleanup_owners
    WHERE cleanup_id=p.cleanup_id AND claim_id=p.claim_id FOR UPDATE;
  IF NOT FOUND OR k.protocol IS DISTINCT FROM 2 OR k.owner_id<>c.owner_id
    OR k.claim IS DISTINCT FROM p.claim OR k.session_id IS DISTINCT FROM p.session_id
    OR k.session_version IS DISTINCT FROM p.session_version
    OR k.authority_fingerprint IS DISTINCT FROM p.authority_fingerprint
    THEN RETURN false; END IF;
  IF k.closed_ms IS NOT NULL OR k.expired_ms IS NOT NULL OR k.invalidated_ms IS NOT NULL
    THEN RETURN false; END IF;
  SELECT * INTO x FROM bfa_p5_voice.claims WHERE claim_id=p.claim_id FOR UPDATE;
  had_claim:=FOUND;
  IF had_claim AND (x.owner_id<>c.owner_id OR x.claim IS DISTINCT FROM p.claim
    OR x.state<>'claimed') THEN RETURN false; END IF;
  SELECT * INTO attempt FROM bfa_p5_voice.attempts
    WHERE owner_id=c.owner_id AND attempt_id=c.attempt_id FOR SHARE;
  had_attempt:=FOUND;
  IF had_claim THEN
    IF NOT had_attempt OR attempt.retired IS DISTINCT FROM false
      OR attempt.winner_claim_id IS DISTINCT FROM p.claim_id THEN RETURN false; END IF;
  ELSIF had_attempt OR p.operation='inspect' THEN
    RETURN false;
  END IF;

  -- Establish protected provenance before using any record's deadline. A
  -- colliding foreign/mismatched identity is never a shortening source.
  IF g.owner_id<>c.owner_id OR g.incarnation<>c.incarnation
    OR i.owner_id<>c.owner_id OR i.thread_id<>c.thread_id
    OR i.incarnation<>c.incarnation OR i.revision<>c.revision
    OR b.protocol<>2 OR b.owner_id<>c.owner_id
    OR b.auth_session_id<>p.session_id OR b.parent_version<>p.session_version
    OR v.owner_id<>c.owner_id OR v.thread_id<>c.thread_id
    OR v.incarnation<>c.incarnation OR v.revision<>c.revision
    OR v.attempt_id<>c.attempt_id OR v.digest<>c.approval_digest
    OR v.scope<>'developer-voice-session'
    THEN RETURN false; END IF;
  -- All potentially waiting record locks precede database time. Never refresh
  -- original verification. Unsafe time/future observations cannot write fences.
  n:=bfa_p5_voice.observe_now(c.owner_id);
  IF n IS NULL OR p.verified_ms>n OR i.issued_ms>n THEN RETURN false; END IF;
  IF a.expires_at IS NULL OR NOT isfinite(a.expires_at)
    OR t.created_at IS NULL OR NOT isfinite(t.created_at)
    OR NOT isfinite(g.source_created_at) THEN RETURN false; END IF;
  allow_epoch:=extract(epoch FROM a.expires_at)*1000;
  IF allow_epoch NOT BETWEEN 1 AND 9007199254740991 THEN RETURN false; END IF;
  allow_ms:=floor(allow_epoch)::bigint;
  ceiling:=least(k.effective_expires_ms,p.effective_expires_ms,c.expires_ms,
    p.identity_expires_ms,i.expires_ms,v.expires_ms,allow_ms);
  IF had_claim THEN ceiling:=least(ceiling,x.effective_expires_ms); END IF;
  IF ceiling<k.effective_expires_ms THEN
    UPDATE bfa_p5_voice.cleanup_owners SET effective_expires_ms=ceiling
      WHERE cleanup_id=p.cleanup_id RETURNING * INTO k;
  END IF;
  IF had_claim AND ceiling<x.effective_expires_ms THEN
    UPDATE bfa_p5_voice.claims SET effective_expires_ms=ceiling
      WHERE claim_id=p.claim_id RETURNING * INTO x;
  END IF;
  invalid:=a.admitted IS DISTINCT FROM true OR t.deleted_at IS NOT NULL
    OR t.revision<>c.revision OR g.retired IS DISTINCT FROM false
    OR g.source_created_at<>t.created_at OR i.revoked IS DISTINCT FROM false
    OR v.revoked IS DISTINCT FROM false;
  IF invalid THEN
    UPDATE bfa_p5_voice.cleanup_owners SET invalidated_ms=coalesce(invalidated_ms,n)
      WHERE cleanup_id=p.cleanup_id;
    IF had_claim THEN
      UPDATE bfa_p5_voice.claims SET state='invalidated' WHERE claim_id=p.claim_id;
    END IF;
    RETURN false;
  END IF;
  IF ceiling<=n THEN
    UPDATE bfa_p5_voice.cleanup_owners SET expired_ms=coalesce(expired_ms,n)
      WHERE cleanup_id=p.cleanup_id;
    IF had_claim THEN
      UPDATE bfa_p5_voice.claims SET state='expired' WHERE claim_id=p.claim_id;
    END IF;
    RETURN false;
  END IF;
  -- Delayed shorter observations above are retained negative evidence. An old
  -- or overlong candidate is never rewritten or returned as a fresh proof.
  RETURN n-p.verified_ms<30000 AND n<p.expires_ms
    AND p.effective_expires_ms<=ceiling;
END $$;

CREATE FUNCTION public.bfa_p5_v2_register_proof(p_proof jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p bfa_p5_voice.proofs; c bfa_p5_voice.claim_key;
BEGIN
  IF NOT bfa_p5_voice.exact_keys(p_proof,ARRAY[
    'protocol','receiptId','operation','claim','cleanupId','authSessionId',
    'parentVersion','authorityFingerprint','identityExpiresAt','verifiedAt',
    'expiresAt','effectiveExpiresAt'])
    OR p_proof->'protocol' IS DISTINCT FROM '2'::jsonb THEN
    RAISE EXCEPTION 'Unavailable';
  END IF;
  c:=bfa_p5_voice.parse_claim(p_proof->'claim');
  p.protocol:=2;
  p.receipt_id:=bfa_p5_voice.id(p_proof->'receiptId');
  p.operation:=p_proof->>'operation';
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
  IF jsonb_typeof(p_proof->'operation') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_proof->'authorityFingerprint') IS DISTINCT FROM 'string'
    THEN RAISE EXCEPTION 'Unavailable'; END IF;
  PERFORM bfa_p5_voice.lock_owner(c.owner_id);
  -- Separate two-integer advisory namespace from the shared bigint owner
  -- lock. Serialize v2 creators of a global receipt ID even across owners;
  -- the unique constraint still applies. Legacy writers do not participate,
  -- so their quiesced cutover remains mandatory and native races are unrun.
  PERFORM pg_advisory_xact_lock(hashtext('bfa-p5-v2-proof-receipt'),hashtext(p.receipt_id::text));
  -- A receipt ID is insert-once. Any existing record, even an exact unconsumed
  -- tuple, denies before negative mutations; no renewal or reattestation.
  -- Different owners cannot turn a global collision into negative updates.
  PERFORM 1 FROM bfa_p5_voice.proofs WHERE receipt_id=p.receipt_id FOR SHARE;
  IF FOUND THEN RETURN NULL; END IF;
  IF NOT bfa_p5_voice_v2.eligible(p) THEN RETURN NULL; END IF;
  -- A future quiesced cutover is still required: legacy consumers are not
  -- protocol-aware. This row alone is not consumption/admission/dispatch.
  INSERT INTO bfa_p5_voice.proofs SELECT p.*;
  RETURN p_proof;
END $$;

REVOKE ALL ON FUNCTION bfa_p5_voice_v2.eligible(bfa_p5_voice.proofs)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.bfa_p5_v2_register_proof(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_v2_register_proof(jsonb) TO service_role;
COMMIT;
