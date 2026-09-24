-- =====================================================================
-- Active la RLS sur sessions, manual_events et event_members
-- =====================================================================
-- Ces trois tables etaient lisibles et modifiables par n'importe qui
-- disposant de la cle anon. Les politiques de sessions existaient deja
-- mais restaient sans effet tant que la RLS etait desactivee.
--
-- Qui accede a quoi, et par ou :
--   - admin d'evenement / super admin : SELECT direct depuis boat_tracker
--     (politiques existantes sessions_select_owner_or_super, etc.)
--   - page publique : uniquement des RPC SECURITY DEFINER (non concernees)
--   - participants (join_event, submit_strava_activity) : RPC SECURITY DEFINER
--   - ancienne app mobile : ecrit sa telemetrie en direct. La politique
--     d'INSERT de telemetry lit sessions sous la RLS de l'appelant : sans
--     sessions_select_own, ces insertions echoueraient.
--
-- A executer dans le SQL Editor (projet yucxpbxrtruwtdqbsxeh).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Le proprietaire voit ses propres sessions (necessaire aussi a la
-- politique d'insertion de telemetry).
DROP POLICY IF EXISTS sessions_select_own ON public.sessions;
CREATE POLICY sessions_select_own ON public.sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Creation directe d'une session hors evenement (ancienne app). Les
-- sessions rattachees a un evenement passent par join_event.
DROP POLICY IF EXISTS sessions_insert_own_no_event ON public.sessions;
CREATE POLICY sessions_insert_own_no_event ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND event_id IS NULL AND boat_id IS NULL);

-- Le proprietaire peut renommer / cloturer sa session. Les droits de
-- colonne ci-dessous empechent de la deplacer vers un autre evenement.
DROP POLICY IF EXISTS sessions_update_own ON public.sessions;
CREATE POLICY sessions_update_own ON public.sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.sessions FROM anon;
REVOKE UPDATE, TRUNCATE, TRIGGER, REFERENCES ON public.sessions FROM authenticated;
GRANT UPDATE (name, ended_at) ON public.sessions TO authenticated;

-- ---------------------------------------------------------------------
-- manual_events
-- ---------------------------------------------------------------------
ALTER TABLE public.manual_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manual_events_select_own ON public.manual_events;
CREATE POLICY manual_events_select_own ON public.manual_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_super_admin());

DROP POLICY IF EXISTS manual_events_insert_own ON public.manual_events;
CREATE POLICY manual_events_insert_own ON public.manual_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = manual_events.session_id AND s.user_id = auth.uid()
    )
  );

REVOKE ALL ON public.manual_events FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.manual_events FROM authenticated;

-- ---------------------------------------------------------------------
-- event_members : alimentee uniquement par des RPC SECURITY DEFINER
-- ---------------------------------------------------------------------
ALTER TABLE public.event_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_members_select_own_or_admin ON public.event_members;
CREATE POLICY event_members_select_own_or_admin ON public.event_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_members.event_id AND e.admin_user_id = auth.uid()
    )
  );

REVOKE ALL ON public.event_members FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.event_members FROM authenticated;

-- ---------------------------------------------------------------------
-- telemetry : trois politiques INSERT identiques, dont une ouverte au
-- role public. On garde telemetry_insert_own_active_session.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert telemetry for active sessions" ON public.telemetry;
DROP POLICY IF EXISTS participants_can_insert_telemetry ON public.telemetry;

COMMIT;
