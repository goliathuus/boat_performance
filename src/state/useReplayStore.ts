import { create } from 'zustand';
import type { TrackPoint } from '@/domain/types';
import { generateBoatColor } from '@/lib/color';

export interface SessionData {
  id: string;
  name: string;
  color: string;
  tMin: number;
  tMax: number;
  points: TrackPoint[]; // All telemetry points for this session
  boatDisplayName?: string; // Display name from boats table
}

interface ReplayState {
  selectedSessionIds: string[];
  sessions: Map<string, SessionData>;
  playing: boolean;
  speed: number; // 0.5, 1, 2, 4, 8
  globalTMin: number | null;
  globalTMax: number | null;
  windowStartTime: number | null; // Début de la fenêtre d'affichage
  focusSessionId: string | null;

  setSelectedSessions: (sessionIds: string[]) => void;
  addSession: (sessionId: string, name: string, tMin: number, tMax: number, boatDisplayName?: string) => void;
  addSessions: (sessions: Array<{ sessionId: string; name: string; tMin: number; tMax: number; boatDisplayName?: string }>) => void;
  updateSessionPoints: (sessionId: string, points: TrackPoint[]) => void;
  updateMultipleSessionPoints: (updates: Array<{ sessionId: string; points: TrackPoint[] }>) => void;
  updateSessionTimeRange: (sessionId: string) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setWindowStartTime: (time: number, currentTime?: number) => void;
  setFocusSession: (sessionId: string | null) => void;
  reset: () => void;
}

export const useReplayStore = create<ReplayState>((set, get) => ({
  selectedSessionIds: [],
  sessions: new Map(),
  playing: false,
  speed: 1,
  globalTMin: null,
  globalTMax: null,
  windowStartTime: null,
  focusSessionId: null,

  setSelectedSessions: (sessionIds) => {
    set({ selectedSessionIds: sessionIds });
    // Update global time range
    const sessions = get().sessions;
    let tMin = Infinity;
    let tMax = -Infinity;
    sessionIds.forEach((id) => {
      const session = sessions.get(id);
      if (session) {
        tMin = Math.min(tMin, session.tMin);
        tMax = Math.max(tMax, session.tMax);
      }
    });
    set({
      globalTMin: tMin === Infinity ? null : tMin,
      globalTMax: tMax === -Infinity ? null : tMax,
      // Don't initialize currentTime here - wait for points to be loaded
      // currentTime will be set in updateSessionTimeRange or in the hooks after loading
    });
  },

  addSession: (sessionId, name, tMin, tMax, boatDisplayName) => {
    const sessions = new Map(get().sessions);
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        id: sessionId,
        name,
        color: generateBoatColor(sessionId),
        tMin,
        tMax,
        points: [],
        boatDisplayName,
      });
      set({ sessions });
    } else {
      // Update existing session with boatDisplayName if provided
      const existing = sessions.get(sessionId);
      if (existing && boatDisplayName) {
        sessions.set(sessionId, { ...existing, boatDisplayName });
        set({ sessions });
      }
    }
  },

  // Batch add multiple sessions at once to reduce re-renders
  addSessions: (sessionsToAdd: Array<{ sessionId: string; name: string; tMin: number; tMax: number; boatDisplayName?: string }>) => {
    const sessions = new Map(get().sessions);
    let hasChanges = false;
    
    sessionsToAdd.forEach(({ sessionId, name, tMin, tMax, boatDisplayName }) => {
      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
          id: sessionId,
          name,
          color: generateBoatColor(sessionId),
          tMin,
          tMax,
          points: [],
          boatDisplayName,
        });
        hasChanges = true;
      } else if (boatDisplayName) {
        const existing = sessions.get(sessionId);
        if (existing && !existing.boatDisplayName) {
          sessions.set(sessionId, { ...existing, boatDisplayName });
          hasChanges = true;
        }
      }
    });
    
    if (hasChanges) {
      set({ sessions });
    }
  },

  updateSessionPoints: (sessionId, points) => {
    const sessions = new Map(get().sessions);
    const session = sessions.get(sessionId);
    if (session) {
      // Only update if points actually changed (avoid unnecessary re-renders)
      if (session.points.length !== points.length || 
          (points.length > 0 && session.points[0]?.t !== points[0]?.t)) {
        sessions.set(sessionId, { ...session, points });
        set({ sessions });
      }
    }
  },

  // Batch update multiple session points at once to reduce re-renders
  updateMultipleSessionPoints: (updates: Array<{ sessionId: string; points: TrackPoint[] }>) => {
    const sessions = new Map(get().sessions);
    let hasChanges = false;
    const notFoundSessions: string[] = [];
    const updatedSessions: string[] = [];
    const skippedSessions: string[] = [];
    
    updates.forEach(({ sessionId, points }) => {
      const session = sessions.get(sessionId);
      if (session) {
        // Only update if points actually changed
        if (session.points.length !== points.length || 
            (points.length > 0 && session.points[0]?.t !== points[0]?.t)) {
          sessions.set(sessionId, { ...session, points });
          hasChanges = true;
          updatedSessions.push(sessionId);
        } else {
          skippedSessions.push(sessionId);
        }
      } else {
        console.error('[useReplayStore] Session not found in store', {
          sessionId,
          availableSessionIds: Array.from(sessions.keys()),
        });
        notFoundSessions.push(sessionId);
      }
    });
    
    if (hasChanges) {
      set({ sessions });
    } else if (notFoundSessions.length > 0) {
      console.error('[useReplayStore] Cannot update points - sessions not found', {
        notFoundSessionIds: notFoundSessions,
      });
    }
  },

  updateSessionTimeRange: (sessionId) => {
    const sessions = new Map(get().sessions);
    const session = sessions.get(sessionId);
    
    if (!session) {
      console.error('[useReplayStore] Cannot update time range - session not found', { sessionId });
      return;
    }

    if (session.points.length === 0) {
      // No points to calculate from, keep existing tMin/tMax
      return;
    }

    // Sort points by time to ensure first and last are correct
    const sortedPoints = [...session.points].sort((a, b) => a.t - b.t);
    const newTMin = sortedPoints[0].t;
    const newTMax = sortedPoints[sortedPoints.length - 1].t;

    // Only update if values changed
    if (session.tMin !== newTMin || session.tMax !== newTMax) {
      sessions.set(sessionId, { ...session, tMin: newTMin, tMax: newTMax });
      set({ sessions });
      // Note: globalTMin/globalTMax are NOT updated here to avoid multiple updates during batch processing
      // They will be recalculated by useTelemetry after all updateSessionTimeRange calls
    }
  },


  setPlaying: (playing) => {
    set({ playing });
  },

  setSpeed: (speed) => {
    set({ speed });
  },

  setWindowStartTime: (time, currentTime) => {
    const { globalTMin, globalTMax } = get();
    if (globalTMin === null || globalTMax === null) return;
    // Clamp between globalTMin and currentTime (or globalTMax if currentTime not provided)
    const maxTime = currentTime !== undefined ? Math.min(currentTime, globalTMax) : globalTMax;
    const clampedTime = Math.max(globalTMin, Math.min(time, maxTime));
    set({ windowStartTime: clampedTime });
  },

  setFocusSession: (sessionId) => {
    set({ focusSessionId: sessionId });
  },

  reset: () => {
    set({
      selectedSessionIds: [],
      sessions: new Map(),
      playing: false,
      speed: 1,
      globalTMin: null,
      globalTMax: null,
      windowStartTime: null,
      focusSessionId: null,
    });
  },
}));

