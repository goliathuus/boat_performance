import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useReplayStore } from '@/state/useReplayStore';
import { isUserAdmin } from '@/lib/supabase-admin';
import { useEvents } from '@/hooks/useEvents';
import { useAllSessions } from '@/hooks/useAllSessions';
import { useEventSessions } from '@/hooks/useEventSessions';
import { exportEventToCSV, exportSessionToCSV, exportSessionFromSupabase } from '@/lib/csv-export';
import { downloadCSV, generateCSVFilename } from '@/lib/csv-download';
import { determineSessionEndTime } from '@/lib/session-utils';
import { CsvLoadModal } from './CsvLoadModal';
import type { EventSession } from '@/hooks/useEventSessions';

type TabType = 'events' | 'sessions';

interface UnifiedSessionPickerProps {
  onSessionsSelected: (sessionIds: string[]) => void;
  onLogout?: () => void;
  onOpenAdmin?: () => void;
}

export function UnifiedSessionPicker({ onSessionsSelected, onLogout, onOpenAdmin }: UnifiedSessionPickerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('events');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [exportingEventId, setExportingEventId] = useState<string | null>(null);
  const [exportingSessionId, setExportingSessionId] = useState<string | null>(null);

  const { events, loading: eventsLoading } = useEvents();
  const { sessions: allSessions, loading: allSessionsLoading } = useAllSessions();
  const { sessions: eventSessions, loading: eventSessionsLoading } = useEventSessions(selectedEventId);
  const sessionsStore = useReplayStore((state) => state.sessions);
  const addSessions = useReplayStore((state) => state.addSessions);
  const setSelectedSessions = useReplayStore((state) => state.setSelectedSessions);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const adminCheck = await isUserAdmin();
        setIsAdmin(adminCheck);
      } catch (err) {
        console.error('Error checking admin status:', err);
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, []);

  const handleEventClick = (eventId: string) => {
    if (expandedEvents.has(eventId)) {
      setExpandedEvents((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    } else {
      setExpandedEvents((prev) => new Set(prev).add(eventId));
      setSelectedEventId(eventId);
    }
  };

  const handleSessionToggle = (sessionId: string) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const handleReplaySelected = async () => {
    const ids = Array.from(selectedSessionIds);
    if (ids.length === 0) return;

    // Add sessions to store if not already there
    const sessionsToAdd: Array<{ sessionId: string; name: string; tMin: number; tMax: number; boatDisplayName?: string }> = [];
    
    const allSessionsToCheck = activeTab === 'events' && selectedEventId
      ? eventSessions
      : allSessions;

    // Process sessions in parallel
    await Promise.all(
      ids.map(async (id) => {
        if (!sessionsStore.has(id)) {
          const session = allSessionsToCheck.find((s) => s.id === id);
          if (session) {
            const tMin = new Date(session.started_at).getTime();
            const tMax = await determineSessionEndTime(
              session.id,
              session.started_at,
              session.ended_at,
              session.event_id
            );
            
            sessionsToAdd.push({
              sessionId: id,
              name: session.name,
              tMin,
              tMax,
              boatDisplayName: session.boat_display_name || undefined,
            });
          }
        }
      })
    );

    if (sessionsToAdd.length > 0) {
      addSessions(sessionsToAdd);
    }

    setSelectedSessions(ids);
    onSessionsSelected(ids);
  };

  const handleReplayAllEventSessions = async () => {
    if (!selectedEventId || eventSessions.length === 0) return;
    
    const ids = eventSessions.map((s) => s.id);
    const sessionsToAdd = await Promise.all(
      eventSessions.map(async (session) => {
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
      })
    );

    addSessions(sessionsToAdd);
    setSelectedSessions(ids);
    onSessionsSelected(ids);
  };

  const handleExportEvent = async (eventId: string, eventCode: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExportingEventId(eventId);
    try {
      const csvContent = await exportEventToCSV(eventId);
      const filename = generateCSVFilename(`event_${eventCode}`, false);
      downloadCSV(csvContent, filename);
    } catch (err) {
      console.error('Error exporting event:', err);
      alert(err instanceof Error ? err.message : 'Failed to export event');
    } finally {
      setExportingEventId(null);
    }
  };

  const handleExportSession = async (sessionId: string, sessionName: string) => {
    setExportingSessionId(sessionId);
    try {
      const sessionData = sessionsStore.get(sessionId);
      let csvContent: string;

      if (sessionData && sessionData.points.length > 0) {
        csvContent = exportSessionToCSV(sessionId, sessionData);
      } else {
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

  const getStatusColor = (status: 'active' | 'expired' | 'upcoming') => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'expired':
        return 'bg-gray-500';
      case 'upcoming':
        return 'bg-blue-500';
    }
  };

  const getStatusLabel = (status: 'active' | 'expired' | 'upcoming') => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'expired':
        return 'Expired';
      case 'upcoming':
        return 'Upcoming';
    }
  };

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col bg-background">
      {/* Header with tabs */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Select Sessions to Replay</h1>
          <div className="flex gap-2">
            {isAdmin && onOpenAdmin && (
              <Button variant="outline" size="sm" onClick={onOpenAdmin}>
                Gestion des sessions
              </Button>
            )}
            {onLogout && (
              <Button variant="outline" size="sm" onClick={onLogout}>
                Déconnexion
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setActiveTab('events')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'events'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Events
          </button>
          <button
            onClick={() => setActiveTab('sessions')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'sessions'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All Sessions
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Main content area */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'events' && (
            <div className="space-y-4">
              {eventsLoading && (
                <div className="text-center py-8">
                  <LoadingSpinner size="lg" text="Loading events..." />
                </div>
              )}

              {!eventsLoading && events.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No events found
                </div>
              )}

              {!eventsLoading && events.length > 0 && (
                <div className="space-y-4">
                  {events.map((event) => {
                    const isExpanded = expandedEvents.has(event.id);
                    const isLoadingSessions = selectedEventId === event.id && eventSessionsLoading;

                    return (
                      <div
                        key={event.id}
                        className="border rounded-lg overflow-hidden"
                      >
                        <div
                          className="p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => handleEventClick(event.id)}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="font-semibold text-lg">{event.title}</h3>
                                <span
                                  className={`px-2 py-1 rounded text-xs text-white ${getStatusColor(event.status)}`}
                                >
                                  {getStatusLabel(event.status)}
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground space-y-1">
                                <div>
                                  <span className="font-medium">Start:</span>{' '}
                                  {new Date(event.starts_at).toLocaleString()}
                                </div>
                                <div>
                                  <span className="font-medium">End:</span>{' '}
                                  {new Date(event.ends_at).toLocaleString()}
                                </div>
                                <div>
                                  <span className="font-medium">Sessions:</span> {event.session_count}
                                </div>
                                <div className="font-mono text-xs mt-1">{event.code}</div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => handleExportEvent(event.id, event.code, e)}
                                disabled={exportingEventId === event.id}
                                title="Export all sessions to CSV"
                              >
                                {exportingEventId === event.id ? '...' : '📥'}
                              </Button>
                              {isExpanded && eventSessions.length > 0 && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReplayAllEventSessions();
                                  }}
                                >
                                  Replay All
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t bg-muted/30">
                            {isLoadingSessions ? (
                              <div className="p-4 text-center">
                                <LoadingSpinner size="sm" text="Loading sessions..." />
                              </div>
                            ) : eventSessions.length === 0 ? (
                              <div className="p-4 text-center text-muted-foreground">
                                No sessions found for this event
                              </div>
                            ) : (
                              <div className="p-4 space-y-2">
                                {eventSessions.map((session) => (
                                  <div
                                    key={session.id}
                                    className="flex items-center gap-3 p-3 bg-background rounded border"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedSessionIds.has(session.id)}
                                      onChange={() => handleSessionToggle(session.id)}
                                      className="w-4 h-4"
                                    />
                                    <div className="flex-1">
                                      <div className="font-medium">
                                        {session.boat_display_name || session.name}
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        {new Date(session.started_at).toLocaleString()}
                                      </div>
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleExportSession(session.id, session.name)}
                                      disabled={exportingSessionId === session.id}
                                    >
                                      {exportingSessionId === session.id ? '...' : '📥'}
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="space-y-4">
              {allSessionsLoading && (
                <div className="text-center py-8">
                  <LoadingSpinner size="lg" text="Loading sessions..." />
                </div>
              )}

              {!allSessionsLoading && allSessions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No sessions found
                </div>
              )}

              {!allSessionsLoading && allSessions.length > 0 && (
                <div className="space-y-2">
                  {allSessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSessionIds.has(session.id)}
                        onChange={() => handleSessionToggle(session.id)}
                        className="w-4 h-4"
                      />
                      <div className="flex-1">
                        <div className="text-sm text-muted-foreground">{session.boat_display_name || session.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">
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
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportSession(session.id, session.name)}
                        disabled={exportingSessionId === session.id}
                      >
                        {exportingSessionId === session.id ? '...' : '📥'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer with action buttons */}
      <div className="border-t p-4 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => setIsCsvModalOpen(true)}
              variant="outline"
            >
              📁 Load CSV
            </Button>
            {selectedSessionIds.size > 0 && (
              <span className="text-sm text-muted-foreground">
                {selectedSessionIds.size} session{selectedSessionIds.size !== 1 ? 's' : ''} selected
              </span>
            )}
          </div>
          <Button
            onClick={handleReplaySelected}
            disabled={selectedSessionIds.size === 0}
            size="lg"
          >
            Replay Selected ({selectedSessionIds.size})
          </Button>
        </div>
      </div>

      {/* Footer credits */}
      <div className="border-t p-2 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span>Développé par</span>
          <a
            href="https://www.sh-courseaularge.fr/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 underline transition-colors font-medium"
          >
            SH Course au large
          </a>
          <span>•</span>
          <a
            href="https://www.instagram.com/sh_course_au_large_mini650?igsh=anh0bnY4b3Rnb2o0"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 underline transition-colors"
            title="Instagram SH Course au large"
          >
            Instagram
          </a>
        </div>
      </div>

      {/* CSV Load Modal */}
      <CsvLoadModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onLoadComplete={(sessionIds) => {
          setIsCsvModalOpen(false);
          onSessionsSelected(sessionIds);
        }}
      />
    </div>
  );
}

