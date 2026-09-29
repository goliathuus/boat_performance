import { Button } from '@/components/ui/button';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'event' | 'session';
}

export function DeleteConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Supprimer',
  cancelLabel = 'Annuler',
  variant = 'event',
}: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass rounded-2xl border shadow-2xl p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-semibold mb-4">{title}</h2>
        <p className="text-muted-foreground mb-6">{message}</p>
        
        {variant === 'event' && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">
              <strong>Attention :</strong> l’événement n’acceptera plus aucune donnée et ses sessions ne pourront plus être rejouées.
            </p>
          </div>
        )}

        {variant === 'session' && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">
              <strong>Attention :</strong> la session sera définitivement supprimée et ne pourra plus être rejouée.
            </p>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}









