-- =============================================================================
-- Migration: reserva de vaga por CPF e teto de ingressos extras
-- No campeonato passado, jogadores pagaram o PIX e foram recusados no envio
-- porque a lotacao encheu enquanto preenchiam. A reserva garante a vaga desde o
-- primeiro passo, para ninguem chegar ao pagamento sem vaga.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.registration_slot_reservations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  cpf             text NOT NULL,
  is_waitlist     boolean NOT NULL,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Impede um CPF de segurar duas vagas, e e o que faz recarregar a pagina
-- reencontrar a mesma reserva em vez de vazar outra.
CREATE UNIQUE INDEX IF NOT EXISTS registration_slot_reservations_champ_cpf
  ON public.registration_slot_reservations (championship_id, cpf);

CREATE INDEX IF NOT EXISTS registration_slot_reservations_champ_expiry
  ON public.registration_slot_reservations (championship_id, expires_at);

ALTER TABLE public.registration_slot_reservations ENABLE ROW LEVEL SECURITY;
-- Sem policies: a tabela guarda CPF, entao anon e authenticated nao leem nada.
-- Todo acesso passa pelas funcoes SECURITY DEFINER e pelo client service-role,
-- que ignora RLS. Mesmo tratamento de registration_lookup_attempts.

COMMENT ON TABLE public.registration_slot_reservations IS
  'Vaga reservada por CPF enquanto o jogador preenche a inscricao. is_waitlist e uma promessa: a classificacao decidida aqui e honrada no commit, para ninguem ser rebaixado de principal para espera depois de ter pago.';

ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS max_extra_tickets int NOT NULL DEFAULT 4;

COMMENT ON COLUMN public.championships.max_extra_tickets IS
  'Teto de ingressos extras por inscricao. O que limita de verdade e a capacidade do salao da Noite de Gala, que muda por edicao.';

COMMIT;
