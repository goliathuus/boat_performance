import { describe, it, expect, vi } from 'vitest';

// tracks/index.ts importe Leaflet pour les emprises ; inutile ici et il exige un DOM.
vi.mock('leaflet', () => ({ default: {} }));
import { sampleTrackAt, segmentHeadingAt, interpolatePosition } from './index';
import type { TrackPoint } from '../types';

// Petit pas de ~111 m par millieme de degre pres de l'equateur.
const pt = (t: number, lat: number, lon: number, extra: Partial<TrackPoint> = {}): TrackPoint => ({ t, lat, lon, ...extra });
const near = (a: number | null, b: number, tol = 1) => {
  expect(a).not.toBeNull();
  const d = Math.abs((((a as number) - b) % 360 + 540) % 360 - 180);
  expect(d).toBeLessThanOrEqual(tol);
};

describe('cap aligne sur le segment parcouru', () => {
  it('pointe vers l est sur un segment plein est', () => {
    const pts = [pt(0, 0, 0), pt(1000, 0, 0.001)];
    near(sampleTrackAt(pts, 500)!.heading, 90);
  });

  it('suit le segment courant, pas le cog du point (pas de retard d un segment)', () => {
    // segment 1 vers le nord, segment 2 vers l est ; cog des points = segment ARRIVANT
    const pts = [
      pt(0, 0, 0),
      pt(1000, 0.001, 0, { cog: 0 }),
      pt(2000, 0.001, 0.001, { cog: 90 }),
    ];
    // a mi-chemin du segment 2, l ancien code donnait ~45° (melange nord/est)
    near(sampleTrackAt(pts, 1500)!.heading, 90);
  });

  it('ne fait plus de tour a l envers au passage du nord', () => {
    // deux segments : ~350° puis ~10°
    const pts = [pt(0, 0, 0), pt(1000, 0.001, -0.000176), pt(2000, 0.002, 0)];
    for (let t = 1000; t <= 2000; t += 100) {
      const h = sampleTrackAt(pts, t)!.heading as number;
      // jamais vers le sud pendant le segment nord-nord-est
      expect(Math.abs(((h % 360) + 360) % 360 - 180)).toBeGreaterThan(90);
    }
  });

  it('a un cap des le premier point, sans colonne cog', () => {
    const pts = [pt(0, 0, 0), pt(1000, 0, 0.001)];
    near(sampleTrackAt(pts, 0)!.heading, 90);
  });

  it('fonctionne quand aucun point n a de cog (CSV agrege sans colonne)', () => {
    const pts = [pt(0, 0, 0), pt(1000, -0.001, 0), pt(2000, -0.002, 0)];
    near(sampleTrackAt(pts, 1500)!.heading, 180);
  });

  it('garde le dernier cap connu quand le bateau s arrete', () => {
    const pts = [pt(0, 0, 0), pt(1000, 0, 0.001), pt(2000, 0, 0.001), pt(3000, 0, 0.001)];
    near(sampleTrackAt(pts, 2500)!.heading, 90);
  });

  it('prend le premier deplacement a venir si le bateau n est pas encore parti', () => {
    const pts = [pt(0, 0, 0), pt(1000, 0, 0), pt(2000, 0.001, 0)];
    near(sampleTrackAt(pts, 500)!.heading, 0);
  });

  it('apres le dernier point, garde le cap du dernier segment', () => {
    const pts = [pt(0, 0, 0), pt(1000, 0, 0.001)];
    near(sampleTrackAt(pts, 5000)!.heading, 90);
  });

  it('ignore le bruit GPS sous un metre', () => {
    // segment courant de ~0,1 m vers le sud : doit garder le cap est precedent
    const pts = [pt(0, 0, 0), pt(1000, 0, 0.001), pt(2000, -0.000001, 0.001)];
    near(sampleTrackAt(pts, 1500)!.heading, 90);
  });

  it('renvoie null pour un point isole', () => {
    expect(segmentHeadingAt([pt(0, 0, 0)], 0)).toBeNull();
  });
});

describe('interpolatePosition (correctif 1)', () => {
  it('interpole le cog par le plus court arc', () => {
    const boat = { id: 'b', name: 'b', color: '#000', points: [pt(0, 0, 0, { cog: 350 }), pt(1000, 0, 0.001, { cog: 10 })] };
    const cog = interpolatePosition(boat, 500)!.point!.cog as number;
    near(cog, 0); // l ancien calcul donnait 180
  });
});

describe('import CSV : horodatage a la seconde, plusieurs lignes par seconde', () => {
  it('l ancien cap manquait sur la plupart des points, le cap par segment jamais', async () => {
    const { parseCSV } = await import('../parsing/csv');
    // Cap plein est, 4 lignes par seconde, 5 m entre chaque ligne (au-dela du
    // dedoublonnage a 3 m), horodatage arrondi a la seconde comme beaucoup
    // d'exports d'instruments.
    const rows = ['timestamp,lat,lon,boat_id'];
    const pasLon = 5 / 111320;
    for (let i = 0; i < 40; i++) {
      const sec = Math.floor(i / 4);
      const ts = new Date(Date.UTC(2026, 4, 6, 10, 0, sec)).toISOString();
      rows.push(`${ts},0,${(i * pasLon).toFixed(8)},B1`);
    }
    const dataset = await parseCSV(rows.join('\n'));
    const points = dataset.boats[0].points;

    // Ancienne source d'orientation : le cog recalcule. Ecart de 0 s entre
    // les lignes d'une meme seconde -> pas de cap -> triangle au nord.
    const sansCog = points.filter((p) => p.cog === undefined).length;
    expect(sansCog / points.length).toBeGreaterThan(0.5);

    // Nouvelle source : le segment parcouru. Toujours plein est.
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    for (let k = 0; k <= 20; k++) {
      const t = t0 + ((t1 - t0) * k) / 20;
      near(sampleTrackAt(points, t)!.heading, 90);
    }
  });
});
