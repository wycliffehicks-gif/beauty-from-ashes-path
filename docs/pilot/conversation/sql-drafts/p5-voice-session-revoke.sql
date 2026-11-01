-- PROPOSED terminal exact-session revocation; outside automatic migrations and
-- never applied to the connected project. Requires p5-voice-admission.sql.
-- No active session, issuance, approval, budget or provider operation is created.
-- The trusted Auth/revocation host must establish the exact owner/session pair;
-- service-role execution or a browser-supplied session ID is not that evidence.
BEGIN;

CREATE FUNCTION public.bfa_p5_voice_revoke_session(
  p_owner_id uuid, p_session_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE s bfa_p5_voice.session_fences;
BEGIN
  IF p_owner_id IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'Unavailable';
  END IF;
  -- Share the owner-first order used by every protected eligibility operation.
  -- Future enabling/provisioning writers must use this lock and must refuse
  -- every retained revoked identity; a session identity cannot be reused.
  PERFORM bfa_p5_voice.lock_owner(p_owner_id);
  SELECT * INTO s FROM bfa_p5_voice.session_fences
    WHERE owner_id=p_owner_id AND session_id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Revoke-before-provision is a permanent denial tombstone, not an active
    -- session. The minimum positive expiry is a sentinel, not an event time.
    INSERT INTO bfa_p5_voice.session_fences
      (owner_id,session_id,version,expires_ms,revoked)
      VALUES(p_owner_id,p_session_id,0,1,true)
      RETURNING * INTO s;
  ELSIF s.revoked IS DISTINCT FROM true THEN
    -- The terminal flag is authoritative even at the safe-integer ceiling.
    -- Saturate rather than wrapping or failing to commit revocation. Existing
    -- readers/proofs check revoked as well as version. Never extend expiry.
    UPDATE bfa_p5_voice.session_fences AS f
      SET revoked=true,
          version=CASE WHEN f.version<9007199254740991
            THEN f.version+1 ELSE f.version END
      WHERE f.owner_id=p_owner_id AND f.session_id=p_session_id
      RETURNING f.* INTO s;
  END IF;
  -- An already-revoked row is returned unchanged: no repeated version advance,
  -- expiry reset or deletion. A lost reply does not imply the mutation rolled
  -- back, and this idempotence does not authorize transparent transport retry.
  RETURN jsonb_build_object(
    'ownerId',s.owner_id,'sessionId',s.session_id,'version',s.version,
    'expiresAt',s.expires_ms,'revoked',true
  );
END $$;

-- Terminal denial is deliberately independent of current Auth/allowlist/thread
-- eligibility, fresh wall-clock time and observe_now. Expiry, deleted threads
-- or a clock below retained high-water must not prevent committing revocation.
-- No clocks, private content, generation, issuance, proof, hold or accounting
-- rows change here. Subsequent eligibility operations still perform their own
-- current checks; this acknowledgment cannot terminate an existing provider
-- session or establish actual Auth-event delivery/propagation.
-- No direct private schema/table/helper grant and no enabling/renewal API.
REVOKE ALL ON FUNCTION public.bfa_p5_voice_revoke_session(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bfa_p5_voice_revoke_session(uuid,uuid) TO service_role;
COMMIT;
