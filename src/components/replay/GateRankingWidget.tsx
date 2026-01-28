import { useState } from 'react';
import type { Gate, Result, Crossing } from '@/types';
import { formatTime } from '@/lib/time';

interface GateRankingWidgetProps {
  gateStart: Gate | null;
  gateFinish: Gate | null;
  gateDrawMode: 'none' | 'drawStart' | 'drawFinish';
  gateStartPartial: { lat: number; lon: number } | null;
  gateFinishPartial: { lat: number; lon: number } | null;
  rankings: Result[];
  crossingsByBoat: Map<string, { start?: Crossing; finish?: Crossing }>;
  selectedBoatId: string | null;
  onSetGateStart: (gate: Gate | null) => void;
  onSetGateFinish: (gate: Gate | null) => void;
  onSetGateDrawMode: (mode: 'none' | 'drawStart' | 'drawFinish') => void;
  onSetGateStartPartial: (point: { lat: number; lon: number } | null) => void;
  onSetGateFinishPartial: (point: { lat: number; lon: number } | null) => void;
  onSetRankings: (rankings: Result[]) => void;
  onSetCrossingsByBoat: (crossings: Map<string, { start?: Crossing; finish?: Crossing }>) => void;
  onSetSelectedBoatId: (boatId: string | null) => void;
}

export function GateRankingWidget({
  gateStart,
  gateFinish,
  gateDrawMode,
  gateStartPartial,
  gateFinishPartial,
  rankings,
  crossingsByBoat,
  selectedBoatId,
  onSetGateStart,
  onSetGateFinish,
  onSetGateDrawMode,
  onSetGateStartPartial,
  onSetGateFinishPartial,
  onSetRankings,
  onSetCrossingsByBoat,
  onSetSelectedBoatId,
}: GateRankingWidgetProps) {
  const handleReset = () => {
    onSetGateStart(null);
    onSetGateFinish(null);
    onSetGateStartPartial(null);
    onSetGateFinishPartial(null);
    onSetGateDrawMode('none');
    onSetRankings([]);
    onSetCrossingsByBoat(new Map());
    onSetSelectedBoatId(null);
  };

  return (
    <div className="h-full">
      <div
        className="bg-background/95 backdrop-blur-sm border-l rounded-tl-lg p-4 h-full flex flex-col"
        style={{
          width: '400px',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-lg font-semibold">Gate Ranking</h2>
          {(gateStart || gateFinish) && (
            <button
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          )}
        </div>

        {/* Controls Section */}
        <div className="flex flex-col gap-2 mb-4 flex-shrink-0">
          <button
            onClick={() => {
              if (gateDrawMode === 'drawStart') {
                onSetGateDrawMode('none');
                onSetGateStartPartial(null);
              } else {
                onSetGateDrawMode('drawStart');
                onSetGateFinishPartial(null);
                if (gateDrawMode === 'drawFinish') onSetGateDrawMode('drawStart');
              }
            }}
            className={`text-xs px-3 py-2 rounded transition-colors ${
              gateDrawMode === 'drawStart'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-accent'
            }`}
          >
            {gateStart ? '✓ Ligne départ' : 'Tracer départ'}
          </button>
          <button
            onClick={() => {
              if (gateDrawMode === 'drawFinish') {
                onSetGateDrawMode('none');
                onSetGateFinishPartial(null);
              } else {
                onSetGateDrawMode('drawFinish');
                onSetGateStartPartial(null);
                if (gateDrawMode === 'drawStart') onSetGateDrawMode('drawFinish');
              }
            }}
            className={`text-xs px-3 py-2 rounded transition-colors ${
              gateDrawMode === 'drawFinish'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-accent'
            }`}
          >
            {gateFinish ? '✓ Ligne arrivée' : 'Tracer arrivée'}
          </button>
          {gateDrawMode !== 'none' && (
            <div className="text-xs text-muted-foreground px-1">
              Cliquez 2 points sur la carte
            </div>
          )}
        </div>

        {/* Ranking Table Section */}
        {gateStart && gateFinish && rankings.length > 0 && (
          <div className="overflow-y-auto flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background border-b">
                <tr>
                  <th className="text-left p-2 font-semibold text-xs">Rang</th>
                  <th className="text-left p-2 font-semibold text-xs">Bateau</th>
                  <th className="text-right p-2 font-semibold text-xs">Temps</th>
                  <th className="text-right p-2 font-semibold text-xs">Vit. moy</th>
                  <th className="text-right p-2 font-semibold text-xs">Distance</th>
                  <th className="text-right p-2 font-semibold text-xs">tStart</th>
                  <th className="text-right p-2 font-semibold text-xs">tFinish</th>
                  <th className="text-right p-2 font-semibold text-xs">Écart</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((result, index) => {
                  const isSelected = selectedBoatId === result.boatId;
                  const leaderTime = rankings[0]?.elapsedMs ?? 0;
                  const gap = result.elapsedMs - leaderTime;
                  const minutes = Math.floor(result.elapsedMs / 60000);
                  const seconds = Math.floor((result.elapsedMs % 60000) / 1000);
                  const gapMinutes = Math.floor(gap / 60000);
                  const gapSeconds = Math.floor((gap % 60000) / 1000);

                  return (
                    <tr
                      key={result.boatId}
                      onClick={() => onSetSelectedBoatId(result.boatId)}
                      className={`cursor-pointer transition-colors ${
                        index % 2 === 0 ? 'bg-background' : 'bg-muted/30'
                      } ${
                        isSelected
                          ? 'ring-2 ring-primary bg-accent/50 hover:bg-accent/70'
                          : 'hover:bg-accent/30'
                      }`}
                    >
                      <td className="p-2 font-mono">{index + 1}</td>
                      <td className="p-2 font-medium">{result.name}</td>
                      <td className="p-2 text-right font-mono">
                        {minutes}:{seconds.toString().padStart(2, '0')}
                      </td>
                      <td className="p-2 text-right font-mono text-xs">
                        {result.avgSpeed.toFixed(1)} kn
                      </td>
                      <td className="p-2 text-right font-mono text-xs">
                        {result.distanceNm.toFixed(2)} NM
                      </td>
                      <td className="p-2 text-right font-mono text-xs">
                        {formatTime(result.tStart)}
                      </td>
                      <td className="p-2 text-right font-mono text-xs">
                        {formatTime(result.tFinish)}
                      </td>
                      <td className="p-2 text-right font-mono text-xs">
                        {index === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span>
                            +{gapMinutes}:{gapSeconds.toString().padStart(2, '0')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {gateStart && gateFinish && rankings.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Aucun bateau n'a franchi les deux gates
          </div>
        )}
      </div>
    </div>
  );
}

