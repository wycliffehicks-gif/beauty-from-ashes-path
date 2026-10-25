-- Newly provisioned Cloud defaults grant browser roles table privileges.
-- RLS with no policies already denies rows; explicitly remove privileges too.
REVOKE ALL ON public.bfa_p3b_staging_accounts FROM anon, authenticated;
REVOKE ALL ON public.bfa_p3b_threads FROM anon, authenticated;
REVOKE ALL ON public.bfa_p3b_allowances FROM anon, authenticated;
REVOKE ALL ON public.bfa_p3b_admissions FROM anon, authenticated;