-- Actual SET ROLE checks of the offline capacity extension, not HTTP/Auth.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'bfa_p5_offline_fixture' THEN RAISE EXCEPTION 'Disposable fixture database required'; END IF;
END $$;
CREATE FUNCTION pg_temp.capacity_role_check(p_value boolean,p_case text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF p_value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Capacity role fixture failed: %',p_case; END IF;
 RAISE NOTICE 'P5_CAPACITY_ROLE_PASS:%',p_case;
END $$;
DO $$
DECLARE role_name text; f record; tab record; stmt text; first_column text; denied boolean; signatures integer:=0;
BEGIN
 FOR f IN SELECT p.oid, p.proname, p.prosecdef, p.proconfig,
   array_to_string(ARRAY(SELECT 'NULL::'||v::regtype::text FROM unnest(p.proargtypes::oid[]) AS v),',') AS args
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'bfa_p5_capacity_%' ORDER BY p.proname LOOP
  signatures:=signatures+1;
  PERFORM pg_temp.capacity_role_check(f.prosecdef AND 'search_path=pg_catalog, pg_temp'=ANY(f.proconfig),
    'fixed definer path '||f.proname);
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
   EXECUTE format('SET LOCAL ROLE %I',role_name);
   IF current_user<>role_name THEN RAISE EXCEPTION 'Role switch failed'; END IF;
   denied:=false;
   BEGIN EXECUTE format('SELECT public.%I(%s)',f.proname,f.args);
   EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
   RESET ROLE;
   PERFORM pg_temp.capacity_role_check(denied AND NOT has_function_privilege(role_name,f.oid,'EXECUTE'),
     role_name||' denied RPC '||f.proname);
  END LOOP;
 END LOOP;
 PERFORM pg_temp.capacity_role_check(signatures=5,'exact five public capacity RPCs');
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  FOR tab IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname='bfa_p5_capacity' ORDER BY tablename LOOP
   SELECT a.attname INTO first_column FROM pg_attribute a
    WHERE a.attrelid=format('%I.%I',tab.schemaname,tab.tablename)::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 1;
   FOREACH stmt IN ARRAY ARRAY[
    format('SELECT * FROM bfa_p5_capacity.%I',tab.tablename),
    format('INSERT INTO bfa_p5_capacity.%I DEFAULT VALUES',tab.tablename),
    format('UPDATE bfa_p5_capacity.%I SET %I=%I WHERE false',tab.tablename,first_column,first_column),
    format('DELETE FROM bfa_p5_capacity.%I',tab.tablename)
   ] LOOP
    EXECUTE format('SET LOCAL ROLE %I',role_name);
    IF current_user<>role_name THEN RAISE EXCEPTION 'Role switch failed'; END IF;
    denied:=false;
    BEGIN EXECUTE stmt; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    RESET ROLE;
    PERFORM pg_temp.capacity_role_check(denied,role_name||' denied direct '||stmt);
   END LOOP;
  END LOOP;
  FOR f IN SELECT p.oid,p.proname,
    array_to_string(ARRAY(SELECT 'NULL::'||v::regtype::text FROM unnest(p.proargtypes::oid[]) AS v),',') AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='bfa_p5_capacity' ORDER BY p.proname LOOP
   EXECUTE format('SET LOCAL ROLE %I',role_name);
   IF current_user<>role_name THEN RAISE EXCEPTION 'Role switch failed'; END IF;
   denied:=false;
   BEGIN EXECUTE format('SELECT bfa_p5_capacity.%I(%s)',f.proname,f.args);
   EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
   RESET ROLE;
   PERFORM pg_temp.capacity_role_check(denied AND NOT has_function_privilege(role_name,f.oid,'EXECUTE'),
     role_name||' denied private helper '||f.proname);
  END LOOP;
 END LOOP;
 FOR tab IN SELECT c.oid,c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='bfa_p5_capacity' AND c.relkind='r' LOOP
  PERFORM pg_temp.capacity_role_check(tab.relrowsecurity AND NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=tab.oid),
    'RLS with no browser policies '||tab.relname);
 END LOOP;
END $$;
DO $$
DECLARE v_owner uuid:=gen_random_uuid(); v_thread uuid:=gen_random_uuid(); v_session uuid:=gen_random_uuid();
 v_incarnation uuid; v_approval uuid:=gen_random_uuid(); v_attempt uuid:=gen_random_uuid(); v_quota uuid:=gen_random_uuid();
 v_cleanup uuid:=gen_random_uuid(); v_pool uuid:=gen_random_uuid(); v_operation uuid:=gen_random_uuid();
 v_claim jsonb; v_proof jsonb; v_receipt jsonb; v_result jsonb; v_n bigint; v_deadline bigint; v_ok boolean;
BEGIN
 v_n:=bfa_p5_voice.ms(); v_deadline:=v_n+600000;
 INSERT INTO public.bfa_p3b_staging_accounts(user_id,admitted,expires_at) VALUES(v_owner,true,to_timestamp(v_deadline/1000.0));
 INSERT INTO public.bfa_p3b_threads(id,owner_id) VALUES(v_thread,v_owner);
 v_incarnation:=public.bfa_p5_voice_register_generation(v_owner,v_thread);
 INSERT INTO bfa_p5_voice.session_fences VALUES(v_owner,v_session,0,v_deadline,false);
 INSERT INTO bfa_p5_voice.quotas VALUES(v_owner,v_quota,5,1,true);
 INSERT INTO bfa_p5_voice.approvals VALUES(v_approval,repeat('d',64),v_owner,v_thread,v_incarnation,0,v_attempt,
  'developer-voice-session',v_deadline,false,v_quota);
 INSERT INTO bfa_p5_capacity.pools(pool_id,version,active_limit,unit_limit,reservation_units,enabled) VALUES(v_pool,1,1,5,1,true);
 INSERT INTO bfa_p5_capacity.routes(owner_id,quota_policy_id,pool_id) VALUES(v_owner,v_quota,v_pool);
 PERFORM public.bfa_p5_voice_register_issuance(v_owner,v_thread,v_incarnation,0,repeat('e',64),v_n,v_deadline);
 v_claim:=jsonb_build_object('claimId',gen_random_uuid(),'expiresAt',v_deadline,'binding',jsonb_build_object(
  'ownerId',v_owner,'threadId',v_thread,'threadIncarnation',v_incarnation,'threadRevision',0,'attemptId',v_attempt,
  'approvalId',v_approval,'approvalDigest',repeat('d',64),'scope','developer-voice-session'));
 PERFORM public.bfa_p5_voice_register_cleanup(v_cleanup,v_claim);
 v_n:=bfa_p5_voice.ms();
 v_proof:=jsonb_build_object('receiptId',gen_random_uuid(),'operation','claim','claim',v_claim,'cleanupId',v_cleanup,
  'ownerSessionId',v_session,'sessionVersion',0,'authorityFingerprint',repeat('e',64),'identityExpiresAt',v_deadline,
  'verifiedAt',v_n,'expiresAt',v_n+30000,'effectiveExpiresAt',v_deadline);
 SET LOCAL ROLE service_role;
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 v_receipt:=public.bfa_p5_voice_register_proof(v_proof);
 v_result:=public.bfa_p5_capacity_claim((v_proof->>'receiptId')::uuid,v_claim);
 RESET ROLE;
 PERFORM pg_temp.capacity_role_check(v_receipt IS NOT NULL AND v_result->>'state'='claimed','service claims with exact one hold through definer');
 PERFORM pg_temp.capacity_role_check((SELECT remaining_units=4 FROM bfa_p5_voice.quotas WHERE owner_id=v_owner AND policy_id=v_quota)
  AND (SELECT occupied=1 AND held_units=1 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),'one cumulative debit and one slot');
 v_n:=bfa_p5_voice.ms();
 v_proof:=v_proof||jsonb_build_object('receiptId',gen_random_uuid(),'operation','inspect','verifiedAt',v_n,'expiresAt',v_n+30000);
 SET LOCAL ROLE service_role;
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 v_receipt:=public.bfa_p5_voice_register_proof(v_proof);
 v_result:=public.bfa_p5_capacity_mark((v_proof->>'receiptId')::uuid,v_claim,v_operation,1);
 RESET ROLE;
 PERFORM pg_temp.capacity_role_check(v_receipt IS NOT NULL AND v_result->>'state'='marked','service marker checks fresh protected proof');
 SET LOCAL ROLE service_role;
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 v_result:=public.bfa_p5_capacity_close(v_cleanup,v_claim);
 RESET ROLE;
 PERFORM pg_temp.capacity_role_check(v_result->>'state'='closed' AND (SELECT occupied=1 AND held_units=1 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),
  'service close retains marked occupancy and units');
 SET LOCAL ROLE service_role;
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 v_result:=public.bfa_p5_capacity_reconcile(v_cleanup,v_claim,jsonb_build_object('operationId',v_operation,
  'evidenceId',gen_random_uuid(),'kind','ended','sessionId','fictional-role-session'));
 RESET ROLE;
 PERFORM pg_temp.capacity_role_check(v_result->>'state'='terminal-recorded','service reconciles normalized final operation evidence');
 PERFORM pg_temp.capacity_role_check((SELECT occupied=0 AND held_units=1 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool)
  AND (SELECT held_units=1 FROM bfa_p5_voice.claims WHERE claim_id=(v_claim->>'claimId')::uuid),'capacity release never refunds either retained unit record');
 SET LOCAL ROLE service_role;
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Role switch failed'; END IF;
 v_ok:=public.bfa_p5_capacity_policy(v_pool,1,0,0,false);
 RESET ROLE;
 PERFORM pg_temp.capacity_role_check(v_ok AND (SELECT version=2 AND active_limit=0 AND unit_limit=0 AND held_units=1 FROM bfa_p5_capacity.pools WHERE pool_id=v_pool),
  'service policy change preserves held units');
END $$;
ROLLBACK;
