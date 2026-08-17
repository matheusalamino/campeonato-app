-- =============================================================================
-- Migration: Public Player Registration
-- Adds the `rest` status, per-championship registration config, registration
-- fields, and storage buckets/policies for public uploads.
-- =============================================================================
BEGIN;

-- 1. Extend the status CHECK to include `rest`
ALTER TABLE public.championships DROP CONSTRAINT IF EXISTS chk_championship_status;
ALTER TABLE public.championships
  ADD CONSTRAINT chk_championship_status
  CHECK (status IN ('draft','active','subscribing','subscribed','in_progress','completed','rest'));

-- 2. Championship registration config
ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS slug                        text,
  ADD COLUMN IF NOT EXISTS registration_image_url      text,
  ADD COLUMN IF NOT EXISTS base_price                  numeric,
  ADD COLUMN IF NOT EXISTS extra_ticket_price          numeric,
  ADD COLUMN IF NOT EXISTS registration_group_options  jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS championships_slug_key
  ON public.championships (slug) WHERE slug IS NOT NULL;

-- 3. Player identity fields
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS shirt_name  text,
  ADD COLUMN IF NOT EXISTS birth_state text;

-- 4. Per-registration fields
ALTER TABLE public.championship_registrations
  ADD COLUMN IF NOT EXISTS is_waitlist          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_affiliation    text,
  ADD COLUMN IF NOT EXISTS invite_code          text,
  ADD COLUMN IF NOT EXISTS extra_tickets_count  int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tickets_total        numeric,
  ADD COLUMN IF NOT EXISTS payment_receipt_link text,
  ADD COLUMN IF NOT EXISTS payment_verified     boolean NOT NULL DEFAULT false;

-- Prevent duplicate active registrations for the same player in a championship
CREATE UNIQUE INDEX IF NOT EXISTS championship_registrations_player_champ_key
  ON public.championship_registrations (championship_id, player_id);

-- 5. Storage buckets
INSERT INTO storage.buckets (id, name, public)
  VALUES ('registration-photos','registration-photos', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public)
  VALUES ('registration-docs','registration-docs', false)
  ON CONFLICT (id) DO NOTHING;

-- 6. Storage policies: scoped anon upload; public read only for photos; docs read = admin
DROP POLICY IF EXISTS "reg photos anon insert" ON storage.objects;
CREATE POLICY "reg photos anon insert" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'registration-photos');

DROP POLICY IF EXISTS "reg photos public read" ON storage.objects;
CREATE POLICY "reg photos public read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'registration-photos');

DROP POLICY IF EXISTS "reg docs anon insert" ON storage.objects;
CREATE POLICY "reg docs anon insert" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'registration-docs');

DROP POLICY IF EXISTS "reg docs admin read" ON storage.objects;
CREATE POLICY "reg docs admin read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'registration-docs' AND public.is_admin());

COMMIT;
