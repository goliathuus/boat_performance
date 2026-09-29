import { EventWithStats } from '@/domain/types';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/brand';
import { PublicShareLink } from './PublicShareLink';

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

interface EventListProps {
  events: EventWithStats[];
  onView: (eventId: string) => void;
  onStop: (eventId: string) => void;
  onDelete: (eventId: string) => void;
  onShareUpdated?: () => void;
  loading?: boolean;
}

export function EventList({ events, onView, onStop, onDelete, onShareUpdated, loading }: EventListProps) {
  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Chargement des événements…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Aucun événement. Créez le premier pour commencer.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div
          key={event.id}
          className="glass rounded-xl border p-4 sm:p-5 transition-colors hover:border-foreground/20"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="font-semibold text-lg">{event.title}</h3>
                <StatusPill status={event.status} />
              </div>
              
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-xs text-foreground/80">{event.code}</span>
                </div>
                <div>
                  <span className="font-medium">Début :</span> {formatDateTime(event.starts_at)}
                </div>
                <div>
                  <span className="font-medium">Fin :</span> {formatDateTime(event.ends_at)}
                </div>
                <div>
                  <span className="font-medium">Sessions :</span> {event.session_count}
                </div>
                {(event.owner_name || event.owner_email) && (
                  <div>
                    <span className="font-medium">Propriétaire :</span>{' '}
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
                Voir
              </Button>
              {event.status === 'active' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onStop(event.id)}
                >
                  Arrêter
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/15 hover:text-destructive"
                onClick={() => onDelete(event.id)}
              >
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

