-- =============================================
-- Public share links for events (token-based)
-- =============================================
-- Execute in Supabase SQL Editor.

BEGIN;

-- Ensure pgcrypto is available for token generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================
-- 1) Schema changes on events
-- =============================================
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS share_token text,
  ADD COLUMN IF NOT EXISTS share_enabled boolean NOT NULL DEFAULT true;

-- Backfill token for existing rows
UPDATE public.events
SET share_token = rtrim(translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_'), '=')
WHERE share_token IS NULL OR length(share_token) = 0;

ALTER TABLE public.events
  ALTER COLUMN share_token SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_share_token_key'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_share_token_key UNIQUE (share_token);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_events_share_enabled ON public.events(share_enabled);

-- =============================================
-- 2) Update admin RPCs to return share fields
-- =============================================
DROP FUNCTION IF EXISTS public.admin_get_events();
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
  owner_email text,
  share_token text,
  share_enabled boolean
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
    u.email::text AS owner_email,
    e.share_token,
    e.share_enabled
  FROM public.events e
  LEFT JOIN public.sessions s ON s.event_id = e.id
  LEFT JOIN public.users u ON u.id = e.admin_user_id
  WHERE is_super_admin() OR e.admin_user_id = auth.uid()
  GROUP BY
    e.id, e.title, e.code, e.starts_at, e.ends_at,
    e.admin_user_id, e.created_at, u.full_name, u.email,
    e.share_token, e.share_enabled
  ORDER BY e.starts_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_events() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_create_event_for_owner(text, timestamptz, timestamptz, uuid);
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
  owner_email text,
  share_token text,
  share_enabled boolean
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
  INSERT INTO public.events (title, code, starts_at, ends_at, admin_user_id, share_token, share_enabled)
  VALUES (
    p_title,
    v_code,
    p_starts_at,
    p_ends_at,
    v_target_owner,
    rtrim(translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_'), '='),
    true
  )
  RETURNING
    events.id,
    events.title,
    events.code,
    events.starts_at,
    events.ends_at,
    events.admin_user_id,
    events.created_at,
    (SELECT u.full_name FROM public.users u WHERE u.id = events.admin_user_id) AS owner_name,
    (SELECT u.email FROM public.users u WHERE u.id = events.admin_user_id) AS owner_email,
    events.share_token,
    events.share_enabled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_event_for_owner(text, timestamptz, timestamptz, uuid) TO authenticated;

-- Also keep compatibility for admin_create_event if present in your project
DROP FUNCTION IF EXISTS public.admin_create_event(text, timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public.admin_create_event(
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
  created_at timestamptz,
  share_token text,
  share_enabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'End date must be after start date';
  END IF;

  LOOP
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.events e WHERE e.code = v_code);
  END LOOP;

  RETURN QUERY
  INSERT INTO public.events (title, code, starts_at, ends_at, admin_user_id, share_token, share_enabled)
  VALUES (
    p_title,
    v_code,
    p_starts_at,
    p_ends_at,
    auth.uid(),
    rtrim(translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_'), '='),
    true
  )
  RETURNING
    events.id,
    events.title,
    events.code,
    events.starts_at,
    events.ends_at,
    events.admin_user_id,
    events.created_at,
    events.share_token,
    events.share_enabled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_event(text, timestamptz, timestamptz) TO authenticated;

-- =============================================
-- 3) New admin RPCs for share management
-- =============================================
DROP FUNCTION IF EXISTS public.admin_regenerate_event_share_token(uuid);
CREATE OR REPLACE FUNCTION public.admin_regenerate_event_share_token(p_event_id uuid)
RETURNS TABLE (
  event_id uuid,
  share_token text,
  share_enabled boolean
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
  UPDATE public.events e
  SET share_token = rtrim(translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_'), '=')
  WHERE e.id = p_event_id
  RETURNING e.id, e.share_token, e.share_enabled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_regenerate_event_share_token(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_set_event_share_enabled(uuid, boolean);
CREATE OR REPLACE FUNCTION public.admin_set_event_share_enabled(
  p_event_id uuid,
  p_enabled boolean
)
RETURNS TABLE (
  event_id uuid,
  share_token text,
  share_enabled boolean
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
  UPDATE public.events e
  SET share_enabled = p_enabled
  WHERE e.id = p_event_id
  RETURNING e.id, e.share_token, e.share_enabled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_event_share_enabled(uuid, boolean) TO authenticated;

-- =============================================
-- 4) Public RPCs (token-scoped)
-- =============================================
DROP FUNCTION IF EXISTS public.public_get_event_by_token(text);
CREATE OR REPLACE FUNCTION public.public_get_event_by_token(p_token text)
RETURNS TABLE (
  id uuid,
  title text,
  starts_at timestamptz,
  ends_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.title, e.starts_at, e.ends_at
  FROM public.events e
  WHERE e.share_token = p_token
    AND e.share_enabled = true;
END;
$$;

DROP FUNCTION IF EXISTS public.public_get_event_sessions(text);
CREATE OR REPLACE FUNCTION public.public_get_event_sessions(p_token text)
RETURNS TABLE (
  id uuid,
  name text,
  started_at timestamptz,
  ended_at timestamptz,
  boat_id uuid,
  event_id uuid,
  boat_display_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.started_at,
    s.ended_at,
    s.boat_id,
    s.event_id,
    b.display_name AS boat_display_name
  FROM public.sessions s
  JOIN public.events e ON e.id = s.event_id
  LEFT JOIN public.boats b ON b.id = s.boat_id
  WHERE e.share_token = p_token
    AND e.share_enabled = true
  ORDER BY s.started_at ASC;
END;
$$;

DROP FUNCTION IF EXISTS public.public_get_telemetry_window(text, uuid, timestamptz, timestamptz, int);
CREATE OR REPLACE FUNCTION public.public_get_telemetry_window(
  p_token text,
  p_session_id uuid,
  p_start_ts timestamptz,
  p_end_ts timestamptz,
  p_max_points int DEFAULT 20000
)
RETURNS TABLE (
  ts timestamptz,
  lat double precision,
  lon double precision,
  speed double precision,
  heading double precision,
  meta jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF p_max_points IS NULL OR p_max_points < 100 THEN
    p_max_points := 100;
  END IF;
  IF p_max_points > 200000 THEN
    p_max_points := 200000;
  END IF;

  SELECT e.id INTO v_event_id
  FROM public.events e
  WHERE e.share_token = p_token
    AND e.share_enabled = true
  LIMIT 1;

  IF v_event_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.id = p_session_id
      AND s.event_id = v_event_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.ts,
    t.lat,
    t.lon,
    t.speed,
    t.heading,
    t.meta
  FROM public.telemetry t
  WHERE t.session_id = p_session_id
    AND t.ts >= p_start_ts
    AND t.ts <= p_end_ts
  ORDER BY t.ts ASC
  LIMIT p_max_points;
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_get_event_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_event_sessions(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_telemetry_window(text, uuid, timestamptz, timestamptz, int) TO anon, authenticated;

COMMIT;

