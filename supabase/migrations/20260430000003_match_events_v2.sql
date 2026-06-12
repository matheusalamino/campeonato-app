-- ── MÓDULO 6: SÚMULA E EVENTOS ──────────────────────────────────────────────
-- Tabela para registro de eventos de partida (Gols, Cartões, etc.)
-- Substitui a tabela legada 'match_events' para integrar com 'knockout_matches'

CREATE TABLE IF NOT EXISTS public.match_events_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knockout_match_id UUID NOT NULL REFERENCES public.knockout_matches(id) ON DELETE CASCADE,
    
    -- Tipo do evento: GOAL, YELLOW_CARD, RED_CARD, FOUL, ASSIST, etc.
    event_type TEXT NOT NULL,
    
    -- Tempo do evento em segundos desde o início da partida (acumulado)
    event_time_s INTEGER NOT NULL,
    
    -- Período em que ocorreu (period_1, period_2, extra_1, etc.)
    period TEXT NOT NULL,
    
    -- Time que gerou o evento (championship_team_id)
    team_id UUID REFERENCES public.championship_teams(id) ON DELETE CASCADE,
    
    -- Jogador envolvido (registration_id do campeonato)
    player_id UUID REFERENCES public.championship_registrations(id) ON DELETE SET NULL,
    
    -- Evento relacionado (ex: assistência ligada a um gol)
    related_event_id UUID REFERENCES public.match_events_v2(id) ON DELETE SET NULL,
    
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ -- Soft delete
);

-- Índices para performance de consulta por jogo
CREATE INDEX idx_match_events_match_id ON public.match_events_v2(knockout_match_id);
CREATE INDEX idx_match_events_player_id ON public.match_events_v2(player_id);

-- RLS (Row Level Security)
ALTER TABLE public.match_events_v2 ENABLE ROW LEVEL SECURITY;

-- Leitura pública para todos
CREATE POLICY "Public match events are viewable by everyone" 
ON public.match_events_v2 FOR SELECT 
USING (true);

-- Inserção/Edição apenas para usuários autenticados
CREATE POLICY "Authenticated users can manage match events" 
ON public.match_events_v2 FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Trigger para atualizar placar automaticamente? 
-- Por enquanto manteremos o placar atualizado via aplicação (hook useMatchStatus) 
-- para garantir que o árbitro tenha controle total sobre o que é gol oficial ou não.
