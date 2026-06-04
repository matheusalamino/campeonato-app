-- Normalize persisted group names so UI surfaces can rely on "Grupo A",
-- "Grupo B", etc. Older flows stored only the letter ("A", "B"...).

UPDATE public.groups
SET name = 'Grupo ' || upper(trim(name))
WHERE trim(name) ~* '^[a-z]$';

UPDATE public.groups
SET name = 'Grupo ' || upper(substring(trim(name) from '^grupo\s+([a-z])$'))
WHERE trim(name) ~* '^grupo\s+[a-z]$';
