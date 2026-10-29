-- Actual PostgreSQL SET ROLE execution; no HTTP/Auth integration is implied.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'bfa_p5_offline_fixture' THEN RAISE EXCEPTION 'Disposable fixture database required'; END IF;
END $$;
CREATE FUNCTION pg_temp.check_true(p_value boolean,p_case text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF p_value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Fixture failed: %',p_case; END IF;
 RAISE NOTICE 'BFA_SQL_PASS:%',p_case;
END $$;
DO $$
DECLARE role_name text; stmt text; rel text; denied boolean;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH stmt IN ARRAY ARRAY[
   'SELECT public.bfa_p5_voice_register_generation(NULL::uuid,NULL::uuid)',
   'SELECT public.bfa_p5_voice_register_issuance(NULL::uuid,NULL::uuid,NULL::uuid,NULL::bigint,NULL::text,NULL::bigint,NULL::bigint)',
   'SELECT public.bfa_p5_voice_register_cleanup(NULL::uuid,NULL::jsonb)',
   'SELECT public.bfa_p5_voice_register_proof(NULL::jsonb)',
   'SELECT public.bfa_p5_voice_claim(NULL::uuid,NULL::jsonb)',
   'SELECT public.bfa_p5_voice_inspect(NULL::uuid,NULL::jsonb)',
   'SELECT public.bfa_p5_voice_close(NULL::uuid,NULL::jsonb)'
  ] LOOP
   EXECUTE format('SET LOCAL ROLE %I',role_name);
   IF current_user<>role_name THEN RAISE EXCEPTION 'Role switch failed'; END IF;
   denied:=false;
   BEGIN EXECUTE stmt; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
   RESET ROLE;
   PERFORM pg_temp.check_true(denied,role_name||' denied RPC '||stmt);
  END LOOP;
 END LOOP;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  FOREACH rel IN ARRAY ARRAY['generations','owner_clocks','session_fences','issuances','quotas','approvals','cleanup_owners','proofs','attempts','claims'] LOOP
   FOREACH stmt IN ARRAY ARRAY[
    format('SELECT * FROM bfa_p5_voice.%I',rel),
    format('INSERT INTO bfa_p5_voice.%I DEFAULT VALUES',rel),
    format('UPDATE bfa_p5_voice.%I SET owner_id=owner_id',rel),
    format('DELETE FROM bfa_p5_voice.%I',rel)
   ] LOOP
    EXECUTE format('SET LOCAL ROLE %I',role_name);
   IF current_user<>role_name THEN RAISE EXCEPTION 'Role switch failed'; END IF;
    denied:=false;
    BEGIN EXECUTE stmt; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    RESET ROLE;
    PERFORM pg_temp.check_true(denied,role_name||' denied direct access '||stmt);
   END LOOP;
  END LOOP;
  EXECUTE format('SET LOCAL ROLE %I',role_name);
   IF current_user<>role_name THEN RAISE EXCEPTION 'Role switch failed'; END IF;
  denied:=false;
  BEGIN PERFORM bfa_p5_voice.ms(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  RESET ROLE;
  PERFORM pg_temp.check_true(denied,role_name||' denied private helper');
 END LOOP;
END $$;
DO $$
DECLARE owner_id uuid:=gen_random_uuid(); thread_id uuid:=gen_random_uuid(); session_id uuid:=gen_random_uuid();
 incarnation uuid; approval_id uuid:=gen_random_uuid(); attempt_id uuid:=gen_random_uuid(); policy_id uuid:=gen_random_uuid();
 cleanup_id uuid:=gen_random_uuid(); v_claim jsonb; proof jsonb; receipt jsonb; result jsonb; n bigint; deadline bigint;
BEGIN
 n:=bfa_p5_voice.ms(); deadline:=n+600000;
 INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES(owner_id,true,to_timestamp(deadline/1000.0));
 INSERT INTO public.bfa_p3b_threads(id,owner_id) VALUES(thread_id,owner_id);
 SET LOCAL ROLE service_role;
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service role switch failed'; END IF;
 incarnation:=public.bfa_p5_voice_register_generation(owner_id,thread_id);
 RESET ROLE;
 PERFORM pg_temp.check_true(incarnation IS NOT NULL,'service role creates generation through definer');
 INSERT INTO bfa_p5_voice.session_fences VALUES(owner_id,session_id,0,deadline,false);
 INSERT INTO bfa_p5_voice.quotas VALUES(owner_id,policy_id,1,1,true);
 INSERT INTO bfa_p5_voice.approvals VALUES(approval_id,repeat('d',64),owner_id,thread_id,incarnation,0,attempt_id,'developer-voice-session',deadline,false,policy_id);
 SET LOCAL ROLE service_role;
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service role switch failed'; END IF;
 IF public.bfa_p5_voice_register_issuance(owner_id,thread_id,incarnation,0,repeat('e',64),n,deadline) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Service issuance denied';
 END IF;
 RESET ROLE;
 PERFORM pg_temp.check_true(true,'service role registers trusted fixture issuance');
 v_claim:=jsonb_build_object('claimId',gen_random_uuid(),'expiresAt',deadline,'binding',jsonb_build_object(
 'ownerId',owner_id,'threadId',thread_id,'threadIncarnation',incarnation,'threadRevision',0,'attemptId',attempt_id,
 'approvalId',approval_id,'approvalDigest',repeat('d',64),'scope','developer-voice-session'));
 SET LOCAL ROLE service_role;
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service role switch failed'; END IF;
 result:=public.bfa_p5_voice_register_cleanup(cleanup_id,v_claim);
 RESET ROLE;
 PERFORM pg_temp.check_true(result=jsonb_build_object('cleanupId',cleanup_id,'claim',v_claim),'service role registers exact cleanup');
 n:=bfa_p5_voice.ms();
 proof:=jsonb_build_object('receiptId',gen_random_uuid(),'operation','claim','claim',v_claim,'cleanupId',cleanup_id,
 'ownerSessionId',session_id,'sessionVersion',0,'authorityFingerprint',repeat('e',64),'identityExpiresAt',deadline,
 'verifiedAt',n,'expiresAt',n+30000,'effectiveExpiresAt',deadline);
 SET LOCAL ROLE service_role;
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service role switch failed'; END IF;
 receipt:=public.bfa_p5_voice_register_proof(proof);
 result:=public.bfa_p5_voice_claim((proof->>'receiptId')::uuid,v_claim);
 RESET ROLE;
 PERFORM pg_temp.check_true(receipt->>'receiptId'=proof->>'receiptId','service role receives exact proof receipt');
 PERFORM pg_temp.check_true(result->>'state'='claimed','service role claims through definer without table access');
 n:=bfa_p5_voice.ms();
 proof:=proof||jsonb_build_object('receiptId',gen_random_uuid(),'operation','inspect','verifiedAt',n,'expiresAt',n+30000);
 SET LOCAL ROLE service_role;
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service role switch failed'; END IF;
 receipt:=public.bfa_p5_voice_register_proof(proof);
 result:=public.bfa_p5_voice_inspect((proof->>'receiptId')::uuid,v_claim);
 RESET ROLE;
 PERFORM pg_temp.check_true(receipt IS NOT NULL AND result->>'state'='claimed','service role inspects through definer');
 SET LOCAL ROLE service_role;
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Service role switch failed'; END IF;
 result:=public.bfa_p5_voice_close(cleanup_id,v_claim);
 RESET ROLE;
 PERFORM pg_temp.check_true(result->>'state'='closed','service role closes through definer');
 PERFORM pg_temp.check_true((SELECT c.state='closed' AND c.held_units=1 FROM bfa_p5_voice.claims c WHERE c.claim_id=(v_claim->>'claimId')::uuid),'role execution retains held unit on close');
END $$;
ROLLBACK;
