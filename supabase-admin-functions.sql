-- Supabase Admin Functions and RLS Policies
-- Execute these in Supabase SQL Editor: https://app.supabase.com/project/_/sql
--
-- ⚠️ IMPORTANT: This script is SAFE to execute
-- - It only modifies POLICIES (RLS rules), not data
-- - It uses DROP POLICY IF EXISTS (safe, won't fail if policy doesn't exist)
-- - All policies are immediately recreated with the same names
-- - No data will be deleted or modified
-- - Functions use CREATE OR REPLACE (safe, updates existing functions)
--
-- What this script does:
-- 1. Creates helper function is_admin() to check user roles
-- 2. Updates RLS policies to require admin role
-- 3. Updates RPC functions to check admin role
-- 4. Does NOT delete any data (events, sessions, telemetry)

-- ============================================================================
-- HELPER FUNCTION FOR ROLE CHECKING
-- ============================================================================

-- Helper function to check if user is admin (based on app_metadata.role)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- ============================================================================
-- RLS POLICIES FOR EVENTS
-- ============================================================================

-- Enable RLS on events table (if not already enabled)
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Ensure unique constraint on events.code (if not already exists)
-- This prevents code collisions at the database level
-- Note: If the constraint already exists, this will fail gracefully
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'events_code_key' 
    OR conname = 'events_code_unique'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_code_unique UNIQUE (code);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN
    -- Constraint already exists, ignore
    NULL;
END $$;

-- Drop existing policies if they exist (to allow updates)
-- ⚠️ SAFE: These policies are immediately recreated below with the same names
-- This allows updating the policies to include role checking
DROP POLICY IF EXISTS "Admins can view their own events" ON events;
DROP POLICY IF EXISTS "Admins can create their own events" ON events;
DROP POLICY IF EXISTS "Admins can update their own events" ON events;
DROP POLICY IF EXISTS "Admins can delete their own events" ON events;

-- SELECT: Admin can view their own events
CREATE POLICY "Admins can view their own events"
ON events
FOR SELECT
USING (is_admin() AND admin_user_id = auth.uid());

-- INSERT: Admin can create events (admin_user_id must be auth.uid())
CREATE POLICY "Admins can create their own events"
ON events
FOR INSERT
WITH CHECK (is_admin() AND admin_user_id = auth.uid());

-- UPDATE: Admin can update their own events
CREATE POLICY "Admins can update their own events"
ON events
FOR UPDATE
USING (is_admin() AND admin_user_id = auth.uid())
WITH CHECK (is_admin() AND admin_user_id = auth.uid());

-- DELETE: Admin can delete their own events
CREATE POLICY "Admins can delete their own events"
ON events
FOR DELETE
USING (is_admin() AND admin_user_id = auth.uid());

-- ============================================================================
-- RLS POLICIES FOR SESSIONS (Admin access)
-- ============================================================================

-- Drop existing policies if they exist (to allow updates)
-- ⚠️ SAFE: These policies are immediately recreated below with the same names
DROP POLICY IF EXISTS "Admins can view sessions from their events" ON sessions;
DROP POLICY IF EXISTS "Admins can delete sessions from their events" ON sessions;

-- SELECT: Admin can view sessions from their events
CREATE POLICY "Admins can view sessions from their events"
ON sessions
FOR SELECT
USING (
  is_admin()
  AND EXISTS (
    SELECT 1 FROM events
    WHERE events.id = sessions.event_id
    AND events.admin_user_id = auth.uid()
  )
);

-- DELETE: Admin can delete sessions from their events
CREATE POLICY "Admins can delete sessions from their events"
ON sessions
FOR DELETE
USING (
  is_admin()
  AND EXISTS (
    SELECT 1 FROM events
    WHERE events.id = sessions.event_id
    AND events.admin_user_id = auth.uid()
  )
);

-- ============================================================================
-- RLS POLICIES FOR TELEMETRY
-- ============================================================================

-- Enable RLS on telemetry table (if not already enabled)
ALTER TABLE telemetry ENABLE ROW LEVEL SECURITY;

-- INSERT: Users can insert telemetry for active sessions they own
-- This policy ensures that:
-- 1. The user owns the session (user_id = auth.uid())
-- 2. The session belongs to an event that hasn't expired (now() <= events.ends_at)
-- When an event is stopped (ends_at = now()) or deleted, this policy will prevent new inserts
-- Note: If the policy already exists, drop it first to avoid conflicts
DO $$
BEGIN
  -- Drop existing policy if it exists (to allow updates)
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'telemetry' 
    AND policyname = 'Users can insert telemetry for active sessions'
  ) THEN
    DROP POLICY IF EXISTS "Users can insert telemetry for active sessions" ON telemetry;
  END IF;
END $$;

CREATE POLICY "Users can insert telemetry for active sessions"
ON telemetry
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM sessions s
    JOIN events e ON e.id = s.event_id
    WHERE s.id = telemetry.session_id
    AND s.user_id = auth.uid()
    AND now() <= e.ends_at
  )
);

-- SELECT: Admins can read telemetry from all sessions in their events
DROP POLICY IF EXISTS "Admins can read telemetry from their events" ON telemetry;

CREATE POLICY "Admins can read telemetry from their events"
ON telemetry
FOR SELECT
USING (
  is_admin()
  AND EXISTS (
    SELECT 1 FROM sessions s
    JOIN events e ON e.id = s.event_id
    WHERE s.id = telemetry.session_id
    AND e.admin_user_id = auth.uid()
  )
);

-- ============================================================================
-- RPC FUNCTIONS
-- ============================================================================

-- Function to generate unique event code (8 chars, base32 without O/0 I/1)
-- Drop ALL existing versions of this function from all schemas
DO $$
DECLARE
  r RECORD;
  drop_cmd TEXT;
BEGIN
  -- Find and drop all functions named generate_event_code
  FOR r IN 
    SELECT 
      n.nspname as schema_name,
      p.proname as func_name,
      p.oid as func_oid,
      pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'generate_event_code'
  LOOP
    drop_cmd := format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE', 
      r.schema_name, r.func_name, COALESCE(r.args, ''));
    EXECUTE drop_cmd;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.generate_event_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  code text := '';
  i int;
  char_pos int;
BEGIN
  -- Generate 8 random characters
  FOR i IN 1..8 LOOP
    char_pos := floor(random() * length(chars))::int + 1;
    code := code || substr(chars, char_pos, 1);
  END LOOP;
  
  -- Add dash in the middle for readability: XXXX-XXXX
  code := substr(code, 1, 4) || '-' || substr(code, 5, 4);
  
  RETURN code;
END;
$$;

-- Function to create an event (generates code, creates event)
CREATE OR REPLACE FUNCTION admin_create_event(
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
RETURNS TABLE (
  id uuid,
  title text,
  code text,
  starts_at timestamptz,
  ends_at timestamptz,
  admin_user_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code text;
  v_attempts int := 0;
  v_max_attempts int := 10;
  v_event_id uuid;
BEGIN
  -- Check if user is admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  -- Validate dates
  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'ends_at must be after starts_at';
  END IF;

  -- Generate unique code (retry if collision)
  LOOP
    v_code := public.generate_event_code();
    
    -- Check if code already exists
    IF NOT EXISTS (SELECT 1 FROM events e WHERE e.code = v_code) THEN
      EXIT; -- Code is unique
    END IF;
    
    v_attempts := v_attempts + 1;
    IF v_attempts >= v_max_attempts THEN
      RAISE EXCEPTION 'Failed to generate unique event code after % attempts', v_max_attempts;
    END IF;
  END LOOP;

  -- Create event
  INSERT INTO events (title, code, starts_at, ends_at, admin_user_id)
  VALUES (p_title, v_code, p_starts_at, p_ends_at, auth.uid())
  RETURNING events.id INTO v_event_id;

  -- Return created event
  RETURN QUERY
  SELECT e.id, e.title, e.code, e.starts_at, e.ends_at, e.admin_user_id, e.created_at
  FROM events e
  WHERE e.id = v_event_id;
END;
$$;

-- Function to stop an event (set ends_at = now())
CREATE OR REPLACE FUNCTION admin_stop_event(p_event_id uuid)
RETURNS void
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
    WHERE id = p_event_id
    AND admin_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: You are not the admin of this event';
  END IF;

  -- Stop the event
  UPDATE events
  SET ends_at = now()
  WHERE id = p_event_id;

  -- Also update all sessions of this event to end now
  UPDATE sessions
  SET ended_at = now()
  WHERE event_id = p_event_id
  AND ended_at IS NULL;
END;
$$;

-- Function to delete an event
-- Strategy: Stop first, then delete (safer than relying on cascade)
CREATE OR REPLACE FUNCTION admin_delete_event(p_event_id uuid)
RETURNS void
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
    WHERE id = p_event_id
    AND admin_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: You are not the admin of this event';
  END IF;

  -- Stop the event first (prevents new telemetry)
  UPDATE events
  SET ends_at = now()
  WHERE id = p_event_id;

  -- Delete event_members (if FK doesn't cascade)
  DELETE FROM event_members
  WHERE event_id = p_event_id;

  -- Delete sessions (if FK doesn't cascade)
  -- Note: This will also prevent telemetry inserts via RLS
  DELETE FROM sessions
  WHERE event_id = p_event_id;

  -- Finally delete the event
  DELETE FROM events
  WHERE id = p_event_id;
END;
$$;

-- Function to delete a session
CREATE OR REPLACE FUNCTION admin_delete_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  -- Verify admin owns the event of this session
  IF NOT EXISTS (
    SELECT 1 FROM sessions s
    JOIN events e ON e.id = s.event_id
    WHERE s.id = p_session_id
    AND e.admin_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: You are not the admin of this session''s event';
  END IF;

  -- Delete the session (telemetry will be inaccessible via RLS)
  DELETE FROM sessions
  WHERE id = p_session_id;
END;
$$;

-- Function to get admin's events with session count
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

  RETURN QUERY
  SELECT 
    e.id,
    e.title,
    e.code,
    e.starts_at,
    e.ends_at,
    e.admin_user_id,
    e.created_at,
    COUNT(s.id)::bigint as session_count
  FROM events e
  LEFT JOIN sessions s ON s.event_id = e.id
  WHERE e.admin_user_id = auth.uid()
  GROUP BY e.id, e.title, e.code, e.starts_at, e.ends_at, e.admin_user_id, e.created_at
  ORDER BY e.created_at DESC;
END;
$$;

-- Function to get sessions of an event
CREATE OR REPLACE FUNCTION admin_get_event_sessions(p_event_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  started_at timestamptz,
  ended_at timestamptz,
  boat_id text,
  user_id uuid,
  event_id uuid
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
    WHERE id = p_event_id
    AND admin_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: You are not the admin of this event';
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
  FROM sessions s
  WHERE s.event_id = p_event_id
  ORDER BY s.started_at DESC;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION admin_create_event(text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_stop_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_events() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_event_sessions(uuid) TO authenticated;

