import Papa from 'papaparse';
import type { TrackPoint, BoatTrack, RaceDataset } from '../types';
import { generateBoatColor } from '@/lib/color';

type RawCSVRow = Record<string, string>;

/**
 * Normalize timestamp to epoch milliseconds
 * Accepts ISO 8601 strings or epoch ms (as string or number)
 */
function normalizeTimestamp(value: string | number): number | null {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    // Try ISO 8601 first
    const isoDate = new Date(value);
    if (!isNaN(isoDate.getTime())) {
      return isoDate.getTime();
    }
    // Try epoch ms
    const epoch = Number.parseFloat(value);
    if (!isNaN(epoch) && epoch > 0) {
      return epoch;
    }
  }
  return null;
}

/**
 * Validate and normalize a CSV row into a TrackPoint
 */
function parseRow(row: RawCSVRow): TrackPoint | null {
  // Find columns (case-insensitive)
  const getValue = (key: string): string | undefined => {
    const lowerKey = key.toLowerCase();
    return row[lowerKey] || row[key];
  };

  const timestamp = getValue('timestamp');
  const latStr = getValue('lat');
  const lonStr = getValue('lon');
  const boatId = getValue('boat_id');

  if (!timestamp || !latStr || !lonStr || !boatId) {
    return null; // Required fields missing
  }

  const t = normalizeTimestamp(timestamp);
  if (t === null) {
    return null;
  }

  const lat = Number.parseFloat(latStr);
  const lon = Number.parseFloat(lonStr);

  // Validate lat/lon ranges
  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }

  const point: TrackPoint = {
    t,
    lat,
    lon,
  };

  // Optional fields
  const sog = getValue('sog');
  const cog = getValue('cog');
  const twd = getValue('twd');
  const awa = getValue('awa');
  const twa = getValue('twa');

  if (sog) {
    const sogNum = Number.parseFloat(sog);
    if (!isNaN(sogNum)) point.sog = sogNum;
  }
  if (cog) {
    const cogNum = Number.parseFloat(cog);
    if (!isNaN(cogNum)) point.cog = cogNum;
  }

  // Normalize wind direction fields (0-360 or -180 to 180)
  if (twd) {
    const twdNum = Number.parseFloat(twd);
    if (!isNaN(twdNum)) {
      // Normalize to 0-360
      let normalized = twdNum;
      if (normalized < 0) normalized += 360;
      if (normalized >= 360) normalized -= 360;
      point.twd = normalized;
    }
  }
  if (awa) {
    const awaNum = Number.parseFloat(awa);
    if (!isNaN(awaNum)) {
      // Normalize to 0-360
      let normalized = awaNum;
      if (normalized < 0) normalized += 360;
      if (normalized >= 360) normalized -= 360;
      point.awa = normalized;
    }
  }
  if (twa) {
    const twaNum = Number.parseFloat(twa);
    if (!isNaN(twaNum)) {
      // Normalize to 0-360
      let normalized = twaNum;
      if (normalized < 0) normalized += 360;
      if (normalized >= 360) normalized -= 360;
      point.twa = normalized;
    }
  }

  // Add any other fields from the row
  Object.keys(row).forEach((key) => {
    const lowerKey = key.toLowerCase();
    if (
      ![
        'timestamp',
        'lat',
        'lon',
        'boat_id',
        'boat_name',
        'sog',
        'cog',
        'twd',
        'awa',
        'twa',
      ].includes(lowerKey)
    ) {
      point[key] = row[key];
    }
  });

  return point;
}

/**
 * Parse CSV file content and return RaceDataset
 */
export async function parseCSV(csvContent: string): Promise<RaceDataset> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawCSVRow>(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        if (results.errors.length > 0) {
          console.warn('CSV parsing warnings:', results.errors);
        }

        // Group points by boat_id
        const boatMap = new Map<string, { name: string; points: TrackPoint[] }>();

        for (const row of results.data) {
          const point = parseRow(row);
          if (!point) continue;

          // Get boat_id (case-insensitive)
          const boatIdKey = Object.keys(row).find(
            (k) => k.toLowerCase() === 'boat_id'
          );
          const boatId = boatIdKey ? row[boatIdKey].trim() : null;

          if (!boatId) continue;

          // Get boat_name (case-insensitive, fallback to boat_id)
          const boatNameKey = Object.keys(row).find(
            (k) => k.toLowerCase() === 'boat_name'
          );
          const boatName = boatNameKey
            ? row[boatNameKey].trim() || boatId
            : boatId;

          if (!boatMap.has(boatId)) {
            boatMap.set(boatId, { name: boatName, points: [] });
          }

          boatMap.get(boatId)!.points.push(point);
        }

        // Convert to BoatTrack array, sort points, and calculate time range
        const boats: BoatTrack[] = [];
        let tMin = Infinity;
        let tMax = -Infinity;

        for (const [boatId, { name, points }] of boatMap.entries()) {
          if (points.length === 0) continue;

          // Sort points by timestamp
          points.sort((a, b) => a.t - b.t);

          // Update time range
          const boatMin = points[0].t;
          const boatMax = points[points.length - 1].t;
          tMin = Math.min(tMin, boatMin);
          tMax = Math.max(tMax, boatMax);

          boats.push({
            id: boatId,
            name,
            color: generateBoatColor(boatId),
            points,
          });
        }

        if (boats.length === 0) {
          reject(new Error('No valid boat tracks found in CSV'));
          return;
        }

        resolve({
          boats,
          tMin,
          tMax,
        });
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}
