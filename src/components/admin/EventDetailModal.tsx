import { useState, useEffect } from 'react';
import { getEventSessions, deleteSession } from '@/lib/supabase-admin';
import { determineSessionEndTime } from '@/lib/session-utils';
import { useReplayStore } from '@/state/useReplayStore';
import { Button } from '@/components/ui/button';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { PublicShareLink } from './PublicShareLink';
import type { AdminSession } from '@/domain/types';

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('fr-FR', {
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
  shareToken: string;
  shareEnabled: boolean;
  onShareUpdated?: () => void;
  onClose: () => void;
  onReplay: (sessionId: string) => void;
  onReplayMultiple?: (sessionIds: string[]) => void;
}

export function EventDetailModal({
  isOpen,
  eventId,
  eventTitle,
  eventCode,
  shareToken,
  shareEnabled,
  onShareUpdated,
  onClose,
  onReplay,
  onReplayMultiple,
}: EventDetailModalProps) {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<AdminSession | null>(null);
  const addSessions = useReplayStore((state) => state.addSessions);
  const setSelectedSessions = useReplayStore((state) => state.setSelectedSessions);

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
      setError(err instanceof Error ? err.message : 'Impossible de charger les sessions');
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
      setError(err instanceof Error ? err.message : 'Impossible de supprimer la session');
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="glass rounded-2xl border shadow-2xl p-6 max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-semibold">{eventTitle}</h2>
              <p className="text-sm text-muted-foreground font-mono">{eventCode}</p>
              <div className="mt-3">
                <PublicShareLink
                  eventId={eventId}
                  shareToken={shareToken}
                  shareEnabled={shareEnabled}
                  onUpdated={() => onShareUpdated?.()}
                />
              </div>
            </div>
            <div className="flex gap-2">
              {sessions.length > 0 && onReplayMultiple && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={async () => {
                    const sessionIds = sessions.map((s) => s.id);
                    // Add sessions to store
                    const sessionsToAdd = await Promise.all(sessions.map(async (session) => {
                      const tMin = new Date(session.started_at).getTime();
                      const tMax = await determineSessionEndTime(
                        session.id,
                        session.started_at,
                        session.ended_at,
                        session.event_id
                      );
                      return {
                        sessionId: session.id,
                        name: session.name,
                        tMin,
                        tMax,
                        boatDisplayName: session.boat_display_name || undefined,
                      };
                    }));
                    addSessions(sessionsToAdd);
                    setSelectedSessions(sessionIds);
                    onReplayMultiple(sessionIds);
                  }}
                >
                  Tout rejouer ({sessions.length})
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Chargement des sessions…
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Aucune session dans cet événement.
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-xl border border-foreground/10 bg-background/40 p-4 transition-colors hover:border-foreground/20"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold mb-2">{session.name}</div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div>
                            <span className="font-medium">Début :</span>{' '}
                            {formatDateTime(session.started_at)}
                          </div>
                          {session.ended_at && (
                            <div>
                              <span className="font-medium">Fin :</span>{' '}
                              {formatDateTime(session.ended_at)}
                            </div>
                          )}
                          
                          {/* Fallback: show boat_id if no display name */}
                          {session.boat_id && !session.boat_display_name && (
                            <div>
                              <span className="font-medium">ID bateau :</span>{' '}
                              <span className="font-mono text-xs">{session.boat_id}</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Visual badges for statistics */}
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {session.telemetry_count !== undefined && session.telemetry_count > 0 && (
                            <span className="inline-flex items-center rounded-full bg-sky-400/15 px-2 py-0.5 text-[11px] font-medium text-sky-300 ring-1 ring-inset ring-sky-400/30 tabular-nums">
                              {session.telemetry_count.toLocaleString('fr-FR')} points GPS
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onReplay(session.id)}
                        >
                          Rejouer
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/15 hover:text-destructive"
                          onClick={() => handleDeleteClick(session)}
                        >
                          Supprimer
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
        title="Supprimer la session"
        message={`Supprimer la session « ${sessionToDelete?.name} » ? Cette action est définitive.`}
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

