-- Normalize persisted group names so UI surfaces can rely on "Grupo A",
-- "Grupo B", etc. Older flows stored only the letter ("A", "B"...).

UPDATE public.groups
SET name = 'Grupo ' || upper(trim(name))
WHERE trim(name) ~* '^[a-z]$';

-- O WHERE usa ~* (case-insensitive), então casa "Grupo A". O substring(... from ...)
-- é case-sensitive por padrão no Postgres, então sem o flag (?i) ele não captura a
-- letra de "Grupo A" e retorna NULL → 'Grupo ' || NULL = NULL → viola NOT NULL.
-- O (?i) deixa o substring case-insensitive, consistente com o WHERE.
UPDATE public.groups
SET name = 'Grupo ' || upper(substring(trim(name) from '(?i)^grupo\s+([a-z])$'))
WHERE trim(name) ~* '^grupo\s+[a-z]$';
