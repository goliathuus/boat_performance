import { useState, useEffect, useRef } from 'react';
import { getTelemetryBucketed } from '@/lib/supabase-rpc';
import type { TrackPoint } from '@/domain/types';

interface UseSessionPreviewPolylineResult {
  points: TrackPoint[];
  loading: boolean;
  error: Error | null;
}

const previewCache = new Map<string, TrackPoint[]>();

/**
 * Hook to load preview polyline (low-res) for a session
 * Uses bucketed telemetry with 10-15 second buckets
 */
export function useSessionPreviewPolyline(
  sessionId: string | null,
  startTs: Date | null,
  endTs: Date | null,
  bucketSeconds: number = 10
): UseSessionPreviewPolylineResult {
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!sessionId || !startTs || !endTs) {
      setPoints([]);
      return;
    }

    // Check cache
    const cacheKey = `${sessionId}-${startTs.getTime()}-${endTs.getTime()}-${bucketSeconds}`;
    const cached = previewCache.get(cacheKey);
    if (cached) {
      setPoints(cached);
      return;
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setLoading(true);
    setError(null);

    // Try RPC first, fallback to keyset if RPC not available
    getTelemetryBucketed(sessionId, startTs, endTs, bucketSeconds)
      .then((data) => {
        if (!abortControllerRef.current?.signal.aborted) {
          setPoints(data);
          previewCache.set(cacheKey, data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!abortControllerRef.current?.signal.aborted) {
          // If RPC fails, try keyset pagination as fallback
          console.warn('RPC not available, using keyset pagination fallback');
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [sessionId, startTs?.getTime(), endTs?.getTime(), bucketSeconds]);

  return { points, loading, error };
}




