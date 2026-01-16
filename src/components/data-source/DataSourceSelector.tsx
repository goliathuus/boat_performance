import { useState } from 'react';
import { UnifiedSessionPicker } from '@/components/replay/UnifiedSessionPicker';
import { CsvDropzone } from '@/components/upload/CsvDropzone';
import { Button } from '@/components/ui/button';
import { useReplayStore } from '@/state/useReplayStore';
import { supabase } from '@/lib/supabase';

interface DataSourceSelectorProps {
  onSessionsSelected: (sessionIds: string[]) => void;
  onCsvLoaded?: () => void;
}

type SourceType = 'none' | 'supabase' | 'csv';

export function DataSourceSelector({ onSessionsSelected, onCsvLoaded }: DataSourceSelectorProps) {
  const [selectedSource, setSelectedSource] = useState<SourceType>('none');
  const addSession = useReplayStore((state) => state.addSession);
  const setSelectedSessions = useReplayStore((state) => state.setSelectedSessions);

  const handleSessionsSelected = async (sessionIds: string[]) => {
    // Load session metadata and add to store
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    for (const sessionId of sessionIds) {
      const { data: session } = await supabase
        .from('sessions')
        .select('name, started_at, ended_at')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (session) {
        const tMin = new Date(session.started_at).getTime();
        const tMax = session.ended_at
          ? new Date(session.ended_at).getTime()
          : Date.now();
        addSession(sessionId, session.name, tMin, tMax);
      }
    }

    setSelectedSessions(sessionIds);
    onSessionsSelected(sessionIds);
  };

  const handleCsvLoaded = () => {
    onCsvLoaded?.();
  };

  if (selectedSource === 'none') {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-2xl p-8">
          <h1 className="text-3xl font-semibold mb-8 text-center">Select Data Source</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Supabase Option */}
            <button
              onClick={() => setSelectedSource('supabase')}
              className="p-8 border-2 border-dashed rounded-lg hover:border-primary hover:bg-primary/5 transition-all text-center"
            >
              <div className="text-6xl mb-4">🗄️</div>
              <h2 className="text-xl font-semibold mb-2">Load from Database</h2>
              <p className="text-muted-foreground text-sm">
                Load boat tracks from your Supabase sessions
              </p>
            </button>

            {/* CSV Option */}
            <button
              onClick={() => setSelectedSource('csv')}
              className="p-8 border-2 border-dashed rounded-lg hover:border-primary hover:bg-primary/5 transition-all text-center"
            >
              <div className="text-6xl mb-4">📊</div>
              <h2 className="text-xl font-semibold mb-2">Import CSV Files</h2>
              <p className="text-muted-foreground text-sm">
                Upload and import boat tracks from CSV files
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 border rounded-lg shadow-lg">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-semibold">
            {selectedSource === 'supabase' ? 'Load from Database' : 'Import CSV'}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedSource('none')}
          >
            ← Back
          </Button>
        </div>

        {selectedSource === 'supabase' && (
          <UnifiedSessionPicker onSessionsSelected={handleSessionsSelected} />
        )}

        {selectedSource === 'csv' && (
          <CsvDropzone onDataLoaded={handleCsvLoaded} embedded />
        )}
      </div>
    </div>
  );
}

