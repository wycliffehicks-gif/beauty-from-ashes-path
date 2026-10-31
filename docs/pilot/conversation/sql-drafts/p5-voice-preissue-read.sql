-- PROPOSED pre-issuance metadata reader; outside migrations and never applied
-- to the connected project. Requires the isolated p5-voice-admission.sql draft.
-- No rows, generations, issuances, approvals, quotas or budgets are created.
-- This content-free snapshot is not Auth, session or dispatch authorization.
BEGIN;

CREATE FUNCTION public.bfa_p5_voice_read_current_thread(
  p_owner_id uuid, p_thread_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE a record; t record; g bfa_p5_voice.generations;
  has_generation boolean; prior_ms bigint; n bigint;
  allow_epoch numeric; allow_ms bigint; source_utc timestamp without time zone;
BEGIN
  IF p_owner_id IS NULL OR p_thread_id IS NULL THEN RETURN NULL; END IF;
  PERFORM bfa_p5_voice.lock_owner(p_owner_id);
  SELECT user_id,admitted,expires_at INTO a
    FROM public.bfa_p3b_staging_accounts WHERE user_id=p_owner_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Only lifecycle metadata: never load saved_snapshot, title or turn content.
  SELECT id,owner_id,revision,created_at,deleted_at INTO t
    FROM public.bfa_p3b_threads
    WHERE id=p_thread_id AND owner_id=p_owner_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- UNIQUE(thread_id) makes absence unambiguous. Do not filter by owner here:
  -- a foreign or retired generation must be denied, never treated as absent.
  SELECT * INTO g FROM bfa_p5_voice.generations
    WHERE thread_id=p_thread_id FOR SHARE;
  has_generation:=FOUND;
  SELECT observed_ms INTO prior_ms FROM bfa_p5_voice.owner_clocks
    WHERE owner_id=p_owner_id FOR SHARE;
  -- Sample after every potentially blocking row lock, not at transaction start.
  n:=bfa_p5_voice.ms();
  IF n IS NULL OR n NOT BETWEEN 0 AND 9007199254740991
    OR (prior_ms IS NOT NULL AND
      (prior_ms NOT BETWEEN 0 AND 9007199254740991 OR n<prior_ms))
    THEN RETURN NULL; END IF;

  -- Guard before conversion so infinity or unsafe JS millisecond values fail
  -- closed. Flooring expiry is conservative at sub-millisecond boundaries.
  IF a.expires_at IS NULL OR NOT isfinite(a.expires_at) THEN RETURN NULL; END IF;
  allow_epoch:=extract(epoch FROM a.expires_at)*1000;
  IF allow_epoch NOT BETWEEN 1 AND 9007199254740991 THEN RETURN NULL; END IF;
  allow_ms:=floor(allow_epoch)::bigint;
  IF a.admitted IS DISTINCT FROM true OR n>=allow_ms
    OR t.deleted_at IS NOT NULL
    OR t.revision IS NULL OR t.revision NOT BETWEEN 0 AND 9007199254740991
    OR t.created_at IS NULL OR NOT isfinite(t.created_at)
    THEN RETURN NULL; END IF;
  IF has_generation AND (
    g.owner_id IS DISTINCT FROM p_owner_id
    OR g.incarnation IS NULL OR g.retired IS DISTINCT FROM false
    OR g.source_created_at IS NULL OR NOT isfinite(g.source_created_at)
    OR g.source_created_at IS DISTINCT FROM t.created_at
  ) THEN RETURN NULL; END IF;

  -- Preserve all database microseconds in one canonical UTC representation,
  -- independent of session TimeZone/DateStyle. This creation timestamp remains
  -- consistency metadata; only the registered permanent UUID is incarnation.
  source_utc:=t.created_at AT TIME ZONE 'UTC';
  IF extract(year FROM source_utc) NOT BETWEEN 1 AND 9999 THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'ownerId',p_owner_id,'threadId',p_thread_id,'threadRevision',t.revision,
    'sourceCreatedAt',to_char(source_utc,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'threadIncarnation',CASE WHEN has_generation THEN g.incarnation ELSE NULL END,
    'deleted',false,
    'allowlist',jsonb_build_object(
      'ownerId',a.user_id,'admitted',true,'expiresAt',allow_ms
    )
  );
END $$;

-- No observe_now call or persistence mutation: the reader cannot advance the
-- clock high-water, create/retire a generation, retain revocation, or fence an
-- attempt. Future per-owner writers must share the owner-first lock discipline.
-- Locks do not span remote Auth or later registration/admission transactions;
-- the trusted host and those transactions must independently recheck authority.
-- No direct schema/table/helper grant; only this RPC is service-role executable.
REVOKE ALL ON FUNCTION public.bfa_p5_voice_read_current_thread(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_voice_read_current_thread(uuid,uuid) TO service_role;
COMMIT;
