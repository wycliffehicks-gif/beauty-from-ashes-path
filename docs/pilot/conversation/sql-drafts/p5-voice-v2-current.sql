-- PROPOSED isolated v2 post-issuance current reader, OUTSIDE migrations.
-- Requires unchanged base admission and v2 parent/issuance drafts. Never
-- applied to connected SQL. No Auth verifier, claim, proof, provider call,
-- runtime route or compatibility cutover is installed. Only owner_clocks may
-- advance; all lifecycle, revocation, approval and accounting records remain.
-- Service-role access and a full request echo do not establish real Auth or
-- trusted service provenance. The future host must independently establish
-- current request-bound Auth and recheck after waits. A snapshot is no permit.
BEGIN;

CREATE FUNCTION public.bfa_p5_v2_read_current(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE req_owner_id uuid; req_session_id uuid; req_parent_version bigint;
  req_thread_id uuid; req_attempt_id uuid; req_fingerprint text; verified_ms bigint; identity_expires_ms bigint;
  parent bfa_p5_voice_v2.auth_parents; binding bfa_p5_voice_v2.issuance_auth_bindings;
  a record; t record; g bfa_p5_voice.generations;
  i bfa_p5_voice.issuances; approval bfa_p5_voice.approvals;
  prior_ms bigint; n bigint; allow_epoch numeric; allow_ms bigint;
BEGIN
  IF octet_length(p_request::text)>10000
    OR NOT bfa_p5_voice.exact_keys(p_request,ARRAY[
      'protocol','ownerId','authSessionId','parentVersion','threadId','attemptId',
      'authorityFingerprint','verifiedAt','identityExpiresAt'])
    OR p_request->'protocol' IS DISTINCT FROM '2'::jsonb
    THEN RAISE EXCEPTION 'Unavailable'; END IF;
  req_owner_id:=bfa_p5_voice.id(p_request->'ownerId');
  req_session_id:=bfa_p5_voice.id(p_request->'authSessionId');
  req_parent_version:=bfa_p5_voice.n(p_request->'parentVersion');
  req_thread_id:=bfa_p5_voice.id(p_request->'threadId');
  req_attempt_id:=bfa_p5_voice.id(p_request->'attemptId');
  req_fingerprint:=p_request->>'authorityFingerprint';
  verified_ms:=bfa_p5_voice.n(p_request->'verifiedAt');
  identity_expires_ms:=bfa_p5_voice.n(p_request->'identityExpiresAt');
  IF '00000000-0000-0000-0000-000000000000'::uuid=ANY(ARRAY[
      req_owner_id,req_session_id,req_thread_id,req_attempt_id])
    OR jsonb_typeof(p_request->'authorityFingerprint') IS DISTINCT FROM 'string'
    OR req_fingerprint IS NULL OR req_fingerprint !~ '^[0-9a-f]{64}$'
    OR identity_expires_ms<=verified_ms
    THEN RAISE EXCEPTION 'Unavailable'; END IF;

  PERFORM bfa_p5_voice.lock_owner(req_owner_id);
  PERFORM 1 FROM bfa_p5_voice.session_fences AS s
    WHERE s.owner_id=req_owner_id AND s.session_id=req_session_id FOR SHARE;
  IF FOUND THEN RETURN NULL; END IF;
  SELECT * INTO parent FROM bfa_p5_voice_v2.auth_parents AS p
    WHERE p.owner_id=req_owner_id AND p.auth_session_id=req_session_id FOR SHARE;
  IF NOT FOUND OR parent.revoked IS DISTINCT FROM false
    OR parent.version<>req_parent_version THEN RETURN NULL; END IF;
  SELECT user_id,admitted,expires_at INTO a FROM public.bfa_p3b_staging_accounts
    WHERE user_id=req_owner_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Select only lifecycle metadata, never title, saved snapshot or turn text.
  SELECT th.id,th.owner_id,th.revision,th.created_at,th.deleted_at INTO t
    FROM public.bfa_p3b_threads AS th
    WHERE th.id=req_thread_id AND th.owner_id=req_owner_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- A foreign generation is a retained conflict, not a missing row to replace.
  SELECT * INTO g FROM bfa_p5_voice.generations AS generation
    WHERE generation.thread_id=req_thread_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO i FROM bfa_p5_voice.issuances AS issuance
    WHERE issuance.fingerprint=req_fingerprint FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO binding FROM bfa_p5_voice_v2.issuance_auth_bindings AS association
    WHERE association.fingerprint=req_fingerprint FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Existing UNIQUE(owner_id,attempt_id) remains mandatory. STRICT fails
  -- closed if a future schema incorrectly allows ambiguous approvals.
  BEGIN
    SELECT * INTO STRICT approval FROM bfa_p5_voice.approvals AS v
      WHERE v.owner_id=req_owner_id AND v.attempt_id=req_attempt_id FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN RETURN NULL;
  END;
  -- Establish exact protected associations before a clock mutation. No foreign
  -- issuance, binding, generation or approval can stand in for this request.
  IF g.owner_id<>req_owner_id OR g.incarnation='00000000-0000-0000-0000-000000000000'::uuid
    OR i.owner_id<>req_owner_id OR i.thread_id<>req_thread_id
    OR i.incarnation<>g.incarnation OR i.revision<>t.revision
    OR binding.protocol<>2 OR binding.owner_id<>req_owner_id
    OR binding.auth_session_id<>req_session_id OR binding.parent_version<>req_parent_version
    OR approval.owner_id<>req_owner_id OR approval.thread_id<>req_thread_id
    OR approval.incarnation<>g.incarnation OR approval.revision<>t.revision
    OR approval.attempt_id<>req_attempt_id
    OR approval.approval_id='00000000-0000-0000-0000-000000000000'::uuid
    OR approval.scope<>'developer-voice-session'
    OR approval.digest !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;

  -- Sample once after every potentially waiting record lock. Advance only the
  -- owner's safe monotonic high-water, including when a current deadline has
  -- expired. Unlike unchanged observe_now, explicit NULL handling denies
  -- without a NOT NULL insert exception. No original lifetime is refreshed.
  SELECT observed_ms INTO prior_ms FROM bfa_p5_voice.owner_clocks AS clock
    WHERE clock.owner_id=req_owner_id FOR UPDATE;
  n:=bfa_p5_voice.ms();
  IF n IS NULL OR n NOT BETWEEN 0 AND 9007199254740991
    OR (prior_ms IS NOT NULL AND n<prior_ms) THEN RETURN NULL; END IF;
  INSERT INTO bfa_p5_voice.owner_clocks VALUES(req_owner_id,n)
    ON CONFLICT(owner_id) DO UPDATE
      SET observed_ms=greatest(bfa_p5_voice.owner_clocks.observed_ms,excluded.observed_ms);
  IF verified_ms>n OR n-verified_ms>=30000 OR identity_expires_ms<=n THEN RETURN NULL; END IF;
  IF a.expires_at IS NULL OR NOT isfinite(a.expires_at)
    OR t.created_at IS NULL OR NOT isfinite(t.created_at)
    OR g.source_created_at IS NULL OR NOT isfinite(g.source_created_at)
    THEN RETURN NULL; END IF;
  allow_epoch:=extract(epoch FROM a.expires_at)*1000;
  IF allow_epoch NOT BETWEEN 1 AND 9007199254740991 THEN RETURN NULL; END IF;
  allow_ms:=floor(allow_epoch)::bigint;
  IF a.admitted IS DISTINCT FROM true OR allow_ms<=n OR t.deleted_at IS NOT NULL
    OR t.revision NOT BETWEEN 0 AND 9007199254740991
    OR g.retired IS DISTINCT FROM false OR g.source_created_at<>t.created_at
    OR i.revoked IS DISTINCT FROM false
    OR i.issued_ms NOT BETWEEN 0 AND 9007199254740991 OR i.issued_ms>n
    OR i.expires_ms NOT BETWEEN 1 AND 9007199254740991
    OR i.expires_ms-i.issued_ms NOT BETWEEN 1 AND 900000 OR i.expires_ms<=n
    OR approval.revoked IS DISTINCT FROM false
    OR approval.expires_ms NOT BETWEEN 1 AND 9007199254740991
    OR approval.expires_ms<=n THEN RETURN NULL; END IF;

  RETURN jsonb_build_object('protocol',2,'request',p_request,'current',jsonb_build_object(
    'ownerId',req_owner_id,'threadId',req_thread_id,'threadIncarnation',g.incarnation,
    'threadRevision',t.revision,'deleted',false,
    'allowlist',jsonb_build_object('ownerId',a.user_id,'admitted',true,'expiresAt',allow_ms),
    'authority',jsonb_build_object(
      'ownerId',i.owner_id,'threadId',i.thread_id,'threadIncarnation',i.incarnation,
      'threadRevision',i.revision,'fingerprint',i.fingerprint,'issuedAt',i.issued_ms,
      'expiresAt',i.expires_ms,'revoked',false),
    'approval',jsonb_build_object(
      'ownerId',approval.owner_id,'threadId',approval.thread_id,
      'threadIncarnation',approval.incarnation,'threadRevision',approval.revision,
      'id',approval.approval_id,'digest',approval.digest,'scope',approval.scope,
      'attemptId',approval.attempt_id,'expiresAt',approval.expires_ms,'revoked',false)
  ));
END $$;

-- This reader never requires a claim, cleanup, proof or capacity allocation.
-- It cannot create/adopt/reset one, reserve usage, revoke Auth, or extend any
-- deadline. Current Auth may expire before the original issuance: the future
-- verifier must take conservative minimum ceilings, not rewrite either fact.
-- Clock retention alone does not create lifecycle terminality; every later
-- proof/admission/marker transaction must independently recheck current state.
-- An unexpected transaction exception rolls back its clock update. A missing
-- reply is not evidence of rollback and must not cause transparent retries.
REVOKE ALL ON FUNCTION public.bfa_p5_v2_read_current(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_v2_read_current(jsonb) TO service_role;
COMMIT;
