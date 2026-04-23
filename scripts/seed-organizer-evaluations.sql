-- Popula public.organizer_evaluations para os três organizers informados.
-- Uma nota (1–5) por habilidade, por inscrição (championship_registrations), por organizer.
-- Goleiro: mesmas chaves usadas em app/(protected)/players/components/EvaluateModal.tsx
-- Demais posições: conjunto de linha.
--
-- Ao final, recalcula final_overall (mesma lógica que lib/overall.ts::recalculateOverall):
-- inscrições com self e/ou organizer_evaluations; sem nenhum dos dois permanece inalterada.
--
-- Execução (exemplos):
--   psql "$DATABASE_URL" -f scripts/seed-organizer-evaluations.sql
--   Ou colar no SQL Editor do Supabase.
--
-- Opcional: limitar a um campeonato — descomente o bloco AND no JOIN final.

BEGIN;

DELETE FROM public.organizer_evaluations
WHERE organizer_id IN (
  '24f1ff49-21e3-4ae0-b1d2-5a294ddbc51f'::uuid,
  'f3e46f43-583f-4ad1-872b-c1bb3a8adeaa'::uuid,
  '4eb2eebd-577e-4825-908e-41cf1bd22395'::uuid
);

INSERT INTO public.organizer_evaluations (registration_id, organizer_id, skill, rating)
SELECT
  cr.id,
  o.organizer_id,
  sk.skill,
  (1 + (abs(hashtext(cr.id::text || o.organizer_id::text || sk.skill)) % 5))::integer
FROM public.championship_registrations cr
INNER JOIN public.players p ON p.id = cr.player_id
CROSS JOIN (
  VALUES
    ('24f1ff49-21e3-4ae0-b1d2-5a294ddbc51f'::uuid),
    ('f3e46f43-583f-4ad1-872b-c1bb3a8adeaa'::uuid),
    ('4eb2eebd-577e-4825-908e-41cf1bd22395'::uuid)
) AS o (organizer_id)
CROSS JOIN LATERAL (
  SELECT unnest(
    CASE
      WHEN p.preferred_position = 'Goleiro' THEN ARRAY[
        'comunicacao',
        'jogoAereo',
        'posicionamento',
        'agilidade',
        'reflexo',
        'reposicao'
      ]::text[]
      ELSE ARRAY[
        'desarme',
        'controle',
        'visao',
        'finalizacao',
        'drible',
        'velocidade'
      ]::text[]
    END
  ) AS skill
) AS sk
WHERE 1 = 1
-- AND cr.championship_id = '00000000-0000-0000-0000-000000000000'::uuid
;

-- final_overall = round(76 + score * 18)
WITH per_registration AS (
  SELECT
    cr.id AS registration_id,
    (SELECT avg(se.rating)::double precision
     FROM public.self_evaluations se
     WHERE se.registration_id = cr.id) AS self_avg,
    (SELECT count(*)::bigint
     FROM public.self_evaluations se
     WHERE se.registration_id = cr.id) AS self_n,
    (SELECT avg(oe.rating)::double precision
     FROM public.organizer_evaluations oe
     WHERE oe.registration_id = cr.id) AS org_avg,
    (SELECT count(*)::bigint
     FROM public.organizer_evaluations oe
     WHERE oe.registration_id = cr.id) AS org_n
  FROM public.championship_registrations cr
),
scored AS (
  SELECT
    registration_id,
    round(
      76::double precision + (
        CASE
          WHEN self_n > 0 AND org_n > 0 THEN
            (self_avg / 5.0) * 0.05 + (org_avg / 5.0) * 0.95
          WHEN self_n > 0 AND org_n = 0 THEN
            self_avg / 5.0
          WHEN self_n = 0 AND org_n > 0 THEN
            org_avg / 5.0
        END
      ) * 18
    )::integer AS final_overall
  FROM per_registration
  WHERE self_n > 0 OR org_n > 0
)
UPDATE public.championship_registrations cr
SET final_overall = s.final_overall
FROM scored s
WHERE cr.id = s.registration_id;

COMMIT;
