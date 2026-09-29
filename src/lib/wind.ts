/**
 * Champ de vent modele (Open-Meteo) autour du plan d'eau d'un replay.
 *
 * Une grille reguliere de points lat/lon, un vecteur (u, v) par point et par
 * pas de temps. Deux modeles au choix, demandes explicitement : le mode
 * automatique d'Open-Meteo prenait ECMWF meme sur les cotes francaises, ou
 * AROME est bien plus fin. Donnees gratuites, sans cle, sous licence
 * CC BY 4.0 : l'attribution est affichee sur la carte.
 *
 * Ce sont des sorties de modele, pas des mesures : pour une date passee,
 * l'archive d'Open-Meteo conserve ce que chaque run prevoyait pour ses
 * premieres heures.
 *
 * On interpole en composantes (u, v) et non en (vitesse, direction) : moyenner
 * 350° et 10° doit donner 0°, pas 180°.
 */

export type WindModelId = 'arome' | 'ecmwf';

export type WindModel = {
  id: WindModelId;
  label: string;
  provider: string;
  resolution: string;
  /** Parametre `models` d'Open-Meteo. */
  apiModel: string;
  /** Jeu de donnees dont on lit les metadonnees de run. */
  metaDataset: string;
  /**
   * Jeu qui prend le relais au-dela de l'horizon du premier. Chez Open-Meteo,
   * AROME HD 15 min tourne toutes les heures mais ne voit que 6 h devant ;
   * plus loin, c'est le run horaire (toutes les 3 h), interpole a 15 min.
   */
  fallbackMetaDataset?: string;
  /** Bloc temporel demande : AROME HD a un vrai pas de 15 min, ECMWF est horaire. */
  block: 'minutely_15' | 'hourly';
  stepMinutes: number;
  /** Emprise couverte, null = monde entier. */
  coverage: WindBounds | null;
};

export const WIND_MODELS: Record<WindModelId, WindModel> = {
  arome: {
    id: 'arome',
    label: 'AROME HD',
    provider: 'Météo-France',
    resolution: '1,3 km',
    apiModel: 'meteofrance_arome_france_hd',
    metaDataset: 'meteofrance_arome_france_hd_15min',
    fallbackMetaDataset: 'meteofrance_arome_france_hd',
    block: 'minutely_15',
    stepMinutes: 15,
    coverage: { south: 37.5, west: -12, north: 55.4, east: 16 },
  },
  ecmwf: {
    id: 'ecmwf',
    label: 'ECMWF IFS',
    provider: 'Centre européen (ECMWF)',
    resolution: '9 km',
    apiModel: 'ecmwf_ifs',
    metaDataset: 'ecmwf_ifs',
    block: 'hourly',
    stepMinutes: 60,
    coverage: null,
  },
};

export function modelCovers(model: WindModel, b: WindBounds): boolean {
  const c = model.coverage;
  if (!c) return true;
  return b.south >= c.south && b.north <= c.north && b.west >= c.west && b.east <= c.east;
}

export type WindBounds = { south: number; west: number; north: number; east: number };

export type WindGrid = {
  model: WindModelId;
  /** 'forecast' = API de prevision (runs recents), 'archive' = archive des previsions. */
  source: 'forecast' | 'archive';
  fetchedAt: number; // epoch ms
  bounds: WindBounds;
  rows: number; // lignes, du sud au nord
  cols: number; // colonnes, de l'ouest a l'est
  times: number[]; // epoch ms, pas regulier croissant
  /** u[ti][r * cols + c] en noeuds, vers l'est ; NaN si absent. */
  u: Float32Array[];
  /** v[ti][r * cols + c] en noeuds, vers le nord ; NaN si absent. */
  v: Float32Array[];
};

/** weight : 1 au coeur de la grille, 0 sur son bord (fondu des limites a l'ecran). */
export type WindSample = { u: number; v: number; speed: number; direction: number; weight: number };

const GRID_SIZE = 8; // 8 x 8 = 64 points par requete
const EDGE_FADE_CELLS = 1.5; // largeur du fondu en bord de grille
const DAY_MS = 86_400_000;

/** Emprise des traces elargie, avec une taille minimale pour garder du relief au champ. */
export function paddedBounds(
  south: number,
  west: number,
  north: number,
  east: number
): WindBounds {
  const latSpan = Math.max(north - south, 0.2);
  const lonSpan = Math.max(east - west, 0.3);
  const latMid = (north + south) / 2;
  const lonMid = (east + west) / 2;
  // Demi-emprise + une emprise entiere de marge de chaque cote : le champ
  // deborde largement de l'ecran une fois la carte cadree sur les traces.
  const k = 0.5 + 1;
  return {
    south: latMid - latSpan * k,
    north: latMid + latSpan * k,
    west: lonMid - lonSpan * k,
    east: lonMid + lonSpan * k,
  };
}

function isoDay(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Charge deux jours UTC a partir du jour de `t` : assez pour interpoler
 * jusqu'a 23 h 59 sans requete supplementaire.
 */
export async function fetchWindGrid(
  bounds: WindBounds,
  t: number,
  modelId: WindModelId,
  signal?: AbortSignal
): Promise<WindGrid> {
  const model = WIND_MODELS[modelId];
  const rows = GRID_SIZE;
  const cols = GRID_SIZE;
  const lats: number[] = [];
  const lons: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      lats.push(bounds.south + ((bounds.north - bounds.south) * r) / (rows - 1));
      lons.push(bounds.west + ((bounds.east - bounds.west) * c) / (cols - 1));
    }
  }

  const startDay = isoDay(t);
  const endDay = isoDay(t + DAY_MS);
  // Au-dela de quelques jours dans le passe, seule l'archive des previsions
  // repond ; l'API de prevision sert le dernier run (tracking live).
  const source: WindGrid['source'] = t > Date.now() - 3 * DAY_MS ? 'forecast' : 'archive';
  const host = source === 'forecast' ? 'api.open-meteo.com' : 'historical-forecast-api.open-meteo.com';

  const params = new URLSearchParams({
    latitude: lats.map((x) => x.toFixed(4)).join(','),
    longitude: lons.map((x) => x.toFixed(4)).join(','),
    [model.block]: 'wind_speed_10m,wind_direction_10m',
    models: model.apiModel,
    wind_speed_unit: 'kn',
    timezone: 'GMT',
    timeformat: 'unixtime',
    start_date: startDay,
    end_date: endDay,
  });

  const res = await fetch(`https://${host}/v1/forecast?${params}`, { signal });
  if (!res.ok) {
    throw new Error(`Open-Meteo ${res.status}`);
  }
  const json = (await res.json()) as unknown;
  type Block = {
    time?: number[];
    wind_speed_10m?: Array<number | null>;
    wind_direction_10m?: Array<number | null>;
  };
  const locations = (Array.isArray(json) ? json : [json]) as Array<Partial<Record<WindModel['block'], Block>>>;
  if (locations.length !== rows * cols) {
    throw new Error('Open-Meteo : nombre de points inattendu');
  }

  const times = (locations[0][model.block]?.time ?? []).map((s) => s * 1000);
  const u: Float32Array[] = [];
  const v: Float32Array[] = [];
  for (let ti = 0; ti < times.length; ti++) {
    const uu = new Float32Array(rows * cols);
    const vv = new Float32Array(rows * cols);
    for (let i = 0; i < locations.length; i++) {
      const spd = locations[i][model.block]?.wind_speed_10m?.[ti];
      const dir = locations[i][model.block]?.wind_direction_10m?.[ti];
      if (spd == null || dir == null) {
        uu[i] = NaN;
        vv[i] = NaN;
        continue;
      }
      // La direction meteo est celle d'ou vient le vent : le vecteur pointe a l'oppose.
      const rad = (dir * Math.PI) / 180;
      uu[i] = -spd * Math.sin(rad);
      vv[i] = -spd * Math.cos(rad);
    }
    u.push(uu);
    v.push(vv);
  }

  return { model: modelId, source, fetchedAt: Date.now(), bounds, rows, cols, times, u, v };
}

export type ModelRunInfo = {
  /** Initialisation du dernier run publie (epoch ms). */
  lastRunInit: number;
  /** Mise en ligne de ce run chez Open-Meteo (epoch ms). */
  lastRunAvailable: number;
  /** Frequence des runs (ms). */
  updateInterval: number;
  /** Derniere echeance couverte par ce run (epoch ms). */
  dataEnd: number;
  /** Run qui prend le relais apres `dataEnd`, s'il existe. */
  fallback?: ModelRunInfo;
};

async function fetchRunMeta(dataset: string, signal?: AbortSignal): Promise<ModelRunInfo> {
  const res = await fetch(`https://api.open-meteo.com/data/${dataset}/static/meta.json`, { signal });
  if (!res.ok) throw new Error(`Open-Meteo meta ${res.status}`);
  const j = (await res.json()) as {
    last_run_initialisation_time: number;
    last_run_availability_time: number;
    update_interval_seconds: number;
    data_end_time: number;
  };
  return {
    lastRunInit: j.last_run_initialisation_time * 1000,
    lastRunAvailable: j.last_run_availability_time * 1000,
    updateInterval: j.update_interval_seconds * 1000,
    dataEnd: j.data_end_time * 1000,
  };
}

/** Metadonnees du dernier run d'un modele, publiees par Open-Meteo. */
export async function fetchModelRunInfo(modelId: WindModelId, signal?: AbortSignal): Promise<ModelRunInfo> {
  const model = WIND_MODELS[modelId];
  const [primary, fallback] = await Promise.all([
    fetchRunMeta(model.metaDataset, signal),
    model.fallbackMetaDataset ? fetchRunMeta(model.fallbackMetaDataset, signal) : Promise.resolve(undefined),
  ]);
  return { ...primary, fallback };
}

/** Rose des vents en 16 secteurs, en francais (O = ouest). */
export function cardinal(deg: number): string {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  return names[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/**
 * Prepare l'echantillonnage d'un instant : interpolation temporelle faite une
 * fois, puis `sample(lat, lon)` n'interpole plus que dans l'espace.
 */
export function windAt(grid: WindGrid, t: number): ((lat: number, lon: number) => WindSample | null) | null {
  const { times, rows, cols, bounds } = grid;
  if (times.length === 0) return null;
  const step = times.length > 1 ? times[1] - times[0] : 3_600_000;
  const pos = (t - times[0]) / step;
  if (pos < 0 || pos > times.length - 1) return null;
  const t0 = Math.floor(pos);
  const t1 = Math.min(times.length - 1, t0 + 1);
  const ft = pos - t0;

  const n = rows * cols;
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    u[i] = grid.u[t0][i] * (1 - ft) + grid.u[t1][i] * ft;
    v[i] = grid.v[t0][i] * (1 - ft) + grid.v[t1][i] * ft;
  }

  const latStep = (bounds.north - bounds.south) / (rows - 1);
  const lonStep = (bounds.east - bounds.west) / (cols - 1);

  return (lat, lon) => {
    const y = (lat - bounds.south) / latStep;
    const x = (lon - bounds.west) / lonStep;
    if (y < 0 || x < 0 || y > rows - 1 || x > cols - 1) return null;
    const r0 = Math.min(rows - 2, Math.floor(y));
    const c0 = Math.min(cols - 2, Math.floor(x));
    const fy = y - r0;
    const fx = x - c0;
    const i00 = r0 * cols + c0;
    const i01 = i00 + 1;
    const i10 = i00 + cols;
    const i11 = i10 + 1;
    const uu =
      (u[i00] * (1 - fx) + u[i01] * fx) * (1 - fy) + (u[i10] * (1 - fx) + u[i11] * fx) * fy;
    const vv =
      (v[i00] * (1 - fx) + v[i01] * fx) * (1 - fy) + (v[i10] * (1 - fx) + v[i11] * fx) * fy;
    if (Number.isNaN(uu) || Number.isNaN(vv)) return null;
    const speed = Math.hypot(uu, vv);
    const direction = ((Math.atan2(-uu, -vv) * 180) / Math.PI + 360) % 360;
    const edge = Math.min(x, y, cols - 1 - x, rows - 1 - y) / EDGE_FADE_CELLS;
    const e = Math.min(1, edge);
    const weight = e * e * (3 - 2 * e); // smoothstep
    return { u: uu, v: vv, speed, direction, weight };
  };
}

/**
 * Echelle de couleur du vent, en noeuds. Du bleu calme au violet de tempete,
 * dans l'esprit des cartes Windy ; interpolee lineairement entre les paliers.
 */
export const WIND_SCALE: ReadonlyArray<{ kn: number; rgb: [number, number, number] }> = [
  { kn: 0, rgb: [91, 107, 181] },
  { kn: 4, rgb: [63, 127, 184] },
  { kn: 8, rgb: [58, 160, 168] },
  { kn: 12, rgb: [75, 171, 92] },
  { kn: 16, rgb: [159, 176, 74] },
  { kn: 20, rgb: [209, 169, 59] },
  { kn: 25, rgb: [216, 118, 58] },
  { kn: 30, rgb: [200, 74, 74] },
  { kn: 35, rgb: [168, 66, 127] },
  { kn: 45, rgb: [125, 73, 166] },
];

export const WIND_SCALE_MAX = WIND_SCALE[WIND_SCALE.length - 1].kn;

export function windColor(kn: number): [number, number, number] {
  if (!(kn > 0)) return WIND_SCALE[0].rgb;
  for (let i = 1; i < WIND_SCALE.length; i++) {
    const hi = WIND_SCALE[i];
    if (kn <= hi.kn) {
      const lo = WIND_SCALE[i - 1];
      const f = (kn - lo.kn) / (hi.kn - lo.kn);
      return [
        Math.round(lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * f),
        Math.round(lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * f),
        Math.round(lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * f),
      ];
    }
  }
  return WIND_SCALE[WIND_SCALE.length - 1].rgb;
}
