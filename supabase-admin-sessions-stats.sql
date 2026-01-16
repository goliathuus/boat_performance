-- =============================================
-- Fonction pour obtenir les sessions avec statistiques
-- À exécuter dans Supabase SQL Editor
-- =============================================
-- Cette fonction ajoute des statistiques aux sessions :
-- - Nombre de points de télémétrie
-- - Nom du bateau associé

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

  -- Verify admin owns this event
  IF NOT EXISTS (
    SELECT 1 FROM events
    WHERE events.id = p_event_id
    AND events.admin_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: You are not the admin of this event';
  END IF;

  -- Return sessions with statistics
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

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION admin_get_event_sessions_with_stats(uuid) TO authenticated;

-- Vérification : Lister les fonctions admin
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname LIKE 'admin_%'
ORDER BY p.proname;

