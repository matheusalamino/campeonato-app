BEGIN;

-- As páginas públicas (/live) resolvem os times de partidas de mata-mata via
-- knockout_match_sources (group_position / match_winner). Sem leitura anônima,
-- resolveCtId não encontra a source e o card mostra "A DEFINIR".
-- É estrutura de chaveamento (sem dado sensível), consistente com group_slots,
-- knockout_matches e match_slots, que já são públicas.
CREATE POLICY "anon read knockout_match_sources"
  ON public.knockout_match_sources FOR SELECT TO anon USING (true);

COMMIT;
