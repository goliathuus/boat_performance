import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { downloadCSV, generateCSVFilename } from '@/lib/csv-download';
import {
  detectCsvInputType,
  filenameToBoatId,
  mergeNormalizedRows,
  normalizedRowsToCsv,
  parseCsvInputFile,
  type CsvDetectedType,
  type CsvInputType,
  type ParseCsvInputResult,
} from '@/domain/parsing/csv-aggregate';

interface CsvAggregatorPageProps {
  onBack: () => void;
  onLogout?: () => void;
}

interface AggregatorFileItem {
  id: string;
  fileName: string;
  content: string;
  detectedType: CsvDetectedType;
  selectedType: CsvInputType;
  boatId: string;
  boatName: string;
}

function labelType(type: CsvDetectedType): string {
  if (type === 'adrena') return 'ADRENA';
  if (type === 'platform') return 'Platform CSV';
  return 'Unknown';
}

function parseAllFiles(items: AggregatorFileItem[]): ParseCsvInputResult[] {
  let sourceOrderBase = 0;
  return items.map((item) => {
    const result = parseCsvInputFile({
      content: item.content,
      type: item.selectedType,
      sourceOrderBase,
      boatId: item.boatId,
      boatName: item.boatName,
    });
    sourceOrderBase += Math.max(1, result.validRows + result.rejectedRows + 1);
    return result;
  });
}

function parseSingleFile(item: AggregatorFileItem): ParseCsvInputResult {
  return parseCsvInputFile({
    content: item.content,
    type: item.selectedType,
    sourceOrderBase: 0,
    boatId: item.boatId,
    boatName: item.boatName,
  });
}

export function CsvAggregatorPage({ onBack, onLogout }: CsvAggregatorPageProps) {
  const [files, setFiles] = useState<AggregatorFileItem[]>([]);
  const [fileResults, setFileResults] = useState<Record<string, ParseCsvInputResult>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [lastExportInfo, setLastExportInfo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const totalValidRows = useMemo(
    () => Object.values(fileResults).reduce((acc, r) => acc + r.validRows, 0),
    [fileResults]
  );
  const totalRejectedRows = useMemo(
    () => Object.values(fileResults).reduce((acc, r) => acc + r.rejectedRows, 0),
    [fileResults]
  );

  const openFilesDialog = () => inputRef.current?.click();

  const handleFileSelection = async (evt: React.ChangeEvent<HTMLInputElement>) => {
    if (!evt.target.files || evt.target.files.length === 0) return;
    setGlobalError(null);
    setLastExportInfo(null);
    const selected = Array.from(evt.target.files);

    const loaded: AggregatorFileItem[] = await Promise.all(
      selected.map(async (file, index) => {
        const content = await file.text();
        const detected = detectCsvInputType(content);
        const selectedType: CsvInputType = detected === 'platform' ? 'platform' : 'adrena';
        const defaultBoatId = filenameToBoatId(file.name);
        return {
          id: `${Date.now()}_${index}_${file.name}`,
          fileName: file.name,
          content,
          detectedType: detected,
          selectedType,
          boatId: defaultBoatId,
          boatName: defaultBoatId,
        };
      })
    );

    const initialResults: Record<string, ParseCsvInputResult> = {};
    loaded.forEach((item) => {
      initialResults[item.id] = parseSingleFile(item);
    });

    setFiles((prev) => [...prev, ...loaded]);
    setFileResults((prev) => ({ ...prev, ...initialResults }));
    evt.target.value = '';
  };

  const updateFile = (id: string, patch: Partial<AggregatorFileItem>) => {
    setFiles((prev) => {
      const updated = prev.map((f) => (f.id === id ? { ...f, ...patch } : f));
      const changed = updated.find((f) => f.id === id);
      if (changed) {
        const mustReparse = Object.prototype.hasOwnProperty.call(patch, 'selectedType');
        if (mustReparse) {
          setFileResults((prevResults) => ({
            ...prevResults,
            [id]: parseSingleFile(changed),
          }));
        }
      }
      return updated;
    });
    setGlobalError(null);
    setLastExportInfo(null);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setFileResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setGlobalError(null);
    setLastExportInfo(null);
  };

  const clearAll = () => {
    setFiles([]);
    setFileResults({});
    setGlobalError(null);
    setLastExportInfo(null);
  };

  const handleAggregate = () => {
    setGlobalError(null);
    setLastExportInfo(null);

    if (files.length === 0) {
      setGlobalError('Add at least one CSV file.');
      return;
    }

    const parseResults = parseAllFiles(files);
    const allRows = parseResults.flatMap((result) => result.rows);
    if (allRows.length === 0) {
      setGlobalError('No valid rows found. Check file type and content.');
      return;
    }

    const mergedRows = mergeNormalizedRows(allRows);
    if (mergedRows.length === 0) {
      setGlobalError('No rows remain after deduplication.');
      return;
    }

    const csv = normalizedRowsToCsv(mergedRows);
    const filename = generateCSVFilename('aggregated_platform', true);
    downloadCSV(csv, filename);
    setLastExportInfo(`${mergedRows.length} rows exported to ${filename}`);
  };

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col bg-background">
      <div className="border-b p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onBack}>
              ← Back
            </Button>
            <h1 className="text-2xl font-semibold">CSV Aggregator</h1>
          </div>
          {onLogout && (
            <Button variant="outline" size="sm" onClick={onLogout}>
              Déconnexion
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="border rounded-lg p-4 bg-muted/20">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={openFilesDialog}>Add CSV files</Button>
              <Button variant="outline" onClick={clearAll} disabled={files.length === 0}>
                Clear
              </Button>
              <Button onClick={handleAggregate} disabled={files.length === 0}>
                Aggregate and Download
              </Button>
              <div className="text-sm text-muted-foreground">
                Valid rows: {totalValidRows} | Rejected rows: {totalRejectedRows}
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              multiple
              onChange={handleFileSelection}
              className="hidden"
            />
          </div>

          {globalError && (
            <div className="border border-destructive/40 bg-destructive/10 rounded-md p-3 text-sm text-destructive">
              {globalError}
            </div>
          )}

          {lastExportInfo && (
            <div className="border border-primary/30 bg-primary/10 rounded-md p-3 text-sm">
              {lastExportInfo}
            </div>
          )}

          {files.length === 0 ? (
            <div className="border rounded-lg p-10 text-center text-muted-foreground">
              Add ADRENA exports and/or platform CSV files to build one merged CSV.
            </div>
          ) : (
            <div className="space-y-3">
              {files.map((file) => {
                const result = fileResults[file.id] ?? {
                  type: file.selectedType,
                  rows: [],
                  validRows: 0,
                  rejectedRows: 0,
                  errors: [],
                };
                const firstError = result?.errors[0];
                return (
                  <div key={file.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{file.fileName}</div>
                      <Button variant="outline" size="sm" onClick={() => removeFile(file.id)}>
                        Remove
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <label className="text-sm space-y-1">
                        <div className="text-muted-foreground">Detected type</div>
                        <div className="font-medium">{labelType(file.detectedType)}</div>
                      </label>

                      <label className="text-sm space-y-1">
                        <div className="text-muted-foreground">Use as</div>
                        <select
                          className="w-full border rounded-md h-9 px-2 bg-background"
                          value={file.selectedType}
                          onChange={(e) =>
                            updateFile(file.id, { selectedType: e.target.value as CsvInputType })
                          }
                        >
                          <option value="adrena">ADRENA</option>
                          <option value="platform">Platform CSV</option>
                        </select>
                      </label>

                      <label className="text-sm space-y-1">
                        <div className="text-muted-foreground">Boat ID (ADRENA)</div>
                        <input
                          className="w-full border rounded-md h-9 px-2 bg-background"
                          value={file.boatId}
                          onChange={(e) => updateFile(file.id, { boatId: e.target.value })}
                          disabled={file.selectedType !== 'adrena'}
                        />
                      </label>

                      <label className="text-sm space-y-1">
                        <div className="text-muted-foreground">Boat Name (ADRENA)</div>
                        <input
                          className="w-full border rounded-md h-9 px-2 bg-background"
                          value={file.boatName}
                          onChange={(e) => updateFile(file.id, { boatName: e.target.value })}
                          disabled={file.selectedType !== 'adrena'}
                        />
                      </label>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      {result.validRows} valid | {result.rejectedRows} rejected
                    </div>

                    {firstError && (
                      <div className="text-sm text-destructive bg-destructive/10 border border-destructive/40 rounded-md p-2">
                        {firstError}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
