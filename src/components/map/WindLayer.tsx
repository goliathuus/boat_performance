import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { windAt, windColor, type WindGrid } from '@/lib/wind';

/**
 * Couche de vent facon Windy : un champ colore par la force du vent, et des
 * particules blanches qui suivent l'ecoulement.
 *
 * Deux canvas dans un pane dedie, entre les tuiles (200) et les traces (400),
 * sous les toponymes (350) : les donnees de course restent au premier plan.
 *
 * Les canvas vivent en coordonnees « calque » de Leaflet : pendant un
 * glisser-deposer ils se deplacent avec la carte sans rien recalculer. Tout
 * est recale a la fin du mouvement (moveend / zoomend / resize).
 */

const CELL = 8; // pas de la grille ecran, en px CSS
const FIELD_ALPHA = 0.5;
const PX_PER_FRAME_PER_KN = 0.07;
const FADE = 0.93; // persistance des trainees

type ScreenField = {
  cols: number;
  rows: number;
  lat: Float64Array; // centre de chaque cellule
  lon: Float64Array;
  vx: Float32Array; // px / image
  vy: Float32Array;
  weight: Float32Array; // 0 = pas de vent connu, 1 = coeur de la grille
};

type Particle = { x: number; y: number; age: number; life: number };

export function WindLayer({ grid, time }: { grid: WindGrid; time: number }) {
  const map = useMap();
  const fieldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenRef = useRef<ScreenField | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });
  const recomputeRef = useRef<(() => void) | null>(null);

  // Derniers grid / time lus par les callbacks Leaflet sans les reinscrire.
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const timeRef = useRef(time);
  timeRef.current = time;

  // Montage : pane, canvas, ecouteurs, boucle d'animation.
  useEffect(() => {
    const paneName = 'wind';
    const pane = map.getPane(paneName) ?? map.createPane(paneName);
    pane.style.zIndex = '250';
    pane.style.pointerEvents = 'none';

    const fieldCanvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide', pane) as HTMLCanvasElement;
    const particleCanvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide', pane) as HTMLCanvasElement;
    for (const c of [fieldCanvas, particleCanvas]) {
      c.style.position = 'absolute';
      c.style.left = '0';
      c.style.top = '0';
      c.style.pointerEvents = 'none';
    }
    fieldCanvasRef.current = fieldCanvas;
    particleCanvasRef.current = particleCanvas;

    const reduceMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const reset = () => {
      const size = map.getSize();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { w: size.x, h: size.y, dpr };
      const origin = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(fieldCanvas, origin);
      L.DomUtil.setPosition(particleCanvas, origin);

      particleCanvas.width = Math.round(size.x * dpr);
      particleCanvas.height = Math.round(size.y * dpr);
      particleCanvas.style.width = `${size.x}px`;
      particleCanvas.style.height = `${size.y}px`;

      const cols = Math.ceil(size.x / CELL) + 1;
      const rows = Math.ceil(size.y / CELL) + 1;
      const n = cols * rows;
      const lat = new Float64Array(n);
      const lon = new Float64Array(n);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ll = map.containerPointToLatLng([c * CELL, r * CELL]);
          lat[r * cols + c] = ll.lat;
          lon[r * cols + c] = ll.lng;
        }
      }
      screenRef.current = {
        cols,
        rows,
        lat,
        lon,
        vx: new Float32Array(n),
        vy: new Float32Array(n),
        weight: new Float32Array(n),
      };

      fieldCanvas.width = cols;
      fieldCanvas.height = rows;
      // Le navigateur agrandit l'image basse resolution avec lissage bilineaire.
      // Decalage d'une demi-cellule : le centre du pixel c tombe sur c * CELL,
      // la ou il a ete echantillonne.
      fieldCanvas.style.width = `${cols * CELL}px`;
      fieldCanvas.style.height = `${rows * CELL}px`;
      fieldCanvas.style.left = `${-CELL / 2}px`;
      fieldCanvas.style.top = `${-CELL / 2}px`;

      recompute();
      seedParticles();
    };

    const recompute = () => {
      const s = screenRef.current;
      if (!s) return;
      const sample = windAt(gridRef.current, timeRef.current);
      const ctx = fieldCanvas.getContext('2d');
      if (!ctx) return;
      const img = ctx.createImageData(s.cols, s.rows);
      const a = Math.round(FIELD_ALPHA * 255);
      for (let i = 0; i < s.cols * s.rows; i++) {
        const w = sample ? sample(s.lat[i], s.lon[i]) : null;
        if (!w) {
          s.weight[i] = 0;
          s.vx[i] = 0;
          s.vy[i] = 0;
          img.data[i * 4 + 3] = 0;
          continue;
        }
        s.weight[i] = w.weight;
        // Ecran : x vers l'est, y vers le sud.
        s.vx[i] = w.u * PX_PER_FRAME_PER_KN;
        s.vy[i] = -w.v * PX_PER_FRAME_PER_KN;
        const [r, g, b] = windColor(w.speed);
        img.data[i * 4] = r;
        img.data[i * 4 + 1] = g;
        img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = Math.round(a * w.weight);
      }
      ctx.putImageData(img, 0, 0);
    };
    recomputeRef.current = recompute;

    const spawn = (p: Particle) => {
      const { w, h } = sizeRef.current;
      // Tirage par rejet : la densite de particules suit le fondu des bords.
      const s = screenRef.current;
      for (let tries = 0; tries < 6; tries++) {
        p.x = Math.random() * w;
        p.y = Math.random() * h;
        if (!s) break;
        const i = Math.round(p.y / CELL) * s.cols + Math.round(p.x / CELL);
        if (Math.random() < (s.weight[i] ?? 0)) break;
      }
      p.age = 0;
      p.life = 40 + Math.random() * 60;
    };

    const seedParticles = () => {
      const { w, h, dpr } = sizeRef.current;
      const count = Math.min(2500, Math.round((w * h) / 900));
      const list: Particle[] = [];
      for (let i = 0; i < count; i++) {
        const p = { x: 0, y: 0, age: 0, life: 0 };
        spawn(p);
        p.age = Math.random() * p.life; // desynchronise les morts
        list.push(p);
      }
      particlesRef.current = list;
      const ctx = particleCanvas.getContext('2d');
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx?.clearRect(0, 0, w, h);
    };

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const s = screenRef.current;
      const ctx = particleCanvas.getContext('2d');
      if (!s || !ctx) return;
      const { w, h } = sizeRef.current;

      // Estompe l'image precedente : c'est ce qui dessine les trainees.
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = `rgba(0,0,0,${FADE})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';

      ctx.beginPath();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      for (const p of particlesRef.current) {
        const c = Math.round(p.x / CELL);
        const r = Math.round(p.y / CELL);
        const i = r * s.cols + c;
        if (p.age++ > p.life || c < 0 || r < 0 || c >= s.cols || r >= s.rows || !(s.weight[i] > 0)) {
          spawn(p);
          continue;
        }
        const nx = p.x + s.vx[i];
        const ny = p.y + s.vy[i];
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        p.x = nx;
        p.y = ny;
      }
      ctx.stroke();
    };

    reset();
    if (!reduceMotion) {
      raf = requestAnimationFrame(frame);
    }

    map.on('moveend zoomend resize', reset);
    // Licence CC BY 4.0 des donnees Open-Meteo : credit visible sur la carte.
    const credit = 'Vent : <a href="https://open-meteo.com/">Open-Meteo</a>';
    map.attributionControl?.addAttribution(credit);
    return () => {
      map.attributionControl?.removeAttribution(credit);
      cancelAnimationFrame(raf);
      map.off('moveend zoomend resize', reset);
      fieldCanvas.remove();
      particleCanvas.remove();
      recomputeRef.current = null;
    };
  }, [map]);

  // Nouveau champ, ou la tete de lecture a franchi une minute : recalcul des
  // vecteurs. Pendant la lecture rapide, ca reste quelques fois par seconde.
  const minute = Math.floor(time / 60_000);
  useEffect(() => {
    recomputeRef.current?.();
  }, [grid, minute]);

  return null;
}
