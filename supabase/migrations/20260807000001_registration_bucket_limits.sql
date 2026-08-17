-- =============================================================================
-- Migration: Registration Bucket Limits
-- Constrains anonymous registration uploads: bounded file size + allowed MIME types only.
-- Photos: 5 MB, images only (JPEG, PNG, WebP)
-- Docs: 10 MB, images + PDF (for receipts/authorizations)
-- =============================================================================
BEGIN;

UPDATE storage.buckets
  SET file_size_limit = 5242880,  -- 5 MB
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
  WHERE id = 'registration-photos';

UPDATE storage.buckets
  SET file_size_limit = 10485760, -- 10 MB
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf']
  WHERE id = 'registration-docs';

COMMIT;
