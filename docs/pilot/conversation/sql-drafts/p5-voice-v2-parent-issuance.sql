-- PROPOSED isolated v2 foundation, OUTSIDE migrations; never applied to the
-- connected project. Requires p5-voice-admission.sql. This is NOT deployable:
-- legacy enabling RPCs remain callable and the v2 proof/cleanup/admission/
-- capacity chain plus quiesced no-fallback cutover are not implemented here.
-- A trusted host must independently verify exact Auth ownership/current policy
-- and fresh eligibility. Service-role execution and these metadata arguments
-- are not proof of Auth. No live Auth call, grant, budget or dispatch is added.
BEGIN;

CREATE SCHEMA bfa_p5_voice_v2;
REVOKE ALL ON SCHEMA bfa_p5_voice_v2 FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE bfa_p5_voice_v2.auth_parents (
  owner_id uuid NOT NULL CHECK(owner_id<>'00000000-0000-0000-0000-000000000000'::uuid),
  auth_session_id uuid NOT NULL CHECK(auth_session_id<>'00000000-0000-0000-0000-000000000000'::uuid),
  version bigint NOT NULL CHECK(version BETWEEN 0 AND 9007199254740991),
  revoked boolean NOT NULL DEFAULT true,
  PRIMARY KEY(owner_id,auth_session_id)
);
-- No time allowance and no FK/cascade to provider Auth/user tables. A clear
-- parent is only a negative revocation fence; it is never continuing Auth.
CREATE TABLE bfa_p5_voice_v2.issuance_auth_bindings (
  fingerprint text PRIMARY KEY REFERENCES bfa_p5_voice.issuances(fingerprint) ON DELETE RESTRICT,
  protocol integer NOT NULL CHECK(protocol=2),
  owner_id uuid NOT NULL,
  auth_session_id uuid NOT NULL,
  parent_version bigint NOT NULL CHECK(parent_version BETWEEN 0 AND 9007199254740991),
  FOREIGN KEY(owner_id,auth_session_id)
    REFERENCES bfa_p5_voice_v2.auth_parents(owner_id,auth_session_id) ON DELETE RESTRICT
);
-- Parent version is deliberately NOT an FK target: revocation changes it while
-- immutable associations retain their original version and become ineligible.
-- There is no writer that updates a binding, adopts an old fingerprint, resets
-- a parent, or touches quota/attempt/claim/cleanup/capacity accounting.
REVOKE ALL ON ALL TABLES IN SCHEMA bfa_p5_voice_v2
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION bfa_p5_voice_v2.parent_observation(p bfa_p5_voice_v2.auth_parents)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT jsonb_build_object('protocol',2,'ownerId',p.owner_id,
    'authSessionId',p.auth_session_id,'parentVersion',p.version,'revoked',p.revoked)
$$;
CREATE FUNCTION bfa_p5_voice_v2.issuance_observation(
  i bfa_p5_voice.issuances,b bfa_p5_voice_v2.issuance_auth_bindings
) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT jsonb_build_object('protocol',2,'ownerId',i.owner_id,
    'authSessionId',b.auth_session_id,'parentVersion',b.parent_version,
    'threadId',i.thread_id,'threadIncarnation',i.incarnation,
    'threadRevision',i.revision,'authorityFingerprint',i.fingerprint,
    'issuedAt',i.issued_ms,'expiresAt',i.expires_ms,'revoked',false)
$$;

CREATE FUNCTION public.bfa_p5_v2_observe_parent(
  p_owner_id uuid,p_auth_session_id uuid,p_verified_ms bigint,p_auth_expires_ms bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE p bfa_p5_voice_v2.auth_parents; had_parent boolean; n bigint;
BEGIN
  IF p_owner_id IS NULL OR p_auth_session_id IS NULL
    OR p_owner_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_auth_session_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_verified_ms IS NULL OR p_verified_ms NOT BETWEEN 0 AND 9007199254740991
    OR p_auth_expires_ms IS NULL OR p_auth_expires_ms NOT BETWEEN 1 AND 9007199254740991
    THEN RETURN NULL; END IF;
  IF p_auth_expires_ms<=p_verified_ms THEN RETURN NULL; END IF;
  PERFORM bfa_p5_voice.lock_owner(p_owner_id);
  PERFORM 1 FROM bfa_p5_voice.session_fences
    WHERE owner_id=p_owner_id AND session_id=p_auth_session_id FOR SHARE;
  IF FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM bfa_p5_voice_v2.auth_parents
    WHERE owner_id=p_owner_id AND auth_session_id=p_auth_session_id FOR UPDATE;
  had_parent:=FOUND;
  n:=bfa_p5_voice.observe_now(p_owner_id);
  IF n IS NULL OR p_verified_ms>n OR n-p_verified_ms>=30000
    OR p_auth_expires_ms<=n THEN RETURN NULL; END IF;
  IF had_parent THEN
    IF p.revoked IS DISTINCT FROM false THEN RETURN NULL; END IF;
  ELSE
    INSERT INTO bfa_p5_voice_v2.auth_parents(owner_id,auth_session_id,version,revoked)
      VALUES(p_owner_id,p_auth_session_id,0,false) RETURNING * INTO p;
  END IF;
  RETURN bfa_p5_voice_v2.parent_observation(p);
END $$;

CREATE FUNCTION public.bfa_p5_v2_revoke_parent(p_owner_id uuid,p_auth_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE p bfa_p5_voice_v2.auth_parents;
BEGIN
  IF p_owner_id IS NULL OR p_auth_session_id IS NULL
    OR p_owner_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_auth_session_id='00000000-0000-0000-0000-000000000000'::uuid
    THEN RETURN NULL; END IF;
  PERFORM bfa_p5_voice.lock_owner(p_owner_id);
  SELECT * INTO p FROM bfa_p5_voice_v2.auth_parents
    WHERE owner_id=p_owner_id AND auth_session_id=p_auth_session_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO bfa_p5_voice_v2.auth_parents(owner_id,auth_session_id,version,revoked)
      VALUES(p_owner_id,p_auth_session_id,0,true) RETURNING * INTO p;
  ELSIF p.revoked IS DISTINCT FROM true THEN
    UPDATE bfa_p5_voice_v2.auth_parents AS a
      SET revoked=true,version=CASE WHEN a.version<9007199254740991 THEN a.version+1 ELSE a.version END
      WHERE a.owner_id=p_owner_id AND a.auth_session_id=p_auth_session_id RETURNING a.* INTO p;
  END IF;
  -- Deny-only operation intentionally ignores legacy/current Auth/allowlist and
  -- clock eligibility. Existing bindings and all cumulative holds are retained.
  RETURN bfa_p5_voice_v2.parent_observation(p);
END $$;

CREATE FUNCTION public.bfa_p5_v2_read_parent(p_owner_id uuid,p_auth_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE p bfa_p5_voice_v2.auth_parents;
BEGIN
  IF p_owner_id IS NULL OR p_auth_session_id IS NULL
    OR p_owner_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_auth_session_id='00000000-0000-0000-0000-000000000000'::uuid
    THEN RETURN NULL; END IF;
  PERFORM bfa_p5_voice.lock_owner(p_owner_id);
  PERFORM 1 FROM bfa_p5_voice.session_fences
    WHERE owner_id=p_owner_id AND session_id=p_auth_session_id FOR SHARE;
  IF FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM bfa_p5_voice_v2.auth_parents
    WHERE owner_id=p_owner_id AND auth_session_id=p_auth_session_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- No clock read/write or Auth claim: expose either retained terminal flag.
  -- NULL can mean a legacy conflict, not absence. A clear result is not a grant.
  RETURN bfa_p5_voice_v2.parent_observation(p);
END $$;

CREATE FUNCTION public.bfa_p5_v2_register_issuance(
  p_owner_id uuid,p_auth_session_id uuid,p_parent_version bigint,
  p_thread_id uuid,p_incarnation uuid,p_revision bigint,p_fingerprint text,
  p_verified_ms bigint,p_auth_expires_ms bigint,p_issued_ms bigint,p_expires_ms bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE p bfa_p5_voice_v2.auth_parents; b bfa_p5_voice_v2.issuance_auth_bindings;
  i bfa_p5_voice.issuances; g bfa_p5_voice.generations; a record; t record;
  had_issuance boolean; had_binding boolean; n bigint; allow_epoch numeric; allow_ms bigint;
BEGIN
  IF p_owner_id IS NULL OR p_auth_session_id IS NULL OR p_thread_id IS NULL OR p_incarnation IS NULL
    OR p_owner_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_auth_session_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_thread_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_incarnation='00000000-0000-0000-0000-000000000000'::uuid
    OR p_parent_version IS NULL OR p_parent_version NOT BETWEEN 0 AND 9007199254740991
    OR p_revision IS NULL OR p_revision NOT BETWEEN 0 AND 9007199254740991
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_verified_ms IS NULL OR p_verified_ms NOT BETWEEN 0 AND 9007199254740991
    OR p_auth_expires_ms IS NULL OR p_auth_expires_ms NOT BETWEEN 1 AND 9007199254740991
    OR p_issued_ms IS NULL OR p_issued_ms NOT BETWEEN 0 AND 9007199254740991
    OR p_expires_ms IS NULL OR p_expires_ms NOT BETWEEN 1 AND 9007199254740991
    THEN RETURN NULL; END IF;
  -- Range checks precede subtraction: hostile bigint endpoints cannot overflow.
  IF p_expires_ms-p_issued_ms NOT BETWEEN 1 AND 900000
    OR p_auth_expires_ms<=p_verified_ms OR p_expires_ms>p_auth_expires_ms THEN RETURN NULL; END IF;
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
  SELECT * INTO g FROM bfa_p5_voice.generations
    WHERE thread_id=p_thread_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO i FROM bfa_p5_voice.issuances WHERE fingerprint=p_fingerprint FOR UPDATE;
  had_issuance:=FOUND;
  SELECT * INTO b FROM bfa_p5_voice_v2.issuance_auth_bindings WHERE fingerprint=p_fingerprint FOR SHARE;
  had_binding:=FOUND;
  -- Clock sampling follows every potentially blocking row lock. A valid denial
  -- may advance only this owner's high-water; no generation is retired here.
  n:=bfa_p5_voice.observe_now(p_owner_id);
  IF n IS NULL OR p_verified_ms>n OR n-p_verified_ms>=30000
    OR p_issued_ms>n OR n-p_issued_ms>=30000
    OR p_auth_expires_ms<=n OR p_expires_ms<=n THEN RETURN NULL; END IF;
  IF a.expires_at IS NULL OR NOT isfinite(a.expires_at) THEN RETURN NULL; END IF;
  allow_epoch:=extract(epoch FROM a.expires_at)*1000;
  IF allow_epoch NOT BETWEEN 1 AND 9007199254740991 THEN RETURN NULL; END IF;
  allow_ms:=floor(allow_epoch)::bigint;
  IF a.admitted IS DISTINCT FROM true OR allow_ms<=n OR p_expires_ms>allow_ms
    OR t.deleted_at IS NOT NULL OR t.revision<>p_revision
    OR t.created_at IS NULL OR NOT isfinite(t.created_at)
    OR g.owner_id<>p_owner_id OR g.incarnation<>p_incarnation OR g.retired IS DISTINCT FROM false
    OR NOT isfinite(g.source_created_at) OR g.source_created_at<>t.created_at THEN RETURN NULL; END IF;
  IF had_issuance OR had_binding THEN
    -- Existing incomplete/orphaned v1 metadata is never adopted or repaired.
    -- A complete tuple can be observed only as the same still-eligible object.
    IF NOT had_issuance OR NOT had_binding
      OR i.revoked IS DISTINCT FROM false OR i.owner_id<>p_owner_id OR i.thread_id<>p_thread_id
      OR i.incarnation<>p_incarnation OR i.revision<>p_revision
      OR i.issued_ms<>p_issued_ms OR i.expires_ms<>p_expires_ms
      OR b.protocol<>2 OR b.owner_id<>p_owner_id OR b.auth_session_id<>p_auth_session_id
      OR b.parent_version<>p_parent_version THEN RETURN NULL; END IF;
  ELSE
    INSERT INTO bfa_p5_voice.issuances
      (fingerprint,owner_id,thread_id,incarnation,revision,issued_ms,expires_ms,revoked)
      VALUES(p_fingerprint,p_owner_id,p_thread_id,p_incarnation,p_revision,p_issued_ms,p_expires_ms,false)
      RETURNING * INTO i;
    INSERT INTO bfa_p5_voice_v2.issuance_auth_bindings
      (fingerprint,protocol,owner_id,auth_session_id,parent_version)
      VALUES(p_fingerprint,2,p_owner_id,p_auth_session_id,p_parent_version) RETURNING * INTO b;
  END IF;
  RETURN bfa_p5_voice_v2.issuance_observation(i,b);
END $$;

CREATE FUNCTION public.bfa_p5_v2_read_issuance(
  p_owner_id uuid,p_auth_session_id uuid,p_parent_version bigint,p_fingerprint text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE p bfa_p5_voice_v2.auth_parents; b bfa_p5_voice_v2.issuance_auth_bindings;
  i bfa_p5_voice.issuances; g bfa_p5_voice.generations; a record; t record;
  n bigint; allow_epoch numeric; allow_ms bigint;
BEGIN
  IF p_owner_id IS NULL OR p_auth_session_id IS NULL
    OR p_owner_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_auth_session_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_parent_version IS NULL OR p_parent_version NOT BETWEEN 0 AND 9007199254740991
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  PERFORM bfa_p5_voice.lock_owner(p_owner_id);
  PERFORM 1 FROM bfa_p5_voice.session_fences
    WHERE owner_id=p_owner_id AND session_id=p_auth_session_id FOR SHARE;
  IF FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM bfa_p5_voice_v2.auth_parents
    WHERE owner_id=p_owner_id AND auth_session_id=p_auth_session_id FOR SHARE;
  IF NOT FOUND OR p.revoked IS DISTINCT FROM false OR p.version<>p_parent_version THEN RETURN NULL; END IF;
  SELECT * INTO i FROM bfa_p5_voice.issuances WHERE fingerprint=p_fingerprint FOR SHARE;
  IF NOT FOUND OR i.owner_id<>p_owner_id THEN RETURN NULL; END IF;
  SELECT * INTO b FROM bfa_p5_voice_v2.issuance_auth_bindings WHERE fingerprint=p_fingerprint FOR SHARE;
  IF NOT FOUND OR b.protocol<>2 OR b.owner_id<>p_owner_id
    OR b.auth_session_id<>p_auth_session_id OR b.parent_version<>p_parent_version THEN RETURN NULL; END IF;
  SELECT user_id,admitted,expires_at INTO a FROM public.bfa_p3b_staging_accounts
    WHERE user_id=p_owner_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT id,owner_id,revision,created_at,deleted_at INTO t FROM public.bfa_p3b_threads
    WHERE id=i.thread_id AND owner_id=p_owner_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO g FROM bfa_p5_voice.generations WHERE thread_id=i.thread_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- This content-free observation may advance ONLY owner_clocks. Persisting the
  -- observed time prevents an observed issuance expiry from reviving on rollback.
  n:=bfa_p5_voice.observe_now(p_owner_id);
  IF n IS NULL THEN RETURN NULL; END IF;
  IF a.expires_at IS NULL OR NOT isfinite(a.expires_at) THEN RETURN NULL; END IF;
  allow_epoch:=extract(epoch FROM a.expires_at)*1000;
  IF allow_epoch NOT BETWEEN 1 AND 9007199254740991 THEN RETURN NULL; END IF;
  allow_ms:=floor(allow_epoch)::bigint;
  IF a.admitted IS DISTINCT FROM true OR allow_ms<=n OR i.expires_ms>allow_ms
    OR t.deleted_at IS NOT NULL OR t.revision<>i.revision
    OR t.created_at IS NULL OR NOT isfinite(t.created_at)
    OR g.owner_id<>p_owner_id OR g.incarnation<>i.incarnation OR g.retired IS DISTINCT FROM false
    OR NOT isfinite(g.source_created_at) OR g.source_created_at<>t.created_at
    OR i.revoked IS DISTINCT FROM false OR i.issued_ms>n OR i.expires_ms<=n
    THEN RETURN NULL; END IF;
  RETURN bfa_p5_voice_v2.issuance_observation(i,b);
END $$;

-- Fresh verification times and Auth ceilings are trusted per-call observations,
-- not persisted identity metadata and not echoed in receipts. A later deliberate
-- exact registration observation may supply newer valid Auth metadata while the
-- original issuance/binding remains unchanged. The transport must associate the
-- reply with that exact invocation and prohibit transparent retry/replacement.
-- Configuration may shorten the 15-minute maximum before the host calls SQL;
-- no parent record extends eligibility and no receipt is a dispatch capability.
-- Observe/register/read_issuance may advance only owner_clocks in addition to
-- their specified insertions. read_parent is mutation-free. revoke_parent changes
-- only its exact parent row. No function writes original/cumulative holds.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA bfa_p5_voice_v2
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.bfa_p5_v2_observe_parent(uuid,uuid,bigint,bigint)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.bfa_p5_v2_revoke_parent(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.bfa_p5_v2_read_parent(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.bfa_p5_v2_register_issuance(uuid,uuid,bigint,uuid,uuid,bigint,text,bigint,bigint,bigint,bigint)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.bfa_p5_v2_read_issuance(uuid,uuid,bigint,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_v2_observe_parent(uuid,uuid,bigint,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_v2_revoke_parent(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_v2_read_parent(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_v2_register_issuance(uuid,uuid,bigint,uuid,uuid,bigint,text,bigint,bigint,bigint,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_v2_read_issuance(uuid,uuid,bigint,text) TO service_role;
COMMIT;
