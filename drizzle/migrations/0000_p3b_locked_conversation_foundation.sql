-- P3b isolated foundation. No participant admission, identities, content seeds,
-- public policies, provider connection or automatic durable transcript writes.
CREATE TABLE public.bfa_p3b_staging_accounts (
  user_id uuid PRIMARY KEY,
  admitted boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bfa_p3b_staging_accounts TO service_role;
ALTER TABLE public.bfa_p3b_staging_accounts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.bfa_p3b_staging_accounts IS 'P3b fictional staging allowlist only; no rows admitted by default. No browser grants or policies until verified staging adapter is implemented.';

CREATE TABLE public.bfa_p3b_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  deleted_at timestamptz,
  saved_snapshot jsonb,
  saved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((saved_snapshot IS NULL AND saved_at IS NULL) OR (saved_snapshot IS NOT NULL AND saved_at IS NOT NULL)),
  CHECK (deleted_at IS NULL OR saved_snapshot IS NULL)
);
GRANT ALL ON public.bfa_p3b_threads TO service_role;
ALTER TABLE public.bfa_p3b_threads ENABLE ROW LEVEL SECURITY;
CREATE INDEX bfa_p3b_threads_owner_idx ON public.bfa_p3b_threads(owner_id);
COMMENT ON COLUMN public.bfa_p3b_threads.saved_snapshot IS 'Only deliberate confirmed save may write validated service-owned snapshot; never active per-turn content. Locked preparation: no writer implemented.';
COMMENT ON COLUMN public.bfa_p3b_threads.deleted_at IS 'Non-content tombstone retained to reject stale save, admission and reopen; deletion nulls snapshot.';

CREATE TABLE public.bfa_p3b_allowances (
  owner_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('text','voice')),
  remaining_units bigint NOT NULL DEFAULT 0 CHECK (remaining_units >= 0 AND remaining_units <= 9007199254740991),
  reservation_units bigint NOT NULL DEFAULT 1 CHECK (reservation_units > 0 AND reservation_units <= 9007199254740991),
  PRIMARY KEY (owner_id, mode)
);
GRANT ALL ON public.bfa_p3b_allowances TO service_role;
ALTER TABLE public.bfa_p3b_allowances ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.bfa_p3b_allowances IS 'New isolated namespace: integer fictional test units only, not money or paid authorization. Zero seeded allowances; never references v5.';

CREATE TABLE public.bfa_p3b_admissions (
  owner_id uuid NOT NULL,
  request_id uuid NOT NULL,
  thread_id uuid NOT NULL REFERENCES public.bfa_p3b_threads(id),
  thread_revision bigint NOT NULL CHECK (thread_revision >= 0),
  mode text NOT NULL CHECK (mode IN ('text','voice')),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  reserved_units bigint NOT NULL CHECK (reserved_units > 0 AND reserved_units <= 9007199254740991),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','dispatched','uncertain','settled','cancelled-before-dispatch')),
  receipt_id uuid,
  charged_units bigint CHECK (charged_units >= 0 AND charged_units <= reserved_units),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, request_id),
  UNIQUE (receipt_id),
  CHECK ((state = 'settled' AND receipt_id IS NOT NULL AND charged_units IS NOT NULL) OR (state <> 'settled' AND receipt_id IS NULL AND charged_units IS NULL))
);
GRANT ALL ON public.bfa_p3b_admissions TO service_role;
ALTER TABLE public.bfa_p3b_admissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX bfa_p3b_admissions_thread_idx ON public.bfa_p3b_admissions(thread_id);
COMMENT ON TABLE public.bfa_p3b_admissions IS 'Content-free evidence only. No message/response/excerpt/log payload. Atomic reservation/claim/reconciliation RPCs are not yet implemented: this schema alone proves no concurrency behavior.';