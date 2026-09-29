import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type OverflowMenuItem = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
};

/**
 * Menu « ⋯ » : regroupe les actions secondaires pour que la carte garde la
 * place. Se ferme au clic dehors, sur Echap et apres le choix d'une action.
 */
export function OverflowMenu({
  items,
  label = 'Plus d’actions',
  className,
}: {
  items: OverflowMenuItem[];
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="glass grid h-10 w-10 place-items-center rounded-full border text-foreground transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="glass absolute right-0 top-12 z-[1100] min-w-[13rem] overflow-hidden rounded-xl border p-1 sm:left-0 sm:right-auto"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/70 disabled:pointer-events-none disabled:opacity-50',
                item.destructive ? 'text-destructive' : 'text-foreground'
              )}
            >
              {item.icon && <span className="grid h-4 w-4 flex-none place-items-center text-muted-foreground">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
