export type PolarDataPoint = {
  twa: number; // True Wind Angle (degrees)
  tws: number; // True Wind Speed (knots)
  sog: number; // Speed Over Ground (knots)
};

export type PolarData = PolarDataPoint[];

export type PolarCurve = {
  tws: number; // True Wind Speed
  points: Array<{ twa: number; sog: number }>; // Points for this TWS curve
};

/**
 * Parse a .pol file content
 * Format:
 * - First line: TWA\TWS followed by TWS values (tab or space separated)
 * - Subsequent lines: TWA value followed by SOG values for each TWS
 */
export function parsePolarFile(content: string): PolarData {
  const lines = content.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('Polar file must have at least 2 lines');
  }

  // Parse header line to get TWS values
  const headerLine = lines[0];
  // Split by tab or space, handling both
  const headerParts = headerLine.split(/\t|\s+/).filter((part) => part.trim() !== '');
  
  // Skip "TWA\TWS" and "0" (first two columns)
  const twsValues: number[] = [];
  for (let i = 2; i < headerParts.length; i++) {
    const tws = Number.parseFloat(headerParts[i].trim());
    if (!isNaN(tws)) {
      twsValues.push(tws);
    }
  }

  if (twsValues.length === 0) {
    throw new Error('No TWS values found in header');
  }

  // Parse data lines
  const data: PolarData = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split by tab or space, handling both
    const parts = line.split(/\t|\s+/).filter((part) => part.trim() !== '');
    if (parts.length < 2) continue;

    // First part is TWA
    const twa = Number.parseFloat(parts[0].trim());
    if (isNaN(twa)) continue;

    // Remaining parts are SOG values for each TWS (skip first "0" value)
    for (let j = 2; j < parts.length && j - 2 < twsValues.length; j++) {
      const sog = Number.parseFloat(parts[j].trim());
      if (!isNaN(sog)) {
        data.push({
          twa,
          tws: twsValues[j - 2],
          sog,
        });
      }
    }
  }

  return data;
}

/**
 * Group polar data by TWS to create curves
 */
export function groupPolarDataByTWS(data: PolarData): PolarCurve[] {
  const twsMap = new Map<number, Array<{ twa: number; sog: number }>>();

  for (const point of data) {
    if (!twsMap.has(point.tws)) {
      twsMap.set(point.tws, []);
    }
    twsMap.get(point.tws)!.push({
      twa: point.twa,
      sog: point.sog,
    });
  }

  // Sort curves by TWS and points by TWA within each curve
  const curves: PolarCurve[] = [];
  for (const [tws, points] of twsMap.entries()) {
    points.sort((a, b) => a.twa - b.twa);
    curves.push({ tws, points });
  }

  curves.sort((a, b) => a.tws - b.tws);
  return curves;
}

