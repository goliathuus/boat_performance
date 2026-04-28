-- =============================================
-- Club-style owner scoping (light model by admin_user_id)
-- =============================================
-- Goal:
-- - admin sees only their own events/sessions/telemetry
-- - super_admin sees everything
-- - super_admin can create events for a target admin owner
--
-- Run in Supabase SQL Editor.

BEGIN;

-- =============================================
-- 1) Role helper functions based on public.users.role
-- =============================================
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

-- =============================================
-- 2) EVENTS policies (owner-scoped admin, global super_admin)
-- =============================================
DROP POLICY IF EXISTS "Admins can view all events" ON public.events;
DROP POLICY IF EXISTS "Admins can view their own events" ON public.events;
DROP POLICY IF EXISTS "events_select_admin_or_member" ON public.events;
DROP POLICY IF EXISTS "Admins can create their own events" ON public.events;
DROP POLICY IF EXISTS "events_insert_self_admin" ON public.events;
DROP POLICY IF EXISTS "Admins can update their own events" ON public.events;
DROP POLICY IF EXISTS "events_update_admin" ON public.events;
DROP POLICY IF EXISTS "Admins can delete their own events" ON public.events;
DROP POLICY IF EXISTS "events_delete_admin" ON public.events;
DROP POLICY IF EXISTS "Super admins can update all events" ON public.events;
DROP POLICY IF EXISTS "Super admins can delete all events" ON public.events;

CREATE POLICY "events_select_owner_or_super"
ON public.events
FOR SELECT
TO authenticated
USING (is_super_admin() OR admin_user_id = auth.uid());

CREATE POLICY "events_insert_owner_or_super"
ON public.events
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin()
  OR (is_admin() AND admin_user_id = auth.uid())
);

CREATE POLICY "events_update_owner_or_super"
ON public.events
FOR UPDATE
TO authenticated
USING (is_super_admin() OR admin_user_id = auth.uid())
WITH CHECK (is_super_admin() OR admin_user_id = auth.uid());

CREATE POLICY "events_delete_owner_or_super"
ON public.events
FOR DELETE
TO authenticated
USING (is_super_admin() OR admin_user_id = auth.uid());

-- =============================================
-- 3) SESSIONS policies (owner-scoped via event)
-- =============================================
DROP POLICY IF EXISTS "Admins can view sessions from their events" ON public.sessions;
DROP POLICY IF EXISTS "sessions_select_event_admin" ON public.sessions;
DROP POLICY IF EXISTS "Admins can delete sessions from their events" ON public.sessions;

CREATE POLICY "sessions_select_owner_or_super"
ON public.sessions
FOR SELECT
TO authenticated
USING (
  is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = sessions.event_id
      AND e.admin_user_id = auth.uid()
  )
);

CREATE POLICY "sessions_delete_owner_or_super"
ON public.sessions
FOR DELETE
TO authenticated
USING (
  is_super_admin()
  OR EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = sessions.event_id
      AND e.admin_user_id = auth.uid()
  )
);

-- =============================================
-- 4) TELEMETRY policies (remove global read)
-- =============================================
DROP POLICY IF EXISTS "All users can read all telemetry" ON public.telemetry;
DROP POLICY IF EXISTS "telemetry_select_event_admin" ON public.telemetry;
DROP POLICY IF EXISTS "telemetry_select_own" ON public.telemetry;

CREATE POLICY "telemetry_select_owner_or_super_or_own"
ON public.telemetry
FOR SELECT
TO authenticated
USING (
  is_super_admin()
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.sessions s
    JOIN public.events e ON e.id = s.event_id
    WHERE s.id = telemetry.session_id
      AND e.admin_user_id = auth.uid()
  )
);

-- Keep INSERT policies already present for participants

-- =============================================
-- 5) RPC: admin_get_events
-- =============================================
CREATE OR REPLACE FUNCTION public.admin_get_events()
RETURNS TABLE (
  id uuid,
  title text,
  code text,
  starts_at timestamptz,
  ends_at timestamptz,
  admin_user_id uuid,
  created_at timestamptz,
  session_count bigint,
  owner_name text,
  owner_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.title,
    e.code,
    e.starts_at,
    e.ends_at,
    e.admin_user_id,
    e.created_at,
    COALESCE(COUNT(s.id), 0)::bigint AS session_count,
    u.full_name::text AS owner_name,
    u.email::text AS owner_email
  FROM public.events e
  LEFT JOIN public.sessions s ON s.event_id = e.id
  LEFT JOIN public.users u ON u.id = e.admin_user_id
  WHERE is_super_admin() OR e.admin_user_id = auth.uid()
  GROUP BY e.id, e.title, e.code, e.starts_at, e.ends_at, e.admin_user_id, e.created_at, u.full_name, u.email
  ORDER BY e.starts_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_events() TO authenticated;

-- =============================================
-- 6) RPC: admin_get_event_sessions_with_stats
-- =============================================
CREATE OR REPLACE FUNCTION public.admin_get_event_sessions_with_stats(p_event_id uuid)
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
DECLARE
  v_owner uuid;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  SELECT e.admin_user_id INTO v_owner
  FROM public.events e
  WHERE e.id = p_event_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF NOT is_super_admin() AND v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Access denied: not owner of this event';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.started_at,
    s.ended_at,
    s.boat_id,
    s.user_id,
    s.event_id,
    COALESCE(COUNT(t.ts), 0)::bigint AS telemetry_count,
    b.display_name AS boat_display_name
  FROM public.sessions s
  LEFT JOIN public.telemetry t ON t.session_id = s.id
  LEFT JOIN public.boats b ON b.id = s.boat_id
  WHERE s.event_id = p_event_id
  GROUP BY s.id, s.name, s.started_at, s.ended_at, s.boat_id, s.user_id, s.event_id, b.display_name
  ORDER BY s.started_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_event_sessions_with_stats(uuid) TO authenticated;

-- =============================================
-- 7) RPC: admin_get_event_sessions (fallback)
-- =============================================
CREATE OR REPLACE FUNCTION public.admin_get_event_sessions(p_event_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  started_at timestamptz,
  ended_at timestamptz,
  boat_id uuid,
  user_id uuid,
  event_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  SELECT e.admin_user_id INTO v_owner
  FROM public.events e
  WHERE e.id = p_event_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF NOT is_super_admin() AND v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Access denied: not owner of this event';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.started_at,
    s.ended_at,
    s.boat_id,
    s.user_id,
    s.event_id
  FROM public.sessions s
  WHERE s.event_id = p_event_id
  ORDER BY s.started_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_event_sessions(uuid) TO authenticated;

-- =============================================
-- 8) RPC: admin_create_event_for_owner
-- =============================================
CREATE OR REPLACE FUNCTION public.admin_create_event_for_owner(
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_owner_admin_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  code text,
  starts_at timestamptz,
  ends_at timestamptz,
  admin_user_id uuid,
  created_at timestamptz,
  owner_name text,
  owner_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_owner uuid;
  v_target_role text;
  v_code text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'End date must be after start date';
  END IF;

  -- super_admin can target another admin; regular admin is forced to self.
  IF is_super_admin() THEN
    v_target_owner := COALESCE(p_owner_admin_id, auth.uid());
  ELSE
    v_target_owner := auth.uid();
  END IF;

  SELECT u.role INTO v_target_role
  FROM public.users u
  WHERE u.id = v_target_owner;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Owner user not found';
  END IF;

  IF v_target_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Owner must have admin privileges';
  END IF;

  LOOP
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.events e WHERE e.code = v_code);
  END LOOP;

  RETURN QUERY
  INSERT INTO public.events (title, code, starts_at, ends_at, admin_user_id)
  VALUES (p_title, v_code, p_starts_at, p_ends_at, v_target_owner)
  RETURNING
    events.id,
    events.title,
    events.code,
    events.starts_at,
    events.ends_at,
    events.admin_user_id,
    events.created_at,
    (SELECT u.full_name FROM public.users u WHERE u.id = events.admin_user_id) AS owner_name,
    (SELECT u.email FROM public.users u WHERE u.id = events.admin_user_id) AS owner_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_event_for_owner(text, timestamptz, timestamptz, uuid) TO authenticated;

COMMIT;

-- =============================================
-- 9) Verification queries
-- =============================================
-- Policies for key tables:
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('events', 'sessions', 'telemetry')
ORDER BY tablename, policyname;

-- Ensure owner fields returned:
SELECT routine_name
FROM information_schema.routines
WHERE specific_schema = 'public'
  AND routine_name IN (
    'admin_get_events',
    'admin_get_event_sessions_with_stats',
    'admin_get_event_sessions',
    'admin_create_event_for_owner'
  )
ORDER BY routine_name;
