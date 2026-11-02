-- PROPOSED insert-once local P5 session fence; outside automatic migrations and
-- never applied to the connected project. Requires p5-voice-admission.sql.
-- The trusted host must already have verified this exact owner/session with
-- Auth. A parsed token, browser identity or service-role execution is not that
-- evidence. No Auth provider session, approval, quota or dispatch is created.
BEGIN;

CREATE FUNCTION public.bfa_p5_voice_provision_session(
  p_owner_id uuid, p_session_id uuid, p_verified_ms bigint, p_expires_ms bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE s bfa_p5_voice.session_fences; had_session boolean; n bigint;
BEGIN
  -- Validate ranges before subtraction, so even hostile bigint endpoints cannot
  -- overflow a duration expression. Typed UUID/bigint arguments may themselves
  -- fail PostgreSQL input conversion; the inactive adapter sanitizes failures.
  IF p_owner_id IS NULL OR p_session_id IS NULL
    OR p_verified_ms IS NULL OR p_verified_ms NOT BETWEEN 0 AND 9007199254740991
    OR p_expires_ms IS NULL OR p_expires_ms NOT BETWEEN 1 AND 9007199254740991
    THEN RETURN NULL; END IF;
  IF p_expires_ms-p_verified_ms NOT BETWEEN 1 AND 900000 THEN RETURN NULL; END IF;

  -- The shared owner-first lock serializes absent insert against revocation's
  -- absent tombstone, as well as every protected operation for this owner.
  PERFORM bfa_p5_voice.lock_owner(p_owner_id);
  SELECT * INTO s FROM bfa_p5_voice.session_fences
    WHERE owner_id=p_owner_id AND session_id=p_session_id FOR UPDATE;
  had_session:=FOUND;
  -- observe_now obtains the clock row lock and samples database time AFTER the
  -- session wait. Structurally valid denials may advance this one high-water
  -- record: an observed expiry must not become fresh after a clock rollback.
  -- Invalid/backward clock values fail closed. This is not remote Auth time.
  n:=bfa_p5_voice.observe_now(p_owner_id);
  IF n IS NULL OR p_verified_ms>n OR n-p_verified_ms>30000 OR p_expires_ms<=n
    THEN RETURN NULL; END IF;

  IF had_session THEN
    -- Never update an existing fence. Revocation tombstones and expired rows
    -- cannot be reactivated, this retained pair cannot be replaced, and a different
    -- expiry (shorter OR longer) cannot replace the original lifetime.
    -- A matching still-active row returns its current version without reset.
    IF s.revoked IS DISTINCT FROM false
      OR s.version NOT BETWEEN 0 AND 9007199254740991
      OR s.expires_ms<>p_expires_ms OR s.expires_ms<=n THEN RETURN NULL; END IF;
  ELSE
    INSERT INTO bfa_p5_voice.session_fences
      (owner_id,session_id,version,expires_ms,revoked)
      VALUES(p_owner_id,p_session_id,0,p_expires_ms,false)
      RETURNING * INTO s;
  END IF;
  RETURN jsonb_build_object(
    'ownerId',s.owner_id,'sessionId',s.session_id,'version',s.version,
    'expiresAt',s.expires_ms,'revoked',false
  );
END $$;

-- This 15-minute ceiling bounds only the proposed local P5 fence, not general
-- app or Auth-provider sessions. The future verified host must choose its exact
-- expiry once and cap it to the independently verified Auth expiry. This RPC
-- cannot infer Auth provenance or authenticate the supplied verification time.
-- Fresh verification is at most 30 seconds old at the locked database check.
-- A later deliberate exact acknowledgment may use newer verified metadata;
-- it does not extend, recreate or renew the original fence. No expiry update,
-- version reset, identity reuse or provider-session operation is available.
-- Only session_fences (one absent row) and this owner's clock can change. No
-- private content, thread, issuance, proof, allowlist, approval or hold changes.
-- A receipt is a local observation, not continuing Auth or dispatch permission;
-- revocation may win immediately afterward. Later readers/transactions must
-- still check current protected state. Lost replies never establish rollback
-- or authorize automatic transport retry, renewed expiry or another identity.
-- SQL echoes no verification timestamp: exact request/reply association is a
-- mandatory trusted transport precondition, not a new receipt guarantee.
REVOKE ALL ON FUNCTION public.bfa_p5_voice_provision_session(uuid,uuid,bigint,bigint)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_voice_provision_session(uuid,uuid,bigint,bigint)
  TO service_role;
COMMIT;
