import { forwardRef, useCallback, useImperativeHandle, useState, useRef } from 'react';
import { parseCSV } from '@/domain/parsing/csv';
import { useReplayStore } from '@/state/useReplayStore';
import type { TrackPoint } from '@/domain/types';
import { Button } from '@/components/ui/button';

interface CsvImportButtonProps {
  className?: string;
  /** Sans bouton visible : l'import est declenche par ref (menu « ⋯ »). */
  hideTrigger?: boolean;
}

export type CsvImportHandle = { open: () => void };

export const CsvImportButton = forwardRef<CsvImportHandle, CsvImportButtonProps>(function CsvImportButton(
  { className, hideTrigger = false },
  ref
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addSessions = useReplayStore((state) => state.addSessions);
  const setSelectedSessions = useReplayStore((state) => state.setSelectedSessions);
  const updateMultipleSessionPoints = useReplayStore((state) => state.updateMultipleSessionPoints);
  const updateSessionTimeRange = useReplayStore((state) => state.updateSessionTimeRange);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;

      setLoading(true);
      setError(null);

      try {
        const file = e.target.files[0];
        const content = await file.text();
        const dataset = await parseCSV(content);

        // Convert BoatTrack[] to sessions in replay store
        const sessionUpdates: Array<{
          sessionId: string;
          name: string;
          tMin: number;
          tMax: number;
          boatDisplayName?: string;
        }> = [];

        const pointsUpdates: Array<{ sessionId: string; points: TrackPoint[] }> = [];

        for (const boat of dataset.boats) {
          // Use boat.id as sessionId (or generate a unique ID)
          const sessionId = `csv_${boat.id}_${Date.now()}`;
          const boatName = boat.name || boat.id;

          sessionUpdates.push({
            sessionId,
            name: boatName,
            tMin: dataset.tMin,
            tMax: dataset.tMax,
            boatDisplayName: boatName,
          });

          pointsUpdates.push({
            sessionId,
            points: boat.points,
          });
        }

        // Add sessions to store
        addSessions(sessionUpdates);

        // Update points
        updateMultipleSessionPoints(pointsUpdates);

        // Recompute per-session time ranges based on actual points
        pointsUpdates.forEach(({ sessionId }) => {
          updateSessionTimeRange(sessionId);
        });

        // Select all imported sessions (recomputes global time range)
        const sessionIds = sessionUpdates.map((s) => s.sessionId);
        setSelectedSessions(sessionIds);

        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lecture du CSV impossible');
        console.error('CSV import error:', err);
      } finally {
        setLoading(false);
      }
    },
    [addSessions, updateMultipleSessionPoints, updateSessionTimeRange, setSelectedSessions]
  );

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  useImperativeHandle(ref, () => ({ open: openFileDialog }), [openFileDialog]);

  return (
    <>
      {!hideTrigger && (
        <Button
          variant="outline"
          size="sm"
          onClick={openFileDialog}
          disabled={loading}
          className={className}
          title="Importer un CSV à rejouer"
        >
          {loading ? 'Chargement…' : 'Importer un CSV'}
        </Button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileSelect}
        className="hidden"
      />
      {error && (
        <div role="alert" className="absolute top-16 left-2 right-2 z-[1001] max-w-md rounded-lg bg-destructive/90 p-3 text-sm text-destructive-foreground sm:left-16 sm:right-auto">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 underline"
          >
            Fermer
          </button>
        </div>
      )}
    </>
  );
});
