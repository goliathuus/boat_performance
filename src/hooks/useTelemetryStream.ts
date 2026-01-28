import { useState, useEffect, useRef, useCallback } from 'react';
import { getTelemetryWindow, getTelemetryKeyset } from '@/lib/supabase-rpc';
import { supabase } from '@/lib/supabase';
import type { TrackPoint } from '@/domain/types';

interface UseTelemetryStreamResult {
  points: TrackPoint[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

const windowCache = new Map<string, TrackPoint[]>();

/**
 * Hook to load telemetry window (sliding cache) around currentTime
 * Automatically loads/unloads data as currentTime moves
 */
export function useTelemetryStream(
  sessionId: string | null,
  currentTime: number | null,
  windowSizeMs: number = 10 * 60 * 1000, // 10 minutes default
  maxPoints: number = 20000
): UseTelemetryStreamResult {
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentWindowRef = useRef<{ start: number; end: number } | null>(null);
  const userIdRef = useRef<string | null>(null);

  // Get user ID once
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        userIdRef.current = user.id;
      }
    });
  }, []);

  const loadWindow = useCallback(
    async (windowStart: number, windowEnd: number) => {
      if (!sessionId) {
        return;
      }

      // Check cache
      const cacheKey = `${sessionId}-${windowStart}-${windowEnd}`;
      const cached = windowCache.get(cacheKey);
      if (cached) {
        setPoints(cached);
        currentWindowRef.current = { start: windowStart, end: windowEnd };
        return;
      }

      // Abort previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      setLoading(true);
      setError(null);

      try {
        const startTs = new Date(windowStart);
        const endTs = new Date(windowEnd);

        // Try RPC first
        let data: TrackPoint[];
        try {
          data = await getTelemetryWindow(sessionId, startTs, endTs, maxPoints);
        } catch (rpcError) {
          // Fallback to keyset pagination if RPC not available
          if (!userIdRef.current) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              userIdRef.current = user.id;
            } else {
              throw new Error('Not authenticated');
            }
          }
          const result = await getTelemetryKeyset(
            sessionId,
            startTs,
            endTs,
            undefined,
            maxPoints
          );
          data = result.points;
        }

        if (!abortControllerRef.current?.signal.aborted) {
          setPoints(data);
          windowCache.set(cacheKey, data);
          currentWindowRef.current = { start: windowStart, end: windowEnd };
          setLoading(false);
        }
      } catch (err) {
        if (!abortControllerRef.current?.signal.aborted) {
          setError(err instanceof Error ? err : new Error('Failed to load telemetry'));
          setLoading(false);
        }
      }
    },
    [sessionId, maxPoints]
  );

  const refetch = useCallback(() => {
    if (currentTime !== null && currentWindowRef.current) {
      loadWindow(currentWindowRef.current.start, currentWindowRef.current.end);
    }
  }, [currentTime, loadWindow]);

  useEffect(() => {
    if (!sessionId) {
      setPoints([]);
      currentWindowRef.current = null;
      return;
    }

    // Wait for currentTime to be available before loading
    if (currentTime === null) {
      return; // Don't clear points, just wait
    }

    const windowStart = currentTime - windowSizeMs;
    const windowEnd = currentTime + windowSizeMs;

    // Check if we need to load a new window
    const currentWindow = currentWindowRef.current;
    if (
      !currentWindow ||
      windowStart < currentWindow.start ||
      windowEnd > currentWindow.end
    ) {
      loadWindow(windowStart, windowEnd);
    } else {
      // Window already loaded, filter points to current window
      const cached = windowCache.get(`${sessionId}-${currentWindow.start}-${currentWindow.end}`);
      if (cached) {
        const filtered = cached.filter(
          (p) => p.t >= windowStart && p.t <= windowEnd
        );
        setPoints(filtered);
      }
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [sessionId, currentTime, windowSizeMs, loadWindow]);

  // Cleanup cache periodically (keep last 5 windows)
  useEffect(() => {
    const cleanup = setInterval(() => {
      if (windowCache.size > 5) {
        const entries = Array.from(windowCache.entries());
        // Keep most recent 5
        const toKeep = entries.slice(-5);
        windowCache.clear();
        toKeep.forEach(([key, value]) => windowCache.set(key, value));
      }
    }, 60000); // Every minute

    return () => clearInterval(cleanup);
  }, []);

  return { points, loading, error, refetch };
}

