import { useState, useEffect } from 'react';
import { getAdminEvents, stopEvent, deleteEvent } from '@/lib/supabase-admin';
import { EventList } from './EventList';
import { CreateEventForm } from './CreateEventForm';
import { EventDetailModal } from './EventDetailModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { Button } from '@/components/ui/button';
import { WindBackdrop } from '@/components/ui/WindBackdrop';
import { PageHeader } from '@/components/ui/brand';
import type { EventWithStats } from '@/domain/types';

interface AdminSessionsPageProps {
  onBack: () => void;
  onReplay: (sessionId: string) => void;
  onReplayMultiple?: (sessionIds: string[]) => void;
  onLogout?: () => void;
}

export function AdminSessionsPage({ onBack, onReplay, onReplayMultiple, onLogout }: AdminSessionsPageProps) {
  const [events, setEvents] = useState<EventWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventWithStats | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<EventWithStats | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminEvents();
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les événements');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSuccess = () => {
    setShowCreateForm(false);
    loadEvents(); // Reload events list
  };

  const handleView = (eventId: string) => {
    const event = events.find((e) => e.id === eventId);
    if (event) {
      setSelectedEvent(event);
      setSelectedEventId(eventId);
    }
  };

  const handleStop = async (eventId: string) => {
    if (!confirm('Are you sure you want to stop this event? This will prevent all participants from writing new telemetry.')) {
      return;
    }

    try {
      await stopEvent(eventId);
      await loadEvents(); // Reload to update status
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’arrêter l’événement');
    }
  };

  const handleDeleteClick = (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    if (event) {
      setEventToDelete(event);
      setShowDeleteConfirm(true);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!eventToDelete) return;

    try {
      await deleteEvent(eventToDelete.id);
      setShowDeleteConfirm(false);
      setEventToDelete(null);
      await loadEvents(); // Reload events list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de supprimer l’événement');
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="relative w-screen app-shell overflow-hidden flex flex-col">
      <WindBackdrop intensity={0.5} />
      <PageHeader
        title="Gestion des événements"
        subtitle="Créez les événements, partagez-les et gérez leurs sessions."
        actions={
          <>
            {!showCreateForm && (
              <Button size="sm" onClick={() => setShowCreateForm(true)}>
                + Nouvel événement
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onBack}>
              ← Sessions
            </Button>
            {onLogout && (
              <Button variant="ghost" size="sm" onClick={onLogout}>
                Déconnexion
              </Button>
            )}
          </>
        }
      />

      {/* Content */}
      <div className="relative flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl">
        {showCreateForm ? (
          <div className="max-w-2xl mx-auto">
            <div className="mb-6">
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                ← Retour aux événements
              </Button>
            </div>
            <div className="glass rounded-2xl border p-6">
              <h2 className="text-xl font-semibold mb-4">Créer un événement</h2>
              <CreateEventForm
                onSuccess={handleCreateSuccess}
                onCancel={() => setShowCreateForm(false)}
              />
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive">
                {error}
              </div>
            )}

            <EventList
              events={events}
              onView={handleView}
              onStop={handleStop}
              onDelete={handleDeleteClick}
              onShareUpdated={loadEvents}
              loading={loading}
            />
          </>
        )}
        </div>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && selectedEventId && (
        <EventDetailModal
          isOpen={selectedEventId !== null}
          eventId={selectedEventId}
          eventTitle={selectedEvent.title}
          eventCode={selectedEvent.code}
          shareToken={selectedEvent.share_token}
          shareEnabled={selectedEvent.share_enabled}
          onShareUpdated={loadEvents}
          onClose={() => {
            setSelectedEventId(null);
            setSelectedEvent(null);
          }}
          onReplay={onReplay}
          onReplayMultiple={onReplayMultiple}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        title="Supprimer l’événement"
        message={`Supprimer l’événement « ${eventToDelete?.title} » ?`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setEventToDelete(null);
        }}
        variant="event"
      />
    </div>
  );
}

