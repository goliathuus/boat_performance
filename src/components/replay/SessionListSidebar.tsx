import { useState } from 'react';
import { useAllSessions } from '@/hooks/useAllSessions';
import { useReplayStore } from '@/state/useReplayStore';
import { exportSessionToCSV, exportSessionFromSupabase } from '@/lib/csv-export';
import { downloadCSV, generateCSVFilename } from '@/lib/csv-download';
import { Button } from '@/components/ui/button';

interface SessionListSidebarProps {
  className?: string;
  onSessionSelected?: (sessionIds: string[]) => void;
}

export function SessionListSidebar({ className, onSessionSelected }: SessionListSidebarProps) {
  const selectedSessionId = useReplayStore((state) => state.selectedSessionId);
  const focusSessionId = useReplayStore((state) => state.focusSessionId);
  const setFocusSession = useReplayStore((state) => state.setFocusSession);
  const setSelectedSession = useReplayStore((state) => state.setSelectedSession);
  const sessionsStore = useReplayStore((state) => state.sessions);
  const { sessions, loading, error } = useAllSessions();
  const [exportingSessionId, setExportingSessionId] = useState<string | null>(null);

  const handleSessionClick = (sessionId: string) => {
    // Set focus for highlighting
    setFocusSession(sessionId);
  };

  const handleSessionReplay = (sessionId: string) => {
    // Set selected session to trigger replay
    setSelectedSession(sessionId);
    // Call callback if provided (for navigation) - pass sessionId as array for consistency
    onSessionSelected?.([sessionId]);
  };

  const handleExportSession = async (sessionId: string, sessionName: string) => {
    setExportingSessionId(sessionId);
    try {
      // Try to export from store first (if data is loaded)
      const sessionData = sessionsStore.get(sessionId);
      let csvContent: string;

      if (sessionData && sessionData.points.length > 0) {
        // Export from store
        csvContent = exportSessionToCSV(sessionId, sessionData);
      } else {
        // Export from Supabase
        csvContent = await exportSessionFromSupabase(sessionId);
      }

      const filename = generateCSVFilename(sessionName, false);
      downloadCSV(csvContent, filename);
    } catch (err) {
      console.error('Error exporting session:', err);
      alert(err instanceof Error ? err.message : 'Failed to export session');
    } finally {
      setExportingSessionId(null);
    }
  };

  return (
    <div className={`flex flex-col h-full border-l bg-background ${className || ''}`}>
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Sessions</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-4 text-center text-muted-foreground">
            Loading sessions...
          </div>
        )}

        {error && (
          <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-md m-4">
            {error.message}
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="p-4 text-center text-muted-foreground">
            No sessions found
          </div>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div className="divide-y">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`w-full text-left p-4 hover:bg-muted/50 transition-colors ${
                  focusSessionId === session.id || selectedSessionId === session.id
                    ? 'bg-muted border-l-4 border-l-primary'
                    : ''
                }`}
              >
                <button
                  onClick={() => handleSessionClick(session.id)}
                  className="w-full text-left"
                >
                <div className="mb-2">
                  {session.boat_display_name && (
                    <div className="font-semibold text-sm mb-1">
                      {session.boat_display_name}
                    </div>
                  )}
                  <div className="text-sm text-muted-foreground">{session.name}</div>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <div>
                    <span className="font-medium">Started:</span>{' '}
                    {new Date(session.started_at).toLocaleString()}
                  </div>
                  {session.ended_at && (
                    <div>
                      <span className="font-medium">Ended:</span>{' '}
                      {new Date(session.ended_at).toLocaleString()}
                    </div>
                  )}
                </div>
                </button>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => handleSessionReplay(session.id)}
                    className="flex-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                  >
                    Replay
                  </button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExportSession(session.id, session.name)}
                    disabled={exportingSessionId === session.id}
                    className="px-3 py-1.5 text-sm"
                    title="Export CSV"
                  >
                    {exportingSessionId === session.id ? '...' : '📥'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

