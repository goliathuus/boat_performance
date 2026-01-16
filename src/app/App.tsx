import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { LoginPage } from '@/components/auth/LoginPage';
import { UnifiedSessionPicker } from '@/components/replay/UnifiedSessionPicker';
import { ReplayPage } from './ReplayPage';
import { AdminSessionsPage } from '@/components/admin/AdminSessionsPage';
import { useReplayStore } from '@/state/useReplayStore';
import { determineSessionEndTime } from '@/lib/session-utils';

type AppPage = 'auth' | 'sessions' | 'replay' | 'admin';

function App() {
  const [page, setPage] = useState<AppPage>('auth');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const selectedSessionIds = useReplayStore((state) => state.selectedSessionIds);
  const resetReplay = useReplayStore((state) => state.reset);

  // Check authentication on mount (only once)
  useEffect(() => {
    const checkAuth = async () => {
      setIsCheckingAuth(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setPage('auth');
        setIsCheckingAuth(false);
        return;
      }

      // If authenticated, check selected sessions from store
      const currentSelectedIds = useReplayStore.getState().selectedSessionIds;
      if (currentSelectedIds.length === 0) {
        setPage('sessions');
      } else {
        setPage('replay');
      }
      setIsCheckingAuth(false);
    };

    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setPage('auth');
        resetReplay();
      } else {
        // User logged in - navigate based on selected sessions
        // Use functional update to get current selectedSessionIds
        setPage((currentPage) => {
          // Don't change if we're on admin page (let user navigate back manually)
          if (currentPage === 'admin') return currentPage;
          
          // Get current selectedSessionIds from store
          const currentSelectedIds = useReplayStore.getState().selectedSessionIds;
          if (currentSelectedIds.length === 0) {
            return 'sessions';
          } else {
            return 'replay';
          }
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []); // Empty deps - only run on mount

  // Update page when sessions are selected (only if authenticated)
  useEffect(() => {
    // Don't change page if we're checking auth or not authenticated
    if (isCheckingAuth || page === 'auth') return;
    
    if (selectedSessionIds.length > 0 && page === 'sessions') {
      setPage('replay');
    } else if (selectedSessionIds.length === 0 && page === 'replay') {
      setPage('sessions');
    }
  }, [selectedSessionIds.length, page, isCheckingAuth]);

  const handleLoginSuccess = () => {
    setPage('sessions');
  };

  const handleSessionsSelected = () => {
    setPage('replay');
  };

  const handleBackToSessions = () => {
    resetReplay();
    setPage('sessions');
  };

  const handleOpenAdmin = () => {
    setPage('admin');
  };

  const handleBackFromAdmin = () => {
    resetReplay();
    setPage('sessions');
  };

  const handleReplayFromAdmin = async (sessionId: string) => {
    // Reset store first
    const store = useReplayStore.getState();
    store.reset();

    // Load session metadata
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: session } = await supabase
      .from('sessions')
      .select('name, started_at, ended_at, event_id, boats(display_name)')
      .eq('id', sessionId)
      .single();

    if (session) {
      const tMin = new Date(session.started_at).getTime();
      const tMax = await determineSessionEndTime(
        sessionId,
        session.started_at,
        session.ended_at,
        session.event_id || null
      );
      
      const boatDisplayName = session.boats && Array.isArray(session.boats) && session.boats.length > 0
        ? session.boats[0].display_name
        : session.boats?.display_name || null;

      store.addSession(sessionId, session.name, tMin, tMax, boatDisplayName || undefined);
      store.setSelectedSessions([sessionId]);
      setPage('replay');
    }
  };

  const handleReplayMultipleFromAdmin = (sessionIds: string[]) => {
    resetReplay();
    setPage('replay');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // The onAuthStateChange listener will handle setting page to 'auth'
  };

  // Show loading while checking auth
  if (isCheckingAuth) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-background">
        <div className="text-lg">Checking authentication...</div>
      </div>
    );
  }

  // Render based on current page
  if (page === 'auth') {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  if (page === 'sessions') {
    return <UnifiedSessionPicker onSessionsSelected={handleSessionsSelected} onLogout={handleLogout} onOpenAdmin={handleOpenAdmin} />;
  }

  if (page === 'admin') {
    return (
      <AdminSessionsPage
        onBack={handleBackFromAdmin}
        onReplay={handleReplayFromAdmin}
        onReplayMultiple={handleReplayMultipleFromAdmin}
        onLogout={handleLogout}
      />
    );
  }

  // Page === 'replay'
  return <ReplayPage onBack={handleBackToSessions} onLogout={handleLogout} />;
}

export default App;
