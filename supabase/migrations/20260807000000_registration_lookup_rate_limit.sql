BEGIN;
CREATE TABLE IF NOT EXISTS public.registration_lookup_attempts (
  id           bigserial PRIMARY KEY,
  ip           text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS registration_lookup_attempts_ip_time
  ON public.registration_lookup_attempts (ip, attempted_at);
ALTER TABLE public.registration_lookup_attempts ENABLE ROW LEVEL SECURITY;
-- No policies → anon/authenticated have no access; only the service-role client (which bypasses RLS) reads/writes.
COMMIT;
