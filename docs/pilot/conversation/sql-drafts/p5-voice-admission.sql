-- PROPOSED SQL; never applied to the connected project or migration journal.
-- Sequentially executed in isolated PostgreSQL WASM; native concurrency unrun.
-- Requires existing P3b tables. Never run against the connected project as part
-- of an offline batch. No Auth bridge, admission rows, budgets or grants seeded.
-- Admission never authorizes provider dispatch; close never refunds a hold.
BEGIN;
CREATE SCHEMA bfa_p5_voice;
REVOKE ALL ON SCHEMA bfa_p5_voice FROM PUBLIC, anon, authenticated, service_role;

CREATE TYPE bfa_p5_voice.claim_key AS (
  owner_id uuid, thread_id uuid, incarnation uuid, revision bigint,
  attempt_id uuid, approval_id uuid, approval_digest text, expires_ms bigint
);

CREATE TABLE bfa_p5_voice.generations (
  incarnation uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL, thread_id uuid NOT NULL UNIQUE REFERENCES public.bfa_p3b_threads(id) ON DELETE RESTRICT,
  source_created_at timestamptz NOT NULL,
  retired boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX generation_never_rebind ON bfa_p5_voice.generations(owner_id,thread_id);
-- This draft prohibits physical ID reuse. The FK and retained generation are
-- the fence; created_at is an additional consistency check, never incarnation.
CREATE TABLE bfa_p5_voice.owner_clocks (
  owner_id uuid PRIMARY KEY,
  observed_ms bigint NOT NULL CHECK(observed_ms BETWEEN 0 AND 9007199254740991)
);
CREATE TABLE bfa_p5_voice.session_fences (
  owner_id uuid NOT NULL, session_id uuid NOT NULL,
  version bigint NOT NULL CHECK(version BETWEEN 0 AND 9007199254740991),
  expires_ms bigint NOT NULL CHECK(expires_ms BETWEEN 1 AND 9007199254740991),
  revoked boolean NOT NULL DEFAULT true,
  PRIMARY KEY(owner_id,session_id)
);
-- Only the future trusted Auth/revocation bridge may maintain session_fences.
-- No writer RPC is supplied: a parsed/unsigned client token cannot provision it.
CREATE TABLE bfa_p5_voice.issuances (
  fingerprint text PRIMARY KEY CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
  owner_id uuid NOT NULL, thread_id uuid NOT NULL, incarnation uuid NOT NULL,
  revision bigint NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740991),
  issued_ms bigint NOT NULL CHECK(issued_ms BETWEEN 0 AND 9007199254740991),
  expires_ms bigint NOT NULL CHECK(expires_ms BETWEEN 1 AND 9007199254740991),
  revoked boolean NOT NULL DEFAULT false,
  CHECK(expires_ms>issued_ms AND expires_ms-issued_ms<=900000)
);
CREATE TABLE bfa_p5_voice.quotas (
  owner_id uuid NOT NULL, policy_id uuid NOT NULL,
  remaining_units bigint NOT NULL DEFAULT 0 CHECK(remaining_units BETWEEN 0 AND 9007199254740991),
  reservation_units bigint NOT NULL CHECK(reservation_units BETWEEN 1 AND 9007199254740991),
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY(owner_id,policy_id)
);
CREATE TABLE bfa_p5_voice.approvals (
  approval_id uuid PRIMARY KEY,
  digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
  owner_id uuid NOT NULL, thread_id uuid NOT NULL, incarnation uuid NOT NULL,
  revision bigint NOT NULL CHECK(revision BETWEEN 0 AND 9007199254740991),
  attempt_id uuid NOT NULL,
  scope text NOT NULL CHECK(scope='developer-voice-session'),
  expires_ms bigint NOT NULL CHECK(expires_ms BETWEEN 1 AND 9007199254740991),
  revoked boolean NOT NULL DEFAULT true,
  quota_policy_id uuid NOT NULL,
  UNIQUE(owner_id,attempt_id)
);
-- No provisioning RPC grants approval or chooses a quota/provider/budget.
CREATE TABLE bfa_p5_voice.cleanup_owners (
  cleanup_id uuid PRIMARY KEY, claim_id uuid NOT NULL UNIQUE,
  owner_id uuid NOT NULL, claim jsonb NOT NULL,
  closed_ms bigint CHECK(closed_ms BETWEEN 0 AND 9007199254740991),
  effective_expires_ms bigint NOT NULL CHECK(effective_expires_ms BETWEEN 1 AND 9007199254740991),
  expired_ms bigint CHECK(expired_ms BETWEEN 0 AND 9007199254740991),
  invalidated_ms bigint CHECK(invalidated_ms BETWEEN 0 AND 9007199254740991),
  session_id uuid, session_version bigint, authority_fingerprint text,
  CHECK((session_id IS NULL AND session_version IS NULL AND authority_fingerprint IS NULL)
    OR (session_id IS NOT NULL AND session_version IS NOT NULL AND authority_fingerprint IS NOT NULL
      AND session_version BETWEEN 0 AND 9007199254740991 AND authority_fingerprint ~ '^[0-9a-f]{64}$'))
);
CREATE TABLE bfa_p5_voice.proofs (
  receipt_id uuid PRIMARY KEY,
  operation text NOT NULL CHECK(operation IN ('claim','inspect')),
  cleanup_id uuid NOT NULL, claim_id uuid NOT NULL,
  owner_id uuid NOT NULL, claim jsonb NOT NULL,
  session_id uuid NOT NULL, session_version bigint NOT NULL CHECK(session_version BETWEEN 0 AND 9007199254740991),
  authority_fingerprint text NOT NULL CHECK(authority_fingerprint ~ '^[0-9a-f]{64}$'),
  identity_expires_ms bigint NOT NULL CHECK(identity_expires_ms BETWEEN 1 AND 9007199254740991),
  verified_ms bigint NOT NULL CHECK(verified_ms BETWEEN 0 AND 9007199254740991),
  expires_ms bigint NOT NULL CHECK(expires_ms BETWEEN 1 AND 9007199254740991),
  effective_expires_ms bigint NOT NULL CHECK(effective_expires_ms BETWEEN 1 AND 9007199254740991),
  consumed_ms bigint CHECK(consumed_ms BETWEEN 0 AND 9007199254740991),
  CHECK(expires_ms>verified_ms AND expires_ms-verified_ms<=30000),
  CHECK(expires_ms<=effective_expires_ms AND effective_expires_ms<=identity_expires_ms)
);
CREATE TABLE bfa_p5_voice.attempts (
  owner_id uuid NOT NULL, attempt_id uuid NOT NULL,
  winner_claim_id uuid, retired boolean NOT NULL,
  PRIMARY KEY(owner_id,attempt_id),
  CHECK((retired AND winner_claim_id IS NULL) OR (NOT retired AND winner_claim_id IS NOT NULL))
);
CREATE TABLE bfa_p5_voice.claims (
  claim_id uuid PRIMARY KEY, owner_id uuid NOT NULL, claim jsonb NOT NULL,
  effective_expires_ms bigint NOT NULL CHECK(effective_expires_ms BETWEEN 1 AND 9007199254740991),
  state text NOT NULL CHECK(state IN ('claimed','closed','expired','invalidated')),
  quota_policy_id uuid NOT NULL,
  held_units bigint NOT NULL CHECK(held_units BETWEEN 1 AND 9007199254740991)
);
-- Held units are content-free reservation evidence, not money/invoices.
-- No expiry/delete cascade, refund, dispatch, settlement or GC function exists.

CREATE FUNCTION bfa_p5_voice.ms() RETURNS bigint LANGUAGE sql VOLATILE
SET search_path=pg_catalog,pg_temp AS $$
  SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint
$$;
CREATE FUNCTION bfa_p5_voice.n(p_value jsonb) RETURNS bigint LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,pg_temp AS $$
DECLARE n numeric;
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Unavailable'; END IF;
  n:=(p_value#>>'{}')::numeric;
  IF n<0 OR n>9007199254740991 OR n<>trunc(n) THEN RAISE EXCEPTION 'Unavailable'; END IF;
  RETURN n::bigint;
END $$;
CREATE FUNCTION bfa_p5_voice.id(p_value jsonb) RETURNS uuid LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,pg_temp AS $$
DECLARE s text; id uuid;
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Unavailable'; END IF;
  s:=p_value#>>'{}'; id:=s::uuid;
  IF s<>id::text THEN RAISE EXCEPTION 'Unavailable'; END IF;
  RETURN id;
END $$;
CREATE FUNCTION bfa_p5_voice.exact_keys(p_value jsonb,p_keys text[]) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE actual text[]; wanted text[];
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  SELECT array_agg(k ORDER BY k) INTO actual FROM jsonb_object_keys(p_value) AS k;
  SELECT array_agg(k ORDER BY k) INTO wanted FROM unnest(p_keys) AS k;
  RETURN actual IS NOT DISTINCT FROM wanted;
END $$;
CREATE FUNCTION bfa_p5_voice.parse_claim(p_claim jsonb) RETURNS bfa_p5_voice.claim_key
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE c bfa_p5_voice.claim_key; b jsonb;
BEGIN
  IF octet_length(p_claim::text)>4096 OR NOT bfa_p5_voice.exact_keys(p_claim,ARRAY['claimId','binding','expiresAt']) THEN RAISE EXCEPTION 'Unavailable'; END IF;
  PERFORM bfa_p5_voice.id(p_claim->'claimId'); b:=p_claim->'binding';
  IF NOT bfa_p5_voice.exact_keys(b,ARRAY['ownerId','threadId','threadIncarnation','threadRevision','attemptId','approvalId','approvalDigest','scope'])
    OR b->>'scope' IS DISTINCT FROM 'developer-voice-session'
    OR jsonb_typeof(b->'approvalDigest') IS DISTINCT FROM 'string'
    OR (b->>'approvalDigest') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Unavailable'; END IF;
  c.owner_id:=bfa_p5_voice.id(b->'ownerId'); c.thread_id:=bfa_p5_voice.id(b->'threadId');
  c.incarnation:=bfa_p5_voice.id(b->'threadIncarnation'); c.revision:=bfa_p5_voice.n(b->'threadRevision');
  c.attempt_id:=bfa_p5_voice.id(b->'attemptId'); c.approval_id:=bfa_p5_voice.id(b->'approvalId');
  c.approval_digest:=b->>'approvalDigest'; c.expires_ms:=bfa_p5_voice.n(p_claim->'expiresAt');
  IF c.expires_ms=0 THEN RAISE EXCEPTION 'Unavailable'; END IF;
  RETURN c;
END $$;
CREATE FUNCTION bfa_p5_voice.lock_owner(p_owner uuid) RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF p_owner IS NULL THEN RAISE EXCEPTION 'Unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
END $$;
CREATE FUNCTION bfa_p5_voice.observe_now(p_owner uuid) RETURNS bigint LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp AS $$
DECLARE prior bigint; n bigint;
BEGIN
 PERFORM bfa_p5_voice.lock_owner(p_owner);
 SELECT observed_ms INTO prior FROM bfa_p5_voice.owner_clocks WHERE owner_id=p_owner FOR UPDATE;
 n:=bfa_p5_voice.ms();
 IF n<0 OR n>9007199254740991 THEN RETURN NULL; END IF;
 IF FOUND AND n<prior THEN RETURN NULL; END IF;
 INSERT INTO bfa_p5_voice.owner_clocks VALUES(p_owner,n)
 ON CONFLICT(owner_id) DO UPDATE SET observed_ms=greatest(bfa_p5_voice.owner_clocks.observed_ms,excluded.observed_ms);
 RETURN n;
END $$;
CREATE FUNCTION bfa_p5_voice.fence_expiry(p_claim_id uuid,p_owner uuid,p_now bigint) RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 UPDATE bfa_p5_voice.cleanup_owners SET expired_ms=coalesce(expired_ms,p_now)
 WHERE claim_id=p_claim_id AND owner_id=p_owner AND p_now>=effective_expires_ms;
 UPDATE bfa_p5_voice.claims SET state='expired'
 WHERE claim_id=p_claim_id AND owner_id=p_owner AND state='claimed' AND EXISTS
  (SELECT 1 FROM bfa_p5_voice.cleanup_owners k WHERE k.claim_id=p_claim_id AND k.expired_ms IS NOT NULL);
END $$;
CREATE FUNCTION bfa_p5_voice.ack(p_claim jsonb,p_state text) RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,pg_temp AS $$ SELECT jsonb_build_object('claim',p_claim,'state',p_state) $$;

-- Locks current P3b state, never a detached shadow revision. The current P3b
-- Stop/Delete transaction uses this same owner lock and changes this thread row.
-- Exact per-owner session/approval writers must use the same owner-first order.
CREATE FUNCTION bfa_p5_voice.eligible(p bfa_p5_voice.proofs) RETURNS boolean LANGUAGE plpgsql
SET search_path=pg_catalog,pg_temp AS $$
DECLARE c bfa_p5_voice.claim_key; a public.bfa_p3b_staging_accounts;
 t public.bfa_p3b_threads; g bfa_p5_voice.generations; s bfa_p5_voice.session_fences;
 i bfa_p5_voice.issuances; v bfa_p5_voice.approvals; n bigint; allow_ms bigint; ceiling bigint; invalid boolean;
BEGIN
 c:=bfa_p5_voice.parse_claim(p.claim); PERFORM bfa_p5_voice.lock_owner(c.owner_id);
 SELECT * INTO a FROM public.bfa_p3b_staging_accounts WHERE user_id=c.owner_id FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO t FROM public.bfa_p3b_threads WHERE id=c.thread_id AND owner_id=c.owner_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO g FROM bfa_p5_voice.generations WHERE incarnation=c.incarnation AND owner_id=c.owner_id AND thread_id=c.thread_id FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF t.deleted_at IS NOT NULL THEN
  UPDATE bfa_p5_voice.generations SET retired=true WHERE incarnation=c.incarnation;
  UPDATE bfa_p5_voice.cleanup_owners SET invalidated_ms=coalesce(invalidated_ms,bfa_p5_voice.ms()) WHERE claim_id=p.claim_id AND owner_id=c.owner_id;
  UPDATE bfa_p5_voice.claims SET state='invalidated' WHERE claim_id=p.claim_id AND owner_id=c.owner_id AND state='claimed';
  RETURN false;
 END IF;
 SELECT * INTO s FROM bfa_p5_voice.session_fences WHERE owner_id=c.owner_id AND session_id=p.session_id FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO i FROM bfa_p5_voice.issuances WHERE fingerprint=p.authority_fingerprint FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO v FROM bfa_p5_voice.approvals WHERE approval_id=c.approval_id FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 n:=bfa_p5_voice.observe_now(c.owner_id);
 IF NOT isfinite(a.expires_at) OR extract(epoch FROM a.expires_at)*1000 NOT BETWEEN 1 AND 9007199254740991 THEN RETURN false; END IF;
 allow_ms:=floor(extract(epoch FROM a.expires_at)*1000)::bigint;
 ceiling:=least(p.effective_expires_ms,s.expires_ms,i.expires_ms,v.expires_ms,allow_ms);
 -- Trust current protected rows, including a shortening noticed only after a
 -- lock wait. Persist it before semantic denial so a later longer proof cannot
 -- revive this exact cleanup/claim in another server process.
 UPDATE bfa_p5_voice.cleanup_owners SET effective_expires_ms=least(effective_expires_ms,ceiling)
 WHERE claim_id=p.claim_id AND owner_id=c.owner_id;
 UPDATE bfa_p5_voice.claims SET effective_expires_ms=least(effective_expires_ms,ceiling)
 WHERE claim_id=p.claim_id AND owner_id=c.owner_id;
 invalid:=NOT a.admitted OR t.revision<>c.revision OR g.retired OR g.source_created_at<>t.created_at
  OR s.revoked OR s.version<>p.session_version
  OR i.revoked OR i.owner_id<>c.owner_id OR i.thread_id<>c.thread_id OR i.incarnation<>c.incarnation OR i.revision<>c.revision
  OR v.revoked OR v.owner_id<>c.owner_id OR v.thread_id<>c.thread_id OR v.incarnation<>c.incarnation
  OR v.revision<>c.revision OR v.attempt_id<>c.attempt_id OR v.digest<>c.approval_digest OR v.scope<>'developer-voice-session';
 IF invalid THEN
  UPDATE bfa_p5_voice.cleanup_owners SET invalidated_ms=coalesce(invalidated_ms,coalesce(n,bfa_p5_voice.ms())) WHERE claim_id=p.claim_id AND owner_id=c.owner_id;
  UPDATE bfa_p5_voice.claims SET state='invalidated' WHERE claim_id=p.claim_id AND owner_id=c.owner_id AND state='claimed';
 END IF;
 IF n IS NULL THEN RETURN false; END IF;
 PERFORM bfa_p5_voice.fence_expiry(p.claim_id,c.owner_id,n);
 RETURN NOT invalid AND a.admitted AND a.expires_at>clock_timestamp()
   AND t.deleted_at IS NULL AND t.revision=c.revision
   AND NOT g.retired AND g.source_created_at=t.created_at
   AND NOT s.revoked AND s.version=p.session_version AND s.expires_ms>=p.effective_expires_ms
   AND NOT i.revoked AND i.owner_id=c.owner_id AND i.thread_id=c.thread_id
   AND i.incarnation=c.incarnation AND i.revision=c.revision AND i.expires_ms>=p.effective_expires_ms
   AND NOT v.revoked AND v.owner_id=c.owner_id AND v.thread_id=c.thread_id
   AND v.incarnation=c.incarnation AND v.revision=c.revision AND v.attempt_id=c.attempt_id
   AND v.digest=c.approval_digest AND v.scope='developer-voice-session' AND v.expires_ms>=p.effective_expires_ms
   AND floor(extract(epoch FROM a.expires_at)*1000)>=p.effective_expires_ms
   AND p.owner_id=c.owner_id AND p.effective_expires_ms<=c.expires_ms
   AND p.effective_expires_ms<=p.identity_expires_ms
   AND p.verified_ms<=n AND n<p.expires_ms AND n<p.effective_expires_ms
   AND p.expires_ms<=p.effective_expires_ms AND p.expires_ms-p.verified_ms BETWEEN 1 AND 30000;
END $$;

-- Trusted creation/issuance path ONLY. No verification/read path calls this.
CREATE FUNCTION public.bfa_p5_voice_register_generation(p_owner uuid,p_thread uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t public.bfa_p3b_threads; g bfa_p5_voice.generations; v uuid;
BEGIN
 PERFORM bfa_p5_voice.lock_owner(p_owner);
 PERFORM public.bfa_p3b_assert_staging(p_owner);
 SELECT * INTO t FROM public.bfa_p3b_threads WHERE id=p_thread AND owner_id=p_owner AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable'; END IF;
 PERFORM public.bfa_p3b_assert_staging(p_owner);
 SELECT * INTO g FROM bfa_p5_voice.generations WHERE owner_id=p_owner AND thread_id=p_thread FOR UPDATE;
 IF FOUND THEN
   IF NOT g.retired AND g.source_created_at=t.created_at THEN RETURN g.incarnation; END IF;
   RAISE EXCEPTION 'Unavailable'; -- No rebind/restore of any registered identity.
 END IF;
 INSERT INTO bfa_p5_voice.generations(owner_id,thread_id,source_created_at) VALUES(p_owner,p_thread,t.created_at) RETURNING incarnation INTO v;
 RETURN v;
END $$;
CREATE FUNCTION public.bfa_p5_voice_register_issuance(p_owner uuid,p_thread uuid,p_incarnation uuid,p_revision bigint,p_fingerprint text,p_issued_ms bigint,p_expires_ms bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t public.bfa_p3b_threads; g bfa_p5_voice.generations; i bfa_p5_voice.issuances; n bigint; had_issuance boolean;
BEGIN
 IF p_owner IS NULL OR p_thread IS NULL OR p_incarnation IS NULL OR p_revision IS NULL OR p_revision NOT BETWEEN 0 AND 9007199254740991
  OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$'
  OR p_issued_ms IS NULL OR p_expires_ms IS NULL OR p_issued_ms NOT BETWEEN 0 AND 9007199254740991 OR p_expires_ms NOT BETWEEN 1 AND 9007199254740991
  OR p_expires_ms-p_issued_ms NOT BETWEEN 1 AND 900000 THEN RAISE EXCEPTION 'Unavailable'; END IF;
 PERFORM bfa_p5_voice.lock_owner(p_owner); PERFORM public.bfa_p3b_assert_staging(p_owner);
 SELECT * INTO t FROM public.bfa_p3b_threads WHERE id=p_thread AND owner_id=p_owner FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO g FROM bfa_p5_voice.generations WHERE incarnation=p_incarnation AND owner_id=p_owner AND thread_id=p_thread FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO i FROM bfa_p5_voice.issuances WHERE fingerprint=p_fingerprint FOR UPDATE;
 had_issuance:=FOUND;
 n:=bfa_p5_voice.observe_now(p_owner); PERFORM public.bfa_p3b_assert_staging(p_owner);
 IF n IS NULL THEN RETURN false; END IF;
 IF t.deleted_at IS NOT NULL THEN UPDATE bfa_p5_voice.generations SET retired=true WHERE incarnation=p_incarnation; END IF;
 IF t.deleted_at IS NOT NULL OR t.revision<>p_revision OR g.retired OR g.source_created_at<>t.created_at
  OR p_issued_ms>n OR n-p_issued_ms>30000 OR p_expires_ms<=n THEN RETURN false; END IF;
 IF had_issuance THEN
   RETURN NOT i.revoked AND i.owner_id=p_owner AND i.thread_id=p_thread AND i.incarnation=p_incarnation
    AND i.revision=p_revision AND i.issued_ms=p_issued_ms AND i.expires_ms=p_expires_ms;
 END IF;
 INSERT INTO bfa_p5_voice.issuances VALUES(p_fingerprint,p_owner,p_thread,p_incarnation,p_revision,p_issued_ms,p_expires_ms,false);
 RETURN true;
END $$;

CREATE FUNCTION public.bfa_p5_voice_register_cleanup(p_cleanup_id uuid,p_claim jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c bfa_p5_voice.claim_key; k bfa_p5_voice.cleanup_owners; id uuid;
BEGIN
 c:=bfa_p5_voice.parse_claim(p_claim); id:=bfa_p5_voice.id(p_claim->'claimId');
 IF p_cleanup_id IS NULL THEN RAISE EXCEPTION 'Unavailable'; END IF;
 PERFORM bfa_p5_voice.lock_owner(c.owner_id);
 SELECT * INTO k FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id=p_cleanup_id OR claim_id=id FOR UPDATE;
 IF FOUND THEN
  IF k.cleanup_id<>p_cleanup_id OR k.claim_id<>id OR k.claim<>p_claim OR k.owner_id<>c.owner_id THEN RAISE EXCEPTION 'Unavailable'; END IF;
 ELSE
  INSERT INTO bfa_p5_voice.cleanup_owners(cleanup_id,claim_id,owner_id,claim,effective_expires_ms) VALUES(p_cleanup_id,id,c.owner_id,p_claim,c.expires_ms);
 END IF;
 -- A prior close is never undone by late registration. Registration is no grant.
 RETURN jsonb_build_object('cleanupId',p_cleanup_id,'claim',p_claim);
END $$;

CREATE FUNCTION public.bfa_p5_voice_register_proof(p_proof jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p bfa_p5_voice.proofs; c bfa_p5_voice.claim_key; k bfa_p5_voice.cleanup_owners; n bigint;
BEGIN
 IF NOT bfa_p5_voice.exact_keys(p_proof,ARRAY['receiptId','operation','claim','cleanupId','ownerSessionId','sessionVersion','authorityFingerprint','identityExpiresAt','verifiedAt','expiresAt','effectiveExpiresAt']) THEN RAISE EXCEPTION 'Unavailable'; END IF;
 c:=bfa_p5_voice.parse_claim(p_proof->'claim');
 p.receipt_id:=bfa_p5_voice.id(p_proof->'receiptId'); p.operation:=p_proof->>'operation';
 p.cleanup_id:=bfa_p5_voice.id(p_proof->'cleanupId'); p.claim_id:=bfa_p5_voice.id(p_proof->'claim'->'claimId');
 p.owner_id:=c.owner_id; p.claim:=p_proof->'claim'; p.session_id:=bfa_p5_voice.id(p_proof->'ownerSessionId');
 p.session_version:=bfa_p5_voice.n(p_proof->'sessionVersion'); p.authority_fingerprint:=p_proof->>'authorityFingerprint';
 p.identity_expires_ms:=bfa_p5_voice.n(p_proof->'identityExpiresAt'); p.verified_ms:=bfa_p5_voice.n(p_proof->'verifiedAt');
 p.expires_ms:=bfa_p5_voice.n(p_proof->'expiresAt'); p.effective_expires_ms:=bfa_p5_voice.n(p_proof->'effectiveExpiresAt');
 IF jsonb_typeof(p_proof->'operation') IS DISTINCT FROM 'string' OR p.operation IS NULL OR p.operation NOT IN ('claim','inspect')
  OR jsonb_typeof(p_proof->'authorityFingerprint') IS DISTINCT FROM 'string' OR p.authority_fingerprint IS NULL OR p.authority_fingerprint !~ '^[0-9a-f]{64}$'
  OR p.effective_expires_ms=0 OR p.identity_expires_ms=0 OR p.expires_ms=0
  OR p.effective_expires_ms>c.expires_ms OR p.effective_expires_ms>p.identity_expires_ms
  OR p.expires_ms>p.effective_expires_ms OR p.expires_ms-p.verified_ms NOT BETWEEN 1 AND 30000 THEN RAISE EXCEPTION 'Unavailable'; END IF;
 PERFORM bfa_p5_voice.lock_owner(c.owner_id);
 SELECT * INTO k FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id=p.cleanup_id AND claim_id=p.claim_id FOR UPDATE;
 IF NOT FOUND OR k.claim<>p.claim OR k.owner_id<>c.owner_id THEN RAISE EXCEPTION 'Unavailable'; END IF;
 IF k.closed_ms IS NOT NULL OR k.expired_ms IS NOT NULL OR k.invalidated_ms IS NOT NULL THEN RETURN NULL; END IF;
 IF k.session_id IS NOT NULL AND (k.session_id<>p.session_id OR k.session_version<>p.session_version OR k.authority_fingerprint<>p.authority_fingerprint) THEN RETURN NULL; END IF;
 -- Persist a trusted shorter observation even when its receipt expires while
 -- waiting; returning NULL commits this fence instead of rolling it back.
 UPDATE bfa_p5_voice.cleanup_owners SET effective_expires_ms=least(effective_expires_ms,p.effective_expires_ms)
 WHERE cleanup_id=p.cleanup_id RETURNING * INTO k;
 UPDATE bfa_p5_voice.claims SET effective_expires_ms=least(effective_expires_ms,k.effective_expires_ms) WHERE claim_id=p.claim_id;
 n:=bfa_p5_voice.observe_now(c.owner_id);
 IF n IS NULL THEN RETURN NULL; END IF;
 PERFORM bfa_p5_voice.fence_expiry(p.claim_id,c.owner_id,n);
 IF n>=k.effective_expires_ms OR p.effective_expires_ms>k.effective_expires_ms OR NOT bfa_p5_voice.eligible(p) THEN RETURN NULL; END IF;
 UPDATE bfa_p5_voice.cleanup_owners SET session_id=p.session_id,session_version=p.session_version,authority_fingerprint=p.authority_fingerprint WHERE cleanup_id=p.cleanup_id;
 INSERT INTO bfa_p5_voice.proofs SELECT p.*;
 RETURN jsonb_build_object('receiptId',p.receipt_id,'operation',p.operation,'claim',p.claim,'expiresAt',p.expires_ms,'effectiveExpiresAt',p.effective_expires_ms);
END $$;

-- One function for claim/inspect ensures identical proof-consumption boundaries.
CREATE FUNCTION bfa_p5_voice.use_proof(p_receipt_id uuid,p_claim jsonb,p_operation text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE c bfa_p5_voice.claim_key; p bfa_p5_voice.proofs; k bfa_p5_voice.cleanup_owners;
 a bfa_p5_voice.attempts; v bfa_p5_voice.approvals; q bfa_p5_voice.quotas; existing bfa_p5_voice.claims;
 id uuid; n bigint; deadline bigint;
BEGIN
 c:=bfa_p5_voice.parse_claim(p_claim); id:=bfa_p5_voice.id(p_claim->'claimId');
 PERFORM bfa_p5_voice.lock_owner(c.owner_id);
 SELECT * INTO p FROM bfa_p5_voice.proofs WHERE receipt_id=p_receipt_id FOR UPDATE;
 IF NOT FOUND OR p.owner_id<>c.owner_id OR p.claim_id<>id OR p.claim<>p_claim OR p.operation<>p_operation OR p.consumed_ms IS NOT NULL THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 UPDATE bfa_p5_voice.proofs SET consumed_ms=bfa_p5_voice.ms() WHERE receipt_id=p.receipt_id;
 SELECT * INTO k FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id=p.cleanup_id AND claim_id=id FOR UPDATE;
 IF NOT FOUND OR k.claim<>p_claim THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 IF k.closed_ms IS NOT NULL THEN RETURN bfa_p5_voice.ack(p_claim,'closed'); END IF;
 n:=bfa_p5_voice.observe_now(c.owner_id);
 IF n IS NULL THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 PERFORM bfa_p5_voice.fence_expiry(id,c.owner_id,n);
 IF k.expired_ms IS NOT NULL OR k.invalidated_ms IS NOT NULL OR n>=k.effective_expires_ms OR p.effective_expires_ms>k.effective_expires_ms
  OR k.session_id IS DISTINCT FROM p.session_id OR k.session_version IS DISTINCT FROM p.session_version
  OR k.authority_fingerprint IS DISTINCT FROM p.authority_fingerprint THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 IF NOT bfa_p5_voice.eligible(p) THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 SELECT * INTO existing FROM bfa_p5_voice.claims WHERE claim_id=id FOR UPDATE;
 IF FOUND AND (existing.claim<>p_claim OR existing.owner_id<>c.owner_id) THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 SELECT * INTO a FROM bfa_p5_voice.attempts WHERE owner_id=c.owner_id AND attempt_id=c.attempt_id FOR UPDATE;
 IF FOUND AND (a.retired OR a.winner_claim_id<>id) THEN RETURN bfa_p5_voice.ack(p_claim,CASE WHEN a.retired THEN 'denied' ELSE 'replayed' END); END IF;
 IF existing.claim_id IS NOT NULL THEN
  IF existing.state='closed' THEN RETURN bfa_p5_voice.ack(p_claim,'closed'); END IF;
  IF existing.state IN ('expired','invalidated') THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
  deadline:=least(existing.effective_expires_ms,p.effective_expires_ms);
  UPDATE bfa_p5_voice.claims SET effective_expires_ms=deadline WHERE claim_id=id;
  n:=bfa_p5_voice.observe_now(c.owner_id);
  IF a.winner_claim_id IS DISTINCT FROM id OR NOT bfa_p5_voice.eligible(p) OR n IS NULL OR n>=deadline THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
  RETURN bfa_p5_voice.ack(p_claim,'claimed');
 END IF;
 IF p_operation<>'claim' THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 SELECT * INTO v FROM bfa_p5_voice.approvals WHERE approval_id=c.approval_id;
 SELECT * INTO q FROM bfa_p5_voice.quotas WHERE owner_id=c.owner_id AND policy_id=v.quota_policy_id FOR UPDATE;
 IF NOT FOUND OR NOT q.enabled OR q.remaining_units<q.reservation_units THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 -- Quota locks can wait. Repeat all eligibility checks using actual current time.
 IF NOT bfa_p5_voice.eligible(p) THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 n:=bfa_p5_voice.observe_now(c.owner_id); IF n IS NULL OR n>=p.expires_ms OR n>=p.effective_expires_ms THEN RETURN bfa_p5_voice.ack(p_claim,'denied'); END IF;
 INSERT INTO bfa_p5_voice.attempts VALUES(c.owner_id,c.attempt_id,id,false);
 UPDATE bfa_p5_voice.quotas SET remaining_units=remaining_units-q.reservation_units WHERE owner_id=q.owner_id AND policy_id=q.policy_id;
 INSERT INTO bfa_p5_voice.claims VALUES(id,c.owner_id,p_claim,p.effective_expires_ms,'claimed',q.policy_id,q.reservation_units);
 RETURN bfa_p5_voice.ack(p_claim,'claimed');
END $$;
CREATE FUNCTION public.bfa_p5_voice_claim(p_receipt_id uuid,p_claim jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN RETURN bfa_p5_voice.use_proof(p_receipt_id,p_claim,'claim'); END $$;
CREATE FUNCTION public.bfa_p5_voice_inspect(p_receipt_id uuid,p_claim jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN RETURN bfa_p5_voice.use_proof(p_receipt_id,p_claim,'inspect'); END $$;

CREATE FUNCTION public.bfa_p5_voice_close(p_cleanup_id uuid,p_claim jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c bfa_p5_voice.claim_key; k bfa_p5_voice.cleanup_owners; x bfa_p5_voice.claims; id uuid;
BEGIN
 c:=bfa_p5_voice.parse_claim(p_claim); id:=bfa_p5_voice.id(p_claim->'claimId');
 IF p_cleanup_id IS NULL THEN RAISE EXCEPTION 'Unavailable'; END IF;
 PERFORM bfa_p5_voice.lock_owner(c.owner_id);
 SELECT * INTO k FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id=p_cleanup_id OR claim_id=id FOR UPDATE;
 IF FOUND THEN
  IF k.cleanup_id<>p_cleanup_id OR k.claim_id<>id OR k.claim<>p_claim OR k.owner_id<>c.owner_id THEN RAISE EXCEPTION 'Unavailable'; END IF;
 ELSE
  -- Trusted server-retained preallocated identity: works after lost registration.
  INSERT INTO bfa_p5_voice.cleanup_owners(cleanup_id,claim_id,owner_id,claim,closed_ms,effective_expires_ms) VALUES(p_cleanup_id,id,c.owner_id,p_claim,bfa_p5_voice.ms(),c.expires_ms);
 END IF;
 SELECT * INTO x FROM bfa_p5_voice.claims WHERE claim_id=id FOR UPDATE;
 IF FOUND AND (x.claim<>p_claim OR x.owner_id<>c.owner_id) THEN RAISE EXCEPTION 'Unavailable'; END IF;
 UPDATE bfa_p5_voice.cleanup_owners SET closed_ms=coalesce(closed_ms,bfa_p5_voice.ms()) WHERE cleanup_id=p_cleanup_id;
 UPDATE bfa_p5_voice.claims SET state='closed' WHERE claim_id=id;
 -- Retire only a never-won attempt. A different committed winner stays intact.
 INSERT INTO bfa_p5_voice.attempts VALUES(c.owner_id,c.attempt_id,NULL,true) ON CONFLICT(owner_id,attempt_id) DO NOTHING;
 RETURN bfa_p5_voice.ack(p_claim,'closed');
END $$;

-- Default function EXECUTE must be revoked in the same creation transaction.
-- Explicit table privileges deny arbitrary service DML; only reviewed definer
-- RPCs above are callable. Future Auth/grant provisioning needs its own review.
REVOKE ALL ON ALL TABLES IN SCHEMA bfa_p5_voice FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA bfa_p5_voice FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE f record; sig regprocedure; BEGIN
 FOREACH sig IN ARRAY ARRAY[
  'public.bfa_p5_voice_register_generation(uuid,uuid)'::regprocedure,
  'public.bfa_p5_voice_register_issuance(uuid,uuid,uuid,bigint,text,bigint,bigint)'::regprocedure,
  'public.bfa_p5_voice_register_cleanup(uuid,jsonb)'::regprocedure,
  'public.bfa_p5_voice_register_proof(jsonb)'::regprocedure,
  'public.bfa_p5_voice_claim(uuid,jsonb)'::regprocedure,
  'public.bfa_p5_voice_inspect(uuid,jsonb)'::regprocedure,
  'public.bfa_p5_voice_close(uuid,jsonb)'::regprocedure] LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',sig);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',sig);
 END LOOP;
 FOR f IN SELECT tablename FROM pg_tables WHERE schemaname='bfa_p5_voice' LOOP
   EXECUTE format('ALTER TABLE bfa_p5_voice.%I ENABLE ROW LEVEL SECURITY',f.tablename);
 END LOOP;
END $$;
COMMIT;
