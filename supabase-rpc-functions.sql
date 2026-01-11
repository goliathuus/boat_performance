-- Supabase RPC Functions for Telemetry Downsampling
-- Execute these in Supabase SQL Editor: https://app.supabase.com/project/_/sql
--
-- ⚠️ PREREQUISITE: Execute supabase-admin-functions.sql first to create is_admin() function

-- Function 1: Get bucketed telemetry (one point per time bucket)
-- This is efficient for preview/low-res polylines
CREATE OR REPLACE FUNCTION get_telemetry_bucketed(
  p_session_id uuid,
  p_start_ts timestamptz,
  p_end_ts timestamptz,
  p_bucket_seconds int DEFAULT 10
)
RETURNS TABLE (
  ts timestamptz,
  lat float8,
  lon float8,
  speed float8,
  heading float8
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Disable RLS for this function execution to allow access to all telemetry
  SET LOCAL row_security = off;
  
  -- Verify session exists (allow access to all sessions)
  IF NOT EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.id = p_session_id
  ) THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  RETURN QUERY
  SELECT
    date_bin(
      make_interval(secs => p_bucket_seconds),
      t.ts,
      p_start_ts
    ) as ts,
    AVG(t.lat) as lat,
    AVG(t.lon) as lon,
    AVG(t.speed) as speed,
    AVG(t.heading) as heading
  FROM telemetry t
  WHERE t.session_id = p_session_id
    AND t.ts >= p_start_ts
    AND t.ts <= p_end_ts
  GROUP BY date_bin(
    make_interval(secs => p_bucket_seconds),
    t.ts,
    p_start_ts
  )
  ORDER BY date_bin(
    make_interval(secs => p_bucket_seconds),
    t.ts,
    p_start_ts
  );
END;
$$;

-- Function 2: Get telemetry window with automatic downsampling
-- Returns points in the time window, downsampled if needed
CREATE OR REPLACE FUNCTION get_telemetry_window(
  p_session_id uuid,
  p_start_ts timestamptz,
  p_end_ts timestamptz,
  p_max_points int DEFAULT 20000
)
RETURNS TABLE (
  ts timestamptz,
  lat float8,
  lon float8,
  speed float8,
  heading float8,
  meta jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_count int;
  v_step int;
  v_total_any_count int;
  v_min_ts timestamptz;
  v_max_ts timestamptz;
BEGIN
  -- Disable RLS for this function execution to allow access to all telemetry
  SET LOCAL row_security = off;
  
  -- Verify session exists (allow access to all sessions)
  IF NOT EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.id = p_session_id
  ) THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  -- Check if any data exists for this session at all
  SELECT COUNT(*), MIN(ts), MAX(ts) INTO v_total_any_count, v_min_ts, v_max_ts
  FROM telemetry
  WHERE telemetry.session_id = p_session_id;
  
  -- If no data exists at all, return empty (this is normal for sessions without telemetry)
  IF v_total_any_count = 0 THEN
    RETURN;
  END IF;

  -- Count total points in window
  SELECT COUNT(*) INTO v_total_count
  FROM telemetry
  WHERE telemetry.session_id = p_session_id
    AND telemetry.ts >= p_start_ts
    AND telemetry.ts <= p_end_ts;
  
  -- If under max, return all
  IF v_total_count <= p_max_points THEN
    RETURN QUERY
    SELECT t.ts AS ts, t.lat AS lat, t.lon AS lon, t.speed AS speed, t.heading AS heading, t.meta AS meta
    FROM telemetry t
    WHERE t.session_id = p_session_id
      AND t.ts >= p_start_ts
      AND t.ts <= p_end_ts
    ORDER BY t.ts;
  ELSE
    -- Otherwise, downsample uniformly
    v_step := GREATEST(1, v_total_count / p_max_points);
    RETURN QUERY
    SELECT t_alias.ts AS ts, t_alias.lat AS lat, t_alias.lon AS lon, t_alias.speed AS speed, t_alias.heading AS heading, t_alias.meta AS meta
    FROM (
      SELECT telemetry.ts AS ts, telemetry.lat AS lat, telemetry.lon AS lon, telemetry.speed AS speed, telemetry.heading AS heading, telemetry.meta AS meta,
             ROW_NUMBER() OVER (ORDER BY telemetry.ts) as rn
      FROM telemetry
      WHERE telemetry.session_id = p_session_id
        AND telemetry.ts >= p_start_ts
        AND telemetry.ts <= p_end_ts
    ) t_alias
    WHERE t_alias.rn % v_step = 0
    ORDER BY t_alias.ts;
  END IF;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_telemetry_bucketed(uuid, timestamptz, timestamptz, int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_telemetry_window(uuid, timestamptz, timestamptz, int) TO authenticated;

