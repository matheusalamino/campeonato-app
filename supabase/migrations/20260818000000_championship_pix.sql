-- =============================================================================
-- Migration: Dados do PIX por campeonato
-- O BR Code da inscricao deixa de ser um payload estatico colado no codigo e
-- passa a ser gerado com o valor correto. Para isso, os dados do recebedor
-- precisam viver junto do campeonato, como ja acontece com preco e imagem.
-- =============================================================================
BEGIN;

ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS pix_key            text,
  ADD COLUMN IF NOT EXISTS pix_merchant_name  text,
  ADD COLUMN IF NOT EXISTS pix_merchant_city  text;

COMMENT ON COLUMN public.championships.pix_key IS
  'Chave PIX do recebedor: e-mail, CPF/CNPJ, telefone ou chave aleatoria.';
COMMENT ON COLUMN public.championships.pix_merchant_name IS
  'Nome do recebedor no BR Code. O padrao corta em 25 caracteres.';
COMMENT ON COLUMN public.championships.pix_merchant_city IS
  'Cidade do recebedor no BR Code. O padrao corta em 15 caracteres.';

COMMIT;
