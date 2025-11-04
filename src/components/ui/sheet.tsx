import * as React from 'react';
import { cn } from '@/lib/utils';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: 'left' | 'right' | 'top' | 'bottom';
  children: React.ReactNode;
  className?: string;
}

const Sheet: React.FC<SheetProps> = ({
  open,
  onOpenChange,
  side = 'right',
  children,
  className,
}) => {
  const sideClasses = {
    left: 'left-0 top-0 h-full border-r',
    right: 'right-0 top-0 h-full border-l',
    top: 'top-0 left-0 w-full border-b',
    bottom: 'bottom-0 left-0 w-full border-t',
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      {/* Sheet */}
      <div
        className={cn(
          'fixed z-50 bg-background p-6 shadow-lg transition-transform',
          sideClasses[side],
          side === 'left' || side === 'right' ? 'w-[300px]' : 'h-[300px]',
          className
        )}
      >
        {children}
      </div>
    </>
  );
};

export { Sheet };
