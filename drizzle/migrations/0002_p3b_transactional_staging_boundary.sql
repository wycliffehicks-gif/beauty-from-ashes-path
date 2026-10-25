-- All browser table writes remain revoked. RPCs that accept state are service-only.
ALTER TABLE public.bfa_p3b_threads ADD COLUMN saved_revision bigint;
CREATE OR REPLACE FUNCTION public.bfa_p3b_is_staging() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.bfa_p3b_staging_accounts WHERE user_id = auth.uid() AND admitted AND expires_at > now()) $$;
REVOKE ALL ON FUNCTION public.bfa_p3b_is_staging() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bfa_p3b_is_staging() TO authenticated, service_role;
GRANT SELECT ON public.bfa_p3b_threads TO authenticated;
CREATE POLICY p3b_owner_read ON public.bfa_p3b_threads FOR SELECT TO authenticated USING (owner_id = auth.uid() AND public.bfa_p3b_is_staging() AND deleted_at IS NULL);
CREATE OR REPLACE FUNCTION public.bfa_p3b_guard(p_owner uuid, p_thread uuid) RETURNS public.bfa_p3b_threads LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE t public.bfa_p3b_threads; BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.bfa_p3b_staging_accounts WHERE user_id=p_owner AND admitted AND expires_at>now()) THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.bfa_p3b_threads WHERE id=p_thread AND owner_id=p_owner AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF; RETURN t; END $$;
REVOKE ALL ON FUNCTION public.bfa_p3b_guard(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bfa_p3b_guard(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.bfa_p3b_create(p_owner uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v uuid; BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.bfa_p3b_staging_accounts WHERE user_id=p_owner AND admitted AND expires_at>now()) THEN RAISE EXCEPTION 'Unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO public.bfa_p3b_threads(owner_id) VALUES(p_owner) RETURNING id INTO v; RETURN v; END $$;
REVOKE ALL ON FUNCTION public.bfa_p3b_create(uuid) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.bfa_p3b_create(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.bfa_p3b_transition(p_owner uuid,p_thread uuid,p_revision bigint,p_action text,p_snapshot jsonb DEFAULT NULL) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE t public.bfa_p3b_threads; a public.bfa_p3b_admissions; BEGIN
 t:=public.bfa_p3b_guard(p_owner,p_thread);
 IF t.revision<>p_revision THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001'; END IF;
 IF p_action NOT IN ('advance','save','discard','reopen','delete','cancel') THEN RAISE EXCEPTION 'Invalid action'; END IF;
 IF p_action='save' AND (p_snapshot IS NULL OR octet_length(p_snapshot::text)>250000) THEN RAISE EXCEPTION 'Invalid snapshot'; END IF;
 UPDATE public.bfa_p3b_threads SET revision=revision+1,
 saved_snapshot=CASE WHEN p_action='delete' THEN NULL WHEN p_action='save' THEN p_snapshot ELSE saved_snapshot END,
 saved_at=CASE WHEN p_action='delete' THEN NULL WHEN p_action='save' THEN now() ELSE saved_at END,
 saved_revision=CASE WHEN p_action='delete' THEN NULL WHEN p_action='save' THEN revision+1 ELSE saved_revision END,
 deleted_at=CASE WHEN p_action='delete' THEN now() ELSE deleted_at END WHERE id=p_thread;
 FOR a IN SELECT * FROM public.bfa_p3b_admissions WHERE thread_id=p_thread AND state IN ('reserved','dispatched') FOR UPDATE LOOP
 IF a.state='reserved' THEN UPDATE public.bfa_p3b_allowances SET remaining_units=remaining_units+a.reserved_units WHERE owner_id=a.owner_id AND mode=a.mode; END IF;
 UPDATE public.bfa_p3b_admissions SET state=CASE WHEN a.state='reserved' THEN 'cancelled-before-dispatch' ELSE 'uncertain' END,updated_at=now() WHERE owner_id=a.owner_id AND request_id=a.request_id;
 END LOOP;
 RETURN p_revision+1; END $$;
REVOKE ALL ON FUNCTION public.bfa_p3b_transition(uuid,uuid,bigint,text,jsonb) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.bfa_p3b_transition(uuid,uuid,bigint,text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.bfa_p3b_reserve(p_owner uuid,p_thread uuid,p_revision bigint,p_request uuid,p_mode text,p_fingerprint text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE t public.bfa_p3b_threads; a public.bfa_p3b_admissions; b public.bfa_p3b_allowances; BEGIN
 -- Serialize an owner's request identity across all threads before inspecting the ledger.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 t:=public.bfa_p3b_guard(p_owner,p_thread);
 SELECT * INTO a FROM public.bfa_p3b_admissions WHERE owner_id=p_owner AND request_id=p_request FOR UPDATE;
 IF FOUND THEN
 IF a.thread_id<>p_thread OR a.thread_revision<>p_revision OR a.mode<>p_mode OR a.fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('duplicate',true,'state',a.state); END IF;
 IF t.revision<>p_revision THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001'; END IF;
 SELECT * INTO b FROM public.bfa_p3b_allowances WHERE owner_id=p_owner AND mode=p_mode FOR UPDATE;
 IF NOT FOUND OR b.remaining_units<b.reservation_units THEN RAISE EXCEPTION 'Limit'; END IF;
 UPDATE public.bfa_p3b_allowances SET remaining_units=remaining_units-b.reservation_units WHERE owner_id=p_owner AND mode=p_mode;
 INSERT INTO public.bfa_p3b_admissions(owner_id,request_id,thread_id,thread_revision,mode,fingerprint,reserved_units) VALUES(p_owner,p_request,p_thread,p_revision,p_mode,p_fingerprint,b.reservation_units);
 RETURN jsonb_build_object('duplicate',false,'state','reserved'); END $$;
REVOKE ALL ON FUNCTION public.bfa_p3b_reserve(uuid,uuid,bigint,uuid,text,text) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.bfa_p3b_reserve(uuid,uuid,bigint,uuid,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.bfa_p3b_claim(p_owner uuid,p_thread uuid,p_revision bigint,p_request uuid,p_mode text,p_fingerprint text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE t public.bfa_p3b_threads; n integer; BEGIN
 t:=public.bfa_p3b_guard(p_owner,p_thread); IF t.revision<>p_revision THEN RETURN false; END IF;
 UPDATE public.bfa_p3b_admissions SET state='dispatched',updated_at=now() WHERE owner_id=p_owner AND request_id=p_request AND thread_id=p_thread AND thread_revision=p_revision AND mode=p_mode AND fingerprint=p_fingerprint AND state='reserved'; GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1; END $$;
REVOKE ALL ON FUNCTION public.bfa_p3b_claim(uuid,uuid,bigint,uuid,text,text) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.bfa_p3b_claim(uuid,uuid,bigint,uuid,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.bfa_p3b_settle(p_owner uuid,p_request uuid,p_receipt uuid,p_charged bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE a public.bfa_p3b_admissions; BEGIN
 -- Trusted server reconciliation remains possible after deletion/revocation. No content is read.
 SELECT * INTO a FROM public.bfa_p3b_admissions WHERE owner_id=p_owner AND request_id=p_request FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF a.state='settled' THEN RETURN a.receipt_id=p_receipt AND a.charged_units=p_charged; END IF;
 IF a.state NOT IN ('dispatched','uncertain') OR p_charged<0 OR p_charged>a.reserved_units THEN RETURN false; END IF;
 UPDATE public.bfa_p3b_admissions SET state='settled',receipt_id=p_receipt,charged_units=p_charged,updated_at=now() WHERE owner_id=p_owner AND request_id=p_request;
 UPDATE public.bfa_p3b_allowances SET remaining_units=remaining_units+a.reserved_units-p_charged WHERE owner_id=p_owner AND mode=a.mode; RETURN true; END $$;
REVOKE ALL ON FUNCTION public.bfa_p3b_settle(uuid,uuid,uuid,bigint) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.bfa_p3b_settle(uuid,uuid,uuid,bigint) TO service_role;
CREATE OR REPLACE FUNCTION public.bfa_p3b_finish(p_owner uuid,p_thread uuid,p_revision bigint,p_request uuid) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE t public.bfa_p3b_threads; BEGIN
 t:=public.bfa_p3b_guard(p_owner,p_thread);
 IF t.revision<>p_revision OR NOT EXISTS(SELECT 1 FROM public.bfa_p3b_admissions WHERE owner_id=p_owner AND request_id=p_request AND thread_id=p_thread AND thread_revision=p_revision AND state='settled') THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001'; END IF;
 UPDATE public.bfa_p3b_threads SET revision=revision+1 WHERE id=p_thread; RETURN p_revision+1; END $$;
REVOKE ALL ON FUNCTION public.bfa_p3b_finish(uuid,uuid,bigint,uuid) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.bfa_p3b_finish(uuid,uuid,bigint,uuid) TO service_role;
COMMENT ON TABLE public.bfa_p3b_admissions IS 'Content-free fictional integer-unit ledger. Service-only transactional reserve/claim/settle; uncertain dispatch is never automatically refunded. No provider connected.';