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

interface HotlineTrackProps {
  positions: Array<[number, number, number]>; // [lat, lon, sogValue]
  min: number;
  max: number;
  weight?: number;
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
  console.log('[HotlineTrack] Component rendering', {
    positionsCount: positions.length,
    min,
    max,
    weight,
  });

  const map = useMap();
  console.log('[HotlineTrack] useMap() result:', map ? 'OK' : 'NULL', {
    hasMap: !!map,
    mapType: map ? map.constructor.name : 'null',
  });

  if (!map) {
    console.error('[HotlineTrack] map is null, cannot render');
    return null;
  }

  const hotlineRef = useRef<L.Hotline | null>(null);
  const positionsRef = useRef<Array<[number, number, number]>>([]);
  const lastParamsRef = useRef<{ min: number; max: number; weight: number }>({ min, max, weight });

  // Check plugin availability immediately (synchronous check)
  const hasHotlineSync = typeof (L as any).hotline === 'function';
  console.log('[HotlineTrack] Plugin check (sync):', hasHotlineSync, {
    LType: typeof L,
    LHotline: typeof (L as any).hotline,
    windowL: typeof window !== 'undefined' ? typeof (window as any).L : 'N/A',
  });

  // Initialize leaflet-hotline plugin if not already initialized
  useEffect(() => {
    console.log('[HotlineTrack] Initialization effect running');
    
    // Ensure L is global
    if (typeof window !== 'undefined') {
      (window as any).L = L;
      console.log('[HotlineTrack] Set window.L = L');
    }

    // Check if plugin is available
    let hasHotline = typeof (L as any).hotline === 'function';
    console.log('[HotlineTrack] Plugin check (initial):', {
      hasHotline,
      LType: typeof L,
      LHotline: typeof (L as any).hotline,
      windowL: typeof window !== 'undefined' ? typeof (window as any).L : 'N/A',
    });

    // If plugin is not available, try to initialize it
    if (!hasHotline) {
      console.warn('[HotlineTrack] leaflet-hotline not found, attempting to load...');
      
      // Try dynamic import
      import('leaflet-hotline/dist/leaflet.hotline')
        .then((module: any) => {
          console.log('[HotlineTrack] Dynamic import successful', module);
          
          // The plugin is a UMD bundle that auto-initializes if L is global
          // But we can also try to call it explicitly if it exports a function
          const pluginFactory = module.default || module;
          if (typeof pluginFactory === 'function') {
            console.log('[HotlineTrack] Calling plugin factory with L');
            pluginFactory(L);
          }
          
          // Re-check after import
          hasHotline = typeof (L as any).hotline === 'function';
          console.log('[HotlineTrack] After import, plugin available:', hasHotline);
          
          if (!hasHotline) {
            console.error('[HotlineTrack] Plugin still not available after import');
            console.error('[HotlineTrack] L object:', L);
            console.error('[HotlineTrack] window.L:', (window as any).L);
          }
        })
        .catch((err) => {
          console.error('[HotlineTrack] Failed to load leaflet-hotline:', err);
        });
    } else {
      console.log('[HotlineTrack] Plugin already available');
    }
  }, []); // Run once on mount

  // Main effect: handles min, max, weight changes and initial creation
  // Note: positions is NOT in dependencies to avoid unnecessary cleanup/recreation
  useEffect(() => {
    console.log('[HotlineTrack] Effect triggered (params)', {
      positionsCount: positions.length,
      min,
      max,
      weight,
      hasMap: !!map,
    });

    // Check if leaflet-hotline is available
    const hasHotline = typeof (L as any).hotline === 'function';
    console.log('[HotlineTrack] leaflet-hotline available:', hasHotline);
    
    if (!hasHotline) {
      console.error('[HotlineTrack] leaflet-hotline is not available. Make sure it is imported correctly.');
      console.error('[HotlineTrack] L object:', L);
      console.error('[HotlineTrack] window.L:', typeof window !== 'undefined' ? (window as any).L : 'N/A');
      return;
    }

    // Check if we have enough positions to create/update hotline
    if (positions.length < 2) {
      console.log('[HotlineTrack] Not enough positions:', positions.length);
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

    // Ensure min != max for palette to work
    const effectiveMin = min;
    const effectiveMax = min === max ? min + 0.1 : max;
    
    // Validate min/max
    if (min === max) {
      console.warn('[HotlineTrack] min and max are equal:', min, '- adding small range');
      console.log('[HotlineTrack] Using adjusted max:', effectiveMax);
    } else {
      console.log('[HotlineTrack] SOG range:', { min, max, range: max - min });
    }

    // Check if params changed (using effective values)
    const paramsChanged =
      lastParamsRef.current.min !== effectiveMin ||
      lastParamsRef.current.max !== effectiveMax ||
      lastParamsRef.current.weight !== weight;

    // Update params ref
    if (paramsChanged) {
      lastParamsRef.current = { min: effectiveMin, max: effectiveMax, weight };
    }

    // Créer la palette de couleurs (bleu → cyan → vert → jaune → orange → rouge)
    // Correspond à l'échelle de getSogColor
    const palette: Record<number, string> = {
      0.0: 'rgb(0, 100, 255)', // Bleu (lent)
      0.2: 'rgb(0, 255, 255)', // Cyan
      0.4: 'rgb(0, 255, 0)', // Vert
      0.6: 'rgb(255, 255, 0)', // Jaune
      0.8: 'rgb(255, 165, 0)', // Orange
      1.0: 'rgb(255, 0, 0)', // Rouge (rapide)
    };

    console.log('[HotlineTrack] Creating/updating hotline with options:', {
      positionsCount: positions.length,
      effectiveMin,
      effectiveMax,
      palette,
      weight,
    });

    try {
      // Si la hotline existe déjà, mettre à jour les options seulement si params changed
      if (hotlineRef.current) {
        console.log('[HotlineTrack] Hotline exists, checking if params changed:', paramsChanged);
        if (paramsChanged) {
          console.log('[HotlineTrack] Updating hotline options');
          hotlineRef.current.setOptions({
            min: effectiveMin,
            max: effectiveMax,
            palette,
            weight,
            outlineColor: 'transparent',
            outlineWidth: 0,
            opacity: 0.7,
          });
          // Also update positions if they changed (defensive check)
          if (!positionsEqual(positionsRef.current, positions)) {
            console.log('[HotlineTrack] Positions also changed, updating them');
            hotlineRef.current.setLatLngs(positions);
            positionsRef.current = positions;
          }
        }
        return;
      }

      // Créer une nouvelle hotline avec les positions actuelles
      // This runs when hotline doesn't exist yet and we have valid positions
      console.log('[HotlineTrack] Creating new hotline', {
        positionsCount: positions.length,
        effectiveMin,
        effectiveMax,
      });
      const hotline = (L as any).hotline(positions, {
        min: effectiveMin,
        max: effectiveMax,
        palette,
        weight,
        outlineColor: 'transparent',
        outlineWidth: 0,
        opacity: 0.7,
      }) as L.Hotline;

      console.log('[HotlineTrack] Hotline created, adding to map');
      hotline.addTo(map);
      hotlineRef.current = hotline;
      positionsRef.current = positions;
      console.log('[HotlineTrack] Hotline successfully added to map');
    } catch (error) {
      console.error('[HotlineTrack] Error creating or updating hotline:', error);
      console.error('[HotlineTrack] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
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
        console.log('[HotlineTrack] Cleanup: removing hotline from map');
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
    // Check if leaflet-hotline is available
    const hasHotline = typeof (L as any).hotline === 'function';
    if (!hasHotline) {
      return;
    }

    // If hotline doesn't exist yet but we have valid positions, create it
    if (!hotlineRef.current && positions.length >= 2) {
      console.log('[HotlineTrack] Positions effect: hotline not created yet but positions are valid, creating hotline');
      
      // Ensure min != max for palette to work
      const effectiveMin = min;
      const effectiveMax = min === max ? min + 0.1 : max;
      
      // Créer la palette de couleurs
      const palette: Record<number, string> = {
        0.0: 'rgb(0, 100, 255)', // Bleu (lent)
        0.2: 'rgb(0, 255, 255)', // Cyan
        0.4: 'rgb(0, 255, 0)', // Vert
        0.6: 'rgb(255, 255, 0)', // Jaune
        0.8: 'rgb(255, 165, 0)', // Orange
        1.0: 'rgb(255, 0, 0)', // Rouge (rapide)
      };

      try {
        console.log('[HotlineTrack] Creating hotline from positions effect');
        const hotline = (L as any).hotline(positions, {
          min: effectiveMin,
          max: effectiveMax,
          palette,
          weight,
          outlineColor: 'transparent',
          outlineWidth: 0,
          opacity: 0.7,
        }) as L.Hotline;

        hotline.addTo(map);
        hotlineRef.current = hotline;
        positionsRef.current = positions;
        lastParamsRef.current = { min: effectiveMin, max: effectiveMax, weight };
        console.log('[HotlineTrack] Hotline created from positions effect');
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
      console.log('[HotlineTrack] Positions effect: not enough positions, removing hotline');
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
    const effectiveMin = min;
    const effectiveMax = min === max ? min + 0.1 : max;
    const paramsChanged =
      lastParamsRef.current.min !== effectiveMin ||
      lastParamsRef.current.max !== effectiveMax ||
      lastParamsRef.current.weight !== weight;

    if (paramsChanged) {
      console.log('[HotlineTrack] Params changed in positions effect, updating options');
      const palette: Record<number, string> = {
        0.0: 'rgb(0, 100, 255)', // Bleu (lent)
        0.2: 'rgb(0, 255, 255)', // Cyan
        0.4: 'rgb(0, 255, 0)', // Vert
        0.6: 'rgb(255, 255, 0)', // Jaune
        0.8: 'rgb(255, 165, 0)', // Orange
        1.0: 'rgb(255, 0, 0)', // Rouge (rapide)
      };
      try {
        hotlineRef.current.setOptions({
          min: effectiveMin,
          max: effectiveMax,
          palette,
          weight,
          outlineColor: 'transparent',
          outlineWidth: 0,
          opacity: 0.7,
        });
        lastParamsRef.current = { min: effectiveMin, max: effectiveMax, weight };
      } catch (error) {
        console.error('[HotlineTrack] Error updating hotline options:', error);
      }
    }

    // Only update positions if they actually changed (deep comparison)
    if (!positionsEqual(positionsRef.current, positions)) {
      console.log('[HotlineTrack] Positions changed, updating hotline', {
        oldCount: positionsRef.current.length,
        newCount: positions.length,
      });
      try {
        hotlineRef.current.setLatLngs(positions);
        positionsRef.current = positions;
        console.log('[HotlineTrack] Positions updated successfully');
      } catch (error) {
        console.error('[HotlineTrack] Error updating hotline positions:', error);
        console.error('[HotlineTrack] Error details:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    } else {
      console.log('[HotlineTrack] Positions unchanged, skipping update');
    }
  }, [positions, map, min, max, weight]); // Include min, max, weight to allow creation when positions become valid

  return null;
}

