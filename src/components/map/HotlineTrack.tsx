import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
// Import leaflet-hotline plugin
// The plugin is a UMD bundle that auto-initializes if L is global
// We ensure L is global BEFORE importing so the plugin can initialize
if (typeof window !== 'undefined') {
  (window as any).L = L;
}
// Import the hotline plugin - it will auto-initialize if L is global
// This must be imported after L is set globally
import 'leaflet-hotline/dist/leaflet.hotline';

interface HotlineStyleOptions {
  min?: number;
  max?: number;
  palette?: Record<number, string>;
  weight?: number;
  outlineColor?: string;
  outlineWidth?: number;
  opacity?: number;
}

// Type definition for Hotline since module augmentation isn't being recognized
interface HotlineLayer extends L.Layer {
  setLatLngs(latlngs: Array<[number, number, number]>): this;
  setOptions(options: HotlineStyleOptions): this;
}

interface HotlineTrackProps {
  positions: Array<[number, number, number]>; // [lat, lon, sogValue]
  min: number;
  max: number;
  weight?: number;
}

/**
 * Palette de couleurs (bleu -> cyan -> vert -> jaune -> orange -> rouge).
 * Correspond a l'echelle de getSogColor.
 */
const SOG_PALETTE: Record<number, string> = {
  0.0: 'rgb(0, 100, 255)', // Bleu (lent)
  0.2: 'rgb(0, 255, 255)', // Cyan
  0.4: 'rgb(0, 255, 0)', // Vert
  0.6: 'rgb(255, 255, 0)', // Jaune
  0.8: 'rgb(255, 165, 0)', // Orange
  1.0: 'rgb(255, 0, 0)', // Rouge (rapide)
};

function isHotlineAvailable(): boolean {
  return typeof (L as any).hotline === 'function';
}

/** min et max doivent differer, sinon la palette ne peut pas s'interpoler. */
function effectiveRange(min: number, max: number): { min: number; max: number } {
  return { min, max: min === max ? min + 0.1 : max };
}

function hotlineOptions(min: number, max: number, weight: number): HotlineStyleOptions {
  return {
    min,
    max,
    palette: SOG_PALETTE,
    weight,
    outlineColor: 'transparent',
    outlineWidth: 0,
    opacity: 0.7,
  };
}

/**
 * Deep comparison helper for positions array
 */
function positionsEqual(a: Array<[number, number, number]>, b: Array<[number, number, number]>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1] || a[i][2] !== b[i][2]) {
      return false;
    }
  }
  return true;
}

export function HotlineTrack({ positions, min, max, weight = 2 }: HotlineTrackProps) {
  const map = useMap();

  const hotlineRef = useRef<HotlineLayer | null>(null);
  const positionsRef = useRef<Array<[number, number, number]>>([]);
  const lastParamsRef = useRef<{ min: number; max: number; weight: number }>({ min, max, weight });

  // Initialize leaflet-hotline plugin if not already initialized
  useEffect(() => {
    // Ensure L is global
    if (typeof window !== 'undefined') {
      (window as any).L = L;
    }

    // If plugin is not available, try to initialize it
    if (!isHotlineAvailable()) {
      console.warn('[HotlineTrack] leaflet-hotline not found, attempting to load...');
      import('leaflet-hotline/dist/leaflet.hotline')
        .then(() => {
          if (!isHotlineAvailable()) {
            console.error('[HotlineTrack] leaflet-hotline still unavailable after dynamic import');
          }
        })
        .catch((err) => {
          console.error('[HotlineTrack] Failed to load leaflet-hotline:', err);
        });
    }
  }, []); // Run once on mount

  // Main effect: handles min, max, weight changes and initial creation
  // Note: positions is NOT in dependencies to avoid unnecessary cleanup/recreation
  useEffect(() => {
    if (!map) return;

    if (!isHotlineAvailable()) {
      console.error('[HotlineTrack] leaflet-hotline is not available. Make sure it is imported correctly.');
      return;
    }

    // Check if we have enough positions to create/update hotline
    if (positions.length < 2) {
      // Remove existing hotline if positions are insufficient
      if (hotlineRef.current) {
        try {
          map.removeLayer(hotlineRef.current);
        } catch (error) {
          console.warn('[HotlineTrack] Error removing hotline layer:', error);
        }
        hotlineRef.current = null;
      }
      positionsRef.current = [];
      return;
    }

    const range = effectiveRange(min, max);

    // Check if params changed (using effective values)
    const paramsChanged =
      lastParamsRef.current.min !== range.min ||
      lastParamsRef.current.max !== range.max ||
      lastParamsRef.current.weight !== weight;

    // Update params ref
    if (paramsChanged) {
      lastParamsRef.current = { min: range.min, max: range.max, weight };
    }

    try {
      // Si la hotline existe deja, mettre a jour les options seulement si params changed
      if (hotlineRef.current) {
        if (paramsChanged) {
          hotlineRef.current.setOptions(hotlineOptions(range.min, range.max, weight));
          // Also update positions if they changed (defensive check)
          if (!positionsEqual(positionsRef.current, positions)) {
            hotlineRef.current.setLatLngs(positions);
            positionsRef.current = positions;
          }
        }
        return;
      }

      // Creer une nouvelle hotline avec les positions actuelles
      // This runs when hotline doesn't exist yet and we have valid positions
      const hotline = (L as any).hotline(
        positions,
        hotlineOptions(range.min, range.max, weight)
      ) as HotlineLayer;

      hotline.addTo(map);
      hotlineRef.current = hotline;
      positionsRef.current = positions;
    } catch (error) {
      console.error('[HotlineTrack] Error creating or updating hotline:', error);
      // Clean up on error
      if (hotlineRef.current) {
        try {
          map.removeLayer(hotlineRef.current);
        } catch (cleanupError) {
          console.warn('[HotlineTrack] Error cleaning up hotline after error:', cleanupError);
        }
        hotlineRef.current = null;
      }
    }

    // Cleanup only runs when map, min, max, or weight change (not positions)
    return () => {
      if (hotlineRef.current) {
        try {
          map.removeLayer(hotlineRef.current);
        } catch (error) {
          console.warn('[HotlineTrack] Error removing hotline layer in cleanup:', error);
        }
        hotlineRef.current = null;
      }
    };
  }, [map, min, max, weight]); // Removed positions from dependencies

  // Separate effect to handle positions changes only (after initial creation)
  useEffect(() => {
    if (!map || !isHotlineAvailable()) {
      return;
    }

    const range = effectiveRange(min, max);

    // If hotline doesn't exist yet but we have valid positions, create it
    if (!hotlineRef.current && positions.length >= 2) {
      try {
        const hotline = (L as any).hotline(
          positions,
          hotlineOptions(range.min, range.max, weight)
        ) as HotlineLayer;

        hotline.addTo(map);
        hotlineRef.current = hotline;
        positionsRef.current = positions;
        lastParamsRef.current = { min: range.min, max: range.max, weight };
      } catch (error) {
        console.error('[HotlineTrack] Error creating hotline from positions effect:', error);
      }
      return;
    }

    // If hotline doesn't exist and we don't have valid positions, nothing to do
    if (!hotlineRef.current) {
      return;
    }

    // If we don't have enough positions, remove the hotline
    if (positions.length < 2) {
      try {
        map.removeLayer(hotlineRef.current);
      } catch (error) {
        console.warn('[HotlineTrack] Error removing hotline layer:', error);
      }
      hotlineRef.current = null;
      positionsRef.current = [];
      return;
    }

    // Check if params changed and update if needed
    const paramsChanged =
      lastParamsRef.current.min !== range.min ||
      lastParamsRef.current.max !== range.max ||
      lastParamsRef.current.weight !== weight;

    if (paramsChanged) {
      try {
        hotlineRef.current.setOptions(hotlineOptions(range.min, range.max, weight));
        lastParamsRef.current = { min: range.min, max: range.max, weight };
      } catch (error) {
        console.error('[HotlineTrack] Error updating hotline options:', error);
      }
    }

    // Only update positions if they actually changed (deep comparison)
    if (!positionsEqual(positionsRef.current, positions)) {
      try {
        hotlineRef.current.setLatLngs(positions);
        positionsRef.current = positions;
      } catch (error) {
        console.error('[HotlineTrack] Error updating hotline positions:', error);
      }
    }
  }, [positions, map, min, max, weight]); // Include min, max, weight to allow creation when positions become valid

  return null;
}
