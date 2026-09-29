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
import { StravaSubmitCallout } from '@/components/StravaSubmitCallout';
import { WindBackdrop } from '@/components/ui/WindBackdrop';
import { Credits, GlassCard, PageHeader, StatusPill } from '@/components/ui/brand';
import { cn } from '@/lib/utils';
import { formatDateRange } from '@/lib/time';

type TabType = 'events' | 'sessions';

const DownloadIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

interface UnifiedSessionPickerProps {
  onSessionsSelected: (sessionIds: string[]) => void;
  onLogout?: () => void;
  onOpenAdmin?: () => void;
  onOpenCsvAgg?: () => void;
}

export function UnifiedSessionPicker({
  onSessionsSelected,
  onLogout,
  onOpenAdmin,
  onOpenCsvAgg,
}: UnifiedSessionPickerProps) {
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

  const selectedCount = selectedSessionIds.size;

  const tabButton = (tab: TabType, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === tab}
      onClick={() => setActiveTab(tab)}
      className={cn(
        'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
        activeTab === tab
          ? 'bg-primary text-primary-foreground shadow'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  );

  const sessionRow = (session: { id: string; name: string; started_at: string; ended_at?: string | null }) => {
    const checked = selectedSessionIds.has(session.id);
    return (
      <label
        key={session.id}
        className={cn(
          'group flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors',
          checked ? 'border-primary/50 bg-primary/10' : 'border-foreground/10 bg-background/40 hover:border-foreground/20'
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => handleSessionToggle(session.id)}
          className="h-4 w-4 flex-none accent-primary"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{session.name}</div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {formatDateRange(session.started_at, session.ended_at ?? null)}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-none text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.preventDefault();
            handleExportSession(session.id, session.name);
          }}
          disabled={exportingSessionId === session.id}
          title="Exporter la session en CSV"
          aria-label={`Exporter ${session.name} en CSV`}
        >
          {exportingSessionId === session.id ? '…' : <DownloadIcon />}
        </Button>
      </label>
    );
  };

  return (
    <div className="relative w-screen app-shell overflow-hidden flex flex-col">
      <WindBackdrop intensity={0.6} />

      <PageHeader
        title="Sessions à rejouer"
        subtitle="Choisissez un événement ou des sessions, puis lancez le replay."
        actions={
          <>
            <StravaSubmitCallout variant="header" />
            {isAdmin && onOpenAdmin && (
              <Button variant="outline" size="sm" onClick={onOpenAdmin}>
                Gestion
              </Button>
            )}
            {onLogout && (
              <Button variant="ghost" size="sm" onClick={onLogout}>
                Déconnexion
              </Button>
            )}
          </>
        }
      >
        <div role="tablist" className="mb-3 inline-flex rounded-full border bg-background/50 p-1">
          {tabButton('events', 'Événements')}
          {tabButton('sessions', 'Toutes les sessions')}
        </div>
      </PageHeader>

      <main className="relative flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-3 p-4 sm:p-6">
          {activeTab === 'events' && (
            <>
              {eventsLoading && (
                <div className="py-12">
                  <LoadingSpinner size="lg" text="Chargement des événements…" />
                </div>
              )}

              {!eventsLoading && events.length === 0 && (
                <EmptyState text="Aucun événement pour l’instant." />
              )}

              {!eventsLoading &&
                events.map((event) => {
                  const isExpanded = expandedEvents.has(event.id);
                  const isLoadingSessions = selectedEventId === event.id && eventSessionsLoading;

                  return (
                    <GlassCard
                      key={event.id}
                      className={cn(
                        'overflow-hidden transition-colors',
                        isExpanded ? 'border-primary/40' : 'hover:border-foreground/20'
                      )}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        className="flex cursor-pointer items-center gap-4 p-4 sm:p-5"
                        onClick={() => handleEventClick(event.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleEventClick(event.id);
                          }
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <h3 className="truncate text-base font-semibold sm:text-lg">{event.title}</h3>
                            <StatusPill status={event.status} />
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                            <span>{formatDateRange(event.starts_at, event.ends_at)}</span>
                            <span>
                              {event.session_count} session{event.session_count > 1 ? 's' : ''}
                            </span>
                            <span className="rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-[11px] text-foreground/70">
                              {event.code}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-none items-center gap-2">
                          {isExpanded && eventSessions.length > 0 && (
                            <Button
                              size="sm"
                              className="rounded-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReplayAllEventSessions();
                              }}
                            >
                              Tout rejouer
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-muted-foreground hover:text-foreground"
                            onClick={(e) => handleExportEvent(event.id, event.code, e)}
                            disabled={exportingEventId === event.id}
                            title="Exporter toutes les sessions en CSV"
                            aria-label={`Exporter ${event.title} en CSV`}
                          >
                            {exportingEventId === event.id ? '…' : <DownloadIcon />}
                          </Button>
                          <ChevronIcon open={isExpanded} />
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-foreground/10 bg-background/30 p-3 sm:p-4">
                          {isLoadingSessions ? (
                            <LoadingSpinner size="sm" text="Chargement des sessions…" />
                          ) : eventSessions.length === 0 ? (
                            <div className="py-2 text-center text-sm text-muted-foreground">
                              Aucune session dans cet événement
                            </div>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {eventSessions.map((session) => sessionRow(session))}
                            </div>
                          )}
                        </div>
                      )}
                    </GlassCard>
                  );
                })}
            </>
          )}

          {activeTab === 'sessions' && (
            <>
              {allSessionsLoading && (
                <div className="py-12">
                  <LoadingSpinner size="lg" text="Chargement des sessions…" />
                </div>
              )}

              {!allSessionsLoading && allSessions.length === 0 && <EmptyState text="Aucune session." />}

              {!allSessionsLoading && allSessions.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">{allSessions.map((session) => sessionRow(session))}</div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="glass relative border-t safe-bottom">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setIsCsvModalOpen(true)} variant="outline" size="sm">
              Importer un CSV
            </Button>
            {onOpenCsvAgg && (
              <Button onClick={onOpenCsvAgg} variant="outline" size="sm">
                Agréger des CSV
              </Button>
            )}
            <Credits className="hidden lg:flex lg:pl-3" />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {selectedCount === 0
                ? 'Aucune session sélectionnée'
                : `${selectedCount} session${selectedCount > 1 ? 's' : ''} sélectionnée${selectedCount > 1 ? 's' : ''}`}
            </span>
            <Button
              onClick={handleReplaySelected}
              disabled={selectedCount === 0}
              className="h-10 w-full rounded-full px-5 font-semibold shadow-lg shadow-primary/20 sm:w-auto"
            >
              <PlayIcon />
              Lancer le replay{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </Button>
          </div>
        </div>
        <Credits className="pb-2 lg:hidden" />
      </footer>

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

function EmptyState({ text }: { text: string }) {
  return (
    <GlassCard className="px-6 py-12 text-center text-sm text-muted-foreground">{text}</GlassCard>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('text-muted-foreground transition-transform', open && 'rotate-180')}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="mr-1.5">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}
