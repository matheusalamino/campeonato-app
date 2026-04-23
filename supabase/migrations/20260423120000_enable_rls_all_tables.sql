-- =============================================================================
-- Re-enable Row Level Security on all public tables + coarse policies
--
-- Contexto: em algum momento a RLS foi desligada manualmente em várias tabelas
-- do schema public (somente `draft_pots` e `group_slots` estavam com RLS on).
-- Esta migration:
--   1. Cria helpers SECURITY DEFINER (is_admin / is_staff / current_manager_cm_ids).
--   2. Reabilita RLS em todas as tabelas do schema public.
--   3. Dropa policies antigas (para permitir reexecução) e cria um conjunto
--      consistente de policies:
--        • SELECT: todos os autenticados (public read em tabelas neutras).
--        • WRITE em tabelas administrativas / draft: admin/fiscal via helpers.
--        • Managers podem inserir/atualizar somente nas próprias linhas de
--          tabelas específicas do draft (habilitação, favoritos, etc.).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Helper functions (SECURITY DEFINER, search_path fixo)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'auction_fiscal')
  );
$$;

-- Retorna todos os championship_manager ids do usuário autenticado
-- (um mesmo cartola pode estar inscrito em vários campeonatos).
CREATE OR REPLACE FUNCTION public.current_manager_cm_ids()
RETURNS TABLE(cm_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cm.id
  FROM public.championship_managers cm
  JOIN public.managers m ON m.id = cm.manager_id
  WHERE m.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_manager_cm_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_manager_cm_ids() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Enable RLS em todas as tabelas do public schema
-- -----------------------------------------------------------------------------

ALTER TABLE public.championships                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_managers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_registrations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_team_players    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_teams           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managers                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players                      ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.draft_balance_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_fines                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_player_favorites       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_player_purchases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_pot_budgets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_qualification_bids     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_special_card_bids      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_special_card_uses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_transfers              ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.groups                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phases                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phase_advancement_rules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phase_group_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phase_knockout_settings      ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.matches                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_events                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_slots                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knockout_matches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knockout_match_sources       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penalties                    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tie_breaker_rules            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_evaluations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_evaluations             ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. Drop policies antigas ambíguas (para reexecução idempotente)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "public read"                 ON public.championships;
DROP POLICY IF EXISTS "admin update championships"  ON public.championships;
DROP POLICY IF EXISTS "public read"                 ON public.championship_managers;
DROP POLICY IF EXISTS "public read"                 ON public.championship_teams;
DROP POLICY IF EXISTS "public read"                 ON public.teams;
DROP POLICY IF EXISTS "public read"                 ON public.managers;

-- -----------------------------------------------------------------------------
-- 4. Macros locais (funções PL/pgSQL estilo "create_standard_policies")
-- -----------------------------------------------------------------------------
--
-- Abaixo optamos por escrever cada policy explicitamente (mais claro para
-- auditoria futura) em vez de usar EXECUTE dinâmico.
--
-- Convenção:
--   • Policy "<table> authenticated read": SELECT to authenticated USING (true)
--   • Policy "<table> staff write":        ALL to authenticated USING/CHECK is_staff()
--   • Para tabelas que managers precisam gravar, adicionamos policies
--     específicas restritas a `current_manager_cm_ids()`.

-- === Tabelas de referência (todos autenticados leem; só admin escreve) =======

-- championships
CREATE POLICY "championships read"
  ON public.championships FOR SELECT TO authenticated USING (true);
CREATE POLICY "championships staff write"
  ON public.championships FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- teams / managers / players / profiles (catálogos)
CREATE POLICY "teams read"    ON public.teams    FOR SELECT TO authenticated USING (true);
CREATE POLICY "teams admin"   ON public.teams    FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "managers read"  ON public.managers FOR SELECT TO authenticated USING (true);
CREATE POLICY "managers admin" ON public.managers FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "players read"  ON public.players FOR SELECT TO authenticated USING (true);
CREATE POLICY "players admin" ON public.players FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- profiles: cada usuário lê o próprio; admin lê todos; admin gerencia
CREATE POLICY "profiles self read"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles self update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles admin"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- === Championship membership / squad ========================================

CREATE POLICY "cm read"
  ON public.championship_managers FOR SELECT TO authenticated USING (true);
CREATE POLICY "cm staff write"
  ON public.championship_managers FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
-- managers podem atualizar saldo do próprio cm (usado pelo join-pot-bid)
CREATE POLICY "cm self update"
  ON public.championship_managers FOR UPDATE TO authenticated
  USING (id IN (SELECT cm_id FROM public.current_manager_cm_ids()))
  WITH CHECK (id IN (SELECT cm_id FROM public.current_manager_cm_ids()));

CREATE POLICY "ct read"
  ON public.championship_teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "ct admin write"
  ON public.championship_teams FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "ctp read"
  ON public.championship_team_players FOR SELECT TO authenticated USING (true);
CREATE POLICY "ctp staff write"
  ON public.championship_team_players FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "creg read"
  ON public.championship_registrations FOR SELECT TO authenticated USING (true);
CREATE POLICY "creg admin write"
  ON public.championship_registrations FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- === Draft tables ===========================================================

-- draft_qualification_bids: manager insere lance próprio; admin resolve.
CREATE POLICY "dqb read"
  ON public.draft_qualification_bids FOR SELECT TO authenticated USING (true);
CREATE POLICY "dqb staff write"
  ON public.draft_qualification_bids FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "dqb manager insert own"
  ON public.draft_qualification_bids FOR INSERT TO authenticated
  WITH CHECK (
    championship_manager_id IN (SELECT cm_id FROM public.current_manager_cm_ids())
  );
CREATE POLICY "dqb manager update own"
  ON public.draft_qualification_bids FOR UPDATE TO authenticated
  USING (championship_manager_id IN (SELECT cm_id FROM public.current_manager_cm_ids()))
  WITH CHECK (championship_manager_id IN (SELECT cm_id FROM public.current_manager_cm_ids()));

-- draft_balance_transactions: ledger (managers registram suas próprias reservas;
-- staff registra multas/estornos). Update/Delete só admin.
CREATE POLICY "dbt read"
  ON public.draft_balance_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "dbt staff write"
  ON public.draft_balance_transactions FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "dbt manager insert own"
  ON public.draft_balance_transactions FOR INSERT TO authenticated
  WITH CHECK (
    championship_manager_id IN (SELECT cm_id FROM public.current_manager_cm_ids())
  );

-- draft_pot_budgets: read autenticado; write staff
CREATE POLICY "dpb read"
  ON public.draft_pot_budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "dpb staff write"
  ON public.draft_pot_budgets FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

-- draft_fines: read autenticado; write staff
CREATE POLICY "df read"
  ON public.draft_fines FOR SELECT TO authenticated USING (true);
CREATE POLICY "df staff write"
  ON public.draft_fines FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

-- draft_player_purchases: read autenticado; write admin
CREATE POLICY "dpp read"
  ON public.draft_player_purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY "dpp staff write"
  ON public.draft_player_purchases FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

-- draft_player_favorites: manager gerencia os próprios; admin gerencia tudo
CREATE POLICY "dpf self read"
  ON public.draft_player_favorites FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR championship_manager_id IN (SELECT cm_id FROM public.current_manager_cm_ids())
  );
CREATE POLICY "dpf self write"
  ON public.draft_player_favorites FOR ALL TO authenticated
  USING (
    championship_manager_id IN (SELECT cm_id FROM public.current_manager_cm_ids())
  )
  WITH CHECK (
    championship_manager_id IN (SELECT cm_id FROM public.current_manager_cm_ids())
  );
CREATE POLICY "dpf admin"
  ON public.draft_player_favorites FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- draft_special_card_uses / draft_special_card_bids
CREATE POLICY "dscu read"
  ON public.draft_special_card_uses FOR SELECT TO authenticated USING (true);
CREATE POLICY "dscu staff write"
  ON public.draft_special_card_uses FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "dscu manager insert own"
  ON public.draft_special_card_uses FOR INSERT TO authenticated
  WITH CHECK (
    activated_by_cm_id IN (SELECT cm_id FROM public.current_manager_cm_ids())
  );

CREATE POLICY "dscb read"
  ON public.draft_special_card_bids FOR SELECT TO authenticated USING (true);
CREATE POLICY "dscb staff write"
  ON public.draft_special_card_bids FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "dscb manager insert own"
  ON public.draft_special_card_bids FOR INSERT TO authenticated
  WITH CHECK (
    championship_manager_id IN (SELECT cm_id FROM public.current_manager_cm_ids())
  );

-- draft_transfers: read autenticado; write admin
CREATE POLICY "dtf read"
  ON public.draft_transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "dtf admin write"
  ON public.draft_transfers FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- === Competition structure (phases / matches / rules) =======================

CREATE POLICY "phases read"          ON public.phases                 FOR SELECT TO authenticated USING (true);
CREATE POLICY "phases admin"         ON public.phases                 FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "par read"             ON public.phase_advancement_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "par admin"            ON public.phase_advancement_rules FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "pgs read"             ON public.phase_group_settings    FOR SELECT TO authenticated USING (true);
CREATE POLICY "pgs admin"            ON public.phase_group_settings    FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "pks read"             ON public.phase_knockout_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "pks admin"            ON public.phase_knockout_settings FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "groups read"          ON public.groups                  FOR SELECT TO authenticated USING (true);
CREATE POLICY "groups admin"         ON public.groups                  FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "matches read"         ON public.matches                 FOR SELECT TO authenticated USING (true);
CREATE POLICY "matches admin"        ON public.matches                 FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "match_events read"    ON public.match_events            FOR SELECT TO authenticated USING (true);
CREATE POLICY "match_events admin"   ON public.match_events            FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "match_slots read"     ON public.match_slots             FOR SELECT TO authenticated USING (true);
CREATE POLICY "match_slots admin"    ON public.match_slots             FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "ko_matches read"      ON public.knockout_matches        FOR SELECT TO authenticated USING (true);
CREATE POLICY "ko_matches admin"     ON public.knockout_matches        FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "ko_sources read"      ON public.knockout_match_sources  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ko_sources admin"     ON public.knockout_match_sources  FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "penalties read"       ON public.penalties               FOR SELECT TO authenticated USING (true);
CREATE POLICY "penalties admin"      ON public.penalties               FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "tbr read"             ON public.tie_breaker_rules       FOR SELECT TO authenticated USING (true);
CREATE POLICY "tbr admin"            ON public.tie_breaker_rules       FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "orgeval read"         ON public.organizer_evaluations   FOR SELECT TO authenticated USING (true);
CREATE POLICY "orgeval admin"        ON public.organizer_evaluations   FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "selfeval read"        ON public.self_evaluations        FOR SELECT TO authenticated USING (true);
CREATE POLICY "selfeval admin"       ON public.self_evaluations        FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMIT;
