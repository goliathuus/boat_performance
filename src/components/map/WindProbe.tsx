import { useMemo, useState } from 'react';
import { Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { WIND_MODELS, cardinal, windAt, type WindGrid } from '@/lib/wind';

/**
 * Sonde de vent : un clic sur la carte pose une petite fleche et une etiquette
 * avec la force et la direction du vent a ce point, a l'instant de la tete de
 * lecture. Pas de cadre : le texte a une ombre portee et laisse voir les traces
 * dessous. La sonde suit la lecture ; un clic dessus la retire.
 *
 * Inactive quand un outil (regle, portes) capte deja les clics.
 */
export function WindProbe({ grid, time, enabled }: { grid: WindGrid; time: number; enabled: boolean }) {
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);

  useMapEvents({
    click: (e) => {
      if (enabled) setPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  const sample = point ? windAt(grid, time)?.(point.lat, point.lng) ?? null : null;
  // Arrondi avant memo : l'icone n'est reconstruite que si l'affichage change.
  const speed = sample ? sample.speed.toFixed(1) : null;
  const dir = sample ? Math.round(sample.direction) : null;
  const label = WIND_MODELS[grid.model].label;

  const icon = useMemo(() => {
    if (!point) return null;
    const coords = `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
    const shadow = 'text-shadow:0 1px 2px rgba(0,0,0,.9),0 0 6px rgba(0,0,0,.6);';
    const body =
      speed !== null && dir !== null
        ? `
          <svg width="18" height="18" viewBox="0 0 24 24" style="flex:none;transform:rotate(${dir + 180}deg);filter:drop-shadow(0 1px 2px rgba(0,0,0,.8))">
            <path d="M12 3 L18 14 H14 V21 H10 V14 H6 Z" fill="#fff"/>
          </svg>
          <span style="display:flex;flex-direction:column;line-height:1.15;${shadow}">
            <span style="font:600 13px/1.15 system-ui,-apple-system,'Segoe UI',sans-serif;">${speed} <span style="font-weight:400;font-size:10px">nds</span> · ${cardinal(dir)} ${dir}°</span>
            <span style="font:400 9.5px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif;opacity:.8">${label} · ${coords}</span>
          </span>`
        : `<span style="font:400 11px system-ui,sans-serif;${shadow}">Pas de vent modélisé ici</span>`;
    return L.divIcon({
      className: 'wind-probe',
      html: `<div title="Cliquer pour retirer" style="display:flex;align-items:center;gap:5px;color:#fff;white-space:nowrap;cursor:pointer;transform:translate(-9px,-50%);">${body}</div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  }, [point, speed, dir, label]);

  if (!point || !enabled || !icon) return null;

  return (
    <Marker
      position={[point.lat, point.lng]}
      icon={icon}
      keyboard={false}
      eventHandlers={{ click: () => setPoint(null) }}
    />
  );
}
