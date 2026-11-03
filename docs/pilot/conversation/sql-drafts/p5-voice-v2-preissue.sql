-- PROPOSED isolated v2 pre-issuance boundary, OUTSIDE automatic migrations.
-- Requires p5-voice-admission.sql and p5-voice-v2-parent-issuance.sql. Never
-- applied to the connected project. No real Auth verifier, route, issuer,
-- approval, proof, admission, provider call or compatibility cutover is added.
-- The trusted host must independently establish request-bound Auth ownership,
-- current policy/eligibility and exact metadata provenance; service_role and
-- these scalar arguments cannot establish those facts. Receipts are snapshots,
-- not permission to issue, admit or dispatch. Full v2 remains nondeployable.
BEGIN;

CREATE FUNCTION public.bfa_p5_v2_read_current_thread(
  p_owner_id uuid,p_auth_session_id uuid,p_parent_version bigint,
  p_thread_id uuid,p_verified_ms bigint,p_auth_expires_ms bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE p bfa_p5_voice_v2.auth_parents; a record; t record;
  g bfa_p5_voice.generations; has_generation boolean; n bigint;
  allow_epoch numeric; allow_ms bigint; source_utc timestamp without time zone;
BEGIN
  IF p_owner_id IS NULL OR p_auth_session_id IS NULL OR p_thread_id IS NULL
    OR p_owner_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_auth_session_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_thread_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_parent_version IS NULL OR p_parent_version NOT BETWEEN 0 AND 9007199254740991
    OR p_verified_ms IS NULL OR p_verified_ms NOT BETWEEN 0 AND 9007199254740991
    OR p_auth_expires_ms IS NULL OR p_auth_expires_ms NOT BETWEEN 1 AND 9007199254740991
    THEN RETURN NULL; END IF;
  IF p_auth_expires_ms<=p_verified_ms THEN RETURN NULL; END IF;
  PERFORM bfa_p5_voice.lock_owner(p_owner_id);
  PERFORM 1 FROM bfa_p5_voice.session_fences
    WHERE owner_id=p_owner_id AND session_id=p_auth_session_id FOR SHARE;
  IF FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM bfa_p5_voice_v2.auth_parents
    WHERE owner_id=p_owner_id AND auth_session_id=p_auth_session_id FOR SHARE;
  IF NOT FOUND OR p.revoked IS DISTINCT FROM false OR p.version<>p_parent_version THEN RETURN NULL; END IF;
  SELECT user_id,admitted,expires_at INTO a FROM public.bfa_p3b_staging_accounts
    WHERE user_id=p_owner_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Select lifecycle metadata only: never saved_snapshot, title or turn bodies.
  SELECT id,owner_id,revision,created_at,deleted_at INTO t FROM public.bfa_p3b_threads
    WHERE id=p_thread_id AND owner_id=p_owner_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Lookup by unique thread identity, not owner: a foreign/retired row is a
  -- retained conflict, never absence permitting a replacement generation.
  SELECT * INTO g FROM bfa_p5_voice.generations WHERE thread_id=p_thread_id FOR SHARE;
  has_generation:=FOUND;
  -- Sample/retain time after all potentially blocking locks. This read may
  -- advance ONLY owner_clocks so observed expiry cannot revive after rollback.
  n:=bfa_p5_voice.observe_now(p_owner_id);
  IF n IS NULL OR p_verified_ms>n OR n-p_verified_ms>=30000
    OR p_auth_expires_ms<=n THEN RETURN NULL; END IF;
  IF a.expires_at IS NULL OR NOT isfinite(a.expires_at) THEN RETURN NULL; END IF;
  allow_epoch:=extract(epoch FROM a.expires_at)*1000;
  IF allow_epoch NOT BETWEEN 1 AND 9007199254740991 THEN RETURN NULL; END IF;
  allow_ms:=floor(allow_epoch)::bigint;
  IF a.admitted IS DISTINCT FROM true OR allow_ms<=n
    OR t.deleted_at IS NOT NULL OR t.revision IS NULL
    OR t.revision NOT BETWEEN 0 AND 9007199254740991
    OR t.created_at IS NULL OR NOT isfinite(t.created_at) THEN RETURN NULL; END IF;
  IF has_generation AND (
    g.owner_id IS DISTINCT FROM p_owner_id OR g.retired IS DISTINCT FROM false
    OR g.incarnation IS NULL OR g.incarnation='00000000-0000-0000-0000-000000000000'::uuid
    OR g.source_created_at IS NULL OR NOT isfinite(g.source_created_at)
    OR g.source_created_at IS DISTINCT FROM t.created_at
  ) THEN RETURN NULL; END IF;
  source_utc:=t.created_at AT TIME ZONE 'UTC';
  IF extract(year FROM source_utc) NOT BETWEEN 1 AND 9999 THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'protocol',2,'ownerId',p_owner_id,'authSessionId',p_auth_session_id,
    'parentVersion',p_parent_version,'threadId',p_thread_id,'threadRevision',t.revision,
    'sourceCreatedAt',to_char(source_utc,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'threadIncarnation',CASE WHEN has_generation THEN g.incarnation ELSE NULL END,
    'deleted',false,'allowlist',jsonb_build_object(
      'ownerId',a.user_id,'admitted',true,'expiresAt',allow_ms)
  );
END $$;

CREATE FUNCTION public.bfa_p5_v2_register_generation(
  p_owner_id uuid,p_auth_session_id uuid,p_parent_version bigint,p_thread_id uuid,
  p_revision bigint,p_source_created_at text,p_verified_ms bigint,p_auth_expires_ms bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE p bfa_p5_voice_v2.auth_parents; a record; t record;
  g bfa_p5_voice.generations; has_generation boolean; n bigint;
  allow_epoch numeric; allow_ms bigint; source_utc timestamp without time zone; source_text text;
BEGIN
  IF p_owner_id IS NULL OR p_auth_session_id IS NULL OR p_thread_id IS NULL
    OR p_owner_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_auth_session_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_thread_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_parent_version IS NULL OR p_parent_version NOT BETWEEN 0 AND 9007199254740991
    OR p_revision IS NULL OR p_revision NOT BETWEEN 0 AND 9007199254740991
    OR p_source_created_at IS NULL OR length(p_source_created_at)<>27
    OR p_source_created_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
    OR p_verified_ms IS NULL OR p_verified_ms NOT BETWEEN 0 AND 9007199254740991
    OR p_auth_expires_ms IS NULL OR p_auth_expires_ms NOT BETWEEN 1 AND 9007199254740991
    THEN RETURN NULL; END IF;
  IF p_auth_expires_ms<=p_verified_ms THEN RETURN NULL; END IF;
  PERFORM bfa_p5_voice.lock_owner(p_owner_id);
  PERFORM 1 FROM bfa_p5_voice.session_fences
    WHERE owner_id=p_owner_id AND session_id=p_auth_session_id FOR SHARE;
  IF FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM bfa_p5_voice_v2.auth_parents
    WHERE owner_id=p_owner_id AND auth_session_id=p_auth_session_id FOR SHARE;
  IF NOT FOUND OR p.revoked IS DISTINCT FROM false OR p.version<>p_parent_version THEN RETURN NULL; END IF;
  SELECT user_id,admitted,expires_at INTO a FROM public.bfa_p3b_staging_accounts
    WHERE user_id=p_owner_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT id,owner_id,revision,created_at,deleted_at INTO t FROM public.bfa_p3b_threads
    WHERE id=p_thread_id AND owner_id=p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO g FROM bfa_p5_voice.generations WHERE thread_id=p_thread_id FOR UPDATE;
  has_generation:=FOUND;
  n:=bfa_p5_voice.observe_now(p_owner_id);
  IF n IS NULL OR p_verified_ms>n OR n-p_verified_ms>=30000
    OR p_auth_expires_ms<=n THEN RETURN NULL; END IF;
  IF a.expires_at IS NULL OR NOT isfinite(a.expires_at) THEN RETURN NULL; END IF;
  allow_epoch:=extract(epoch FROM a.expires_at)*1000;
  IF allow_epoch NOT BETWEEN 1 AND 9007199254740991 THEN RETURN NULL; END IF;
  allow_ms:=floor(allow_epoch)::bigint;
  IF a.admitted IS DISTINCT FROM true OR allow_ms<=n
    OR t.deleted_at IS NOT NULL OR t.revision IS NULL
    OR t.revision NOT BETWEEN 0 AND 9007199254740991 OR t.revision<>p_revision
    OR t.created_at IS NULL OR NOT isfinite(t.created_at) THEN RETURN NULL; END IF;
  source_utc:=t.created_at AT TIME ZONE 'UTC';
  IF extract(year FROM source_utc) NOT BETWEEN 1 AND 9999 THEN RETURN NULL; END IF;
  source_text:=to_char(source_utc,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  -- Compare the exact actual six-digit microsecond UTC representation, never
  -- parse/coerce or round caller text. This is consistency metadata, not incarnation.
  IF p_source_created_at<>source_text THEN RETURN NULL; END IF;
  IF has_generation THEN
    IF g.owner_id IS DISTINCT FROM p_owner_id OR g.retired IS DISTINCT FROM false
      OR g.incarnation IS NULL OR g.incarnation='00000000-0000-0000-0000-000000000000'::uuid
      OR g.source_created_at IS NULL OR NOT isfinite(g.source_created_at)
      OR g.source_created_at IS DISTINCT FROM t.created_at THEN RETURN NULL; END IF;
  ELSE
    -- The permanent UUID comes only from the existing DB default. Common
    -- owner/thread locks and UNIQUE(thread_id) protect one retained identity.
    INSERT INTO bfa_p5_voice.generations(owner_id,thread_id,source_created_at)
      VALUES(p_owner_id,p_thread_id,t.created_at) RETURNING * INTO g;
  END IF;
  RETURN jsonb_build_object(
    'protocol',2,'ownerId',p_owner_id,'authSessionId',p_auth_session_id,
    'parentVersion',p_parent_version,'threadId',p_thread_id,'threadRevision',t.revision,
    'sourceCreatedAt',source_text,'threadIncarnation',g.incarnation,
    'deleted',false,'allowlist',jsonb_build_object(
      'ownerId',a.user_id,'admitted',true,'expiresAt',allow_ms)
  );
END $$;

-- Neither function creates/reopens a parent or needs a not-yet-created issuance.
-- Both reject every retained v1 session row, even active/expired ones. Existing
-- generations are never updated, retired, repaired or rebound here. A later
-- legitimate current revision still shares its same permanent generation.
-- Reader mutation: owner_clocks only. Registrar: owner_clocks and at most one
-- new generation row. Semantic denial may retain time but no other record.
-- A failed INSERT transaction rolls back its clock change as well. Lost/late
-- responses cannot establish rollback or authorize replacement identities.
-- Verification/Auth deadlines are not echoed. Exact request/reply association,
-- no transparent retry and fresh Auth around future host waits are mandatory.
-- Auth and SQL are not atomic. No receipt extends its own validity after return.
REVOKE ALL ON FUNCTION public.bfa_p5_v2_read_current_thread(uuid,uuid,bigint,uuid,bigint,bigint)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.bfa_p5_v2_register_generation(uuid,uuid,bigint,uuid,bigint,text,bigint,bigint)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_v2_read_current_thread(uuid,uuid,bigint,uuid,bigint,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_v2_register_generation(uuid,uuid,bigint,uuid,bigint,text,bigint,bigint) TO service_role;
COMMIT;
