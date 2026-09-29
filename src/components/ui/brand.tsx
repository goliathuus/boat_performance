import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Pictogramme : une voile et deux filets de vent, sur pastille degradee. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid h-8 w-8 flex-none place-items-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 shadow-lg shadow-sky-500/20',
        className
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 3v14l6-3.5z" fill="white" fillOpacity="0.95" stroke="none" />
        <path d="M10 5 5 16h5" />
        <path d="M3 20c2 .8 4 .8 6 0s4-.8 6 0 4 .8 6 0" />
      </svg>
    </span>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <BrandMark />
      <span className="text-[15px] font-semibold tracking-tight text-foreground">
        Boat<span className="text-primary">Tracker</span>
      </span>
    </span>
  );
}

/**
 * Barre d'en-tete des pages hors carte : verre fume colle en haut, marque a
 * gauche, titre de page, actions a droite. Meme matiere que le chrome du replay.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Contenu sous la ligne de titre (onglets, filtres). */
  children?: ReactNode;
}) {
  return (
    <header className="glass relative z-10 border-b safe-top">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <BrandWordmark className="hidden sm:flex" />
          <BrandMark className="sm:hidden" />
          <span className="hidden h-6 w-px bg-foreground/15 sm:block" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold sm:text-lg">{title}</h1>
            {subtitle && <p className="hidden truncate text-xs text-muted-foreground lg:block">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:flex-none sm:flex-nowrap">{actions}</div>}
      </div>
      {children && <div className="mx-auto max-w-6xl px-4 sm:px-6">{children}</div>}
    </header>
  );
}

export type EventStatus = 'active' | 'expired' | 'upcoming';

const STATUS: Record<EventStatus, { label: string; className: string; dot: string }> = {
  active: { label: 'En cours', className: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/30', dot: 'bg-emerald-400 animate-pulse' },
  upcoming: { label: 'À venir', className: 'bg-sky-400/15 text-sky-300 ring-sky-400/30', dot: 'bg-sky-400' },
  expired: { label: 'Terminé', className: 'bg-foreground/10 text-muted-foreground ring-foreground/15', dot: 'bg-muted-foreground' },
};

/** Pastille de statut d'un evenement. */
export function StatusPill({ status }: { status: EventStatus }) {
  const s = STATUS[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', s.className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

/** Carte en verre fume pour les listes et formulaires. */
export function GlassCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('glass rounded-xl border', className)}>{children}</div>;
}

/** Credits SH Course au large, discrets, en pied de page. */
export function Credits({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-3 text-xs text-muted-foreground', className)}>
      <span>Développé par</span>
      <a
        href="https://www.sh-courseaularge.fr/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-foreground/80 transition-colors hover:text-primary"
      >
        SH Course au large
      </a>
      <span className="text-foreground/20">•</span>
      <a
        href="https://www.instagram.com/sh_course_au_large_mini650?igsh=anh0bnY4b3Rnb2o0"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors hover:text-primary"
        title="Instagram SH Course au large"
      >
        Instagram
      </a>
    </div>
  );
}
