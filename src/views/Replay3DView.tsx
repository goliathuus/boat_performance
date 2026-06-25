import { useMemo, useState, useCallback } from 'react';
import { useReplayStore } from '@/state/useReplayStore';
import type { BoatTrack } from '@/domain/types';
import { interpolatePosition } from '@/domain/tracks';
import type { SessionData } from '@/state/useReplayStore';
import {
  bearingDegrees,
  cogToYawRadians,
  projectLatLonToXZ,
} from '@/lib/geo/localEnu';
import { ThreeScene } from '@/3d/ThreeScene';
import type { BoatPose3D } from '@/3d/replay3dTypes';
import { NorthCompassHud } from '@/components/replay/NorthCompassHud';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type Replay3DViewProps = {
  currentTime: number;
};

/** Trace window relative to playhead (and clamped by global replay window start). */
export type TrailWindowMode = 'replay' | '1h' | '30m' | '10m';

const TRAIL_MS: Record<Exclude<TrailWindowMode, 'replay'>, number> = {
  '1h': 60 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '10m': 10 * 60 * 1000,
};
const TRAIL_UPDATE_INTERVAL_MS = 120;

function sessionToBoatTrack(session: SessionData): BoatTrack {
  return {
    id: session.id,
    name: session.boatDisplayName ?? session.name,
    color: session.color,
    points: session.points,
  };
}

function headingFromSegmentAtTime(boat: BoatTrack, t: number): number {
  const pts = boat.points;
  if (pts.length < 2) return 0;
  if (t <= pts[0].t) {
    return bearingDegrees(pts[0].lat, pts[0].lon, pts[1].lat, pts[1].lon);
  }
  if (t >= pts[pts.length - 1].t) {
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    return bearingDegrees(a.lat, a.lon, b.lat, b.lon);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    if (t >= p1.t && t <= p2.t) {
      return bearingDegrees(p1.lat, p1.lon, p2.lat, p2.lon);
    }
  }
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  return bearingDegrees(a.lat, a.lon, b.lat, b.lon);
}

function decimateIndices(count: number, maxPoints: number): number[] {
  if (count <= maxPoints) return Array.from({ length: count }, (_, i) => i);
  const step = count / maxPoints;
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(Math.min(count - 1, Math.floor(i * step)));
  }
  if (out[out.length - 1] !== count - 1) out.push(count - 1);
  return out;
}

function getTrailBudget(mode: TrailWindowMode): { maxRawPoints: number; extraPerSegment: number } {
  switch (mode) {
    case '10m':
      return { maxRawPoints: 120, extraPerSegment: 1 };
    case '30m':
      return { maxRawPoints: 160, extraPerSegment: 0 };
    case '1h':
      return { maxRawPoints: 200, extraPerSegment: 0 };
    case 'replay':
    default:
      return { maxRawPoints: 220, extraPerSegment: 0 };
  }
}

function trailStartTime(
  mode: TrailWindowMode,
  currentTime: number,
  windowStartTime: number | null
): number {
  if (mode === 'replay') {
    return windowStartTime ?? -Infinity;
  }
  const rel = currentTime - TRAIL_MS[mode];
  if (windowStartTime !== null) {
    return Math.max(rel, windowStartTime);
  }
  return rel;
}

function applyLabelOffsets(boats: BoatPose3D[]): BoatPose3D[] {
  if (boats.length <= 1) {
    return boats.map((b) => ({ ...b, labelOffsetX: 0, labelOffsetY: 0 }));
  }

  const sorted = [...boats].sort((a, b) => a.z - b.z || a.x - b.x);
  const taken: Array<{ x: number; z: number; slot: number }> = [];
  const SLOT_OFFSETS_X = [0, 10, -10, 18, -18, 26, -26];
  const SLOT_OFFSETS_Y = [0, 1.8, 1.8, 3.5, 3.5, 5, 5];
  const NEAR_RADIUS = 28;

  const out = sorted.map((boat) => {
    let slot = 0;
    while (slot < SLOT_OFFSETS_X.length) {
      const ox = SLOT_OFFSETS_X[slot];
      const oz = 0;
      const conflict = taken.some((t) => {
        const dx = boat.x + ox - (t.x + SLOT_OFFSETS_X[t.slot]);
        const dz = boat.z + oz - (t.z + 0);
        return dx * dx + dz * dz < NEAR_RADIUS * NEAR_RADIUS;
      });
      if (!conflict) break;
      slot += 1;
    }

    if (slot >= SLOT_OFFSETS_X.length) slot = SLOT_OFFSETS_X.length - 1;
    taken.push({ x: boat.x, z: boat.z, slot });

    return {
      ...boat,
      labelOffsetX: SLOT_OFFSETS_X[slot],
      labelOffsetY: SLOT_OFFSETS_Y[slot],
    };
  });

  // Keep original order stable for rendering.
  const byId = new Map(out.map((b) => [b.sessionId, b]));
  return boats.map((b) => byId.get(b.sessionId) ?? { ...b, labelOffsetX: 0, labelOffsetY: 0 });
}

/**
 * Full-viewport 3D replay: projects GPS tracks to local metres and drives ThreeScene.
 */
export function Replay3DView({ currentTime }: Replay3DViewProps) {
  const selectedSessionIds = useReplayStore((s) => s.selectedSessionIds);
  const hiddenSessionIds = useReplayStore((s) => s.hiddenSessionIds);
  const sessions = useReplayStore((s) => s.sessions);
  const windowStartTime = useReplayStore((s) => s.windowStartTime);
  const focusSessionId = useReplayStore((s) => s.focusSessionId);

  const [trailWindowMode, setTrailWindowMode] = useState<TrailWindowMode>('replay');
  const [viewerAzimuthRad, setViewerAzimuthRad] = useState(0);
  const onViewerAzimuth = useCallback((rad: number) => {
    setViewerAzimuthRad(rad);
  }, []);

  const { originLat, originLon, tracks } = useMemo(() => {
    const visibleIds = selectedSessionIds.filter((id) => !hiddenSessionIds.has(id));
    const list: BoatTrack[] = [];
    let sumLat = 0;
    let sumLon = 0;
    let n = 0;

    for (const id of visibleIds) {
      const session = sessions.get(id);
      if (!session || session.points.length === 0) continue;
      list.push(sessionToBoatTrack(session));
      for (const p of session.points) {
        sumLat += p.lat;
        sumLon += p.lon;
        n += 1;
      }
    }

    if (n === 0) {
      return { originLat: 46, originLon: -1, tracks: [] as BoatTrack[] };
    }

    return {
      originLat: sumLat / n,
      originLon: sumLon / n,
      tracks: list,
    };
  }, [selectedSessionIds, hiddenSessionIds, sessions]);

  // Keep sea size stable during playback: compute from full telemetry, not time-sliced trail.
  const stableSeaHalfExtentM = useMemo(() => {
    const allXZ: Array<{ x: number; z: number }> = [];
    for (const boat of tracks) {
      for (const p of boat.points) {
        allXZ.push(projectLatLonToXZ(p.lat, p.lon, originLat, originLon));
      }
    }

    if (allXZ.length === 0) {
      return 120;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of allXZ) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }

    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    const span = Math.max(spanX, spanZ, 80);
    return span * 0.65 + 80;
  }, [tracks, originLat, originLon]);

  // Perf cache: pre-project all telemetry once per dataset/origin change.
  const projectedTracks = useMemo(() => {
    return tracks.map((boat) => ({
      id: boat.id,
      projected: boat.points.map((p) => {
        const xz = projectLatLonToXZ(p.lat, p.lon, originLat, originLon);
        return { t: p.t, x: xz.x, z: xz.z };
      }),
    }));
  }, [tracks, originLat, originLon]);

  const scenePayload = useMemo(() => {
    const boats: BoatPose3D[] = [];
    const tMinTrail = trailStartTime(trailWindowMode, currentTime, windowStartTime);
    const quantizedTrailTime =
      Math.floor(currentTime / TRAIL_UPDATE_INTERVAL_MS) * TRAIL_UPDATE_INTERVAL_MS;

    for (const boat of tracks) {
      const interp = interpolatePosition(boat, currentTime);
      if (!interp) continue;

      const cog = interp.point?.cog;
      const headingDeg =
        cog !== undefined && !Number.isNaN(cog)
          ? cog
          : headingFromSegmentAtTime(boat, currentTime);

      const { x, z } = projectLatLonToXZ(interp.lat, interp.lon, originLat, originLon);
      const yawRadians = cogToYawRadians(headingDeg);

      // Lightweight trail: update at fixed cadence + use projected cache.
      const projected = projectedTracks.find((p) => p.id === boat.id)?.projected ?? [];
      const rawTrail = projected.filter((p) => p.t <= quantizedTrailTime && p.t >= tMinTrail);
      const { maxRawPoints, extraPerSegment } = getTrailBudget(trailWindowMode);
      const rawIdxs =
        rawTrail.length > maxRawPoints
          ? decimateIndices(rawTrail.length, maxRawPoints)
          : rawTrail.map((_, i) => i);

      const trailXZ: Array<[number, number]> = [];
      const sampledRaw = rawIdxs.map((i) => rawTrail[i]);

      for (let i = 0; i < sampledRaw.length; i++) {
        const p1 = sampledRaw[i];
        trailXZ.push([p1.x, p1.z]);

        const p2 = sampledRaw[i + 1];
        if (!p2) continue;

        // Add a few interpolation points between raw GPS points for smoother rendering.
        for (let k = 1; k <= extraPerSegment; k++) {
          const ratio = k / (extraPerSegment + 1);
          const ti = p1.t + (p2.t - p1.t) * ratio;
          const interpMid = interpolatePosition(boat, ti);
          if (!interpMid) continue;
          const xzi = projectLatLonToXZ(interpMid.lat, interpMid.lon, originLat, originLon);
          trailXZ.push([xzi.x, xzi.z]);
        }
      }

      // Ensure the trail ends exactly at the rendered boat center (currentTime).
      const xzNow = projectLatLonToXZ(interp.lat, interp.lon, originLat, originLon);
      const last = trailXZ[trailXZ.length - 1];
      if (!last || last[0] !== xzNow.x || last[1] !== xzNow.z) {
        trailXZ.push([xzNow.x, xzNow.z]);
      }

      boats.push({
        sessionId: boat.id,
        name: boat.name,
        color: boat.color,
        x,
        z,
        yawRadians,
        sogKn: interp.point?.sog ?? null,
        cogDeg: headingDeg,
        labelOffsetX: 0,
        labelOffsetY: 0,
        t: currentTime,
        trail: trailXZ,
      });
    }

    let cameraFocusX = 0;
    let cameraFocusZ = 0;
    if (boats.length > 0) {
      if (focusSessionId) {
        const b = boats.find((boat) => boat.sessionId === focusSessionId);
        if (b) {
          cameraFocusX = b.x;
          cameraFocusZ = b.z;
        } else {
          cameraFocusX = boats[0].x;
          cameraFocusZ = boats[0].z;
        }
      } else if (boats.length === 1) {
        cameraFocusX = boats[0].x;
        cameraFocusZ = boats[0].z;
      } else {
        cameraFocusX = boats.reduce((s, boat) => s + boat.x, 0) / boats.length;
        cameraFocusZ = boats.reduce((s, boat) => s + boat.z, 0) / boats.length;
      }
    }

    const boatsWithLabelOffsets = applyLabelOffsets(boats);

    return {
      boats: boatsWithLabelOffsets,
      cameraFocusX,
      cameraFocusZ,
      hasBoats: boatsWithLabelOffsets.length > 0,
    };
  }, [
    tracks,
    currentTime,
    originLat,
    originLon,
    windowStartTime,
    focusSessionId,
    trailWindowMode,
    projectedTracks,
  ]);

  return (
    <div className="absolute inset-0 z-0 h-full w-full">
      <div
        className={cn(
          'pointer-events-auto absolute left-4 top-20 z-[500] flex flex-col gap-1 rounded-md border bg-background/90 px-2 py-1.5 shadow-sm backdrop-blur-sm',
          'max-w-[200px]'
        )}
      >
        <label className="text-xs font-medium text-muted-foreground" htmlFor="trail-window-3d">
          Trace affichée
        </label>
        <Select
          id="trail-window-3d"
          className="h-9 text-xs"
          value={trailWindowMode}
          onChange={(e) => setTrailWindowMode(e.target.value as TrailWindowMode)}
        >
          <option value="replay">Fenêtre replay (carte)</option>
          <option value="1h">Dernière heure</option>
          <option value="30m">Dernières 30 min</option>
          <option value="10m">Dernières 10 min</option>
        </Select>
      </div>

      <NorthCompassHud viewerAzimuthRad={viewerAzimuthRad} />

      <ThreeScene
        boats={scenePayload.boats}
        seaHalfExtentM={stableSeaHalfExtentM}
        cameraFocusX={scenePayload.cameraFocusX}
        cameraFocusZ={scenePayload.cameraFocusZ}
        hasBoats={scenePayload.hasBoats}
        onViewerAzimuth={onViewerAzimuth}
      />
    </div>
  );
}
