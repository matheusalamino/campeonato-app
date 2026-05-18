-- ── MÓDULO 7: DISPUTA DE PÊNALTIS ──────────────────────────────────────────
-- Tabela para registro individual de cobranças de pênaltis

CREATE TABLE IF NOT EXISTS public.penalty_shootouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knockout_match_id UUID NOT NULL REFERENCES public.knockout_matches(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.championship_teams(id) ON DELETE CASCADE,
    player_id UUID REFERENCES public.championship_registrations(id) ON DELETE SET NULL,
    
    -- Ordem da cobrança (1, 2, 3...)
    shot_order INTEGER NOT NULL,
    
    -- Resultado: 'scored' (gol), 'missed' (fora/trave), 'saved' (defesa)
    result TEXT NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- Unique constraint para evitar duplicidade de ordem por jogo
    CONSTRAINT unique_shot_per_match UNIQUE (knockout_match_id, team_id, shot_order)
);

-- RLS
ALTER TABLE public.penalty_shootouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public penalty shots are viewable by everyone" 
ON public.penalty_shootouts FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can manage penalty shots" 
ON public.penalty_shootouts FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Índices
CREATE INDEX idx_penalties_match_id ON public.penalty_shootouts(knockout_match_id);
