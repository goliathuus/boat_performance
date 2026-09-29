import { useState } from 'react';
import { WIND_MODELS, WIND_SCALE, WIND_SCALE_MAX, type ModelRunInfo, type WindGrid, type WindModelId } from '@/lib/wind';
import type { WindStatus } from '@/hooks/useWindField';
import { cn } from '@/lib/utils';

const STATUS_TEXT: Partial<Record<WindStatus, string>> = {
  loading: 'Chargement…',
  unavailable: 'Pas de données pour cette date',
  error: 'Indisponible (réseau)',
};

const TICKS = [0, 10, 20, 30];

function utc(t: number, withDate = true): string {
  const iso = new Date(t).toISOString();
  const hm = iso.slice(11, 16);
  return withDate ? `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${hm}` : hm;
}

/**
 * D'ou vient la valeur affichee a l'instant de la tete de lecture.
 *
 * Avant le dernier run publie, c'est l'archive : Open-Meteo y garde, pour
 * chaque heure, la sortie du run le plus recent a ce moment-la. Apres, c'est
 * la prevision du dernier run, a une certaine echeance -- ou celle du run de
 * relais si l'instant depasse l'horizon du premier.
 */
function provenance(grid: WindGrid | null, run: ModelRunInfo | null, currentTime: number, model: WindModelId): string | null {
  if (!run) return null;
  if (currentTime >= run.lastRunInit && grid?.source !== 'archive') {
    const r = currentTime > run.dataEnd && run.fallback ? run.fallback : run;
    const lead = Math.max(0, Math.round((currentTime - r.lastRunInit) / 3_600_000));
    const relay = r === run ? '' : ' (au-delà de l’horizon 15 min, pas horaire interpolé)';
    return `Prévision du run ${utc(r.lastRunInit)} UTC, échéance +${lead} h${relay}`;
  }
  return `Archive : sortie du run le plus récent à cet instant (${WIND_MODELS[model].label} : un run ${every(run.updateInterval)})`;
}

function every(ms: number): string {
  const h = Math.round(ms / 3_600_000);
  return h <= 1 ? 'toutes les heures' : `toutes les ${h} h`;
}

interface WindLegendProps {
  /** Vent affiche ou non ; la legende reste visible pour pouvoir le reactiver. */
  enabled: boolean;
  onToggleEnabled?: () => void;
  status: WindStatus;
  model: WindModelId;
  aromeAvailable: boolean;
  onSelectModel: (model: WindModelId) => void;
  grid: WindGrid | null;
  runInfo: ModelRunInfo | null;
  currentTime: number;
}

/**
 * Echelle du vent en noeuds, interrupteur, choix du modele et provenance.
 * Le detail de provenance est replie par defaut : il ne sert qu'a qui le cherche.
 */
export function WindLegend({
  enabled,
  onToggleEnabled,
  status,
  model,
  aromeAvailable,
  onSelectModel,
  grid,
  runInfo,
  currentTime,
}: WindLegendProps) {
  const [expanded, setExpanded] = useState(false);
  const gradient = WIND_SCALE.map(
    ({ kn, rgb }) => `rgb(${rgb.join(',')}) ${((kn / WIND_SCALE_MAX) * 100).toFixed(1)}%`
  ).join(', ');
  const m = WIND_MODELS[model];
  const message = STATUS_TEXT[status];
  const origin = provenance(grid, runInfo, currentTime, model);

  return (
    <div className="glass rounded-lg border px-2.5 py-2 text-[10px] leading-snug text-muted-foreground w-[228px] sm:w-[260px]">
      <div className="flex items-center justify-between gap-2">
        {onToggleEnabled ? (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={onToggleEnabled}
            title={enabled ? 'Masquer le vent' : 'Afficher le vent'}
            className="flex items-center gap-1.5 rounded-full py-0.5 pr-1 font-semibold uppercase tracking-wide text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className={cn(
                'relative inline-block h-3.5 w-6 rounded-full transition-colors',
                enabled ? 'bg-primary' : 'bg-foreground/25'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow transition-[left]',
                  enabled ? 'left-3' : 'left-0.5'
                )}
              />
            </span>
            Vent
          </button>
        ) : (
          <span className="font-semibold uppercase tracking-wide text-foreground/90">Vent</span>
        )}
        <div
          className={cn('flex rounded-full border bg-background/60 p-0.5', !enabled && 'opacity-50')}
          role="group"
          aria-label="Modèle de vent"
        >
          {(['arome', 'ecmwf'] as const).map((id) => {
            const disabled = !enabled || (id === 'arome' && !aromeAvailable);
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                aria-pressed={model === id}
                onClick={() => onSelectModel(id)}
                title={
                  id === 'arome' && !aromeAvailable
                    ? 'Zone hors de la couverture AROME (France et abords)'
                    : `${WIND_MODELS[id].label} · ${WIND_MODELS[id].provider}`
                }
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors',
                  model === id ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-accent',
                  disabled && 'cursor-not-allowed hover:bg-transparent',
                  disabled && model !== id && 'opacity-40'
                )}
              >
                {id === 'arome' ? 'AROME' : 'ECMWF'}
              </button>
            );
          })}
        </div>
      </div>

      {enabled && (
        <>
          <div
            className="mt-1.5 h-1.5 rounded-full"
            style={{ background: `linear-gradient(to right, ${gradient})`, opacity: status === 'ready' ? 1 : 0.4 }}
          />
          <div className="relative mt-0.5 h-3 tabular-nums">
            {TICKS.map((kn) => (
              <span
                key={kn}
                className="absolute -translate-x-1/2 first:translate-x-0"
                style={{ left: `${(kn / WIND_SCALE_MAX) * 100}%` }}
              >
                {kn}
              </span>
            ))}
            <span className="absolute right-0">nds</span>
          </div>

          <div className="mt-1 border-t border-foreground/10 pt-1">
            <div className="flex items-start justify-between gap-2">
              <span className="text-foreground/85">
                {m.label} · {m.provider} · {m.resolution} · pas {m.stepMinutes} min
              </span>
            </div>
            {message && <div className="text-amber-300/90">{message}</div>}
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="mt-0.5 inline-flex items-center gap-0.5 text-primary/90 hover:text-primary"
            >
              {expanded ? 'Voir moins' : 'Voir plus'}
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={cn('transition-transform', expanded && 'rotate-180')}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {expanded && (
              <div className="mt-0.5 space-y-0.5">
                {!message && origin && <div>{origin}</div>}
                {runInfo && (
                  <div>
                    Dernier run publié : {utc(runInfo.lastRunInit)} UTC (en ligne à {utc(runInfo.lastRunAvailable, false)})
                  </div>
                )}
                <div className="opacity-80">
                  Modèle, pas une mesure · Open-Meteo
                  {grid &&
                    ` · chargé à ${new Date(grid.fetchedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
