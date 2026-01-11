import { useState, useEffect } from 'react';
import { getEventSessions, deleteSession } from '@/lib/supabase-admin';
import { Button } from '@/components/ui/button';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import type { AdminSession } from '@/domain/types';

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface EventDetailModalProps {
  isOpen: boolean;
  eventId: string;
  eventTitle: string;
  eventCode: string;
  onClose: () => void;
  onReplay: (sessionId: string) => void;
}

export function EventDetailModal({
  isOpen,
  eventId,
  eventTitle,
  eventCode,
  onClose,
  onReplay,
}: EventDetailModalProps) {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<AdminSession | null>(null);

  useEffect(() => {
    if (isOpen && eventId) {
      loadSessions();
    }
  }, [isOpen, eventId]);

  const loadSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getEventSessions(eventId);
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (session: AdminSession) => {
    setSessionToDelete(session);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!sessionToDelete) return;

    try {
      await deleteSession(sessionToDelete.id);
      await loadSessions(); // Reload list
      setShowDeleteConfirm(false);
      setSessionToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session');
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50">
        <div className="bg-background border rounded-lg shadow-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-semibold">{eventTitle}</h2>
              <p className="text-sm text-muted-foreground font-mono">{eventCode}</p>
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading sessions...
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No sessions found for this event.
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold mb-2">{session.name}</div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div>
                            <span className="font-medium">Started:</span>{' '}
                            {formatDateTime(session.started_at)}
                          </div>
                          {session.ended_at && (
                            <div>
                              <span className="font-medium">Ended:</span>{' '}
                              {formatDateTime(session.ended_at)}
                            </div>
                          )}
                          {session.boat_id && (
                            <div>
                              <span className="font-medium">Boat ID:</span> {session.boat_id}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onReplay(session.id)}
                        >
                          Replay
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteClick(session)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Session"
        message={`Are you sure you want to delete the session "${sessionToDelete?.name}"? This action cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setSessionToDelete(null);
        }}
        variant="session"
      />
    </>
  );
}

