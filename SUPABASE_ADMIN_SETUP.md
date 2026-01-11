# Supabase Admin Setup Guide

## Overview

This guide explains how to set up the admin functions and RLS policies for the session management interface.

**Important**: The system now uses role-based access control. Users must have the `admin` role in their `app_metadata` to access admin functions. See `ROLES_SETUP.md` for instructions on how to assign the admin role.

## Step 1: Execute SQL Functions

1. Go to https://app.supabase.com
2. Select your project
3. Navigate to **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy and paste the entire contents of `supabase-admin-functions.sql` into the SQL Editor
6. Execute the query

This will create:
- RLS policies for `events` table (admin access)
- RLS policies for `sessions` table (admin access to their events' sessions)
- RPC functions for admin operations:
  - `admin_create_event` - Create a new event with auto-generated code
  - `admin_stop_event` - Stop an event (set ends_at = now())
  - `admin_delete_event` - Delete an event and its sessions
  - `admin_delete_session` - Delete a specific session
  - `admin_get_events` - List all events for the current admin
  - `admin_get_event_sessions` - List sessions for a specific event

## Step 2: Verify RLS is Enabled

Make sure Row Level Security (RLS) is enabled on the `events` and `sessions` tables:

```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('events', 'sessions');
```

If `rowsecurity` is `false` for either table, enable it:

```sql
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
```

## Step 3: Verify Foreign Keys

The admin functions assume that foreign keys exist between:
- `sessions.event_id` → `events.id`
- `event_members.event_id` → `events.id`

If these foreign keys don't exist or don't have `ON DELETE CASCADE`, the `admin_delete_event` function will handle deletion manually (stop first, then delete).

## Step 4: Test the Functions

You can test the functions directly in SQL Editor:

```sql
-- Test creating an event (replace with your user ID)
SELECT * FROM admin_create_event(
  'Test Event',
  '2024-01-01T10:00:00Z'::timestamptz,
  '2024-01-01T18:00:00Z'::timestamptz
);

-- Test getting events
SELECT * FROM admin_get_events();

-- Test getting sessions for an event (replace with event ID)
SELECT * FROM admin_get_event_sessions('your-event-id'::uuid);
```

## Security Notes

- All RPC functions use `SECURITY DEFINER` but verify ownership via `admin_user_id = auth.uid()`
- RLS policies ensure users can only access their own events
- The `admin_delete_event` function stops the event first to prevent new telemetry writes
- After deletion, RLS on `telemetry` will automatically prevent inserts because the session/event no longer exists

## Troubleshooting

### "Access denied" errors
- Verify you're logged in as the admin user who created the event
- Check that `events.admin_user_id` matches `auth.uid()`

### Code generation fails
- The function retries up to 10 times to generate a unique code
- If it still fails, check for database locks or high concurrency

### Sessions not appearing
- Verify the session belongs to an event owned by the current admin
- Check that RLS policies are correctly applied

