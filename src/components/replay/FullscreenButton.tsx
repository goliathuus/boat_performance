import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Bascule plein ecran.
 *
 * L'API Fullscreen n'existe pas pour les elements sur iOS Safari (seules les
 * videos y ont droit) : le bouton se masque alors au lieu d'offrir une action
 * sans effet. Sur iPhone, le plein ecran passe par « Ajouter a l'ecran
 * d'accueil », que le manifeste et les meta apple-mobile-web-app couvrent.
 */
function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  const doc = document as Document & { webkitFullscreenEnabled?: boolean };
  return Boolean(
    (doc.fullscreenEnabled && el.requestFullscreen) ||
      (doc.webkitFullscreenEnabled && el.webkitRequestFullscreen)
  );
}

function currentFullscreenElement(): Element | null {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function FullscreenButton({ className }: { className?: string }) {
  const [supported] = useState(fullscreenSupported);
  const [active, setActive] = useState(() => currentFullscreenElement() !== null);

  useEffect(() => {
    const sync = () => setActive(currentFullscreenElement() !== null);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const toggle = useCallback(async () => {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };

    try {
      if (currentFullscreenElement()) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' });
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      }
    } catch {
      // Refus du navigateur (geste non fiable, permission) : on laisse l'etat tel quel.
    }
  }, []);

  if (!supported) return null;

  const label = active ? 'Quitter le plein écran' : 'Passer en plein écran';

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center justify-center rounded-md border bg-background/90 backdrop-blur-sm',
        'h-9 w-9 text-foreground transition-colors hover:bg-accent/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
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
      >
        {active ? (
          <>
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </>
        ) : (
          <>
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </>
        )}
      </svg>
    </button>
  );
}
