-- TEMPORARY staging-only test helper (authorized by Carl; removed by the next migration).
-- Holds ONLY one thread row lock (no owner advisory lock) for a bounded time; reads no content, mutates nothing. Service role only.
CREATE OR REPLACE FUNCTION public.bfa_p3b_test_hold_thread_row(p_thread uuid, p_seconds numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_thread IS NULL OR p_seconds IS NULL OR p_seconds <= 0 OR p_seconds > 6 THEN
    RAISE EXCEPTION 'Invalid arguments' USING ERRCODE='P0001';
  END IF;
  PERFORM 1 FROM public.bfa_p3b_threads WHERE id=p_thread FOR UPDATE;
  PERFORM pg_sleep(p_seconds);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.bfa_p3b_test_hold_thread_row(uuid,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bfa_p3b_test_hold_thread_row(uuid,numeric) TO service_role;