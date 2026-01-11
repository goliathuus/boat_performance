import { useState, FormEvent } from 'react';
import { createEvent } from '@/lib/supabase-admin';
import { Button } from '@/components/ui/button';

interface CreateEventFormProps {
  onSuccess: (eventCode: string) => void;
  onCancel: () => void;
}

export function CreateEventForm({ onSuccess, onCancel }: CreateEventFormProps) {
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const startsAtDate = new Date(startsAt);
      const endsAtDate = new Date(endsAt);

      if (endsAtDate <= startsAtDate) {
        setError('End date must be after start date');
        setLoading(false);
        return;
      }

      const event = await createEvent(title, startsAtDate, endsAtDate);
      setCreatedCode(event.code);
      onSuccess(event.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (createdCode) {
      try {
        await navigator.clipboard.writeText(createdCode);
        // Could add a toast here
      } catch (err) {
        console.error('Failed to copy code:', err);
      }
    }
  };

  if (createdCode) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
          <p className="text-sm text-muted-foreground mb-2">Event created successfully!</p>
          <div className="flex items-center gap-2">
            <code className="text-2xl font-mono font-bold">{createdCode}</code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyCode}
            >
              Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Share this code with participants to join the event
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Close
          </Button>
        </div>
      </div>
    );
  }

  // Set default dates (now and +1 hour)
  const now = new Date();
  const defaultStartsAt = now.toISOString().slice(0, 16);
  const defaultEndsAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 16);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-2">
          Event Title *
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="e.g., Regatta 2024"
        />
      </div>

      <div>
        <label htmlFor="starts_at" className="block text-sm font-medium mb-2">
          Start Date & Time *
        </label>
        <input
          id="starts_at"
          type="datetime-local"
          value={startsAt || defaultStartsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          required
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <label htmlFor="ends_at" className="block text-sm font-medium mb-2">
          End Date & Time *
        </label>
        <input
          id="ends_at"
          type="datetime-local"
          value={endsAt || defaultEndsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          required
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? 'Creating...' : 'Create Event'}
        </Button>
      </div>
    </form>
  );
}


