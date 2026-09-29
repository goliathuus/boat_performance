import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Recharge les donnees du replay sans quitter la page : utile en direct,
 * ou recharger le navigateur ramenait a la liste des sessions.
 * L'icone tourne pendant le chargement, puis une coche confirme brievement.
 */
export function RefreshButton({
  onRefresh,
  refreshing,
  lastRefresh,
  className,
}: {
  onRefresh: () => void;
  refreshing: boolean;
  lastRefresh: number | null;
  className?: string;
}) {
  const [justDone, setJustDone] = useState(false);

  useEffect(() => {
    if (lastRefresh === null) return;
    setJustDone(true);
    const id = window.setTimeout(() => setJustDone(false), 1500);
    return () => window.clearTimeout(id);
  }, [lastRefresh]);

  const label = refreshing
    ? 'Rafraîchissement…'
    : lastRefresh
      ? `Rafraîchir les données (dernière mise à jour ${new Date(lastRefresh).toLocaleTimeString('fr-FR')})`
      : 'Rafraîchir les données';

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      aria-label={label}
      title={label}
      aria-busy={refreshing}
      className={cn(
        'glass grid h-10 w-10 flex-none place-items-center rounded-full border text-foreground transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait',
        justDone && !refreshing && 'text-emerald-300',
        className
      )}
    >
      {justDone && !refreshing ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={cn(refreshing && 'animate-spin')}
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <polyline points="21 3 21 9 15 9" />
        </svg>
      )}
    </button>
  );
}
