CREATE OR REPLACE FUNCTION public.bfa_p3b_fence(p_owner uuid,p_thread uuid,p_action text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t public.bfa_p3b_threads; BEGIN
 IF p_action IS NULL OR p_action NOT IN ('cancel','delete') THEN RAISE EXCEPTION 'Invalid arguments' USING ERRCODE='P0001'; END IF;
 t:=public.bfa_p3b_guard(p_owner,p_thread);
 -- Explicit Stop/Delete operates on the locked current revision, not a retry of a send.
 RETURN public.bfa_p3b_transition(p_owner,p_thread,t.revision,p_action,NULL);
END $$;
REVOKE ALL ON FUNCTION public.bfa_p3b_fence(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bfa_p3b_fence(uuid,uuid,text) TO service_role;