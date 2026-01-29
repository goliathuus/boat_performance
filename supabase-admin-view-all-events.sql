-- =============================================
-- Modifications pour permettre aux admins de voir tous les événements
-- À exécuter dans Supabase SQL Editor
-- =============================================

-- 1. Policy pour SELECT : Admins peuvent voir tous les événements
-- Cette policy fonctionne en combinaison avec les autres policies PERMISSIVE
-- existantes (logique OR)
-- Supprimer la policy si elle existe déjà, puis la créer
DROP POLICY IF EXISTS "Admins can view all events" ON events;
CREATE POLICY "Admins can view all events"
ON events FOR SELECT
TO authenticated
USING (is_admin());

-- 2. Créer ou remplacer la fonction admin_get_events pour retourner tous les événements pour les admins
CREATE OR REPLACE FUNCTION admin_get_events()
RETURNS TABLE (
  id uuid,
  title text,
  code text,
  starts_at timestamptz,
  ends_at timestamptz,
  admin_user_id uuid,
  created_at timestamptz,
  session_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  -- Return ALL events with session counts (not just those created by the current admin)
  RETURN QUERY
  SELECT 
    e.id,
    e.title,
    e.code,
    e.starts_at,
    e.ends_at,
    e.admin_user_id,
    e.created_at,
    COALESCE(COUNT(s.id), 0)::bigint as session_count
  FROM events e
  LEFT JOIN sessions s ON s.event_id = e.id
  GROUP BY e.id, e.title, e.code, e.starts_at, e.ends_at, e.admin_user_id, e.created_at
  ORDER BY e.starts_at DESC;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION admin_get_events() TO authenticated;

-- 3. Mettre à jour la fonction admin_get_event_sessions_with_stats pour permettre aux admins
-- de voir les sessions de tous les événements (pas seulement ceux qu'ils ont créés)
CREATE OR REPLACE FUNCTION admin_get_event_sessions_with_stats(p_event_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  started_at timestamptz,
  ended_at timestamptz,
  boat_id uuid,
  user_id uuid,
  event_id uuid,
  telemetry_count bigint,
  boat_display_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  -- Verify event exists (no longer checking if admin owns it - admins can see all events)
  IF NOT EXISTS (
    SELECT 1 FROM events
    WHERE events.id = p_event_id
  ) THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Return sessions with statistics for any event (admin can see all)
  RETURN QUERY
  SELECT 
    s.id,
    s.name,
    s.started_at,
    s.ended_at,
    s.boat_id,
    s.user_id,
    s.event_id,
    COALESCE(COUNT(t.ts), 0)::bigint as telemetry_count,
    b.display_name as boat_display_name
  FROM sessions s
  LEFT JOIN telemetry t ON t.session_id = s.id
  LEFT JOIN boats b ON b.id = s.boat_id
  WHERE s.event_id = p_event_id
  GROUP BY s.id, s.name, s.started_at, s.ended_at, s.boat_id, s.user_id, s.event_id, b.display_name
  ORDER BY s.started_at DESC;
END;
$$;

-- Vérification : Lister les policies pour la table events
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check
FROM pg_policies
WHERE tablename = 'events'
ORDER BY policyname;

-- Vérification : Lister les fonctions admin
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname LIKE 'admin_%'
ORDER BY p.proname;
