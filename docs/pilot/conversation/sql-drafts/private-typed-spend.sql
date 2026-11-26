-- INACTIVE / UNAPPLIED. One separately funded fictional typed send per approval.
-- Not a migration, runtime connection, Auth verifier, price oracle or live grant.
-- Trusted provisioning must bind a reviewed exact manifest (including the inner
-- ConversationService request identity, price basis and limits), the exact full
-- wire digest and its independently calculated integer micro-USD reservation.
-- p_request is the outer UUID, not the service's req-N exchange identifier.
-- No content, raw provider IDs, secrets, initial approvals or automatic refunds.
BEGIN;
CREATE SCHEMA bfa_private_text_spend;
REVOKE ALL ON SCHEMA bfa_private_text_spend FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE bfa_private_text_spend.approvals (
  approval_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  auth_session_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  thread_revision bigint NOT NULL CHECK (thread_revision BETWEEN 0 AND 9007199254740991),
  request_id uuid NOT NULL UNIQUE,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  provider text NOT NULL CHECK (provider = 'openai'),
  model text NOT NULL CHECK (model ~ '^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$'),
  tier text NOT NULL CHECK (tier = 'default'),
  max_micros bigint NOT NULL CHECK (max_micros BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(created_at)),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at) AND expires_at > created_at),
  revoked boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'approved' CHECK (state IN ('approved','held','settled')),
  held_at timestamptz CHECK (isfinite(held_at)),
  auth_verified_at timestamptz CHECK (isfinite(auth_verified_at)),
  auth_expires_at timestamptz CHECK (isfinite(auth_expires_at)),
  response_sha256 text UNIQUE CHECK (response_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_sha256 text CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  charged_micros bigint CHECK (charged_micros BETWEEN 0 AND max_micros),
  settled_at timestamptz CHECK (isfinite(settled_at)),
  CHECK (
    (state = 'approved' AND held_at IS NULL AND auth_verified_at IS NULL AND auth_expires_at IS NULL
      AND response_sha256 IS NULL AND evidence_sha256 IS NULL AND charged_micros IS NULL AND settled_at IS NULL)
    OR
    (state IN ('held','settled') AND held_at IS NOT NULL AND auth_verified_at IS NOT NULL AND auth_expires_at IS NOT NULL
      AND held_at >= created_at AND held_at >= auth_verified_at
      AND held_at < expires_at AND held_at < auth_expires_at AND held_at - auth_verified_at < interval '30 seconds'
      AND ((state = 'held' AND response_sha256 IS NULL AND evidence_sha256 IS NULL AND charged_micros IS NULL AND settled_at IS NULL)
        OR (state = 'settled' AND response_sha256 IS NOT NULL AND evidence_sha256 IS NOT NULL AND charged_micros IS NOT NULL
          AND settled_at IS NOT NULL AND settled_at >= held_at)))
  )
);
REVOKE ALL ON TABLE bfa_private_text_spend.approvals FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE bfa_private_text_spend.approvals ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE bfa_private_text_spend.approvals IS
  'Inactive single-send micro-USD approval. Trusted owner provisions immutable facts; service RPCs only consume/settle. Held means possibly dispatched and retains the full maximum indefinitely. Settled unused allowance cannot fund another send. No invoice/finality claim.';

CREATE FUNCTION public.bfa_private_text_spend_claim(
  p_approval uuid, p_owner uuid, p_session uuid, p_thread uuid, p_revision bigint, p_request uuid,
  p_manifest text, p_payload text, p_provider text, p_model text, p_tier text, p_max_micros bigint,
  p_approval_expires_at timestamptz, p_auth_verified_at timestamptz, p_auth_expires_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE a bfa_private_text_spend.approvals; is_admitted boolean; allow_expires timestamptz;
  current_owner uuid; current_revision bigint; deleted timestamptz; sampled timestamptz;
BEGIN
  SELECT * INTO a FROM bfa_private_text_spend.approvals WHERE approval_id = p_approval FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF a.owner_id IS DISTINCT FROM p_owner OR a.auth_session_id IS DISTINCT FROM p_session
    OR a.thread_id IS DISTINCT FROM p_thread OR a.thread_revision IS DISTINCT FROM p_revision
    OR a.request_id IS DISTINCT FROM p_request OR a.manifest_sha256 IS DISTINCT FROM p_manifest
    OR a.payload_sha256 IS DISTINCT FROM p_payload OR a.provider IS DISTINCT FROM p_provider
    OR a.model IS DISTINCT FROM p_model OR a.tier IS DISTINCT FROM p_tier
    OR a.max_micros IS DISTINCT FROM p_max_micros OR a.expires_at IS DISTINCT FROM p_approval_expires_at
    OR a.state <> 'approved' OR a.revoked THEN RETURN false; END IF;
  -- Do not call the old whole-thread guard: no saved_snapshot/content is read.
  SELECT admitted, expires_at INTO is_admitted, allow_expires FROM public.bfa_p3b_staging_accounts
    WHERE user_id = p_owner FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT owner_id, revision, deleted_at INTO current_owner, current_revision, deleted
    FROM public.bfa_p3b_threads WHERE id = p_thread FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Physical time is sampled only AFTER every potentially blocking row lock.
  sampled := clock_timestamp();
  IF p_auth_verified_at IS NULL OR p_auth_expires_at IS NULL
    OR NOT isfinite(p_auth_verified_at) OR NOT isfinite(p_auth_expires_at)
    OR NOT isfinite(sampled) OR allow_expires IS NULL OR NOT isfinite(allow_expires)
    OR is_admitted IS DISTINCT FROM true OR current_owner IS DISTINCT FROM p_owner
    OR current_revision IS DISTINCT FROM p_revision OR deleted IS NOT NULL
    OR sampled < a.created_at OR sampled >= a.expires_at OR sampled >= allow_expires
    OR sampled < p_auth_verified_at OR sampled - p_auth_verified_at >= interval '30 seconds'
    OR sampled >= p_auth_expires_at THEN RETURN false; END IF;
  UPDATE bfa_private_text_spend.approvals SET state = 'held', held_at = sampled,
    auth_verified_at = p_auth_verified_at, auth_expires_at = p_auth_expires_at WHERE approval_id = p_approval;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.bfa_private_text_spend_claim(uuid,uuid,uuid,uuid,bigint,uuid,text,text,text,text,text,bigint,timestamptz,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bfa_private_text_spend_claim(uuid,uuid,uuid,uuid,bigint,uuid,text,text,text,text,text,bigint,timestamptz,timestamptz,timestamptz) TO service_role;

CREATE FUNCTION public.bfa_private_text_spend_settle(
  p_approval uuid, p_owner uuid, p_session uuid, p_thread uuid, p_revision bigint, p_request uuid,
  p_manifest text, p_payload text, p_provider text, p_model text, p_tier text, p_max_micros bigint,
  p_approval_expires_at timestamptz, p_response_id text, p_evidence_sha256 text, p_charged_micros bigint
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE a bfa_private_text_spend.approvals; response_digest text; sampled timestamptz;
BEGIN
  SELECT * INTO a FROM bfa_private_text_spend.approvals WHERE approval_id = p_approval FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF a.owner_id IS DISTINCT FROM p_owner OR a.auth_session_id IS DISTINCT FROM p_session
    OR a.thread_id IS DISTINCT FROM p_thread OR a.thread_revision IS DISTINCT FROM p_revision
    OR a.request_id IS DISTINCT FROM p_request OR a.manifest_sha256 IS DISTINCT FROM p_manifest
    OR a.payload_sha256 IS DISTINCT FROM p_payload OR a.provider IS DISTINCT FROM p_provider
    OR a.model IS DISTINCT FROM p_model OR a.tier IS DISTINCT FROM p_tier
    OR a.max_micros IS DISTINCT FROM p_max_micros OR a.expires_at IS DISTINCT FROM p_approval_expires_at
    OR a.state NOT IN ('held','settled') THEN RETURN false; END IF;
  IF p_response_id IS NULL OR p_response_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$'
    OR p_evidence_sha256 IS NULL OR p_evidence_sha256 !~ '^[0-9a-f]{64}$'
    OR p_charged_micros IS NULL OR p_charged_micros < 0 OR p_charged_micros > a.max_micros
    THEN RETURN false; END IF;
  -- Canonical full provider ID: never truncate or convert it to a synthetic UUID.
  response_digest := encode(sha256(convert_to('openai:' || p_response_id, 'UTF8')), 'hex');
  IF a.state = 'settled' THEN
    RETURN a.response_sha256 = response_digest AND a.evidence_sha256 = p_evidence_sha256
      AND a.charged_micros = p_charged_micros;
  END IF;
  sampled := clock_timestamp();
  IF NOT isfinite(sampled) OR sampled < a.held_at THEN RETURN false; END IF;
  -- Reconciliation deliberately survives Auth expiry, allowlist withdrawal and
  -- thread tombstones. Caller must verify authentic receipt/usage/price binding;
  -- SQL cannot authenticate provider data or turn an arbitrary amount into truth.
  BEGIN
    UPDATE bfa_private_text_spend.approvals SET state = 'settled', response_sha256 = response_digest,
      evidence_sha256 = p_evidence_sha256, charged_micros = p_charged_micros, settled_at = sampled
      WHERE approval_id = p_approval;
  EXCEPTION WHEN unique_violation THEN RETURN false;
  END;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.bfa_private_text_spend_settle(uuid,uuid,uuid,uuid,bigint,uuid,text,text,text,text,text,bigint,timestamptz,text,text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bfa_private_text_spend_settle(uuid,uuid,uuid,uuid,bigint,uuid,text,text,text,text,text,bigint,timestamptz,text,text,bigint) TO service_role;

-- No grant issuer, live Auth bridge, provider dispatch, cleanup/refund command,
-- automatic retry, application import or connected migration is supplied here.
-- A successful claim is historical one-send accounting evidence, not permanent
-- eligibility. Future orchestration must recheck current Auth/access and all
-- deadlines after waits before the one actual send, retaining holds on doubt.
COMMIT;
