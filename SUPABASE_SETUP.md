# Supabase Setup Guide

## RPC Functions for High-Volume Mode

To enable optimal performance with large datasets (200k-2M points), you need to create RPC functions in your Supabase database.

### Step 1: Open Supabase SQL Editor

1. Go to https://app.supabase.com
2. Select your project
3. Navigate to **SQL Editor** in the left sidebar
4. Click **New Query**

### Step 2: Execute RPC Functions

Copy and paste the entire contents of `supabase-rpc-functions.sql` into the SQL Editor and execute it.

This will create two functions:
- `get_telemetry_bucketed`: Efficient downsampling for preview polylines
- `get_telemetry_window`: Automatic downsampling for replay windows

### Step 3: Verify Functions

After execution, you should see:
- ✅ Function `get_telemetry_bucketed` created
- ✅ Function `get_telemetry_window` created
- ✅ Permissions granted to `authenticated` role

### Step 4: Test (Optional)

You can test the functions directly in SQL Editor:

```sql
-- Test bucketed function
SELECT * FROM get_telemetry_bucketed(
  'your-session-id'::uuid,
  '2024-01-01T00:00:00Z'::timestamptz,
  '2024-01-01T23:59:59Z'::timestamptz,
  10
);

-- Test window function
SELECT * FROM get_telemetry_window(
  'your-session-id'::uuid,
  '2024-01-01T00:00:00Z'::timestamptz,
  '2024-01-01T23:59:59Z'::timestamptz,
  20000
);
```

## Fallback Mode

If RPC functions are not available, the application will automatically fall back to keyset pagination. However, performance will be reduced for very large datasets.

## Security

The RPC functions include Row Level Security (RLS) checks:
- They verify that the user owns the session via `auth.uid()`
- They use `SECURITY DEFINER` to bypass RLS on telemetry table, but check access via sessions table

Make sure your `sessions` table has proper RLS policies enabled.


