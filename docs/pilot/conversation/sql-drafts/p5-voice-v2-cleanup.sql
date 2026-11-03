-- PROPOSED isolated v2 cleanup boundary, OUTSIDE migrations; never applied to
-- the connected project. Requires p5-voice-admission.sql and the v2 parent /
-- issuance foundation. No runtime route, Auth verifier or enabling cutover.
-- Legacy proof/claim/capacity paths remain callable and MUST NOT receive v2
-- authority. Complete versioned predicates and quiesced no-fallback cutover
-- remain required before deployment. Registration and reads are not grants.
BEGIN;

-- Preserve all existing rows as protocol NULL. Old explicit-column inserts
-- keep that value; no legacy/unbound record is backfilled or adopted by v2.
-- No additional table, accounting identity or renewable parent is introduced.
ALTER TABLE bfa_p5_voice.cleanup_owners ADD COLUMN protocol integer;
ALTER TABLE bfa_p5_voice.cleanup_owners ADD CONSTRAINT cleanup_protocol_v2_binding
  CHECK(protocol IS NULL OR (
    protocol=2 AND owner_id<>'00000000-0000-0000-0000-000000000000'::uuid
    AND session_id IS NOT NULL
    AND session_id<>'00000000-0000-0000-0000-000000000000'::uuid
    AND session_version IS NOT NULL
    AND session_version BETWEEN 0 AND 9007199254740991
    AND authority_fingerprint IS NOT NULL
    AND authority_fingerprint ~ '^[0-9a-f]{64}$'
  ));

CREATE FUNCTION bfa_p5_voice_v2.cleanup_observation(k bfa_p5_voice.cleanup_owners)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT jsonb_build_object('protocol',2,'cleanupId',k.cleanup_id,'claim',k.claim,
    'authSessionId',k.session_id,'parentVersion',k.session_version,
    'authorityFingerprint',k.authority_fingerprint,
    'effectiveExpiresAt',k.effective_expires_ms,'closedAt',k.closed_ms,
    'expiredAt',k.expired_ms,'invalidatedAt',k.invalidated_ms)
$$;

CREATE FUNCTION public.bfa_p5_v2_register_cleanup(
  p_cleanup_id uuid,p_claim jsonb,p_auth_session_id uuid,p_parent_version bigint,
  p_fingerprint text,p_verified_ms bigint,p_auth_expires_ms bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE c bfa_p5_voice.claim_key; id uuid; k bfa_p5_voice.cleanup_owners;
  p bfa_p5_voice_v2.auth_parents; b bfa_p5_voice_v2.issuance_auth_bindings;
  i bfa_p5_voice.issuances; g bfa_p5_voice.generations; a record; t record;
  had_cleanup boolean; n bigint; allow_epoch numeric; allow_ms bigint; ceiling bigint;
BEGIN
  -- The shared parser retains exact keys, canonical UUID text, safe integers,
  -- scope and digest checks. V2 additionally excludes every nil claim identity.
  c:=bfa_p5_voice.parse_claim(p_claim); id:=bfa_p5_voice.id(p_claim->'claimId');
  IF p_cleanup_id IS NULL OR p_auth_session_id IS NULL
    OR p_cleanup_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_auth_session_id='00000000-0000-0000-0000-000000000000'::uuid
    OR id='00000000-0000-0000-0000-000000000000'::uuid
    OR c.owner_id='00000000-0000-0000-0000-000000000000'::uuid
    OR c.thread_id='00000000-0000-0000-0000-000000000000'::uuid
    OR c.incarnation='00000000-0000-0000-0000-000000000000'::uuid
    OR c.attempt_id='00000000-0000-0000-0000-000000000000'::uuid
    OR c.approval_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_parent_version IS NULL OR p_parent_version NOT BETWEEN 0 AND 9007199254740991
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_verified_ms IS NULL OR p_verified_ms NOT BETWEEN 0 AND 9007199254740991
    OR p_auth_expires_ms IS NULL OR p_auth_expires_ms NOT BETWEEN 1 AND 9007199254740991
    THEN RETURN NULL; END IF;
  IF p_auth_expires_ms<=p_verified_ms THEN RETURN NULL; END IF;
  PERFORM bfa_p5_voice.lock_owner(c.owner_id);
  PERFORM 1 FROM bfa_p5_voice.session_fences
    WHERE owner_id=c.owner_id AND session_id=p_auth_session_id FOR SHARE;
  IF FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM bfa_p5_voice_v2.auth_parents
    WHERE owner_id=c.owner_id AND auth_session_id=p_auth_session_id FOR SHARE;
  IF NOT FOUND OR p.revoked IS DISTINCT FROM false OR p.version<>p_parent_version
    THEN RETURN NULL; END IF;
  SELECT user_id,admitted,expires_at INTO a FROM public.bfa_p3b_staging_accounts
    WHERE user_id=c.owner_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT th.id,th.owner_id,th.revision,th.created_at,th.deleted_at INTO t
    FROM public.bfa_p3b_threads AS th
    WHERE th.id=c.thread_id AND th.owner_id=c.owner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO g FROM bfa_p5_voice.generations WHERE thread_id=c.thread_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO i FROM bfa_p5_voice.issuances WHERE fingerprint=p_fingerprint FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO b FROM bfa_p5_voice_v2.issuance_auth_bindings
    WHERE fingerprint=p_fingerprint FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO k FROM bfa_p5_voice.cleanup_owners
    WHERE cleanup_id=p_cleanup_id OR claim_id=id FOR UPDATE;
  had_cleanup:=FOUND;
  IF had_cleanup AND (
    k.protocol IS DISTINCT FROM 2 OR k.cleanup_id<>p_cleanup_id OR k.claim_id<>id
    OR k.owner_id<>c.owner_id OR k.claim IS DISTINCT FROM p_claim
    OR k.session_id IS DISTINCT FROM p_auth_session_id
    OR k.session_version IS DISTINCT FROM p_parent_version
    OR k.authority_fingerprint IS DISTINCT FROM p_fingerprint
    OR k.closed_ms IS NOT NULL OR k.expired_ms IS NOT NULL OR k.invalidated_ms IS NOT NULL
  ) THEN RETURN NULL; END IF;
  -- This is only pre-proof/pre-admission registration. Never mutate a retained
  -- proof, shared claim, attempt winner or accounting. Later v2 proof/inspect
  -- must own any subsequent lifetime shortening after this boundary.
  PERFORM 1 FROM bfa_p5_voice.proofs
    WHERE cleanup_id=p_cleanup_id OR claim_id=id FOR SHARE;
  IF FOUND THEN RETURN NULL; END IF;
  PERFORM 1 FROM bfa_p5_voice.claims WHERE claim_id=id FOR SHARE;
  IF FOUND THEN RETURN NULL; END IF;
  PERFORM 1 FROM bfa_p5_voice.attempts
    WHERE owner_id=c.owner_id AND attempt_id=c.attempt_id FOR SHARE;
  IF FOUND THEN RETURN NULL; END IF;
  -- Sample after all potentially blocking locks. Never refresh verified time.
  -- A safe, nonfuture observation may retain a shorter negative fence on an
  -- exact existing row even if verification aged while waiting; not permission.
  n:=bfa_p5_voice.observe_now(c.owner_id);
  IF n IS NULL OR p_verified_ms>n THEN RETURN NULL; END IF;
  IF a.expires_at IS NULL OR NOT isfinite(a.expires_at) THEN RETURN NULL; END IF;
  allow_epoch:=extract(epoch FROM a.expires_at)*1000;
  IF allow_epoch NOT BETWEEN 1 AND 9007199254740991 THEN RETURN NULL; END IF;
  allow_ms:=floor(allow_epoch)::bigint;
  IF a.admitted IS DISTINCT FROM true
    OR t.deleted_at IS NOT NULL OR t.revision<>c.revision
    OR t.created_at IS NULL OR NOT isfinite(t.created_at)
    OR g.owner_id<>c.owner_id OR g.incarnation<>c.incarnation
    OR g.retired IS DISTINCT FROM false OR NOT isfinite(g.source_created_at)
    OR g.source_created_at<>t.created_at
    OR i.owner_id<>c.owner_id OR i.thread_id<>c.thread_id
    OR i.incarnation<>c.incarnation OR i.revision<>c.revision
    OR i.revoked IS DISTINCT FROM false OR i.issued_ms>n
    OR b.protocol<>2 OR b.owner_id<>c.owner_id
    OR b.auth_session_id<>p_auth_session_id OR b.parent_version<>p_parent_version
    THEN RETURN NULL; END IF;
  ceiling:=least(c.expires_ms,i.expires_ms,p_auth_expires_ms,allow_ms);
  IF had_cleanup THEN
    -- Retain a shorter ceiling before stale-verification/expiry denial. It is
    -- negative evidence only: a later longer observation cannot revive it.
    IF ceiling<k.effective_expires_ms THEN
      UPDATE bfa_p5_voice.cleanup_owners SET effective_expires_ms=ceiling
        WHERE cleanup_id=p_cleanup_id RETURNING * INTO k;
    END IF;
    ceiling:=k.effective_expires_ms;
  END IF;
  IF n-p_verified_ms>=30000 OR ceiling<=n THEN RETURN NULL; END IF;
  IF NOT had_cleanup THEN
    INSERT INTO bfa_p5_voice.cleanup_owners
      (cleanup_id,claim_id,owner_id,claim,effective_expires_ms,
       session_id,session_version,authority_fingerprint,protocol)
      VALUES(p_cleanup_id,id,c.owner_id,p_claim,ceiling,
        p_auth_session_id,p_parent_version,p_fingerprint,2) RETURNING * INTO k;
  END IF;
  RETURN bfa_p5_voice_v2.cleanup_observation(k);
END $$;

CREATE FUNCTION public.bfa_p5_v2_read_cleanup(
  p_cleanup_id uuid,p_claim jsonb,p_auth_session_id uuid,p_parent_version bigint,
  p_fingerprint text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE c bfa_p5_voice.claim_key; id uuid; k bfa_p5_voice.cleanup_owners;
BEGIN
  c:=bfa_p5_voice.parse_claim(p_claim); id:=bfa_p5_voice.id(p_claim->'claimId');
  IF p_cleanup_id IS NULL OR p_auth_session_id IS NULL
    OR p_cleanup_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_auth_session_id='00000000-0000-0000-0000-000000000000'::uuid
    OR id='00000000-0000-0000-0000-000000000000'::uuid
    OR c.owner_id='00000000-0000-0000-0000-000000000000'::uuid
    OR c.thread_id='00000000-0000-0000-0000-000000000000'::uuid
    OR c.incarnation='00000000-0000-0000-0000-000000000000'::uuid
    OR c.attempt_id='00000000-0000-0000-0000-000000000000'::uuid
    OR c.approval_id='00000000-0000-0000-0000-000000000000'::uuid
    OR p_parent_version IS NULL OR p_parent_version NOT BETWEEN 0 AND 9007199254740991
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$'
    THEN RETURN NULL; END IF;
  PERFORM bfa_p5_voice.lock_owner(c.owner_id);
  SELECT * INTO k FROM bfa_p5_voice.cleanup_owners
    WHERE cleanup_id=p_cleanup_id AND claim_id=id FOR SHARE;
  IF NOT FOUND OR k.protocol IS DISTINCT FROM 2 OR k.owner_id<>c.owner_id
    OR k.claim IS DISTINCT FROM p_claim
    OR k.session_id IS DISTINCT FROM p_auth_session_id
    OR k.session_version IS DISTINCT FROM p_parent_version
    OR k.authority_fingerprint IS DISTINCT FROM p_fingerprint
    THEN RETURN NULL; END IF;
  -- Exact persisted evidence remains observable after closure, expiry, Auth or
  -- legacy revocation and thread deletion. No current-eligibility implication,
  -- clock sampling, expiry synthesis, parent lookup, mutation or authority.
  RETURN bfa_p5_voice_v2.cleanup_observation(k);
END $$;

-- No broad privilege changes: legacy deny/close/reconciliation paths and all
-- prior grants stay intact. Default new-function access is revoked atomically.
REVOKE ALL ON FUNCTION bfa_p5_voice_v2.cleanup_observation(bfa_p5_voice.cleanup_owners)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.bfa_p5_v2_register_cleanup(uuid,jsonb,uuid,bigint,text,bigint,bigint)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.bfa_p5_v2_read_cleanup(uuid,jsonb,uuid,bigint,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_v2_register_cleanup(uuid,jsonb,uuid,bigint,text,bigint,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_v2_read_cleanup(uuid,jsonb,uuid,bigint,text) TO service_role;
COMMIT;
