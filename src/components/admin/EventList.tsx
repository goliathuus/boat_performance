import { EventWithStats } from '@/domain/types';
import { Button } from '@/components/ui/button';
import { PublicShareLink } from './PublicShareLink';

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

interface EventListProps {
  events: EventWithStats[];
  onView: (eventId: string) => void;
  onStop: (eventId: string) => void;
  onDelete: (eventId: string) => void;
  onShareUpdated?: () => void;
  loading?: boolean;
}

export function EventList({ events, onView, onStop, onDelete, onShareUpdated, loading }: EventListProps) {
  const getStatusBadge = (status: EventWithStats['status']) => {
    const styles = {
      active: 'bg-green-500/20 text-green-700 dark:text-green-400',
      expired: 'bg-gray-500/20 text-gray-700 dark:text-gray-400',
      upcoming: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
    };

    const labels = {
      active: 'Active',
      expired: 'Expired',
      upcoming: 'Upcoming',
    };

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading events...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No events found. Create your first event to get started.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div
          key={event.id}
          className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="font-semibold text-lg">{event.title}</h3>
                {getStatusBadge(event.status)}
              </div>
              
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{event.code}</span>
                </div>
                <div>
                  <span className="font-medium">Start:</span> {formatDateTime(event.starts_at)}
                </div>
                <div>
                  <span className="font-medium">End:</span> {formatDateTime(event.ends_at)}
                </div>
                <div>
                  <span className="font-medium">Sessions:</span> {event.session_count}
                </div>
                {(event.owner_name || event.owner_email) && (
                  <div>
                    <span className="font-medium">Propriétaire:</span>{' '}
                    {event.owner_name || event.owner_email}
                  </div>
                )}
              </div>
              <PublicShareLink
                eventId={event.id}
                shareToken={event.share_token}
                shareEnabled={event.share_enabled}
                compact
                onUpdated={() => onShareUpdated?.()}
              />
            </div>

            <div className="flex gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onView(event.id)}
              >
                View
              </Button>
              {event.status === 'active' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onStop(event.id)}
                >
                  Stop
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onDelete(event.id)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

