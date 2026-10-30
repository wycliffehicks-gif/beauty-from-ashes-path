-- FICTIONAL ROLLBACK FIXTURES: isolated capacity extension only.
-- Execute after unchanged P3b prerequisites, p5-voice-admission.sql and
-- p5-voice-capacity.sql in a fresh LOCAL bfa_p5_offline_fixture database.
-- This sequential suite proves neither independent-backend concurrency nor
-- Auth/provider finality. Direct setup inserts are fictional trusted-port data.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'bfa_p5_offline_fixture' THEN RAISE EXCEPTION 'Disposable fixture database required'; END IF;
 IF to_regclass('bfa_p5_capacity.allocations') IS NULL THEN RAISE EXCEPTION 'Install isolated capacity draft first'; END IF;
END $$;
CREATE FUNCTION pg_temp.capacity_assert(p_value boolean,p_case text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF p_value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Capacity fixture failed: %',p_case; END IF;
 RAISE NOTICE 'P5_CAPACITY_ASSERT: %',p_case;
END $$;
CREATE FUNCTION pg_temp.capacity_pool(p_limit bigint DEFAULT 1,p_unit_limit bigint DEFAULT 20,p_units bigint DEFAULT 2,p_enabled boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid:=gen_random_uuid();
BEGIN
 INSERT INTO bfa_p5_capacity.pools(pool_id,version,active_limit,unit_limit,reservation_units,occupied,held_units,enabled,quarantined)
 VALUES(v_id,1,p_limit,p_unit_limit,p_units,0,0,p_enabled,false);
 RETURN v_id;
END $$;
CREATE FUNCTION pg_temp.capacity_actor(p_pool uuid,p_units bigint DEFAULT 2,p_quota bigint DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_owner uuid:=gen_random_uuid(); v_thread uuid:=gen_random_uuid(); v_session uuid:=gen_random_uuid();
 v_policy uuid:=gen_random_uuid(); v_cleanup uuid:=gen_random_uuid(); v_incarnation uuid;
 v_attempt uuid:=gen_random_uuid(); v_approval uuid:=gen_random_uuid(); v_n bigint:=bfa_p5_voice.ms();
 v_deadline bigint; v_claim jsonb; v_fingerprint text:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
BEGIN
 v_deadline:=v_n+600000;
 INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at)
 VALUES(v_owner,true,to_timestamp(v_deadline/1000.0));
 INSERT INTO public.bfa_p3b_threads(id,owner_id) VALUES(v_thread,v_owner);
 v_incarnation:=public.bfa_p5_voice_register_generation(v_owner,v_thread);
 INSERT INTO bfa_p5_voice.session_fences VALUES(v_owner,v_session,0,v_deadline,false);
 INSERT INTO bfa_p5_voice.quotas VALUES(v_owner,v_policy,p_quota,p_units,true);
 INSERT INTO bfa_p5_voice.approvals VALUES(v_approval,repeat('b',64),v_owner,v_thread,v_incarnation,0,
  v_attempt,'developer-voice-session',v_deadline,false,v_policy);
 IF NOT public.bfa_p5_voice_register_issuance(v_owner,v_thread,v_incarnation,0,v_fingerprint,v_n,v_deadline)
 THEN RAISE EXCEPTION 'Fictional issuance setup failed'; END IF;
 v_claim:=jsonb_build_object('claimId',gen_random_uuid(),'expiresAt',v_deadline,'binding',jsonb_build_object(
  'ownerId',v_owner,'threadId',v_thread,'threadIncarnation',v_incarnation,'threadRevision',0,
  'attemptId',v_attempt,'approvalId',v_approval,'approvalDigest',repeat('b',64),'scope','developer-voice-session'));
 PERFORM public.bfa_p5_voice_register_cleanup(v_cleanup,v_claim);
 IF p_pool IS NOT NULL THEN INSERT INTO bfa_p5_capacity.routes(owner_id,quota_policy_id,pool_id) VALUES(v_owner,v_policy,p_pool); END IF;
 RETURN jsonb_build_object('claim',v_claim,'cleanup',v_cleanup,'owner',v_owner,'thread',v_thread,
  'session',v_session,'fingerprint',v_fingerprint,'policy',v_policy,'pool',p_pool);
END $$;
CREATE FUNCTION pg_temp.capacity_next(p_actor jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_claim jsonb:=p_actor->'claim'; v_cleanup uuid:=gen_random_uuid(); v_approval uuid:=gen_random_uuid(); v_attempt uuid:=gen_random_uuid();
BEGIN
 v_claim:=v_claim||jsonb_build_object('claimId',gen_random_uuid());
 v_claim:=jsonb_set(v_claim,'{binding,attemptId}',to_jsonb(v_attempt));
 v_claim:=jsonb_set(v_claim,'{binding,approvalId}',to_jsonb(v_approval));
 INSERT INTO bfa_p5_voice.approvals VALUES(v_approval,repeat('b',64),(p_actor->>'owner')::uuid,
  (p_actor->>'thread')::uuid,(v_claim->'binding'->>'threadIncarnation')::uuid,0,v_attempt,
  'developer-voice-session',(v_claim->>'expiresAt')::bigint,false,(p_actor->>'policy')::uuid);
 PERFORM public.bfa_p5_voice_register_cleanup(v_cleanup,v_claim);
 RETURN p_actor||jsonb_build_object('claim',v_claim,'cleanup',v_cleanup);
END $$;
CREATE FUNCTION pg_temp.capacity_receipt(p_actor jsonb,p_operation text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_n bigint:=bfa_p5_voice.ms(); v_deadline bigint:=(p_actor->'claim'->>'expiresAt')::bigint;
 v_proof jsonb; v_receipt uuid:=gen_random_uuid(); v_result jsonb;
BEGIN
 v_proof:=jsonb_build_object('receiptId',v_receipt,'operation',p_operation,'claim',p_actor->'claim',
  'cleanupId',p_actor->'cleanup','ownerSessionId',p_actor->'session','sessionVersion',0,
  'authorityFingerprint',p_actor->'fingerprint','identityExpiresAt',v_deadline,
  'verifiedAt',v_n,'expiresAt',least(v_n+30000,v_deadline),'effectiveExpiresAt',v_deadline);
 v_result:=public.bfa_p5_voice_register_proof(v_proof);
 IF v_result IS NULL THEN RETURN NULL; END IF;
 RETURN v_receipt;
END $$;
CREATE FUNCTION pg_temp.capacity_claim(p_actor jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN RETURN public.bfa_p5_capacity_claim(pg_temp.capacity_receipt(p_actor,'claim'),p_actor->'claim'); END $$;
CREATE FUNCTION pg_temp.capacity_mark(p_actor jsonb,p_operation uuid,p_version bigint DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN RETURN public.bfa_p5_capacity_mark(pg_temp.capacity_receipt(p_actor,'inspect'),p_actor->'claim',p_operation,p_version); END $$;
CREATE FUNCTION pg_temp.capacity_close(p_actor jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN RETURN public.bfa_p5_capacity_close((p_actor->>'cleanup')::uuid,p_actor->'claim'); END $$;
CREATE FUNCTION pg_temp.capacity_observation(p_operation uuid,p_kind text,p_session text DEFAULT NULL,p_evidence uuid DEFAULT gen_random_uuid())
RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('evidenceId',p_evidence,'operationId',p_operation,'kind',p_kind,'sessionId',p_session)
$$;
CREATE FUNCTION pg_temp.capacity_observe(p_actor jsonb,p_observation jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN RETURN public.bfa_p5_capacity_reconcile((p_actor->>'cleanup')::uuid,p_actor->'claim',p_observation); END $$;

-- A shared last slot is modeled sequentially across two different owners.
-- Actual independently blocked database backends remain a separate acceptance.
DO $$
DECLARE v_pool uuid:=pg_temp.capacity_pool(); a jsonb:=pg_temp.capacity_actor(v_pool); b jsonb:=pg_temp.capacity_actor(v_pool);
 v_receipt uuid; v_changed jsonb; v_loser jsonb; v_rejected boolean;
BEGIN
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_claim(a)->>'state'='claimed','first combined admission claims capacity');
 PERFORM pg_temp.capacity_assert((SELECT occupied=1 AND held_units=2 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'combined claim adds one occupied slot and one pool hold');
 PERFORM pg_temp.capacity_assert((SELECT remaining_units=28 FROM bfa_p5_voice.quotas WHERE owner_id=(a->>'owner')::uuid),'combined claim debits original owner quota once');
 PERFORM pg_temp.capacity_assert((SELECT held_units=2 FROM bfa_p5_voice.claims WHERE claim_id=(a->'claim'->>'claimId')::uuid),'base claim retains exact original hold');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_claim(a)->>'state'='claimed','exact duplicate claim observes existing allocation');
 PERFORM pg_temp.capacity_assert((SELECT remaining_units=28 FROM bfa_p5_voice.quotas WHERE owner_id=(a->>'owner')::uuid),'duplicate cannot debit original quota twice');
 PERFORM pg_temp.capacity_assert((SELECT occupied=1 AND held_units=2 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'duplicate cannot add pool occupancy or hold twice');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_claim(b)->>'state'='denied','second owner cannot acquire shared last slot');
 PERFORM pg_temp.capacity_assert((SELECT remaining_units=30 FROM bfa_p5_voice.quotas WHERE owner_id=(b->>'owner')::uuid),'capacity denial leaves second owner quota unchanged');
 PERFORM pg_temp.capacity_assert(NOT EXISTS(SELECT 1 FROM bfa_p5_voice.claims WHERE claim_id=(b->'claim'->>'claimId')::uuid),'capacity denial creates no partial base claim');
 PERFORM pg_temp.capacity_assert(NOT EXISTS(SELECT 1 FROM bfa_p5_capacity.allocations WHERE claim_id=(b->'claim'->>'claimId')::uuid),'capacity denial creates no partial allocation');
 v_receipt:=pg_temp.capacity_receipt(a,'claim');
 v_changed:=jsonb_set(a->'claim','{binding,threadRevision}',to_jsonb(1));
 PERFORM pg_temp.capacity_assert(public.bfa_p5_capacity_claim(v_receipt,v_changed)->>'state'='denied','changed claim binding cannot consume original ownership');
 PERFORM pg_temp.capacity_assert(public.bfa_p5_capacity_claim(v_receipt,a->'claim')->>'state'='claimed','wrong binding leaves original exact receipt available');
 v_loser:=a||jsonb_build_object('claim',(a->'claim')||jsonb_build_object('claimId',gen_random_uuid()),'cleanup',gen_random_uuid());
 PERFORM public.bfa_p5_voice_register_cleanup((v_loser->>'cleanup')::uuid,v_loser->'claim');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_claim(v_loser)->>'state'='replayed','changed claim ID cannot win original owner attempt');
 PERFORM pg_temp.capacity_close(v_loser);
 PERFORM pg_temp.capacity_assert((SELECT slot_held AND NOT closed FROM bfa_p5_capacity.allocations WHERE claim_id=(a->'claim'->>'claimId')::uuid),'losing cleanup leaves committed winner and slot intact');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_close(a)->>'state'='closed','exact unmarked close succeeds');
 PERFORM pg_temp.capacity_assert((SELECT occupied=0 AND held_units=2 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'never-started close releases slot but retains cumulative hold');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_mark(a,gen_random_uuid())->>'state'<>'marked','close-before-marker prevents late start');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_claim(b)->>'state'='claimed','another deliberate attempt can use safely released capacity');
 PERFORM pg_temp.capacity_assert((SELECT occupied=1 AND held_units=4 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'replacement adds its own single hold');
END $$;

-- Missing/disabled/zero/mismatched policies deny without debits.
DO $$
DECLARE v_pool uuid; a jsonb; v_before bigint; v_case text;
BEGIN
 a:=pg_temp.capacity_actor(NULL);
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_claim(a)->>'state'='denied','missing server pool mapping denies');
 PERFORM pg_temp.capacity_assert((SELECT remaining_units=30 FROM bfa_p5_voice.quotas WHERE owner_id=(a->>'owner')::uuid),'missing mapping cannot consume quota');
 FOREACH v_case IN ARRAY ARRAY['disabled','zero-capacity','zero-units','unit-mismatch'] LOOP
  v_pool:=pg_temp.capacity_pool(CASE WHEN v_case='zero-capacity' THEN 0 ELSE 1 END,
   CASE WHEN v_case='zero-units' THEN 0 ELSE 20 END,2,v_case<>'disabled');
  a:=pg_temp.capacity_actor(v_pool,CASE WHEN v_case='unit-mismatch' THEN 3 ELSE 2 END);
  PERFORM pg_temp.capacity_assert(pg_temp.capacity_claim(a)->>'state'='denied',v_case||' policy denies');
  PERFORM pg_temp.capacity_assert((SELECT remaining_units=30 FROM bfa_p5_voice.quotas WHERE owner_id=(a->>'owner')::uuid),v_case||' denial preserves original quota');
  PERFORM pg_temp.capacity_assert((SELECT occupied=0 AND held_units=0 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),v_case||' denial preserves pool');
 END LOOP;
 v_pool:=pg_temp.capacity_pool(); a:=pg_temp.capacity_actor(v_pool,2,1);
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_claim(a)->>'state'='denied','insufficient original quota denies without pool debit');
 PERFORM pg_temp.capacity_assert((SELECT occupied=0 AND held_units=0 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'insufficient quota leaves pool empty');
END $$;

-- No lazy conversion of a standalone base admission into a second debit.
DO $$
DECLARE v_pool uuid:=pg_temp.capacity_pool(); a jsonb:=pg_temp.capacity_actor(v_pool);
BEGIN
 PERFORM pg_temp.capacity_assert(public.bfa_p5_voice_claim(pg_temp.capacity_receipt(a,'claim'),a->'claim')->>'state'='claimed','standalone base hold fixture exists');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_claim(a)->>'state'='denied','standalone base hold cannot lazily attach capacity');
 PERFORM pg_temp.capacity_assert((SELECT remaining_units=28 FROM bfa_p5_voice.quotas WHERE owner_id=(a->>'owner')::uuid),'rejected attachment preserves original single hold');
 PERFORM pg_temp.capacity_assert((SELECT occupied=0 AND held_units=0 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'rejected attachment creates no pool allocation');
END $$;

-- Closure before any claim must retain the base close/owner-attempt fence.
DO $$
DECLARE v_pool uuid:=pg_temp.capacity_pool(); a jsonb:=pg_temp.capacity_actor(v_pool); v_receipt uuid:=pg_temp.capacity_receipt(a,'claim');
BEGIN
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_close(a)->>'state'='closed','close before capacity claim is accepted');
 PERFORM pg_temp.capacity_assert(public.bfa_p5_capacity_claim(v_receipt,a->'claim')->>'state'='closed','late claim observes exact close tombstone');
 PERFORM pg_temp.capacity_assert((SELECT retired FROM bfa_p5_voice.attempts WHERE owner_id=(a->>'owner')::uuid AND attempt_id=(a->'claim'->'binding'->>'attemptId')::uuid),'close before claim retires owner attempt');
 PERFORM pg_temp.capacity_assert((SELECT remaining_units=30 FROM bfa_p5_voice.quotas WHERE owner_id=(a->>'owner')::uuid),'close-before-claim creates no hold');
 PERFORM pg_temp.capacity_assert((SELECT occupied=0 AND held_units=0 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'close-before-claim creates no occupancy');
END $$;

-- Marker-before-close retains capacity even when creation acknowledgment is lost.
DO $$
DECLARE v_pool uuid:=pg_temp.capacity_pool(); a jsonb:=pg_temp.capacity_actor(v_pool); b jsonb;
 v_operation uuid:=gen_random_uuid(); v_evidence uuid:=gen_random_uuid(); v_observation jsonb; v_receipt uuid;
BEGIN
 PERFORM pg_temp.capacity_claim(a);
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_mark(a,v_operation)->>'state'='marked','one exact create marker commits');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_mark(a,v_operation)->>'state'='already-marked','marker replay is observation only');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_mark(a,gen_random_uuid())->>'state'<>'marked','different operation cannot reuse marked allocation');
 PERFORM pg_temp.capacity_close(a);
 PERFORM pg_temp.capacity_assert((SELECT occupied=1 AND held_units=2 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'admission close after marker retains uncertain capacity');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_observe(a,pg_temp.capacity_observation(v_operation,'unknown'))->>'state'='uncertain','missing create acknowledgment remains uncertain');
 b:=pg_temp.capacity_actor(v_pool);
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_claim(b)->>'state'='denied','unknown provider outcome blocks replacement reservation');
 v_observation:=pg_temp.capacity_observation(v_operation,'ended','session-lost-ack',v_evidence);
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_observe(a,v_observation)->>'state'='terminal-recorded','exact final evidence reconciles unknown session after close');
 PERFORM pg_temp.capacity_assert((SELECT occupied=0 AND held_units=2 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'terminal evidence releases one slot without refund');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_observe(a,v_observation)->>'state'='duplicate-evidence','exact terminal receipt replay is idempotent');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_observe(a,pg_temp.capacity_observation(v_operation,'created','session-lost-ack'))->>'state'='late-evidence','late historical create acknowledgment cannot revive final session');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_observe(a,pg_temp.capacity_observation(v_operation,'unknown'))->>'state'='late-evidence','late inconclusive evidence cannot downgrade established finality');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_claim(b)->>'state'='claimed','terminally released slot can be reserved deliberately');
 PERFORM pg_temp.capacity_assert((SELECT occupied=1 AND held_units=4 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'duplicate and late receipts cannot debit or release replacement');
 PERFORM pg_temp.capacity_assert((SELECT held_units=2 FROM bfa_p5_voice.claims WHERE claim_id=(a->'claim'->>'claimId')::uuid),'reconciliation preserves original base hold');
END $$;

-- Whole-operation final no-create evidence is distinct from timeout/not-found.
DO $$
DECLARE v_pool uuid:=pg_temp.capacity_pool(1,4); a jsonb:=pg_temp.capacity_actor(v_pool); b jsonb; c jsonb;
 v_operation uuid:=gen_random_uuid();
BEGIN
 PERFORM pg_temp.capacity_claim(a); PERFORM pg_temp.capacity_mark(a,v_operation);
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_observe(a,pg_temp.capacity_observation(v_operation,'not-created'))->>'state'='terminal-recorded','trusted whole-operation no-create finality releases slot');
 PERFORM pg_temp.capacity_assert((SELECT occupied=0 AND held_units=2 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'no-create finality retains cumulative units');
 b:=pg_temp.capacity_actor(v_pool); PERFORM pg_temp.capacity_claim(b); PERFORM pg_temp.capacity_close(b);
 c:=pg_temp.capacity_actor(v_pool);
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_claim(c)->>'state'='denied','free slots cannot bypass exhausted cumulative pool ceiling');
 PERFORM pg_temp.capacity_assert((SELECT occupied=0 AND held_units=4 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'repeated release never recycles cumulative units');
 PERFORM pg_temp.capacity_assert((SELECT remaining_units=30 FROM bfa_p5_voice.quotas WHERE owner_id=(c->>'owner')::uuid),'pool-unit denial preserves fresh owner quota');
END $$;

-- Trusted contradictions latch quarantine without reopening/mutating replacement.
DO $$
DECLARE v_pool uuid:=pg_temp.capacity_pool(); a jsonb:=pg_temp.capacity_actor(v_pool); b jsonb; c jsonb;
 v_operation uuid:=gen_random_uuid(); v_receipt uuid;
BEGIN
 PERFORM pg_temp.capacity_claim(a); PERFORM pg_temp.capacity_mark(a,v_operation);
 PERFORM pg_temp.capacity_observe(a,pg_temp.capacity_observation(v_operation,'ended','session-original'));
 b:=pg_temp.capacity_actor(v_pool); PERFORM pg_temp.capacity_claim(b);
 v_receipt:=pg_temp.capacity_receipt(b,'inspect');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_observe(a,pg_temp.capacity_observation(v_operation,'created','session-conflict'))->>'state'='quarantined','different late session contradicts original finality');
 PERFORM pg_temp.capacity_assert((SELECT quarantined AND occupied=1 AND held_units=4 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'quarantine preserves actual retained bookkeeping');
 PERFORM pg_temp.capacity_assert(public.bfa_p5_capacity_mark(v_receipt,b->'claim',gen_random_uuid(),1)->>'state'='quarantined','quarantine blocks already-reserved replacement marker');
 PERFORM pg_temp.capacity_assert((SELECT operation_id IS NULL AND slot_held AND NOT closed FROM bfa_p5_capacity.allocations WHERE claim_id=(b->'claim'->>'claimId')::uuid),'old contradiction cannot mutate replacement ownership');
 PERFORM pg_temp.capacity_assert((SELECT NOT slot_held AND terminal='ended' FROM bfa_p5_capacity.allocations WHERE claim_id=(a->'claim'->>'claimId')::uuid),'conflict does not reopen original released allocation');
 PERFORM pg_temp.capacity_close(b);
 PERFORM pg_temp.capacity_assert(public.bfa_p5_capacity_policy(v_pool,1,10,100,true),'policy increase remains explicit versioned operation');
 c:=pg_temp.capacity_actor(v_pool);
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_claim(c)->>'state'='denied','quarantine survives cleanup and policy increase');
 PERFORM pg_temp.capacity_assert((SELECT quarantined AND occupied=0 AND held_units=4 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'no side effect clears quarantine or cumulative holds');
END $$;

-- Evidence identity/session reuse and incompatible finality cannot free a slot.
DO $$
DECLARE v_pool uuid:=pg_temp.capacity_pool(2); a jsonb:=pg_temp.capacity_actor(v_pool); b jsonb:=pg_temp.capacity_actor(v_pool);
 v_aop uuid:=gen_random_uuid(); v_bop uuid:=gen_random_uuid(); v_evidence uuid:=gen_random_uuid();
BEGIN
 PERFORM pg_temp.capacity_claim(a); PERFORM pg_temp.capacity_claim(b);
 PERFORM pg_temp.capacity_mark(a,v_aop); PERFORM pg_temp.capacity_mark(b,v_bop);
 PERFORM pg_temp.capacity_observe(a,pg_temp.capacity_observation(v_aop,'created','unique-session',v_evidence));
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_observe(b,pg_temp.capacity_observation(v_bop,'ended','other-session',v_evidence))->>'state'='quarantined','evidence ID cannot be rebound across owners and operations');
 PERFORM pg_temp.capacity_assert((SELECT occupied=2 AND held_units=4 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'rebound evidence releases neither slot');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_observe(b,pg_temp.capacity_observation(v_bop,'ended','unique-session'))->>'state'='quarantined','one session cannot be attributed to two create operations');
 PERFORM pg_temp.capacity_assert((SELECT occupied=2 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'session rebind cannot release another operation');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_observe(a,pg_temp.capacity_observation(v_aop,'not-created'))->>'state'='quarantined','known creation cannot become final no-create');
 PERFORM pg_temp.capacity_assert((SELECT terminal IS NULL AND slot_held FROM bfa_p5_capacity.allocations WHERE claim_id=(a->'claim'->>'claimId')::uuid),'contradictory no-create cannot fabricate termination');
END $$;

-- Completed operation IDs remain unavailable to newer allocations.
DO $$
DECLARE v_pool uuid:=pg_temp.capacity_pool(); a jsonb:=pg_temp.capacity_actor(v_pool); b jsonb;
 v_operation uuid:=gen_random_uuid();
BEGIN
 PERFORM pg_temp.capacity_claim(a); PERFORM pg_temp.capacity_mark(a,v_operation);
 PERFORM pg_temp.capacity_observe(a,pg_temp.capacity_observation(v_operation,'not-created'));
 b:=pg_temp.capacity_actor(v_pool); PERFORM pg_temp.capacity_claim(b);
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_mark(b,v_operation)->>'state'<>'marked','completed operation identity cannot be rebound');
 PERFORM pg_temp.capacity_assert((SELECT operation_id IS NULL AND slot_held FROM bfa_p5_capacity.allocations WHERE claim_id=(b->'claim'->>'claimId')::uuid),'operation conflict leaves replacement reserved without dispatch marker');
END $$;

-- Lowered policies retain occupancy/units and gate pending starts.
DO $$
DECLARE v_pool uuid:=pg_temp.capacity_pool(2,20); a jsonb:=pg_temp.capacity_actor(v_pool); b jsonb:=pg_temp.capacity_actor(v_pool);
 v_aop uuid:=gen_random_uuid(); v_bop uuid:=gen_random_uuid(); v_receipt uuid;
BEGIN
 PERFORM pg_temp.capacity_claim(a); PERFORM pg_temp.capacity_claim(b); PERFORM pg_temp.capacity_mark(a,v_aop);
 PERFORM pg_temp.capacity_assert(public.bfa_p5_capacity_policy(v_pool,1,1,20,true),'capacity decrease uses exact previous policy version');
 PERFORM pg_temp.capacity_assert(NOT public.bfa_p5_capacity_policy(v_pool,1,50,100,true),'stale policy version cannot overwrite newer limit');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_mark(b,v_bop,1)->>'state'<>'marked','stale caller policy version cannot mark');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_mark(b,v_bop,2)->>'state'<>'marked','over-limit existing occupancy blocks pending marker');
 PERFORM pg_temp.capacity_assert((SELECT occupied=2 AND held_units=4 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'capacity decrease does not evict or refund');
 PERFORM pg_temp.capacity_close(a);
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_mark(b,v_bop,2)->>'state'<>'marked','closing marked predecessor alone does not unblock capacity');
 PERFORM pg_temp.capacity_observe(a,pg_temp.capacity_observation(v_aop,'ended','policy-session'));
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_mark(b,v_bop,2)->>'state'='marked','confirmed predecessor finality allows pending marker under current policy');
 PERFORM pg_temp.capacity_assert(public.bfa_p5_capacity_policy(v_pool,2,1,3,true),'cumulative ceiling can be lowered below prior holds without erasing history');
 PERFORM pg_temp.capacity_assert((SELECT occupied=1 AND held_units=4 AND unit_limit=3 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'lowered unit ceiling preserves all prior reservations');
END $$;

-- A current approval must not silently switch the immutable original hold policy.
DO $$
DECLARE v_pool uuid:=pg_temp.capacity_pool(); a jsonb:=pg_temp.capacity_actor(v_pool);
 v_q2 uuid:=gen_random_uuid(); v_receipt uuid; v_operation uuid:=gen_random_uuid();
BEGIN
 PERFORM pg_temp.capacity_claim(a);
 INSERT INTO bfa_p5_voice.quotas(owner_id,policy_id,remaining_units,reservation_units,enabled)
 VALUES((a->>'owner')::uuid,v_q2,30,2,false);
 -- Deliberate protected-row drift is fixture fault injection, not an approved
 -- policy migration. The original allocation and hold still belong to Q1.
 UPDATE bfa_p5_voice.approvals SET quota_policy_id=v_q2
 WHERE approval_id=(a->'claim'->'binding'->>'approvalId')::uuid;
 v_receipt:=pg_temp.capacity_receipt(a,'inspect');
 PERFORM pg_temp.capacity_assert(v_receipt IS NOT NULL,'base inspect receipt alone does not certify immutable quota policy');
 PERFORM pg_temp.capacity_assert(public.bfa_p5_capacity_mark(v_receipt,a->'claim',v_operation,1)->>'state'<>'marked','current approval quota Q2 cannot mark retained hold under Q1');
 PERFORM pg_temp.capacity_assert((SELECT operation_id IS NULL AND slot_held AND units=2 FROM bfa_p5_capacity.allocations WHERE claim_id=(a->'claim'->>'claimId')::uuid),'policy drift creates no operation and preserves original allocation');
 PERFORM pg_temp.capacity_assert((SELECT quota_policy_id=(a->>'policy')::uuid AND held_units=2 FROM bfa_p5_voice.claims WHERE claim_id=(a->'claim'->>'claimId')::uuid),'policy drift cannot rebind original cumulative hold');
 PERFORM pg_temp.capacity_assert((SELECT remaining_units=28 FROM bfa_p5_voice.quotas WHERE owner_id=(a->>'owner')::uuid AND policy_id=(a->>'policy')::uuid)
  AND (SELECT remaining_units=30 FROM bfa_p5_voice.quotas WHERE owner_id=(a->>'owner')::uuid AND policy_id=v_q2),'policy drift neither refunds Q1 nor debits Q2');
 PERFORM pg_temp.capacity_assert((SELECT occupied=1 AND held_units=2 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'policy drift retains pool occupancy and cumulative units');
END $$;

-- Fresh authority changes after receipt minting cannot be hidden by a prior check.
DO $$
DECLARE v_pool uuid; a jsonb; v_receipt uuid; v_operation uuid; v_deadline bigint; v_marked boolean;
BEGIN
 FOREACH v_marked IN ARRAY ARRAY[false,true] LOOP
  v_pool:=pg_temp.capacity_pool(); a:=pg_temp.capacity_actor(v_pool); v_operation:=gen_random_uuid();
  PERFORM pg_temp.capacity_claim(a);
  IF v_marked THEN PERFORM pg_temp.capacity_mark(a,v_operation); END IF;
  v_receipt:=pg_temp.capacity_receipt(a,'inspect');
  UPDATE bfa_p5_voice.session_fences SET revoked=true WHERE owner_id=(a->>'owner')::uuid;
  UPDATE bfa_p5_voice.owner_clocks SET observed_ms=bfa_p5_voice.ms()+60000 WHERE owner_id=(a->>'owner')::uuid;
  PERFORM pg_temp.capacity_assert(public.bfa_p5_capacity_mark(v_receipt,a->'claim',v_operation,1)->>'state'<>'marked','revocation during backward-clock observation denies marker');
  PERFORM pg_temp.capacity_assert((SELECT invalidated_ms IS NOT NULL FROM bfa_p5_voice.cleanup_owners WHERE claim_id=(a->'claim'->>'claimId')::uuid),'revocation fence survives simultaneous clock denial');
  -- Deliberate restoration is fixture fault injection, never product revival.
  UPDATE bfa_p5_voice.owner_clocks SET observed_ms=bfa_p5_voice.ms() WHERE owner_id=(a->>'owner')::uuid;
  UPDATE bfa_p5_voice.session_fences SET revoked=false WHERE owner_id=(a->>'owner')::uuid;
  PERFORM pg_temp.capacity_assert(pg_temp.capacity_mark(a,gen_random_uuid())->>'state'<>'marked','clock recovery and restored source cannot revive invalidated allocation');
  PERFORM pg_temp.capacity_close(a);
  PERFORM pg_temp.capacity_assert((SELECT occupied=CASE WHEN v_marked THEN 1 ELSE 0 END AND held_units=2 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'cleanup releases only unmarked revoked allocation and never units');
 END LOOP;
 v_pool:=pg_temp.capacity_pool(); a:=pg_temp.capacity_actor(v_pool); PERFORM pg_temp.capacity_claim(a);
 v_receipt:=pg_temp.capacity_receipt(a,'inspect'); v_deadline:=(a->'claim'->>'expiresAt')::bigint;
 UPDATE bfa_p5_voice.approvals SET expires_ms=bfa_p5_voice.ms()-1 WHERE approval_id=(a->'claim'->'binding'->>'approvalId')::uuid;
 PERFORM pg_temp.capacity_assert(public.bfa_p5_capacity_mark(v_receipt,a->'claim',gen_random_uuid(),1)->>'state'<>'marked','shortened current approval defeats earlier inspection receipt');
 UPDATE bfa_p5_voice.approvals SET expires_ms=v_deadline WHERE approval_id=(a->'claim'->'binding'->>'approvalId')::uuid;
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_mark(a,gen_random_uuid())->>'state'<>'marked','later expiry extension cannot revive observed expiry');
END $$;

-- Cleanup and trusted reconciliation remain content-free after thread deletion.
DO $$
DECLARE v_pool uuid:=pg_temp.capacity_pool(); a jsonb:=pg_temp.capacity_actor(v_pool); v_operation uuid:=gen_random_uuid();
BEGIN
 PERFORM pg_temp.capacity_claim(a); PERFORM pg_temp.capacity_mark(a,v_operation);
 UPDATE public.bfa_p3b_threads SET deleted_at=clock_timestamp(),revision=revision+1 WHERE id=(a->>'thread')::uuid;
 UPDATE public.bfa_p3b_staging_accounts SET admitted=false WHERE user_id=(a->>'owner')::uuid;
 UPDATE bfa_p5_voice.session_fences SET revoked=true WHERE owner_id=(a->>'owner')::uuid;
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_close(a)->>'state'='closed','retained exact cleanup works after deletion and Auth revocation');
 PERFORM pg_temp.capacity_assert((SELECT occupied=1 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'deletion and closed admission do not prove external termination');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_observe(a,pg_temp.capacity_observation(v_operation,'ended','deleted-session'))->>'state'='terminal-recorded','trusted exact terminal reconciliation works after deletion');
 PERFORM pg_temp.capacity_assert((SELECT deleted_at IS NOT NULL FROM public.bfa_p3b_threads WHERE id=(a->>'thread')::uuid),'reconciliation cannot restore deleted thread');
 PERFORM pg_temp.capacity_assert((SELECT occupied=0 AND held_units=2 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'post-deletion reconciliation releases only slot');
 PERFORM pg_temp.capacity_assert((SELECT held_units=2 FROM bfa_p5_voice.claims WHERE claim_id=(a->'claim'->>'claimId')::uuid),'post-deletion original accounting evidence survives');
END $$;

-- Checked arithmetic at the shared cumulative ceiling must not overflow.
DO $$
DECLARE v_max bigint:=9007199254740991; v_pool uuid; a jsonb; b jsonb; v_result boolean; v_rejected boolean;
BEGIN
 v_pool:=pg_temp.capacity_pool(2,v_max,v_max);
 a:=pg_temp.capacity_actor(v_pool,v_max,v_max); b:=pg_temp.capacity_actor(v_pool,v_max,v_max);
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_claim(a)->>'state'='claimed','maximum safe integer reservation is exact');
 PERFORM pg_temp.capacity_assert(pg_temp.capacity_claim(b)->>'state'='denied','second maximum reservation cannot overflow cumulative units');
 PERFORM pg_temp.capacity_assert((SELECT occupied=1 AND held_units=v_max FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'overflow denial leaves exact pool totals');
 PERFORM pg_temp.capacity_assert((SELECT remaining_units=v_max FROM bfa_p5_voice.quotas WHERE owner_id=(b->>'owner')::uuid),'overflow denial leaves other owner quota intact');
 v_rejected:=false; v_result:=NULL;
 BEGIN v_result:=public.bfa_p5_capacity_policy(v_pool,1,2,v_max+1,true); EXCEPTION WHEN raise_exception OR check_violation OR numeric_value_out_of_range THEN v_rejected:=true; END;
 PERFORM pg_temp.capacity_assert(v_rejected OR v_result=false,'unsafe policy amount rejects instead of coercing');
 PERFORM pg_temp.capacity_assert((SELECT version=1 AND unit_limit=v_max AND held_units=v_max FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'unsafe policy leaves version and counters unchanged');
END $$;

-- An enclosing transaction failure rolls back the combined mutation exactly.
DO $$
DECLARE v_pool uuid:=pg_temp.capacity_pool(); a jsonb:=pg_temp.capacity_actor(v_pool);
 v_receipt uuid:=pg_temp.capacity_receipt(a,'claim'); v_result jsonb; v_rejected boolean:=false;
BEGIN
 BEGIN
  v_result:=public.bfa_p5_capacity_claim(v_receipt,a->'claim');
  IF v_result->>'state'<>'claimed' THEN RAISE EXCEPTION 'Fixture setup claim failed'; END IF;
  RAISE EXCEPTION 'Injected rollback after mutation' USING ERRCODE='P5001';
 EXCEPTION WHEN SQLSTATE 'P5001' THEN v_rejected:=true;
 END;
 PERFORM pg_temp.capacity_assert(v_rejected,'injected enclosing transaction failure executed');
 PERFORM pg_temp.capacity_assert((SELECT occupied=0 AND held_units=0 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'rollback restores pool counters together');
 PERFORM pg_temp.capacity_assert((SELECT remaining_units=30 FROM bfa_p5_voice.quotas WHERE owner_id=(a->>'owner')::uuid),'rollback restores original quota debit');
 PERFORM pg_temp.capacity_assert(NOT EXISTS(SELECT 1 FROM bfa_p5_voice.claims WHERE claim_id=(a->'claim'->>'claimId')::uuid),'rollback removes tentative base claim');
 PERFORM pg_temp.capacity_assert(NOT EXISTS(SELECT 1 FROM bfa_p5_capacity.allocations WHERE claim_id=(a->'claim'->>'claimId')::uuid),'rollback removes tentative allocation');
 PERFORM pg_temp.capacity_assert((SELECT consumed_ms IS NULL FROM bfa_p5_voice.proofs WHERE receipt_id=v_receipt),'rollback restores proof consumption');
 PERFORM pg_temp.capacity_assert(public.bfa_p5_capacity_claim(v_receipt,a->'claim')->>'state'='claimed','same exact receipt works after proven rollback');
END $$;

-- Malformed/cross-boundary cleanup and evidence cannot release another slot.
DO $$
DECLARE v_pool uuid:=pg_temp.capacity_pool(); a jsonb:=pg_temp.capacity_actor(v_pool); v_operation uuid:=gen_random_uuid();
 v_bad jsonb; v_rejected boolean; v_result jsonb;
BEGIN
 PERFORM pg_temp.capacity_claim(a); PERFORM pg_temp.capacity_mark(a,v_operation);
 v_bad:=jsonb_set(a->'claim','{binding,threadIncarnation}',to_jsonb(gen_random_uuid()));
 v_rejected:=false;
 BEGIN v_result:=public.bfa_p5_capacity_close((a->>'cleanup')::uuid,v_bad); EXCEPTION WHEN raise_exception OR check_violation OR numeric_value_out_of_range THEN v_rejected:=true; END;
 PERFORM pg_temp.capacity_assert(v_rejected OR v_result->>'state'<>'closed','changed generation cannot close original cleanup identity');
 v_rejected:=false; v_result:=NULL;
 BEGIN v_result:=pg_temp.capacity_observe(a,pg_temp.capacity_observation(v_operation,'ended',NULL)); EXCEPTION WHEN raise_exception OR check_violation OR numeric_value_out_of_range THEN v_rejected:=true; END;
 PERFORM pg_temp.capacity_assert(v_rejected OR v_result->>'state'='denied','terminal session evidence requires exact session identity');
 v_rejected:=false; v_result:=NULL;
 BEGIN v_result:=pg_temp.capacity_observe(a,pg_temp.capacity_observation(v_operation,'not-created','bad-session')); EXCEPTION WHEN raise_exception OR check_violation OR numeric_value_out_of_range THEN v_rejected:=true; END;
 PERFORM pg_temp.capacity_assert(v_rejected OR v_result->>'state'='denied','no-create evidence cannot smuggle a session identity');
 v_rejected:=false; v_result:=NULL;
 BEGIN v_result:=pg_temp.capacity_observe(a,pg_temp.capacity_observation(v_operation,'ended','known-session')||jsonb_build_object('transcript','excluded')); EXCEPTION WHEN raise_exception OR check_violation OR numeric_value_out_of_range THEN v_rejected:=true; END;
 PERFORM pg_temp.capacity_assert(v_rejected OR v_result->>'state'='denied','unknown evidence payload fields reject instead of entering retained diagnostics');
 PERFORM pg_temp.capacity_assert((SELECT occupied=1 AND held_units=2 AND NOT quarantined FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'malformed untrusted shape changes no capacity or quarantine');
END $$;
ROLLBACK;
-- The runner must verify every P3b/admission/capacity fixture table is empty.
