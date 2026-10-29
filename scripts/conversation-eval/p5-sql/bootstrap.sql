-- Isolated local fixture prerequisites ONLY. No real Auth identity is created.
-- Fresh disposable database; never install these roles/stubs in the app project.
DO $$ BEGIN
 IF current_database()<>'bfa_p5_offline_fixture' THEN
  RAISE EXCEPTION 'Disposable fixture database required';
 END IF;
END $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
COMMENT ON FUNCTION auth.uid() IS 'Local test stub: never authenticates anyone. Not Auth integration evidence.';
