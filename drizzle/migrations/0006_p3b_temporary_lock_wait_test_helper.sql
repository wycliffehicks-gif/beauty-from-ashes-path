-- TEMPORARY staging-only test helper (authorized by Carl, removed by the next migration).
-- Holds the same per-owner transaction lock used by every P3b entry point for a bounded time,
-- reads no content and mutates nothing. Service role only.
CREATE OR REPLACE FUNCTION public.bfa_p3b_test_hold_owner_lock(p_owner uuid, p_seconds numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_owner IS NULL OR p_seconds IS NULL OR p_seconds <= 0 OR p_seconds > 6 THEN
    RAISE EXCEPTION 'Invalid arguments' USING ERRCODE='P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
  PERFORM pg_sleep(p_seconds);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.bfa_p3b_test_hold_owner_lock(uuid,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bfa_p3b_test_hold_owner_lock(uuid,numeric) TO service_role;