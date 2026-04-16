import Papa from 'papaparse';

export type CsvInputType = 'adrena' | 'platform';
export type CsvDetectedType = CsvInputType | 'unknown';

export interface NormalizedCsvRow {
  time: number;
  boat_id: string;
  boat_name: string;
  lon: number;
  lat: number;
  speed?: number;
  cog?: number;
  twd?: number;
  awa?: number;
  twa?: number;
  sourceOrder: number;
}

type CsvRow = Record<string, string>;

export interface ParseCsvInputResult {
  type: CsvInputType;
  rows: NormalizedCsvRow[];
  validRows: number;
  rejectedRows: number;
  errors: string[];
}

const OUTPUT_COLUMNS = ['time', 'boat_id', 'boat_name', 'lon', 'lat', 'speed', 'cog', 'twd', 'awa', 'twa'];

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function sanitizeText(value: string | undefined): string {
  return (value ?? '').trim();
}

function normalizeTimestamp(value: string | number): number | null {
  if (typeof value === 'number') {
    if (value > 0 && value < 1e12) return value * 1000;
    return value;
  }

  const text = sanitizeText(String(value));
  if (!text || text === '---') return null;

  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.getTime();
  }

  const numeric = Number.parseFloat(text.replace(',', '.'));
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }

  return null;
}

function parseNumberWithUnit(value: string | undefined): number | null {
  const text = sanitizeText(value);
  if (!text || text === '---') return null;
  const normalized = text.replace(',', '.');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalNumber(value: number | null): number | undefined {
  return value === null ? undefined : value;
}

function parseAdrenaCoordinate(value: string | undefined, kind: 'lat' | 'lon'): number | null {
  const text = sanitizeText(value);
  if (!text || text === '---') return null;

  // Be tolerant to encoding artifacts where "°" may become a replacement char.
  // We only require: degrees, minutes, hemisphere letter.
  const match = text.match(/(\d+)\D+(\d+(?:[.,]\d+)?)\D*([NSEW])/i);
  if (!match) return null;

  const deg = Number.parseFloat(match[1]);
  const min = Number.parseFloat(match[2].replace(',', '.'));
  const hemi = match[3].toUpperCase();

  if (!Number.isFinite(deg) || !Number.isFinite(min)) return null;
  let decimal = deg + min / 60;

  const isNegative = hemi === 'S' || hemi === 'W';
  if (isNegative) decimal *= -1;

  if (kind === 'lat' && (decimal < -90 || decimal > 90)) return null;
  if (kind === 'lon' && (decimal < -180 || decimal > 180)) return null;

  return decimal;
}

function parseAdrenaUtcDateTime(dateText: string | undefined, timeText: string | undefined): number | null {
  const datePart = sanitizeText(dateText);
  const timePart = sanitizeText(timeText);
  if (!datePart || !timePart) return null;

  const dateMatch = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const timeMatch = timePart.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (!dateMatch || !timeMatch) return null;

  const day = Number.parseInt(dateMatch[1], 10);
  const month = Number.parseInt(dateMatch[2], 10);
  const year = Number.parseInt(dateMatch[3], 10);
  const hour = Number.parseInt(timeMatch[1], 10);
  const minute = Number.parseInt(timeMatch[2], 10);
  const second = Number.parseInt(timeMatch[3], 10);

  const millis = Date.UTC(year, month - 1, day, hour, minute, second);
  return Number.isFinite(millis) ? millis : null;
}

function getValueByHeaderMap(row: CsvRow, preferredHeaders: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const targetHeader of preferredHeaders) {
    const found = keys.find((k) => normalizeHeader(k) === normalizeHeader(targetHeader));
    if (found) return row[found];
  }
  return undefined;
}

function parsePlatformRow(row: CsvRow, sourceOrder: number): NormalizedCsvRow | null {
  const timeValue = getValueByHeaderMap(row, ['time', 'timestamp']);
  const latValue = getValueByHeaderMap(row, ['lat']);
  const lonValue = getValueByHeaderMap(row, ['lon']);
  const boatIdValue = getValueByHeaderMap(row, ['boat_id']);
  const boatNameValue = getValueByHeaderMap(row, ['boat_name']);

  const time = normalizeTimestamp(timeValue ?? '');
  const lat = parseNumberWithUnit(latValue);
  const lon = parseNumberWithUnit(lonValue);
  const boatId = sanitizeText(boatIdValue);
  const boatName = sanitizeText(boatNameValue) || boatId;

  if (time === null || lat === null || lon === null || !boatId) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return {
    time,
    boat_id: boatId,
    boat_name: boatName,
    lat,
    lon,
    speed: toOptionalNumber(parseNumberWithUnit(getValueByHeaderMap(row, ['speed', 'sog']))),
    cog: toOptionalNumber(parseNumberWithUnit(getValueByHeaderMap(row, ['cog']))),
    twd: toOptionalNumber(parseNumberWithUnit(getValueByHeaderMap(row, ['twd']))),
    awa: toOptionalNumber(parseNumberWithUnit(getValueByHeaderMap(row, ['awa']))),
    twa: toOptionalNumber(parseNumberWithUnit(getValueByHeaderMap(row, ['twa']))),
    sourceOrder,
  };
}

function parseAdrenaRow(
  row: CsvRow,
  sourceOrder: number,
  boatId: string,
  boatName: string
): NormalizedCsvRow | null {
  const time = parseAdrenaUtcDateTime(
    getValueByHeaderMap(row, ['date TU']),
    getValueByHeaderMap(row, ['heure TU'])
  );
  const lat = parseAdrenaCoordinate(getValueByHeaderMap(row, ['latitude']), 'lat');
  const lon = parseAdrenaCoordinate(getValueByHeaderMap(row, ['longitude']), 'lon');

  if (time === null || lat === null || lon === null || !boatId) return null;

  return {
    time,
    boat_id: boatId,
    boat_name: boatName || boatId,
    lat,
    lon,
    speed: toOptionalNumber(parseNumberWithUnit(getValueByHeaderMap(row, ['vitesse fond']))),
    cog: toOptionalNumber(parseNumberWithUnit(getValueByHeaderMap(row, ['route fond']))),
    twd: toOptionalNumber(parseNumberWithUnit(getValueByHeaderMap(row, ['TWD']))),
    awa: toOptionalNumber(parseNumberWithUnit(getValueByHeaderMap(row, ['AWA']))),
    twa: toOptionalNumber(parseNumberWithUnit(getValueByHeaderMap(row, ['TWA']))),
    sourceOrder,
  };
}

function hasAllPlatformHeaders(headers: string[]): boolean {
  const normalized = new Set(headers.map((h) => normalizeHeader(h)));
  const hasTime = normalized.has('time') || normalized.has('timestamp');
  return hasTime && normalized.has('lat') && normalized.has('lon') && normalized.has('boat_id');
}

function hasAdrenaHeaders(headers: string[]): boolean {
  const normalized = new Set(headers.map((h) => normalizeHeader(h)));
  return (
    normalized.has('date tu') &&
    normalized.has('heure tu') &&
    normalized.has('latitude') &&
    normalized.has('longitude')
  );
}

export function detectCsvInputType(content: string): CsvDetectedType {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) return 'unknown';
  const delimiter = firstLine.includes(';') ? ';' : ',';
  const headers = firstLine.split(delimiter).map((h) => h.trim());
  if (hasAdrenaHeaders(headers)) return 'adrena';
  if (hasAllPlatformHeaders(headers)) return 'platform';
  return 'unknown';
}

export function parseCsvInputFile(params: {
  content: string;
  type: CsvInputType;
  sourceOrderBase: number;
  boatId?: string;
  boatName?: string;
}): ParseCsvInputResult {
  const { content, type, sourceOrderBase, boatId, boatName } = params;
  const delimiter = type === 'adrena' ? ';' : ',';
  const errors: string[] = [];
  const parsed = Papa.parse<CsvRow>(content, {
    header: true,
    skipEmptyLines: true,
    delimiter,
    transformHeader: (header) => header.trim(),
  });

  if (parsed.errors.length > 0) {
    errors.push(...parsed.errors.slice(0, 5).map((err) => err.message));
  }

  const headers = (parsed.meta.fields ?? []).map((h) => h.trim());
  if (type === 'adrena' && !hasAdrenaHeaders(headers)) {
    errors.push('ADRENA headers missing (date TU/heure TU/latitude/longitude)');
  }
  if (type === 'platform' && !hasAllPlatformHeaders(headers)) {
    errors.push('Platform headers missing (time|timestamp, lat, lon, boat_id)');
  }

  const normalizedRows: NormalizedCsvRow[] = [];
  let rejectedRows = 0;
  const adrenaBoatId = sanitizeText(boatId);
  const adrenaBoatName = sanitizeText(boatName) || adrenaBoatId;

  if (type === 'adrena' && !adrenaBoatId) {
    errors.push('Boat ID is required for ADRENA files');
    return { type, rows: [], validRows: 0, rejectedRows: parsed.data.length, errors };
  }

  parsed.data.forEach((row, index) => {
    const sourceOrder = sourceOrderBase + index;
    const parsedRow =
      type === 'adrena'
        ? parseAdrenaRow(row, sourceOrder, adrenaBoatId, adrenaBoatName)
        : parsePlatformRow(row, sourceOrder);

    if (!parsedRow) {
      rejectedRows += 1;
      return;
    }
    normalizedRows.push(parsedRow);
  });

  return {
    type,
    rows: normalizedRows,
    validRows: normalizedRows.length,
    rejectedRows,
    errors,
  };
}

function completenessScore(row: NormalizedCsvRow): number {
  let score = 0;
  if (row.speed !== undefined) score += 1;
  if (row.cog !== undefined) score += 1;
  if (row.twd !== undefined) score += 1;
  if (row.awa !== undefined) score += 1;
  if (row.twa !== undefined) score += 1;
  return score;
}

function pickBestRow(a: NormalizedCsvRow, b: NormalizedCsvRow): NormalizedCsvRow {
  const scoreA = completenessScore(a);
  const scoreB = completenessScore(b);
  if (scoreA !== scoreB) return scoreA > scoreB ? a : b;
  return a.sourceOrder >= b.sourceOrder ? a : b;
}

export function mergeNormalizedRows(allRows: NormalizedCsvRow[]): NormalizedCsvRow[] {
  const fullKeyMap = new Map<string, NormalizedCsvRow>();
  for (const row of allRows) {
    const fullKey = `${row.time}|${row.boat_id}|${row.lat}|${row.lon}`;
    const existing = fullKeyMap.get(fullKey);
    if (!existing) {
      fullKeyMap.set(fullKey, row);
    } else {
      fullKeyMap.set(fullKey, pickBestRow(existing, row));
    }
  }

  const timeBoatMap = new Map<string, NormalizedCsvRow>();
  for (const row of fullKeyMap.values()) {
    const key = `${row.time}|${row.boat_id}`;
    const existing = timeBoatMap.get(key);
    if (!existing) {
      timeBoatMap.set(key, row);
    } else {
      timeBoatMap.set(key, pickBestRow(existing, row));
    }
  }

  return Array.from(timeBoatMap.values()).sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.boat_id.localeCompare(b.boat_id);
  });
}

export function normalizedRowsToCsv(rows: NormalizedCsvRow[]): string {
  const exportRows = rows.map((row) => ({
    time: row.time,
    boat_id: row.boat_id,
    boat_name: row.boat_name || row.boat_id,
    lon: row.lon,
    lat: row.lat,
    speed: row.speed,
    cog: row.cog,
    twd: row.twd,
    awa: row.awa,
    twa: row.twa,
  }));

  return Papa.unparse(exportRows, {
    header: true,
    columns: OUTPUT_COLUMNS,
  });
}

export function filenameToBoatId(filename: string): string {
  const noExt = filename.replace(/\.[^/.]+$/, '');
  const slug = noExt
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || `boat_${Date.now()}`;
}
