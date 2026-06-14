BEGIN;

-- ── Correções das páginas públicas (debug pós-staging) ──────────────────────
-- (1) Os jogos se ligam ao campeonato via phase_id → phases.championship_id;
--     knockout_matches.championship_id está NULL em todo o banco. As views
--     passam a derivar championship_id pela fase (igual ao useGroupStandings).
-- (2) preferred_position é gravado por extenso ("Goleiro"), não "GOL" — o IOG
--     agora casa de forma tolerante (upper(...) LIKE 'GOL%').

-- public_player_stats: gols/assistências e partidas jogadas via phase
CREATE OR REPLACE VIEW public.public_player_stats AS
WITH ev AS (
  SELECT e.*, ph.championship_id
  FROM public.match_events_v2 e
  JOIN public.knockout_matches km ON km.id = e.knockout_match_id
  JOIN public.phases ph ON ph.id = km.phase_id
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
    COUNT(*) FILTER (WHERE event_type = 'GOAL')        AS goals,
    COUNT(*) FILTER (WHERE event_type = 'ASSIST')      AS assists,
    COUNT(*) FILTER (WHERE event_type = 'YELLOW_CARD') AS yellow_cards,
    COUNT(*) FILTER (WHERE event_type = 'RED_CARD')    AS red_cards,
    COUNT(*) FILTER (WHERE event_type = 'FOUL')        AS fouls
  FROM attributed
  GROUP BY championship_id, registration_id
),
save_stats AS (
  -- player_saves já tem championship_id direto (não depende de phase)
  SELECT
    championship_id,
    registration_id,
    COUNT(*) FILTER (WHERE NOT is_penalty) AS decisive_saves,
    COUNT(*) FILTER (WHERE is_penalty)     AS penalty_saves
  FROM public.player_saves
  GROUP BY championship_id, registration_id
),
played AS (
  SELECT ph.championship_id, ml.player_id AS registration_id,
         COUNT(DISTINCT ml.knockout_match_id) AS matches_played
  FROM public.match_lineups ml
  JOIN public.knockout_matches km ON km.id = ml.knockout_match_id
  JOIN public.phases ph ON ph.id = km.phase_id
  -- Inclui IN_PROGRESS para exibição ao vivo; o IOG usa só COMPLETED (ver public_goalkeeper_iog)
  WHERE km.status IN ('IN_PROGRESS', 'COMPLETED')
  GROUP BY ph.championship_id, ml.player_id
),
keys AS (
  SELECT championship_id, registration_id FROM event_stats
  UNION SELECT championship_id, registration_id FROM save_stats
  UNION SELECT championship_id, registration_id FROM played
)
SELECT
  k.championship_id,
  k.registration_id,
  COALESCE(es.goals, 0)          AS goals,
  COALESCE(es.assists, 0)        AS assists,
  COALESCE(es.yellow_cards, 0)   AS yellow_cards,
  COALESCE(es.red_cards, 0)      AS red_cards,
  COALESCE(sv.decisive_saves, 0) AS decisive_saves,
  COALESCE(sv.penalty_saves, 0)  AS penalty_saves,
  COALESCE(es.fouls, 0)          AS fouls,
  COALESCE(pl.matches_played, 0) AS matches_played
FROM keys k
LEFT JOIN event_stats es USING (championship_id, registration_id)
LEFT JOIN save_stats  sv USING (championship_id, registration_id)
LEFT JOIN played      pl USING (championship_id, registration_id);

GRANT SELECT ON public.public_player_stats TO anon, authenticated;

-- public_goalkeeper_iog: posição tolerante a formato ("GOL" ou "Goleiro")
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
      AND upper(p.preferred_position) LIKE 'GOL%'
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
    SELECT registration_id,
           COUNT(*) FILTER (WHERE is_penalty)     AS penalty_saves,
           COUNT(*) FILTER (WHERE NOT is_penalty) AS decisive_saves
    FROM player_saves
    WHERE championship_id = p_championship_id
      AND registration_id IN (SELECT id FROM gk)
    GROUP BY registration_id
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

COMMIT;
