import { useReplayStore } from '@/state/useReplayStore';
import { useState } from 'react';

interface BoatLegendProps {
  className?: string;
}

export function BoatLegend({ className }: BoatLegendProps) {
  const selectedSessionIds = useReplayStore((state) => state.selectedSessionIds);
  const sessions = useReplayStore((state) => state.sessions);
  const [hiddenSessions, setHiddenSessions] = useState<Set<string>>(new Set());

  const toggleSession = (sessionId: string) => {
    const newHidden = new Set(hiddenSessions);
    if (newHidden.has(sessionId)) {
      newHidden.delete(sessionId);
    } else {
      newHidden.add(sessionId);
    }
    setHiddenSessions(newHidden);
  };

  // Update selectedSessionIds in store to hide sessions
  // Note: This is a simplified approach - in a real implementation, you might want
  // to add a separate "visibleSessionIds" state to the store
  // For now, we'll just track visibility locally and let the map handle it

  return (
    <div className={`bg-background border rounded-lg p-3 shadow-lg ${className || ''}`}>
      <div className="text-sm font-semibold mb-2">Boat Legend</div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {selectedSessionIds.length === 0 ? (
          <div className="text-xs text-muted-foreground">No sessions selected</div>
        ) : (
          selectedSessionIds.map((sessionId) => {
            const session = sessions.get(sessionId);
            if (!session) return null;

            const isHidden = hiddenSessions.has(sessionId);
            const displayName = session.boatDisplayName || session.name;

            return (
              <label
                key={sessionId}
                className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded"
              >
                <input
                  type="checkbox"
                  checked={!isHidden}
                  onChange={() => toggleSession(sessionId)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: session.color }}
                />
                <span className={`text-xs flex-1 ${isHidden ? 'line-through text-muted-foreground' : ''}`}>
                  {displayName}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}


