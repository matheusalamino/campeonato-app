-- =============================================================================
-- Migration: txid do PIX por inscricao
-- Cada inscricao gera seu proprio identificador de transacao. E ele que permite
-- conciliar o recebimento com o PSP depois, em vez de conferir comprovante a
-- olho — um comprovante em imagem e trivial de forjar e nao prova nada.
-- =============================================================================
BEGIN;

ALTER TABLE public.championship_registrations
  ADD COLUMN IF NOT EXISTS pix_txid text;

CREATE INDEX IF NOT EXISTS championship_registrations_pix_txid
  ON public.championship_registrations (pix_txid) WHERE pix_txid IS NOT NULL;

COMMENT ON COLUMN public.championship_registrations.pix_txid IS
  'Identificador da transacao no BR Code gerado para esta inscricao.';

COMMIT;
