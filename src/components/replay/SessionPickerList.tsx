import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useReplayStore } from '@/state/useReplayStore';
import { isUserAdmin } from '@/lib/supabase-admin';
import { EventListSidebar } from './EventListSidebar';
import { SessionListSidebar } from './SessionListSidebar';
import { useEventTelemetry } from '@/hooks/useEventTelemetry';

interface SessionPickerListProps {
  onSessionsSelected: (sessionIds: string[]) => void;
  onLogout?: () => void;
  onOpenAdmin?: () => void;
}

export function SessionPickerList({ onSessionsSelected, onLogout, onOpenAdmin }: SessionPickerListProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const selectedEventId = useReplayStore((state) => state.selectedEventId);
  const selectedSessionIds = useReplayStore((state) => state.selectedSessionIds);
  
  // Load telemetry for selected event (before navigation to replay)
  useEventTelemetry(selectedEventId);
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(300);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

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

  // Handle mouse events for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        setLeftWidth(Math.max(200, Math.min(600, e.clientX)));
      }
      if (isResizingRight) {
        const newWidth = window.innerWidth - e.clientX;
        setRightWidth(Math.max(200, Math.min(600, newWidth)));
      }
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
    };

    if (isResizingLeft || isResizingRight) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingLeft, isResizingRight]);

  const selectedSessionId = useReplayStore((state) => state.selectedSessionId);
  const sessions = useReplayStore((state) => state.sessions);

  // Navigate to replay when event is selected and sessions are actually ready in the store
  useEffect(() => {
    if (selectedEventId && selectedSessionIds.length > 0) {
      // Check if all selected sessions are in the store
      const allSessionsReady = selectedSessionIds.every((id) => sessions.has(id));
      
      if (allSessionsReady) {
        // All sessions are in the store, navigate immediately
        onSessionsSelected(selectedSessionIds);
      } else {
        // Some sessions are not ready yet, wait a bit and check again
        const timer = setTimeout(() => {
          const stillReady = selectedSessionIds.every((id) => sessions.has(id));
          if (stillReady) {
            onSessionsSelected(selectedSessionIds);
          }
        }, 200); // Short delay to allow store updates
        
        return () => clearTimeout(timer);
      }
    }
  }, [selectedEventId, selectedSessionIds, sessions, onSessionsSelected]);

  // Navigate to replay when a session is individually selected
  // Verify the session is in the store before navigating
  useEffect(() => {
    if (selectedSessionId && selectedSessionIds.length > 0) {
      // Check if the selected session is in the store
      const sessionReady = selectedSessionIds.every((id) => sessions.has(id));
      
      if (sessionReady) {
        // Session is ready, navigate immediately
        onSessionsSelected(selectedSessionIds);
      } else {
        // Session not ready yet, wait a bit and check again
        const timer = setTimeout(() => {
          const stillReady = selectedSessionIds.every((id) => sessions.has(id));
          if (stillReady) {
            onSessionsSelected(selectedSessionIds);
          }
        }, 200);
        
        return () => clearTimeout(timer);
      }
    }
  }, [selectedSessionId, selectedSessionIds, sessions, onSessionsSelected]);

  return (
    <div className="w-screen h-screen overflow-hidden flex">
      {/* Left sidebar - Events */}
      <div style={{ width: `${leftWidth}px` }} className="relative flex-shrink-0">
        <EventListSidebar />
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50 transition-colors z-10"
          onMouseDown={() => setIsResizingLeft(true)}
        />
      </div>

      {/* Center - Instructions or empty */}
      <div className="flex-1 flex items-center justify-center bg-background relative">
        {!selectedEventId && !selectedSessionId ? (
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-4">Select an Event or Session</h1>
            <p className="text-muted-foreground">
              Choose an event from the left sidebar or a session from the right sidebar to start replay
            </p>
          </div>
        ) : selectedSessionIds.length === 0 ? (
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-4">Loading Sessions...</h1>
            <p className="text-muted-foreground">
              Please wait while we load the sessions
            </p>
          </div>
        ) : (
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-4">Ready to Replay</h1>
            <p className="text-muted-foreground mb-4">
              {selectedSessionIds.length} session{selectedSessionIds.length !== 1 ? 's' : ''} loaded
            </p>
            <Button onClick={() => onSessionsSelected(selectedSessionIds)} size="lg">
              Start Replay
            </Button>
          </div>
        )}

        {/* Top toolbar */}
        <div className="absolute top-4 left-4 z-[1000] flex gap-2">
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

      {/* Right sidebar - Sessions */}
      <div style={{ width: `${rightWidth}px` }} className="relative flex-shrink-0">
        <SessionListSidebar onSessionSelected={onSessionsSelected} />
        <div
          className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-primary/50 transition-colors z-10"
          onMouseDown={() => setIsResizingRight(true)}
        />
      </div>
    </div>
  );
}

