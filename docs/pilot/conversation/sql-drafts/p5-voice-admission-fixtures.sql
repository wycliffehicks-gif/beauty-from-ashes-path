-- EXECUTABLE FUTURE FIXTURES; NOT EXECUTED IN THE OFFLINE AUTHORING BATCH.
-- Run only in a disposable LOCAL database named bfa_p5_offline_fixture, after
-- installing isolated copies of P3b migrations and the proposed SQL package.
-- Direct inserts below are fictional server fixtures, never Auth evidence.
-- No remote credentials, participant data, model or voice calls are needed.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database()<>'bfa_p5_offline_fixture' THEN RAISE EXCEPTION 'Disposable fixture database required'; END IF;
 IF to_regclass('bfa_p5_voice.proofs') IS NULL THEN RAISE EXCEPTION 'Install reviewed draft in disposable fixture DB first'; END IF;
END $$;
CREATE FUNCTION pg_temp.check_true(p_value boolean,p_case text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Fixture failed: %',p_case; END IF; END $$;
CREATE FUNCTION pg_temp.proof(p_claim jsonb,p_cleanup uuid,p_session uuid,p_fingerprint text,p_operation text,p_now bigint) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('receiptId',gen_random_uuid(),'operation',p_operation,'claim',p_claim,
 'cleanupId',p_cleanup,'ownerSessionId',p_session,'sessionVersion',0,
 'authorityFingerprint',p_fingerprint,'identityExpiresAt',(p_claim->>'expiresAt')::bigint,
 'verifiedAt',p_now,'expiresAt',p_now+30000,'effectiveExpiresAt',(p_claim->>'expiresAt')::bigint)
$$;
DO $$
DECLARE v_owner_id uuid:=gen_random_uuid(); v_thread_id uuid:=gen_random_uuid(); v_session_id uuid:=gen_random_uuid();
 v_incarnation uuid; v_attempt_id uuid:=gen_random_uuid(); v_approval_id uuid:=gen_random_uuid(); v_policy_id uuid:=gen_random_uuid();
 v_cleanup uuid:=gen_random_uuid(); v_loser_cleanup uuid:=gen_random_uuid(); v_closed_cleanup uuid:=gen_random_uuid();
 v_n bigint:=bfa_p5_voice.ms(); v_deadline bigint; v_claim jsonb; v_loser jsonb; v_second_claim jsonb; v_closed_claim jsonb;
 v_p jsonb; v_r jsonb; v_rejected boolean; v_fingerprint text:=repeat('a',64); v_changed jsonb; v_other_session uuid:=gen_random_uuid();
BEGIN
 v_deadline:=v_n+600000;
 INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES(v_owner_id,true,to_timestamp(v_deadline/1000.0));
 INSERT INTO public.bfa_p3b_threads(id,owner_id) VALUES(v_thread_id,v_owner_id);
 v_incarnation:=public.bfa_p5_voice_register_generation(v_owner_id,v_thread_id);
 PERFORM pg_temp.check_true(v_incarnation=public.bfa_p5_voice_register_generation(v_owner_id,v_thread_id),'generation stable across issuance');
 INSERT INTO bfa_p5_voice.session_fences VALUES(v_owner_id,v_session_id,0,v_deadline,false);
 INSERT INTO bfa_p5_voice.quotas VALUES(v_owner_id,v_policy_id,1,1,true);
 INSERT INTO bfa_p5_voice.approvals VALUES(v_approval_id,repeat('b',64),v_owner_id,v_thread_id,v_incarnation,0,v_attempt_id,'developer-voice-session',v_deadline,false,v_policy_id);
 PERFORM pg_temp.check_true(public.bfa_p5_voice_register_issuance(v_owner_id,v_thread_id,v_incarnation,0,v_fingerprint,v_n,v_deadline),'trusted fictional issuance');
 PERFORM pg_temp.check_true(public.bfa_p5_voice_register_issuance(v_owner_id,v_thread_id,v_incarnation,0,v_fingerprint,v_n,v_deadline),'identical issuance idempotent');
 PERFORM pg_temp.check_true(NOT public.bfa_p5_voice_register_issuance(v_owner_id,v_thread_id,v_incarnation,0,v_fingerprint,v_n,v_deadline+1),'issuance cannot extend existing fingerprint');
 PERFORM pg_temp.check_true(NOT public.bfa_p5_voice_register_issuance(v_owner_id,v_thread_id,gen_random_uuid(),0,repeat('c',64),v_n,v_deadline),'wrong generation rejected');
 v_rejected:=false; BEGIN
  PERFORM public.bfa_p5_voice_register_issuance(v_owner_id,v_thread_id,v_incarnation,0,repeat('c',64),v_n,v_n+900001);
 EXCEPTION WHEN OTHERS THEN v_rejected:=true; END;
 PERFORM pg_temp.check_true(v_rejected,'issuance cannot exceed 15 minutes');
 v_claim:=jsonb_build_object('claimId',gen_random_uuid(),'expiresAt',v_deadline,'binding',jsonb_build_object(
  'ownerId',v_owner_id,'threadId',v_thread_id,'threadIncarnation',v_incarnation,'threadRevision',0,
  'attemptId',v_attempt_id,'approvalId',v_approval_id,'approvalDigest',repeat('b',64),'scope','developer-voice-session'));
 PERFORM public.bfa_p5_voice_register_cleanup(v_cleanup,v_claim);
 v_p:=pg_temp.proof(v_claim,v_cleanup,v_session_id,repeat('c',64),'claim',bfa_p5_voice.ms());
 PERFORM pg_temp.check_true(public.bfa_p5_voice_register_proof(v_p) IS NULL,'unregistered envelope fingerprint denied without backfill');
 v_p:=pg_temp.proof(v_claim,v_cleanup,v_session_id,v_fingerprint,'claim',bfa_p5_voice.ms());
 v_rejected:=false; BEGIN PERFORM public.bfa_p5_voice_register_proof(v_p-'identityExpiresAt'); EXCEPTION WHEN OTHERS THEN v_rejected:=true; END;
 PERFORM pg_temp.check_true(v_rejected,'missing proof field fails closed');
 v_rejected:=false; BEGIN PERFORM public.bfa_p5_voice_register_proof(v_p||jsonb_build_object('identityExpiresAt',NULL)); EXCEPTION WHEN OTHERS THEN v_rejected:=true; END;
 PERFORM pg_temp.check_true(v_rejected,'JSON null proof field fails closed');
 v_rejected:=false; BEGIN PERFORM public.bfa_p5_voice_register_proof(v_p||jsonb_build_object('sessionVersion',9007199254740992::numeric)); EXCEPTION WHEN OTHERS THEN v_rejected:=true; END;
 PERFORM pg_temp.check_true(v_rejected,'unsafe integer fails closed');
 v_rejected:=false; BEGIN PERFORM public.bfa_p5_voice_register_proof(v_p||jsonb_build_object('expiresAt',(v_p->>'verifiedAt')::bigint+30001)); EXCEPTION WHEN OTHERS THEN v_rejected:=true; END;
 PERFORM pg_temp.check_true(v_rejected,'operation receipt TTL separate and bounded');
 v_r:=public.bfa_p5_voice_register_proof(v_p);
 PERFORM pg_temp.check_true(v_r=jsonb_build_object('receiptId',v_p->'receiptId','operation','claim','claim',v_claim,'expiresAt',v_p->'expiresAt','effectiveExpiresAt',v_p->'effectiveExpiresAt'),'exact proof acknowledgment');
 v_rejected:=false; BEGIN PERFORM public.bfa_p5_voice_register_proof(v_p); EXCEPTION WHEN OTHERS THEN v_rejected:=true; END;
 PERFORM pg_temp.check_true(v_rejected,'receipt ID cannot be registered twice');
 v_r:=public.bfa_p5_voice_claim((v_p->>'receiptId')::uuid,v_claim);
 PERFORM pg_temp.check_true(v_r->>'state'='claimed','first claim succeeds');
 PERFORM pg_temp.check_true((SELECT q.remaining_units=0 FROM bfa_p5_voice.quotas q WHERE q.owner_id=(v_claim->'binding'->>'ownerId')::uuid),'claim reserves exactly one unit');
 v_r:=public.bfa_p5_voice_claim((v_p->>'receiptId')::uuid,v_claim);
 PERFORM pg_temp.check_true(v_r->>'state'='denied','receipt is single use');
 v_p:=pg_temp.proof(v_claim,v_cleanup,v_session_id,v_fingerprint,'inspect',bfa_p5_voice.ms());
 PERFORM public.bfa_p5_voice_register_proof(v_p);
 PERFORM pg_temp.check_true(public.bfa_p5_voice_claim((v_p->>'receiptId')::uuid,v_claim)->>'state'='denied','operation is exact');
 PERFORM pg_temp.check_true(public.bfa_p5_voice_inspect((v_p->>'receiptId')::uuid,v_claim)->>'state'='claimed','mismatched operation did not consume someone else receipt');
 INSERT INTO bfa_p5_voice.session_fences VALUES(v_owner_id,v_other_session,0,v_deadline,false);
 v_p:=pg_temp.proof(v_claim,v_cleanup,v_other_session,v_fingerprint,'inspect',bfa_p5_voice.ms());
 PERFORM pg_temp.check_true(public.bfa_p5_voice_register_proof(v_p) IS NULL,'another session cannot inherit exact existing claim');
 v_loser:=v_claim||jsonb_build_object('claimId',gen_random_uuid());
 PERFORM public.bfa_p5_voice_register_cleanup(v_loser_cleanup,v_loser);
 v_p:=pg_temp.proof(v_loser,v_loser_cleanup,v_session_id,v_fingerprint,'claim',bfa_p5_voice.ms()); PERFORM public.bfa_p5_voice_register_proof(v_p);
 PERFORM pg_temp.check_true(public.bfa_p5_voice_claim((v_p->>'receiptId')::uuid,v_loser)->>'state'='replayed','owner-attempt admits one winner');
 PERFORM public.bfa_p5_voice_close(v_loser_cleanup,v_loser);
 PERFORM pg_temp.check_true((SELECT state='claimed' AND held_units=1 FROM bfa_p5_voice.claims WHERE claim_id=(v_claim->>'claimId')::uuid),'losing close leaves winner and hold intact');
 v_changed:=v_claim||jsonb_build_object('expiresAt',v_deadline-1);
 v_rejected:=false; BEGIN PERFORM public.bfa_p5_voice_close(v_cleanup,v_changed); EXCEPTION WHEN OTHERS THEN v_rejected:=true; END;
 PERFORM pg_temp.check_true(v_rejected,'same claim ID with changed original expiry cannot close');
 v_second_claim:=jsonb_set(v_claim||jsonb_build_object('claimId',gen_random_uuid()),'{binding,attemptId}',to_jsonb(gen_random_uuid()));
 v_second_claim:=jsonb_set(v_second_claim,'{binding,approvalId}',to_jsonb(gen_random_uuid()));
 INSERT INTO bfa_p5_voice.approvals SELECT (v_second_claim->'binding'->>'approvalId')::uuid,repeat('b',64),v_owner_id,v_thread_id,v_incarnation,0,(v_second_claim->'binding'->>'attemptId')::uuid,'developer-voice-session',v_deadline,false,v_policy_id;
 v_r:=public.bfa_p5_voice_register_cleanup(gen_random_uuid(),v_second_claim);
 v_p:=pg_temp.proof(v_second_claim,(v_r->>'cleanupId')::uuid,v_session_id,v_fingerprint,'claim',bfa_p5_voice.ms()); PERFORM public.bfa_p5_voice_register_proof(v_p);
 PERFORM pg_temp.check_true(public.bfa_p5_voice_claim((v_p->>'receiptId')::uuid,v_second_claim)->>'state'='denied','last quota unit cannot be reserved twice');
 -- Trusted current deadline shortens after an earlier proof. Semantic denial
 -- must retain the observation, even if an administrator later extends the row.
 UPDATE bfa_p5_voice.approvals SET expires_ms=bfa_p5_voice.ms()-1 WHERE approval_id=(v_second_claim->'binding'->>'approvalId')::uuid;
 v_p:=pg_temp.proof(v_second_claim,(v_r->>'cleanupId')::uuid,v_session_id,v_fingerprint,'claim',bfa_p5_voice.ms());
 PERFORM pg_temp.check_true(public.bfa_p5_voice_register_proof(v_p) IS NULL,'shortened current approval denies and persists');
 PERFORM pg_temp.check_true((SELECT expired_ms IS NOT NULL AND effective_expires_ms<v_deadline FROM bfa_p5_voice.cleanup_owners WHERE claim_id=(v_second_claim->>'claimId')::uuid),'expired current record terminally fences cleanup');
 UPDATE bfa_p5_voice.approvals SET expires_ms=v_deadline WHERE approval_id=(v_second_claim->'binding'->>'approvalId')::uuid;
 v_p:=pg_temp.proof(v_second_claim,(v_r->>'cleanupId')::uuid,v_session_id,v_fingerprint,'claim',bfa_p5_voice.ms());
 PERFORM pg_temp.check_true(public.bfa_p5_voice_register_proof(v_p) IS NULL,'later longer authority cannot revive observed expiry');
 v_closed_claim:=jsonb_set(v_second_claim||jsonb_build_object('claimId',gen_random_uuid()),'{binding,attemptId}',to_jsonb(gen_random_uuid()));
 PERFORM public.bfa_p5_voice_close(v_closed_cleanup,v_closed_claim);
 PERFORM public.bfa_p5_voice_register_cleanup(v_closed_cleanup,v_closed_claim);
 PERFORM pg_temp.check_true((SELECT closed_ms IS NOT NULL FROM bfa_p5_voice.cleanup_owners WHERE cleanup_id=v_closed_cleanup),'late cleanup registration cannot revive close');
 PERFORM pg_temp.check_true((SELECT retired AND winner_claim_id IS NULL FROM bfa_p5_voice.attempts WHERE bfa_p5_voice.attempts.owner_id=(v_closed_claim->'binding'->>'ownerId')::uuid AND bfa_p5_voice.attempts.attempt_id=(v_closed_claim->'binding'->>'attemptId')::uuid),'close before claim retires unused attempt');
 PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM bfa_p5_voice.claims WHERE claim_id=(v_closed_claim->>'claimId')::uuid),'close created no quota claim');
 -- Current P3b Stop/Delete revision, not an independently maintained shadow.
 UPDATE public.bfa_p3b_threads SET revision=revision+1 WHERE id=v_thread_id;
 v_p:=pg_temp.proof(v_claim,v_cleanup,v_session_id,v_fingerprint,'inspect',bfa_p5_voice.ms());
 PERFORM pg_temp.check_true(public.bfa_p5_voice_register_proof(v_p) IS NULL,'current P3b revision fences old authority');
 -- Deliberately restoring a row here is fixture fault injection, not a proposed
 -- product lifecycle. Its old admission must remain terminally invalidated.
 UPDATE public.bfa_p3b_threads SET revision=revision-1 WHERE id=v_thread_id;
 v_p:=pg_temp.proof(v_claim,v_cleanup,v_session_id,v_fingerprint,'inspect',bfa_p5_voice.ms());
 PERFORM pg_temp.check_true(public.bfa_p5_voice_register_proof(v_p) IS NULL,'restoring source revision cannot revive old admission');
 v_rejected:=false; BEGIN DELETE FROM public.bfa_p3b_threads WHERE id=v_thread_id; EXCEPTION WHEN foreign_key_violation THEN v_rejected:=true; END;
 PERFORM pg_temp.check_true(v_rejected,'registered physical thread identity cannot be deleted and reused');
 -- Simulate a previously committed later clock observation. This does not
 -- change the system clock and is narrower than a real clock-adjustment test.
 UPDATE bfa_p5_voice.owner_clocks SET observed_ms=bfa_p5_voice.ms()+60000 WHERE owner_id=v_owner_id;
 PERFORM pg_temp.check_true(bfa_p5_voice.observe_now(v_owner_id) IS NULL,'backward clock relative to durable watermark denies');
 UPDATE bfa_p5_voice.session_fences SET revoked=true WHERE bfa_p5_voice.session_fences.owner_id=(v_claim->'binding'->>'ownerId')::uuid;
 UPDATE public.bfa_p3b_staging_accounts SET admitted=false WHERE user_id=(v_claim->'binding'->>'ownerId')::uuid;
 PERFORM pg_temp.check_true(public.bfa_p5_voice_close(v_cleanup,v_claim)->>'state'='closed','trusted cleanup after revocation');
 PERFORM pg_temp.check_true(public.bfa_p5_voice_close(v_cleanup,v_claim)->>'state'='closed','close idempotent');
 PERFORM pg_temp.check_true((SELECT held_units=1 FROM bfa_p5_voice.claims WHERE claim_id=(v_claim->>'claimId')::uuid),'close retains hold');
END $$;
-- Privilege catalogue checks are narrower than real transport/role acceptance.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT v_p.oid FROM pg_proc v_p JOIN pg_namespace v_n ON v_n.oid=v_p.pronamespace WHERE v_n.nspname='public' AND v_p.proname LIKE 'bfa_p5_voice_%' LOOP
  PERFORM pg_temp.check_true(NOT has_function_privilege('anon',f.oid,'EXECUTE'),'anonymous cannot invoke RPC');
  PERFORM pg_temp.check_true(NOT has_function_privilege('authenticated',f.oid,'EXECUTE'),'authenticated cannot invoke RPC');
  PERFORM pg_temp.check_true(has_function_privilege('service_role',f.oid,'EXECUTE'),'service role can invoke RPC');
 END LOOP;
END $$;
ROLLBACK;
-- Still required: two-process barriers/lock-wait tests, injected transport loss,
-- actual service-role/HTTP calls, Auth revocation integration and provider gates.
