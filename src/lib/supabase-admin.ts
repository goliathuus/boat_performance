import { supabase } from './supabase';
import type { Event, EventWithStats, AdminSession, AdminUser } from '@/domain/types';

/**
 * Get all events for the current admin user with session counts
 */
export async function getAdminEvents(): Promise<EventWithStats[]> {
  const { data, error } = await supabase.rpc('admin_get_events');

  if (error) {
    throw new Error(`Failed to get events: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  // Calculate status for each event
  const now = new Date();
  return data.map((event: any) => {
    const startsAt = new Date(event.starts_at);
    const endsAt = new Date(event.ends_at);
    
    let status: 'active' | 'expired' | 'upcoming';
    if (now < startsAt) {
      status = 'upcoming';
    } else if (now > endsAt) {
      status = 'expired';
    } else {
      status = 'active';
    }

    return {
      id: event.id,
      title: event.title,
      code: event.code,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      admin_user_id: event.admin_user_id,
      created_at: event.created_at,
      owner_name: event.owner_name ?? null,
      owner_email: event.owner_email ?? null,
      status,
      session_count: Number(event.session_count) || 0,
    };
  });
}

/**
 * Create a new event
 */
export async function createEvent(
  title: string,
  startsAt: Date,
  endsAt: Date,
  ownerAdminId?: string
): Promise<Event> {
  // Validate dates
  if (endsAt <= startsAt) {
    throw new Error('End date must be after start date');
  }

  const rpcName = ownerAdminId ? 'admin_create_event_for_owner' : 'admin_create_event';
  const rpcArgs = ownerAdminId
    ? {
        p_title: title,
        p_starts_at: startsAt.toISOString(),
        p_ends_at: endsAt.toISOString(),
        p_owner_admin_id: ownerAdminId,
      }
    : {
        p_title: title,
        p_starts_at: startsAt.toISOString(),
        p_ends_at: endsAt.toISOString(),
      };

  const { data, error } = await supabase.rpc(rpcName, rpcArgs);

  if (error) {
    throw new Error(`Failed to create event: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('Failed to create event: No data returned');
  }

  return {
    id: data[0].id,
    title: data[0].title,
    code: data[0].code,
    starts_at: data[0].starts_at,
    ends_at: data[0].ends_at,
    admin_user_id: data[0].admin_user_id,
    created_at: data[0].created_at,
    owner_name: data[0].owner_name ?? null,
    owner_email: data[0].owner_email ?? null,
  };
}

/**
 * Stop an event (set ends_at = now())
 */
export async function stopEvent(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_stop_event', {
    p_event_id: eventId,
  });

  if (error) {
    throw new Error(`Failed to stop event: ${error.message}`);
  }
}

/**
 * Delete an event
 */
export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_event', {
    p_event_id: eventId,
  });

  if (error) {
    throw new Error(`Failed to delete event: ${error.message}`);
  }
}

/**
 * Get sessions for an event with statistics
 */
export async function getEventSessions(eventId: string): Promise<AdminSession[]> {
  // Try the new RPC with stats first
  try {
    const { data, error } = await supabase.rpc('admin_get_event_sessions_with_stats', {
      p_event_id: eventId,
    });

    if (!error && data) {
      return data.map((session: any) => ({
        id: session.id,
        name: session.name,
        started_at: session.started_at,
        ended_at: session.ended_at,
        boat_id: session.boat_id,
        user_id: session.user_id,
        event_id: session.event_id,
        telemetry_count: Number(session.telemetry_count) || 0,
        boat_display_name: session.boat_display_name,
      }));
    }
  } catch (err) {
    console.log('RPC with stats not available, falling back to basic version');
  }

  // Fallback to old version without stats
  const { data, error } = await supabase.rpc('admin_get_event_sessions', {
    p_event_id: eventId,
  });

  if (error) {
    throw new Error(`Failed to get event sessions: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  return data.map((session: any) => ({
    id: session.id,
    name: session.name,
    started_at: session.started_at,
    ended_at: session.ended_at,
    boat_id: session.boat_id,
    user_id: session.user_id,
    event_id: session.event_id,
  }));
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_session', {
    p_session_id: sessionId,
  });

  if (error) {
    throw new Error(`Failed to delete session: ${error.message}`);
  }
}

/**
 * Check if the current user is an admin (admin or super_admin)
 * Now reads from the users table instead of app_metadata
 */
export async function isUserAdmin(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return false;
    }

    // Query the users table instead of app_metadata
    const { data, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      console.error('Error checking admin status:', error);
      return false;
    }

    // Admin includes both 'admin' and 'super_admin'
    return data.role === 'admin' || data.role === 'super_admin';
  } catch (error) {
    console.error('Error in isUserAdmin:', error);
    return false;
  }
}

/**
 * Check if the current user is a super admin
 */
export async function isUserSuperAdmin(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return false;
    }

    const { data, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      console.error('Error checking super admin status:', error);
      return false;
    }

    return data.role === 'super_admin';
  } catch (error) {
    console.error('Error in isUserSuperAdmin:', error);
    return false;
  }
}

/**
 * Get user role from the users table
 */
export async function getUserRole(userId?: string): Promise<'admin' | 'user' | 'super_admin' | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const targetUserId = userId || user?.id;
    
    if (!targetUserId) {
      return null;
    }

    const { data, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', targetUserId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.role as 'admin' | 'user' | 'super_admin';
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
}

/**
 * Get all admin users (clubs) for super admin assignment UI.
 */
export async function getAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, club_name, role')
    .in('role', ['admin'])
    .order('full_name', { ascending: true });

  if (error) {
    throw new Error(`Failed to load admin users: ${error.message}`);
  }

  return (data ?? []).map((u: any) => ({
    id: u.id,
    email: u.email ?? null,
    full_name: u.full_name ?? null,
    club_name: u.club_name ?? null,
  }));
}

