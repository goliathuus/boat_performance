import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { LoginPage } from '@/components/auth/LoginPage';
import { UnifiedSessionPicker } from '@/components/replay/UnifiedSessionPicker';
import { ReplayPage } from './ReplayPage';
import { AdminSessionsPage } from '@/components/admin/AdminSessionsPage';
import { CsvAggregatorPage } from '@/components/replay/CsvAggregatorPage';
import { useReplayStore } from '@/state/useReplayStore';
import { determineSessionEndTime } from '@/lib/session-utils';
import { PublicEventPage } from './PublicEventPage';
import { WindBackdrop } from '@/components/ui/WindBackdrop';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

type AppPage = 'auth' | 'sessions' | 'replay' | 'admin' | 'csvAgg';

// Parse l'URL hash pour retrouver l'état de navigation (#replay?s=id1,id2)
function parseHashState(): { page: 'replay'; sessionIds: string[] } | { page: 'sessions' } {
  const hash = window.location.hash.slice(1);
  if (!hash) return { page: 'sessions' };
  const [path, query] = hash.split('?');
  if (path === 'replay') {
    const sessionIds = new URLSearchParams(query ?? '').get('s')?.split(',').filter(Boolean) ?? [];
    if (sessionIds.length > 0) return { page: 'replay', sessionIds };
  }
  return { page: 'sessions' };
}

// Recharge les métadonnées des sessions depuis Supabase et peuple le store
async function restoreSessionsFromHash(sessionIds: string[]): Promise<boolean> {
  const store = useReplayStore.getState();
  const results = await Promise.all(
    sessionIds.map(async (id) => {
      const { data: session } = await supabase
        .from('sessions')
        .select('name, started_at, ended_at, event_id, boats(display_name)')
        .eq('id', id)
        .single();
      if (!session) return null;
      const tMin = new Date(session.started_at).getTime();
      const tMax = await determineSessionEndTime(
        id,
        session.started_at,
        session.ended_at,
        (session.event_id as string | null) ?? null
      );
      const boatDisplayName =
        Array.isArray(session.boats) && session.boats.length > 0
          ? (session.boats[0] as { display_name?: string })?.display_name ?? undefined
          : undefined;
      return { sessionId: id, name: session.name as string, tMin, tMax, boatDisplayName };
    })
  );
  const valid = results.filter((r): r is NonNullable<typeof r> => r !== null);
  if (valid.length === 0) return false;
  store.addSessions(valid);
  store.setSelectedSessions(sessionIds);
  return true;
}

function AuthenticatedApp() {
  const [page, setPage] = useState<AppPage>('auth');
  const [csvAggReturnPage, setCsvAggReturnPage] = useState<'sessions' | 'replay'>('sessions');
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

      // Restaure l'état depuis le hash (ex: rechargement sur la page de replay)
      const hashState = parseHashState();
      if (hashState.page === 'replay') {
        const restored = await restoreSessionsFromHash(hashState.sessionIds);
        setPage(restored ? 'replay' : 'sessions');
      } else {
        const currentSelectedIds = useReplayStore.getState().selectedSessionIds;
        setPage(currentSelectedIds.length > 0 ? 'replay' : 'sessions');
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

  // Synchronise l'URL hash avec la page courante (permet de retrouver l'état après rechargement)
  // Ne rien faire pendant isCheckingAuth : le hash doit rester intact pour que checkAuth puisse le lire
  useEffect(() => {
    if (isCheckingAuth) return;
    if (page === 'replay' && selectedSessionIds.length > 0) {
      const newHash = `#replay?s=${selectedSessionIds.join(',')}`;
      if (window.location.hash !== newHash) {
        history.replaceState(null, '', newHash);
      }
    } else if (page === 'sessions' || page === 'auth') {
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }, [page, selectedSessionIds, isCheckingAuth]);

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

  const handleOpenCsvAggFromSessions = () => {
    setCsvAggReturnPage('sessions');
    setPage('csvAgg');
  };

  const handleOpenCsvAggFromReplay = () => {
    setCsvAggReturnPage('replay');
    setPage('csvAgg');
  };

  const handleBackFromCsvAgg = () => {
    setPage(csvAggReturnPage);
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
      
      const boatDisplayName = Array.isArray(session.boats) && session.boats.length > 0
        ? session.boats[0]?.display_name ?? null
        : null;

      store.addSession(sessionId, session.name, tMin, tMax, boatDisplayName || undefined);
      store.setSelectedSessions([sessionId]);
      setPage('replay');
    }
  };

  const handleReplayMultipleFromAdmin = (sessionIds: string[]) => {
    void sessionIds;
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
      <div className="relative w-screen app-shell flex items-center justify-center">
        <WindBackdrop />
        <LoadingSpinner size="lg" text="Vérification de la session…" className="relative" />
      </div>
    );
  }

  // Render based on current page
  if (page === 'auth') {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  if (page === 'sessions') {
    return (
      <UnifiedSessionPicker
        onSessionsSelected={handleSessionsSelected}
        onLogout={handleLogout}
        onOpenAdmin={handleOpenAdmin}
        onOpenCsvAgg={handleOpenCsvAggFromSessions}
      />
    );
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

  if (page === 'csvAgg') {
    return <CsvAggregatorPage onBack={handleBackFromCsvAgg} onLogout={handleLogout} />;
  }

  // Page === 'replay'
  return (
    <ReplayPage
      onBack={handleBackToSessions}
      onLogout={handleLogout}
      onOpenCsvAgg={handleOpenCsvAggFromReplay}
    />
  );
}

function App() {
  const publicMatch = window.location.pathname.match(/^\/public\/([^/]+)\/?$/);
  if (publicMatch) {
    return <PublicEventPage token={publicMatch[1]} />;
  }

  return <AuthenticatedApp />;
}

export default App;
