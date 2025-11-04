import { useCallback, useState, useRef } from 'react';
import { useRaceStore } from '@/state/useRaceStore';
import { parseCSV } from '@/domain/parsing/csv';
import { mergeTracks } from '@/domain/tracks';
import { Button } from '@/components/ui/button';

export function CsvDropzone() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataset = useRaceStore((state) => state.dataset);
  const setDataset = useRaceStore((state) => state.setDataset);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setLoading(true);
      setError(null);

      try {
        const fileArray = Array.from(files);
        const datasets = await Promise.all(
          fileArray.map(async (file) => {
            const content = await file.text();
            return parseCSV(content);
          })
        );

        // Merge all datasets
        const merged = mergeTracks(datasets);
        setDataset(merged);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse CSV');
        setLoading(false);
      }
    },
    [setDataset]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragActive(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFiles(files);
      }
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles]
  );

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  if (dataset) {
    return (
      <div className="absolute top-4 right-4 z-[1000]">
        <Button
          onClick={openFileDialog}
          variant="outline"
          size="sm"
          disabled={loading}
        >
          {loading ? 'Loading...' : '📁 Import More CSV'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        fixed inset-0 z-[1000] flex items-center justify-center
        bg-background/90 backdrop-blur-sm
        transition-all
        ${isDragActive ? 'bg-primary/10' : ''}
      `}
    >
      <div className="max-w-md w-full mx-4 p-8 border-2 border-dashed rounded-lg text-center">
        {error && (
          <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-md">
            {error}
          </div>
        )}
        {loading ? (
          <div className="text-lg">Loading CSV files...</div>
        ) : (
          <>
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-2xl font-semibold mb-2">Import Boat Tracks</h2>
            <p className="text-muted-foreground mb-6">
              Drag and drop CSV files here, or click to browse
            </p>
            <Button onClick={openFileDialog} size="lg">
              Choose CSV Files
            </Button>
            <p className="text-sm text-muted-foreground mt-4">
              CSV files must contain: timestamp, lat, lon, boat_id, boat_name (optional)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </>
        )}
      </div>
    </div>
  );
}
