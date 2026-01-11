import { useState, useEffect } from 'react';
import { getAdminEvents, stopEvent, deleteEvent } from '@/lib/supabase-admin';
import { EventList } from './EventList';
import { CreateEventForm } from './CreateEventForm';
import { EventDetailModal } from './EventDetailModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { Button } from '@/components/ui/button';
import type { EventWithStats } from '@/domain/types';

interface AdminSessionsPageProps {
  onBack: () => void;
  onReplay: (sessionId: string) => void;
  onLogout?: () => void;
}

export function AdminSessionsPage({ onBack, onReplay, onLogout }: AdminSessionsPageProps) {
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
      setError(err instanceof Error ? err.message : 'Failed to load events');
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
      setError(err instanceof Error ? err.message : 'Failed to stop event');
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
      setError(err instanceof Error ? err.message : 'Failed to delete event');
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Gestion des Sessions (Admin)</h1>
          <p className="text-sm text-muted-foreground">Manage events and sessions</p>
        </div>
        <div className="flex gap-2">
          {!showCreateForm && (
            <Button onClick={() => setShowCreateForm(true)}>
              + Create Event
            </Button>
          )}
          <Button variant="outline" onClick={onBack}>
            ← Back to Replay
          </Button>
          {onLogout && (
            <Button variant="outline" onClick={onLogout}>
              Déconnexion
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {showCreateForm ? (
          <div className="max-w-2xl mx-auto">
            <div className="mb-6">
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                ← Back to Events
              </Button>
            </div>
            <div className="bg-background border rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Create New Event</h2>
              <CreateEventForm
                onSuccess={handleCreateSuccess}
                onCancel={() => setShowCreateForm(false)}
              />
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-md">
                {error}
              </div>
            )}

            <EventList
              events={events}
              onView={handleView}
              onStop={handleStop}
              onDelete={handleDeleteClick}
              loading={loading}
            />
          </>
        )}
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && selectedEventId && (
        <EventDetailModal
          isOpen={selectedEventId !== null}
          eventId={selectedEventId}
          eventTitle={selectedEvent.title}
          eventCode={selectedEvent.code}
          onClose={() => {
            setSelectedEventId(null);
            setSelectedEvent(null);
          }}
          onReplay={onReplay}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Event"
        message={`Are you sure you want to delete the event "${eventToDelete?.title}"? This will stop all telemetry writes and make all associated sessions unavailable.`}
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

