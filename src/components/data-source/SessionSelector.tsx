import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { loadSessionData } from '@/domain/parsing/supabase';
import { useRaceStore } from '@/state/useRaceStore';
import { Button } from '@/components/ui/button';

interface Session {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
}

interface SessionSelectorProps {
  onDataLoaded: () => void;
}

export function SessionSelector({ onDataLoaded }: SessionSelectorProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setDataset = useRaceStore((state) => state.setDataset);
  const setDataSource = useRaceStore((state) => state.setDataSource);

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError('Not authenticated');
          return;
        }

        const { data, error: fetchError } = await supabase
          .from('sessions')
          .select('id, name, started_at, ended_at')
          .eq('user_id', user.id)
          .order('started_at', { ascending: false });

        if (fetchError) {
          throw new Error(`Failed to load sessions: ${fetchError.message}`);
        }

        setSessions(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sessions');
      } finally {
        setLoadingSessions(false);
      }
    };

    loadSessions();
  }, []);

  const handleLoadSession = async () => {
    if (!selectedSessionId) {
      setError('Please select a session');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      const dataset = await loadSessionData(selectedSessionId, user.id);
      setDataset(dataset);
      setDataSource('supabase');
      onDataLoaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session data');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loadingSessions) {
    return (
      <div className="p-4 text-center">
        <div className="text-lg">Loading sessions...</div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="p-4 text-center">
        <div className="text-muted-foreground">No sessions found. Please create a session first.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-md text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="session-select" className="block text-sm font-medium mb-2">
          Select a session
        </label>
        <select
          id="session-select"
          value={selectedSessionId}
          onChange={(e) => setSelectedSessionId(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">-- Select a session --</option>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.name} ({formatDate(session.started_at)})
            </option>
          ))}
        </select>
      </div>

      <Button
        onClick={handleLoadSession}
        disabled={!selectedSessionId || loading}
        className="w-full"
      >
        {loading ? 'Loading...' : 'Load Session'}
      </Button>
    </div>
  );
}

