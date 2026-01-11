import { useEvents } from '@/hooks/useEvents';
import { useReplayStore } from '@/state/useReplayStore';
import { useEffect, useRef } from 'react';

interface EventListSidebarProps {
  className?: string;
}

export function EventListSidebar({ className }: EventListSidebarProps) {
  const { events, loading, error } = useEvents();
  const selectedEventId = useReplayStore((state) => state.selectedEventId);
  const setSelectedEvent = useReplayStore((state) => state.setSelectedEvent);
  const resetReplay = useReplayStore((state) => state.reset);
  const previousEventIdRef = useRef<string | null>(null);

  // When event changes, reset store to clear old sessions
  // Let useEventTelemetry handle adding sessions and loading telemetry
  useEffect(() => {
    // If event changed, reset store first to clear old sessions
    if (previousEventIdRef.current !== null && previousEventIdRef.current !== selectedEventId) {
      resetReplay();
    }
    
    previousEventIdRef.current = selectedEventId;
  }, [selectedEventId, resetReplay]);

  const handleEventClick = (eventId: string) => {
    setSelectedEvent(eventId);
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
    <div className={`flex flex-col h-full border-r bg-background ${className || ''}`}>
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Events</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-4 text-center text-muted-foreground">
            Loading events...
          </div>
        )}

        {error && (
          <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-md m-4">
            {error.message}
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="p-4 text-center text-muted-foreground">
            No events found
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <div className="divide-y">
            {events.map((event) => (
              <button
                key={event.id}
                onClick={() => handleEventClick(event.id)}
                className={`w-full text-left p-4 hover:bg-muted/50 transition-colors ${
                  selectedEventId === event.id ? 'bg-muted border-l-4 border-l-primary' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-sm flex-1">{event.title}</h3>
                  <span
                    className={`px-2 py-1 rounded text-xs text-white ${getStatusColor(event.status)}`}
                  >
                    {getStatusLabel(event.status)}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
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
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

