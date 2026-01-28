import { useState, useRef, useCallback } from 'react';
import { parseCSV } from '@/domain/parsing/csv';
import { useReplayStore } from '@/state/useReplayStore';
import type { TrackPoint } from '@/domain/types';
import { Button } from '@/components/ui/button';

interface CsvLoadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadComplete: (sessionIds: string[]) => void;
}

export function CsvLoadModal({ isOpen, onClose, onLoadComplete }: CsvLoadModalProps) {
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

        // Close modal and trigger navigation
        onClose();
        onLoadComplete(sessionIds);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse CSV');
        console.error('CSV import error:', err);
      } finally {
        setLoading(false);
      }
    },
    [addSessions, updateMultipleSessionPoints, updateSessionTimeRange, setSelectedSessions, onClose, onLoadComplete]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        setLoading(true);
        setError(null);

        try {
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

          addSessions(sessionUpdates);
          updateMultipleSessionPoints(pointsUpdates);

          // Recompute per-session time ranges based on actual points
          pointsUpdates.forEach(({ sessionId }) => {
            updateSessionTimeRange(sessionId);
          });

          const sessionIds = sessionUpdates.map((s) => s.sessionId);
          setSelectedSessions(sessionIds);

          onClose();
          onLoadComplete(sessionIds);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to parse CSV');
          console.error('CSV import error:', err);
        } finally {
          setLoading(false);
        }
      }
    },
    [addSessions, updateMultipleSessionPoints, updateSessionTimeRange, setSelectedSessions, onClose, onLoadComplete]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-background/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-background border rounded-lg shadow-lg p-8 max-w-md w-full mx-4 relative"
        onClick={(e) => e.stopPropagation()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground text-2xl leading-none"
          title="Close"
        >
          ×
        </button>

        <h2 className="text-2xl font-semibold mb-6">Import CSV File</h2>

        {error && (
          <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-md text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <div className="text-lg">Loading CSV file...</div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-8 border-2 border-dashed rounded-lg text-center">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-xl font-semibold mb-2">Import Boat Tracks</h3>
              <p className="text-muted-foreground mb-6">
                Drag and drop a CSV file here, or click to browse
              </p>
              <Button onClick={openFileDialog} size="lg">
                Choose CSV File
              </Button>
              <p className="text-sm text-muted-foreground mt-4">
                CSV files must contain: time (or timestamp), lat, lon, boat_id, boat_name (optional), speed (or sog), cog, twd, awa, twa (optional)
              </p>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </div>
  );
}

