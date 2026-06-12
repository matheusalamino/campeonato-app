BEGIN;

-- ── Páginas públicas: views seguras, funções de ranking e leitura anônima ──
-- IMPORTANTE: `players` e `championship_registrations` NÃO recebem policy anon.
-- Dados sensíveis (cpf, email, whatsapp, birth_date, instagram) ficam fora das
-- views. As views rodam como owner (security_invoker=false, default), de
-- propósito: expõem só as colunas listadas.

-- 1. View de jogadores públicos (uma linha por inscrição)
CREATE OR REPLACE VIEW public.public_players AS
SELECT DISTINCT ON (cr.id)
  cr.id              AS registration_id,
  cr.championship_id,
  p.name             AS player_name,
  p.official_name,
  p.preferred_position AS position,
  cr.profile_photo_link AS photo_url,
  cr.final_overall,
  ct.id              AS championship_team_id,
  t.name             AS team_name,
  t.logo_url         AS team_logo_url
FROM public.championship_registrations cr
JOIN public.players p ON p.id = cr.player_id
LEFT JOIN public.championship_team_players ctp ON ctp.registration_id = cr.id
LEFT JOIN public.championship_teams ct ON ct.id = ctp.championship_team_id
LEFT JOIN public.teams t ON t.id = ct.team_id
ORDER BY cr.id, ctp.created_at ASC;

GRANT SELECT ON public.public_players TO anon, authenticated;

-- 2. View de estatísticas por jogador (eventos + partidas jogadas)
CREATE OR REPLACE VIEW public.public_player_stats AS
WITH ev AS (
  SELECT e.*, km.championship_id
  FROM public.match_events_v2 e
  JOIN public.knockout_matches km ON km.id = e.knockout_match_id
  WHERE e.deleted_at IS NULL
),
-- Cada evento atribuído ao jogador; assistências vêm do GOAL.assist_player_id
attributed AS (
  SELECT championship_id, player_id AS registration_id, event_type FROM ev WHERE player_id IS NOT NULL
  UNION ALL
  SELECT championship_id, assist_player_id, 'ASSIST' FROM ev
  WHERE event_type = 'GOAL' AND assist_player_id IS NOT NULL
),
event_stats AS (
  SELECT
    championship_id,
    registration_id,
    COUNT(*) FILTER (WHERE event_type = 'GOAL')         AS goals,
    COUNT(*) FILTER (WHERE event_type = 'ASSIST')       AS assists,
    COUNT(*) FILTER (WHERE event_type = 'YELLOW_CARD')  AS yellow_cards,
    COUNT(*) FILTER (WHERE event_type = 'RED_CARD')     AS red_cards,
    COUNT(*) FILTER (WHERE event_type = 'SAVE')         AS decisive_saves,
    COUNT(*) FILTER (WHERE event_type = 'PENALTY_SAVE') AS penalty_saves,
    COUNT(*) FILTER (WHERE event_type = 'FOUL')         AS fouls
  FROM attributed
  GROUP BY championship_id, registration_id
),
played AS (
  SELECT km.championship_id, ml.player_id AS registration_id,
         COUNT(DISTINCT ml.knockout_match_id) AS matches_played
  FROM public.match_lineups ml
  JOIN public.knockout_matches km ON km.id = ml.knockout_match_id
  WHERE km.status IN ('IN_PROGRESS', 'COMPLETED')
  GROUP BY km.championship_id, ml.player_id
)
SELECT
  COALESCE(es.championship_id, pl.championship_id) AS championship_id,
  COALESCE(es.registration_id, pl.registration_id) AS registration_id,
  COALESCE(es.goals, 0)          AS goals,
  COALESCE(es.assists, 0)        AS assists,
  COALESCE(es.yellow_cards, 0)   AS yellow_cards,
  COALESCE(es.red_cards, 0)      AS red_cards,
  COALESCE(es.decisive_saves, 0) AS decisive_saves,
  COALESCE(es.penalty_saves, 0)  AS penalty_saves,
  COALESCE(es.fouls, 0)          AS fouls,
  COALESCE(pl.matches_played, 0) AS matches_played
FROM event_stats es
FULL OUTER JOIN played pl
  ON pl.championship_id = es.championship_id AND pl.registration_id = es.registration_id;

GRANT SELECT ON public.public_player_stats TO anon, authenticated;

-- 3. View do radar (médias de avaliação dos organizadores, 1-5)
CREATE OR REPLACE VIEW public.public_player_skills AS
SELECT
  oe.registration_id,
  cr.championship_id,
  oe.skill,
  ROUND(AVG(oe.rating)::numeric, 2) AS rating
FROM public.organizer_evaluations oe
JOIN public.championship_registrations cr ON cr.id = oe.registration_id
GROUP BY oe.registration_id, cr.championship_id, oe.skill;

GRANT SELECT ON public.public_player_skills TO anon, authenticated;

-- 4. IOG = (5 - MGS) + 2*PD + 2*MDD (FAQ oficial); só goleiros com partidas
CREATE OR REPLACE FUNCTION public.public_goalkeeper_iog(p_championship_id uuid)
RETURNS TABLE (
  registration_id uuid,
  matches_played bigint,
  goals_conceded bigint,
  penalty_saves bigint,
  decisive_saves bigint,
  iog numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH gk AS (
    SELECT cr.id
    FROM championship_registrations cr
    JOIN players p ON p.id = cr.player_id
    WHERE cr.championship_id = p_championship_id
      AND p.preferred_position = 'GOL'
  ),
  gk_matches AS (
    SELECT ml.player_id AS registration_id, ml.knockout_match_id, ml.championship_team_id
    FROM match_lineups ml
    JOIN knockout_matches km ON km.id = ml.knockout_match_id
    WHERE ml.player_id IN (SELECT id FROM gk)
      AND km.status = 'COMPLETED'
  ),
  conceded AS (
    -- Gols sofridos = gols do adversário + gols contra do próprio time
    SELECT gm.registration_id,
           COUNT(e.id) AS goals_conceded,
           COUNT(DISTINCT gm.knockout_match_id) AS matches_played
    FROM gk_matches gm
    LEFT JOIN match_events_v2 e
      ON e.knockout_match_id = gm.knockout_match_id
     AND e.deleted_at IS NULL
     AND (
       (e.event_type = 'GOAL'     AND e.team_id <> gm.championship_team_id) OR
       (e.event_type = 'OWN_GOAL' AND e.team_id  = gm.championship_team_id)
     )
    GROUP BY gm.registration_id
  ),
  saves AS (
    SELECT e.player_id AS registration_id,
           COUNT(*) FILTER (WHERE e.event_type = 'PENALTY_SAVE') AS penalty_saves,
           COUNT(*) FILTER (WHERE e.event_type = 'SAVE')         AS decisive_saves
    FROM match_events_v2 e
    JOIN knockout_matches km ON km.id = e.knockout_match_id
    WHERE km.championship_id = p_championship_id
      AND e.deleted_at IS NULL
      AND e.player_id IN (SELECT id FROM gk)
    GROUP BY e.player_id
  )
  SELECT
    c.registration_id,
    c.matches_played,
    c.goals_conceded,
    COALESCE(s.penalty_saves, 0)  AS penalty_saves,
    COALESCE(s.decisive_saves, 0) AS decisive_saves,
    ROUND(
      (5 - (c.goals_conceded::numeric / NULLIF(c.matches_played, 0)))
      + 2 * COALESCE(s.penalty_saves, 0)
      + 2 * (COALESCE(s.decisive_saves, 0)::numeric / NULLIF(c.matches_played, 0)),
      2
    ) AS iog
  FROM conceded c
  LEFT JOIN saves s ON s.registration_id = c.registration_id
  WHERE c.matches_played > 0
  ORDER BY iog DESC;
$$;

GRANT EXECUTE ON FUNCTION public.public_goalkeeper_iog(uuid) TO anon, authenticated;

-- 5. Candidatos a Revelação: overall <= limite (default 85), ranqueados por
--    participações em gol por partida; desempate por menor overall
CREATE OR REPLACE FUNCTION public.public_revelation_candidates(
  p_championship_id uuid,
  p_overall_threshold numeric DEFAULT 85
)
RETURNS TABLE (
  registration_id uuid,
  goals bigint,
  assists bigint,
  matches_played bigint,
  participations_per_match numeric,
  final_overall numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.registration_id,
    s.goals,
    s.assists,
    s.matches_played,
    ROUND((s.goals + s.assists)::numeric / NULLIF(s.matches_played, 0), 2)
      AS participations_per_match,
    cr.final_overall
  FROM public.public_player_stats s
  JOIN championship_registrations cr ON cr.id = s.registration_id
  WHERE s.championship_id = p_championship_id
    AND cr.final_overall IS NOT NULL
    AND cr.final_overall <= p_overall_threshold
    AND s.matches_played > 0
  ORDER BY participations_per_match DESC NULLS LAST, cr.final_overall ASC;
$$;

GRANT EXECUTE ON FUNCTION public.public_revelation_candidates(uuid, numeric) TO anon, authenticated;

-- 6. Leitura anônima nas tabelas NÃO sensíveis que as páginas públicas usam
--    (match_events_v2, group_slots, penalty_shootouts, match_lineups já são públicas)
CREATE POLICY "anon read championships"     ON public.championships      FOR SELECT TO anon USING (true);
CREATE POLICY "anon read phases"            ON public.phases             FOR SELECT TO anon USING (true);
CREATE POLICY "anon read groups"            ON public.groups             FOR SELECT TO anon USING (true);
CREATE POLICY "anon read knockout_matches"  ON public.knockout_matches   FOR SELECT TO anon USING (true);
CREATE POLICY "anon read match_slots"       ON public.match_slots        FOR SELECT TO anon USING (true);
CREATE POLICY "anon read teams"             ON public.teams              FOR SELECT TO anon USING (true);
CREATE POLICY "anon read championship_teams" ON public.championship_teams FOR SELECT TO anon USING (true);
CREATE POLICY "anon read best_player_votes" ON public.best_player_votes  FOR SELECT TO anon USING (true);
CREATE POLICY "anon read tie_breaker_rules" ON public.tie_breaker_rules  FOR SELECT TO anon USING (true);

COMMIT;
