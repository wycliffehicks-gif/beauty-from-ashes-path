CREATE OR REPLACE FUNCTION public.bfa_p3b_is_staging() RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.bfa_p3b_staging_accounts WHERE user_id=auth.uid() AND admitted AND expires_at>clock_timestamp()) $$;
REVOKE ALL ON FUNCTION public.bfa_p3b_is_staging() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bfa_p3b_is_staging() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.bfa_p3b_assert_staging(p_owner uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE a public.bfa_p3b_staging_accounts; BEGIN
 IF p_owner IS NULL THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.bfa_p3b_staging_accounts WHERE user_id=p_owner FOR SHARE;
 IF NOT FOUND OR a.admitted IS DISTINCT FROM true OR a.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.bfa_p3b_assert_staging(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bfa_p3b_assert_staging(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.bfa_p3b_guard(p_owner uuid,p_thread uuid) RETURNS public.bfa_p3b_threads LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t public.bfa_p3b_threads; BEGIN
 IF p_owner IS NULL OR p_thread IS NULL THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 PERFORM public.bfa_p3b_assert_staging(p_owner);
 SELECT * INTO t FROM public.bfa_p3b_threads WHERE id=p_thread AND owner_id=p_owner AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 -- Lock wait may cross real expiry: recheck actual clock after the thread lock.
 PERFORM public.bfa_p3b_assert_staging(p_owner);
 RETURN t; END $$;
REVOKE ALL ON FUNCTION public.bfa_p3b_guard(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bfa_p3b_guard(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.bfa_p3b_create(p_owner uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v uuid; BEGIN
 IF p_owner IS NULL THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0)); PERFORM public.bfa_p3b_assert_staging(p_owner);
 INSERT INTO public.bfa_p3b_threads(owner_id) VALUES(p_owner) RETURNING id INTO v; RETURN v; END $$;
REVOKE ALL ON FUNCTION public.bfa_p3b_create(uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.bfa_p3b_create(uuid) TO service_role;
-- Forward replacement preserves existing transactional algorithms, signatures and grants.
-- All entry points acquire the same owner lock, including settlement after deletion.
DO $$ DECLARE sig text; def text; guard text; BEGIN
 FOREACH sig IN ARRAY ARRAY['public.bfa_p3b_transition(uuid,uuid,bigint,text,jsonb)','public.bfa_p3b_reserve(uuid,uuid,bigint,uuid,text,text)','public.bfa_p3b_claim(uuid,uuid,bigint,uuid,text,text)','public.bfa_p3b_finish(uuid,uuid,bigint,uuid)','public.bfa_p3b_settle(uuid,uuid,uuid,bigint)'] LOOP
  def:=pg_get_functiondef(sig::regprocedure);
  IF sig LIKE '%settle%' THEN
   guard:='IF p_owner IS NULL OR p_request IS NULL OR p_receipt IS NULL OR p_charged IS NULL OR p_charged<0 THEN RAISE EXCEPTION ''Invalid arguments'' USING ERRCODE=''P0001''; END IF;';
  ELSIF sig LIKE '%transition%' THEN
   guard:='IF p_owner IS NULL OR p_thread IS NULL OR p_revision IS NULL OR p_revision<0 OR p_action IS NULL OR p_action NOT IN (''advance'',''save'',''discard'',''reopen'',''delete'',''cancel'') OR (p_action<>''save'' AND p_snapshot IS NOT NULL) OR (p_action=''save'' AND (p_snapshot IS NULL OR jsonb_typeof(p_snapshot)<>''string'' OR octet_length(p_snapshot::text)>250000)) THEN RAISE EXCEPTION ''Invalid arguments'' USING ERRCODE=''P0001''; END IF;';
  ELSIF sig LIKE '%finish%' THEN
   guard:='IF p_owner IS NULL OR p_thread IS NULL OR p_revision IS NULL OR p_revision<0 OR p_request IS NULL THEN RAISE EXCEPTION ''Invalid arguments'' USING ERRCODE=''P0001''; END IF;';
  ELSE
   guard:='IF p_owner IS NULL OR p_thread IS NULL OR p_revision IS NULL OR p_revision<0 OR p_request IS NULL OR p_mode IS NULL OR p_mode NOT IN (''text'',''voice'') OR p_fingerprint IS NULL OR p_fingerprint !~ ''^[0-9a-f]{64}$'' THEN RAISE EXCEPTION ''Invalid arguments'' USING ERRCODE=''P0001''; END IF;';
  END IF;
  def:=regexp_replace(def,'BEGIN','BEGIN '||guard||' PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));');
  IF sig LIKE '%transition%' THEN def:=replace(def,'state IN (''reserved'',''dispatched'') FOR UPDATE LOOP','state IN (''reserved'',''dispatched'') ORDER BY request_id FOR UPDATE LOOP'); END IF;
  EXECUTE def;
 END LOOP;
END $$;