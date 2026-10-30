-- PROPOSED protected readers; outside migrations and never applied to the
-- connected project. Requires the isolated p5-voice-admission.sql draft.
-- No rows, Auth sessions, issuances, approvals, quotas or budgets are created.
-- These are content-free eligibility snapshots, never dispatch capabilities.
-- The future service host must authenticate every request independently.
BEGIN;

-- No persistence mutations: lock the exact protected fence and inspect the
-- existing clock high-water without calling the mutating observe_now helper.
-- Every future per-owner writer must use the same owner-first lock discipline.
CREATE FUNCTION public.bfa_p5_voice_read_session_fence(
  p_owner_id uuid, p_session_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE s bfa_p5_voice.session_fences; prior_ms bigint; n bigint;
BEGIN
  IF p_owner_id IS NULL OR p_session_id IS NULL THEN RETURN NULL; END IF;
  PERFORM bfa_p5_voice.lock_owner(p_owner_id);
  SELECT * INTO s FROM bfa_p5_voice.session_fences
    WHERE owner_id=p_owner_id AND session_id=p_session_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT observed_ms INTO prior_ms FROM bfa_p5_voice.owner_clocks
    WHERE owner_id=p_owner_id FOR SHARE;
  -- Sample after the last potentially blocking row lock, not transaction start.
  n:=bfa_p5_voice.ms();
  IF n IS NULL OR n NOT BETWEEN 0 AND 9007199254740991
    OR (prior_ms IS NOT NULL AND n<prior_ms)
    OR s.revoked IS DISTINCT FROM false
    OR s.version NOT BETWEEN 0 AND 9007199254740991
    OR s.expires_ms NOT BETWEEN 1 AND 9007199254740991
    OR n>=s.expires_ms THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'ownerId',s.owner_id,'sessionId',s.session_id,'version',s.version,
    'expiresAt',s.expires_ms,'revoked',false
  );
END $$;

CREATE FUNCTION public.bfa_p5_voice_read_current(
  p_owner_id uuid, p_thread_id uuid, p_attempt_id uuid,
  p_authority_fingerprint text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE a record; t record; g bfa_p5_voice.generations;
  i bfa_p5_voice.issuances; v bfa_p5_voice.approvals;
  prior_ms bigint; n bigint; allow_epoch numeric; allow_ms bigint;
BEGIN
  IF p_owner_id IS NULL OR p_thread_id IS NULL OR p_attempt_id IS NULL
    OR p_authority_fingerprint IS NULL
    OR p_authority_fingerprint !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  PERFORM bfa_p5_voice.lock_owner(p_owner_id);
  SELECT user_id,admitted,expires_at INTO a
    FROM public.bfa_p3b_staging_accounts WHERE user_id=p_owner_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Select only lifecycle metadata. Never load saved_snapshot, title or content.
  SELECT id,owner_id,revision,created_at,deleted_at INTO t
    FROM public.bfa_p3b_threads
    WHERE id=p_thread_id AND owner_id=p_owner_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO g FROM bfa_p5_voice.generations
    WHERE owner_id=p_owner_id AND thread_id=p_thread_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO i FROM bfa_p5_voice.issuances
    WHERE fingerprint=p_authority_fingerprint FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- The base schema enforces UNIQUE(owner_id,attempt_id). STRICT also refuses
  -- ambiguous rows if a future schema weakens that invariant; never pick one.
  BEGIN
    SELECT * INTO STRICT v FROM bfa_p5_voice.approvals
      WHERE owner_id=p_owner_id AND attempt_id=p_attempt_id FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN RETURN NULL;
  END;
  SELECT observed_ms INTO prior_ms FROM bfa_p5_voice.owner_clocks
    WHERE owner_id=p_owner_id FOR SHARE;
  n:=bfa_p5_voice.ms();
  IF n IS NULL OR n NOT BETWEEN 0 AND 9007199254740991
    OR (prior_ms IS NOT NULL AND n<prior_ms) THEN RETURN NULL; END IF;

  -- Explicit guards precede timestamp conversion. Infinity and out-of-range
  -- timestamps must not become invalid or rounded JS numbers on the wire.
  IF NOT isfinite(a.expires_at) THEN RETURN NULL; END IF;
  allow_epoch:=extract(epoch FROM a.expires_at)*1000;
  IF allow_epoch NOT BETWEEN 1 AND 9007199254740991 THEN RETURN NULL; END IF;
  allow_ms:=floor(allow_epoch)::bigint;
  IF a.admitted IS DISTINCT FROM true OR n>=allow_ms
    OR t.deleted_at IS NOT NULL
    OR t.revision NOT BETWEEN 0 AND 9007199254740991
    OR NOT isfinite(t.created_at) OR NOT isfinite(g.source_created_at)
    OR g.retired IS DISTINCT FROM false OR g.source_created_at<>t.created_at
    OR i.revoked IS DISTINCT FROM false
    OR i.owner_id<>p_owner_id OR i.thread_id<>p_thread_id
    OR i.incarnation<>g.incarnation OR i.revision<>t.revision
    OR i.issued_ms NOT BETWEEN 0 AND 9007199254740991 OR i.issued_ms>n
    OR i.expires_ms NOT BETWEEN 1 AND 9007199254740991
    OR i.expires_ms<=i.issued_ms OR i.expires_ms-i.issued_ms>900000
    OR n>=i.expires_ms
    OR v.revoked IS DISTINCT FROM false
    OR v.owner_id<>p_owner_id OR v.thread_id<>p_thread_id
    OR v.incarnation<>g.incarnation OR v.revision<>t.revision
    OR v.attempt_id<>p_attempt_id OR v.scope<>'developer-voice-session'
    OR v.digest !~ '^[0-9a-f]{64}$'
    OR v.expires_ms NOT BETWEEN 1 AND 9007199254740991
    OR n>=v.expires_ms THEN RETURN NULL; END IF;
  -- P3b Stop changes the current revision: its old issuance/approval therefore
  -- fails above. Timestamp equality is only a consistency check; the permanent
  -- registered generation supplies incarnation, never this read or its caller.
  RETURN jsonb_build_object(
    'ownerId',p_owner_id,'threadId',p_thread_id,
    'threadIncarnation',g.incarnation,'threadRevision',t.revision,'deleted',false,
    'allowlist',jsonb_build_object(
      'ownerId',a.user_id,'admitted',true,'expiresAt',allow_ms
    ),
    'authority',jsonb_build_object(
      'ownerId',i.owner_id,'threadId',i.thread_id,'threadIncarnation',i.incarnation,
      'threadRevision',i.revision,'fingerprint',i.fingerprint,
      'expiresAt',i.expires_ms,'revoked',false
    ),
    'approval',jsonb_build_object(
      'ownerId',v.owner_id,'threadId',v.thread_id,'threadIncarnation',v.incarnation,
      'threadRevision',v.revision,'id',v.approval_id,'digest',v.digest,
      'scope',v.scope,'attemptId',v.attempt_id,'expiresAt',v.expires_ms,'revoked',false
    )
  );
END $$;

-- Readers do not advance high-water, retire generations, retain observed expiry
-- or revocation, or fence attempts. Consequently a snapshot alone cannot enforce
-- terminal monotonicity. Existing proof/claim/inspect/dispatch transactions must
-- independently recheck current records and retain their terminal fences.
-- Locks do not span remote Auth, these two calls, or a later admission operation.
-- No direct schema/table/helper privilege is added; each function is exposed
-- solely to the service role in this same creation transaction.
REVOKE ALL ON FUNCTION public.bfa_p5_voice_read_session_fence(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.bfa_p5_voice_read_current(uuid,uuid,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_voice_read_session_fence(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_voice_read_current(uuid,uuid,uuid,text) TO service_role;
COMMIT;
