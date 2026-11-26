-- INACTIVE / UNAPPLIED post-hold boundary; install only after private-typed-spend.sql.
-- No grants, runtime route, provider call, content storage or historical rewrite.
-- Requires real host auth.sessions(id,user_id,not_after) at eventual deployment;
-- local fixtures create a synthetic table ONLY inside the disposable database.
-- SQL verifies current session presence, not provider truth or every host policy.
BEGIN;
CREATE TABLE bfa_private_text_spend.dispatches (
  approval_id uuid PRIMARY KEY REFERENCES bfa_private_text_spend.approvals(approval_id),
  dispatch_id uuid NOT NULL UNIQUE,
  dispatched_at timestamptz NOT NULL CHECK (isfinite(dispatched_at)),
  effective_expires_at timestamptz NOT NULL CHECK (isfinite(effective_expires_at) AND effective_expires_at > dispatched_at),
  response_sha256 text CHECK (response_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_sha256 text CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  charged_micros bigint CHECK (charged_micros BETWEEN 0 AND 9007199254740991),
  settled_at timestamptz CHECK (isfinite(settled_at) AND settled_at >= dispatched_at),
  finished_at timestamptz CHECK (isfinite(finished_at) AND finished_at >= settled_at),
  finished_revision bigint CHECK (finished_revision BETWEEN 1 AND 9007199254740991),
  CHECK ((response_sha256 IS NULL AND evidence_sha256 IS NULL AND charged_micros IS NULL AND settled_at IS NULL)
    OR (response_sha256 IS NOT NULL AND evidence_sha256 IS NOT NULL AND charged_micros IS NOT NULL AND settled_at IS NOT NULL)),
  CHECK ((finished_at IS NULL AND finished_revision IS NULL)
    OR (finished_at IS NOT NULL AND finished_revision IS NOT NULL AND settled_at IS NOT NULL))
);
REVOKE ALL ON TABLE bfa_private_text_spend.dispatches FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE bfa_private_text_spend.dispatches ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE bfa_private_text_spend.dispatches IS
  'One-use post-hold dispatch marker and independently verified new-path settlement/finish. A marker means possibly sent, not a provider call or permission forever. No automatic release or saved content.';
CREATE TYPE bfa_private_text_spend.current_access AS (
  checked_at timestamptz, verified_at timestamptz, identity_expires_at timestamptz,
  allowlist_expires_at timestamptz, effective_expires_at timestamptz, current_revision bigint
);

CREATE FUNCTION bfa_private_text_spend.lock_approval(p_approval uuid, p_owner uuid, p_session uuid, p_thread uuid, p_revision bigint, p_request uuid,
  p_manifest text, p_payload text, p_provider text, p_model text, p_tier text, p_max_micros bigint,
  p_approval_expires_at timestamptz)
RETURNS bfa_private_text_spend.approvals LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a bfa_private_text_spend.approvals;
BEGIN
 SELECT * INTO a FROM bfa_private_text_spend.approvals WHERE approval_id=p_approval FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF a.owner_id IS DISTINCT FROM p_owner OR a.auth_session_id IS DISTINCT FROM p_session
   OR a.thread_id IS DISTINCT FROM p_thread OR a.thread_revision IS DISTINCT FROM p_revision
   OR a.request_id IS DISTINCT FROM p_request OR a.manifest_sha256 IS DISTINCT FROM p_manifest
   OR a.payload_sha256 IS DISTINCT FROM p_payload OR a.provider IS DISTINCT FROM p_provider
   OR a.model IS DISTINCT FROM p_model OR a.tier IS DISTINCT FROM p_tier
   OR a.max_micros IS DISTINCT FROM p_max_micros OR a.expires_at IS DISTINCT FROM p_approval_expires_at
   THEN RETURN NULL; END IF;
 RETURN a;
END $$;

CREATE FUNCTION bfa_private_text_spend.lock_current(
 a bfa_private_text_spend.approvals, p_revision bigint,
 p_auth_verified_at timestamptz, p_auth_expires_at timestamptz,
 p_eligibility_expires_at timestamptz, p_marked_expires_at timestamptz, p_not_before timestamptz
) RETURNS bfa_private_text_spend.current_access LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE session_owner uuid; session_expires timestamptz; is_admitted boolean; allow_expires timestamptz;
 thread_owner uuid; thread_revision bigint; thread_deleted timestamptz; sampled timestamptz;
 identity_expires timestamptz; eligible_until timestamptz;
BEGIN
 -- Deliberately no schema fallback. Missing host table/column fails closed.
 SELECT user_id,not_after INTO session_owner,session_expires FROM auth.sessions
   WHERE id=a.auth_session_id FOR SHARE;
 IF NOT FOUND OR session_owner IS DISTINCT FROM a.owner_id THEN RETURN NULL; END IF;
 SELECT admitted,expires_at INTO is_admitted,allow_expires FROM public.bfa_p3b_staging_accounts
   WHERE user_id=a.owner_id FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT owner_id,revision,deleted_at INTO thread_owner,thread_revision,thread_deleted
   FROM public.bfa_p3b_threads WHERE id=a.thread_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 sampled:=clock_timestamp();
 IF a.revoked OR a.state NOT IN ('held','settled') OR a.held_at IS NULL
   OR p_auth_verified_at IS NULL OR p_auth_expires_at IS NULL OR p_eligibility_expires_at IS NULL
   OR NOT isfinite(p_auth_verified_at) OR NOT isfinite(p_auth_expires_at) OR NOT isfinite(p_eligibility_expires_at)
   OR NOT isfinite(sampled) OR (session_expires IS NOT NULL AND NOT isfinite(session_expires))
   OR allow_expires IS NULL OR NOT isfinite(allow_expires) OR is_admitted IS DISTINCT FROM true
   OR thread_owner IS DISTINCT FROM a.owner_id OR thread_revision IS DISTINCT FROM p_revision OR thread_deleted IS NOT NULL
   OR sampled < greatest(a.held_at,p_not_before) OR sampled < p_auth_verified_at
   OR p_auth_verified_at < a.auth_verified_at OR sampled-p_auth_verified_at >= interval '30 seconds'
   THEN RETURN NULL; END IF;
 identity_expires:=least(a.auth_expires_at,p_auth_expires_at,session_expires);
 eligible_until:=least(a.expires_at,identity_expires,allow_expires,p_eligibility_expires_at,p_marked_expires_at);
 IF sampled>=eligible_until THEN RETURN NULL; END IF;
 RETURN (sampled,p_auth_verified_at,identity_expires,allow_expires,eligible_until,thread_revision)::bfa_private_text_spend.current_access;
END $$;
CREATE FUNCTION bfa_private_text_spend.settled_matches(a bfa_private_text_spend.approvals,d bfa_private_text_spend.dispatches)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT a.state='settled' AND d.evidence_sha256 IS NOT NULL
   AND a.response_sha256=d.response_sha256 AND a.evidence_sha256=d.evidence_sha256
   AND a.charged_micros=d.charged_micros AND a.settled_at=d.settled_at;
$$;
CREATE FUNCTION bfa_private_text_spend.ack(a bfa_private_text_spend.approvals,d bfa_private_text_spend.dispatches,r bfa_private_text_spend.current_access)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(
   'protocol',1,'binding',jsonb_build_object('approvalId',a.approval_id,'ownerId',a.owner_id,
     'authSessionId',a.auth_session_id,'threadId',a.thread_id,'threadRevision',a.thread_revision,
     'requestId',a.request_id,'manifestSha256',a.manifest_sha256,'payloadSha256',a.payload_sha256,
     'provider',a.provider,'model',a.model,'tier',a.tier,'maxMicros',a.max_micros,
     'approvalExpiresAt',floor(extract(epoch FROM a.expires_at)*1000)::bigint),
   'dispatchId',d.dispatch_id,'state',CASE WHEN d.finished_revision IS NOT NULL THEN 'finished'
     WHEN d.evidence_sha256 IS NOT NULL THEN 'settled' WHEN d.dispatch_id IS NOT NULL THEN 'dispatched' ELSE 'held' END,
   'currentRevision',r.current_revision,'checkedAt',floor(extract(epoch FROM r.checked_at)*1000)::bigint,
   'verifiedAt',floor(extract(epoch FROM r.verified_at)*1000)::bigint,
   'verificationExpiresAt',floor(extract(epoch FROM r.verified_at+interval '30 seconds')*1000)::bigint,
   'identityExpiresAt',floor(extract(epoch FROM r.identity_expires_at)*1000)::bigint,
   'allowlistExpiresAt',floor(extract(epoch FROM r.allowlist_expires_at)*1000)::bigint,
   'effectiveExpiresAt',floor(extract(epoch FROM r.effective_expires_at)*1000)::bigint,
   'dispatchMarkedAt',floor(extract(epoch FROM d.dispatched_at)*1000)::bigint,
   'settlementEvidenceSha256',d.evidence_sha256,'finishedRevision',d.finished_revision);
$$;

CREATE FUNCTION public.bfa_private_text_spend_read(p_approval uuid, p_owner uuid, p_session uuid, p_thread uuid, p_revision bigint, p_request uuid,
  p_manifest text, p_payload text, p_provider text, p_model text, p_tier text, p_max_micros bigint,
  p_approval_expires_at timestamptz,
 p_dispatch_id uuid, p_auth_verified_at timestamptz, p_auth_expires_at timestamptz, p_eligibility_expires_at timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a bfa_private_text_spend.approvals; d bfa_private_text_spend.dispatches;
 r bfa_private_text_spend.current_access; expected bigint;
BEGIN
 a:=bfa_private_text_spend.lock_approval(p_approval,p_owner,p_session,p_thread,p_revision,p_request,p_manifest,p_payload,p_provider,p_model,p_tier,p_max_micros,p_approval_expires_at);
 IF a.approval_id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO d FROM bfa_private_text_spend.dispatches WHERE approval_id=p_approval FOR UPDATE;
 IF p_dispatch_id IS NULL THEN
   IF d.dispatch_id IS NOT NULL OR a.state<>'held' THEN RETURN NULL; END IF;
 ELSIF d.dispatch_id IS DISTINCT FROM p_dispatch_id THEN RETURN NULL;
 END IF;
 IF d.evidence_sha256 IS NOT NULL AND NOT bfa_private_text_spend.settled_matches(a,d) THEN RETURN NULL; END IF;
 expected:=coalesce(d.finished_revision,a.thread_revision);
 r:=bfa_private_text_spend.lock_current(a,expected,p_auth_verified_at,p_auth_expires_at,p_eligibility_expires_at,
   d.effective_expires_at,greatest(d.dispatched_at,d.settled_at,d.finished_at));
 IF r.checked_at IS NULL THEN RETURN NULL; END IF;
 RETURN bfa_private_text_spend.ack(a,d,r);
END $$;
CREATE FUNCTION public.bfa_private_text_spend_dispatch(p_approval uuid, p_owner uuid, p_session uuid, p_thread uuid, p_revision bigint, p_request uuid,
  p_manifest text, p_payload text, p_provider text, p_model text, p_tier text, p_max_micros bigint,
  p_approval_expires_at timestamptz,
 p_dispatch_id uuid, p_auth_verified_at timestamptz, p_auth_expires_at timestamptz, p_eligibility_expires_at timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a bfa_private_text_spend.approvals; d bfa_private_text_spend.dispatches; r bfa_private_text_spend.current_access;
BEGIN
 a:=bfa_private_text_spend.lock_approval(p_approval,p_owner,p_session,p_thread,p_revision,p_request,p_manifest,p_payload,p_provider,p_model,p_tier,p_max_micros,p_approval_expires_at);
 IF a.approval_id IS NULL OR a.state<>'held' OR p_dispatch_id IS NULL THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM bfa_private_text_spend.dispatches WHERE approval_id=p_approval) THEN RETURN NULL; END IF;
 r:=bfa_private_text_spend.lock_current(a,a.thread_revision,p_auth_verified_at,p_auth_expires_at,p_eligibility_expires_at,NULL,NULL);
 IF r.checked_at IS NULL THEN RETURN NULL; END IF;
 BEGIN
   INSERT INTO bfa_private_text_spend.dispatches(approval_id,dispatch_id,dispatched_at,effective_expires_at)
     VALUES(p_approval,p_dispatch_id,r.checked_at,r.effective_expires_at) RETURNING * INTO d;
 EXCEPTION WHEN unique_violation THEN RETURN NULL;
 END;
 RETURN bfa_private_text_spend.ack(a,d,r);
END $$;
CREATE FUNCTION public.bfa_private_text_spend_settle_dispatched(p_approval uuid, p_owner uuid, p_session uuid, p_thread uuid, p_revision bigint, p_request uuid,
  p_manifest text, p_payload text, p_provider text, p_model text, p_tier text, p_max_micros bigint,
  p_approval_expires_at timestamptz,
 p_dispatch_id uuid,p_response_id text,p_evidence_sha256 text,p_charged_micros bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a bfa_private_text_spend.approvals; d bfa_private_text_spend.dispatches;
BEGIN
 a:=bfa_private_text_spend.lock_approval(p_approval,p_owner,p_session,p_thread,p_revision,p_request,p_manifest,p_payload,p_provider,p_model,p_tier,p_max_micros,p_approval_expires_at);
 IF a.approval_id IS NULL OR p_dispatch_id IS NULL THEN RETURN false; END IF;
 SELECT * INTO d FROM bfa_private_text_spend.dispatches WHERE approval_id=p_approval FOR UPDATE;
 IF NOT FOUND OR d.dispatch_id IS DISTINCT FROM p_dispatch_id THEN RETURN false; END IF;
 -- Existing settlement privileges remain intact for old holds. Only this
 -- wrapper can establish the independent dispatch-aware association for finish.
 BEGIN
   IF NOT public.bfa_private_text_spend_settle(p_approval,p_owner,p_session,p_thread,p_revision,p_request,p_manifest,p_payload,p_provider,p_model,p_tier,p_max_micros,p_approval_expires_at,p_response_id,p_evidence_sha256,p_charged_micros)
     THEN RETURN false; END IF;
   SELECT * INTO a FROM bfa_private_text_spend.approvals WHERE approval_id=p_approval;
   IF d.evidence_sha256 IS NOT NULL THEN RETURN bfa_private_text_spend.settled_matches(a,d); END IF;
   IF a.settled_at<d.dispatched_at THEN RAISE EXCEPTION 'Invalid settlement time' USING ERRCODE='23514'; END IF;
   UPDATE bfa_private_text_spend.dispatches SET response_sha256=a.response_sha256,evidence_sha256=a.evidence_sha256,
     charged_micros=a.charged_micros,settled_at=a.settled_at WHERE approval_id=p_approval;
 EXCEPTION WHEN check_violation THEN RETURN false;
 END;
 RETURN true;
END $$;
CREATE FUNCTION public.bfa_private_text_spend_finish(p_approval uuid, p_owner uuid, p_session uuid, p_thread uuid, p_revision bigint, p_request uuid,
  p_manifest text, p_payload text, p_provider text, p_model text, p_tier text, p_max_micros bigint,
  p_approval_expires_at timestamptz,
 p_dispatch_id uuid, p_auth_verified_at timestamptz, p_auth_expires_at timestamptz, p_eligibility_expires_at timestamptz,p_evidence_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a bfa_private_text_spend.approvals; d bfa_private_text_spend.dispatches; r bfa_private_text_spend.current_access;
BEGIN
 a:=bfa_private_text_spend.lock_approval(p_approval,p_owner,p_session,p_thread,p_revision,p_request,p_manifest,p_payload,p_provider,p_model,p_tier,p_max_micros,p_approval_expires_at);
 IF a.approval_id IS NULL OR p_dispatch_id IS NULL OR a.thread_revision>=9007199254740991 THEN RETURN NULL; END IF;
 SELECT * INTO d FROM bfa_private_text_spend.dispatches WHERE approval_id=p_approval FOR UPDATE;
 IF NOT FOUND OR d.dispatch_id IS DISTINCT FROM p_dispatch_id OR d.finished_at IS NOT NULL
   OR p_evidence_sha256 IS NULL OR d.evidence_sha256 IS DISTINCT FROM p_evidence_sha256
   OR NOT bfa_private_text_spend.settled_matches(a,d) THEN RETURN NULL; END IF;
 r:=bfa_private_text_spend.lock_current(a,a.thread_revision,p_auth_verified_at,p_auth_expires_at,p_eligibility_expires_at,
   d.effective_expires_at,greatest(d.dispatched_at,d.settled_at));
 IF r.checked_at IS NULL THEN RETURN NULL; END IF;
 UPDATE public.bfa_p3b_threads SET revision=revision+1 WHERE id=a.thread_id;
 UPDATE bfa_private_text_spend.dispatches SET finished_at=r.checked_at,finished_revision=a.thread_revision+1
   WHERE approval_id=p_approval RETURNING * INTO d;
 r.current_revision:=d.finished_revision;
 RETURN bfa_private_text_spend.ack(a,d,r);
END $$;

REVOKE ALL ON FUNCTION public.bfa_private_text_spend_read(uuid,uuid,uuid,uuid,bigint,uuid,text,text,text,text,text,bigint,timestamptz,uuid,timestamptz,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bfa_private_text_spend_read(uuid,uuid,uuid,uuid,bigint,uuid,text,text,text,text,text,bigint,timestamptz,uuid,timestamptz,timestamptz,timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.bfa_private_text_spend_dispatch(uuid,uuid,uuid,uuid,bigint,uuid,text,text,text,text,text,bigint,timestamptz,uuid,timestamptz,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bfa_private_text_spend_dispatch(uuid,uuid,uuid,uuid,bigint,uuid,text,text,text,text,text,bigint,timestamptz,uuid,timestamptz,timestamptz,timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.bfa_private_text_spend_settle_dispatched(uuid,uuid,uuid,uuid,bigint,uuid,text,text,text,text,text,bigint,timestamptz,uuid,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bfa_private_text_spend_settle_dispatched(uuid,uuid,uuid,uuid,bigint,uuid,text,text,text,text,text,bigint,timestamptz,uuid,text,text,bigint) TO service_role;

REVOKE ALL ON FUNCTION public.bfa_private_text_spend_finish(uuid,uuid,uuid,uuid,bigint,uuid,text,text,text,text,text,bigint,timestamptz,uuid,timestamptz,timestamptz,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bfa_private_text_spend_finish(uuid,uuid,uuid,uuid,bigint,uuid,text,text,text,text,text,bigint,timestamptz,uuid,timestamptz,timestamptz,timestamptz,text) TO service_role;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA bfa_private_text_spend FROM PUBLIC,anon,authenticated,service_role;
-- No prior approval, hold, settlement, saved snapshot or privilege is rewritten.
-- A finish advances content-free revision only. Delivery still needs the owned
-- caller's last local/Auth/current checks; SQL does not atomically send HTTP or
-- prove receipt authenticity, complete host session policy or actual UI receipt.
COMMIT;
