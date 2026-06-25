import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { ConfirmedCourseBuoy, InferredMarkCandidate } from '@/lib/inferredMarks';

type CourseDetectSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: InferredMarkCandidate[];
  confirmed: ConfirmedCourseBuoy[];
  onConfirmCandidate: (id: string) => void;
  onRejectCandidate: (id: string) => void;
  onClearConfirmed: () => void;
};

export function CourseDetectSheet({
  open,
  onOpenChange,
  candidates,
  confirmed,
  onConfirmCandidate,
  onRejectCandidate,
  onClearConfirmed,
}: CourseDetectSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="right" className="w-[min(440px,94vw)] overflow-y-auto">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Parcours depuis les traces GPS</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Zones où plusieurs virages serrés concordent : bouées probables. Valide ou rejette chaque
            proposition ; rien n’est figé tant que tu n’as pas validé.
          </p>
        </div>

        {confirmed.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Bouées validées ({confirmed.length})</span>
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onClearConfirmed}>
                Tout effacer
              </Button>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 max-h-28 overflow-y-auto border rounded-md p-2">
              {confirmed.map((b, i) => (
                <li key={b.id}>
                  Bouée {i + 1} — {b.lat.toFixed(5)}, {b.lon.toFixed(5)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="text-sm font-medium mb-2">
            Propositions ({candidates.length})
          </div>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground border rounded-md p-4">
              Aucune zone détectée avec les critères actuels. Réessaie avec plus de traces ou des sessions
              différentes.
            </p>
          ) : (
            <ul className="space-y-2">
              {candidates.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start gap-2 border rounded-md p-3 bg-muted/30"
                >
                  <div className="flex-1 min-w-0 text-sm">
                    <div className="font-mono text-xs text-muted-foreground">
                      {c.lat.toFixed(5)}, {c.lon.toFixed(5)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Score {c.score} · {c.hitCount} virages · {c.sessionCount} bateau
                      {c.sessionCount > 1 ? 'x' : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-8 w-8 p-0"
                      title="Valider cette bouée"
                      aria-label="Valider cette bouée"
                      onClick={() => onConfirmCandidate(c.id)}
                    >
                      ✓
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0"
                      title="Rejeter"
                      aria-label="Rejeter cette proposition"
                      onClick={() => onRejectCandidate(c.id)}
                    >
                      ✕
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
          Fermer
        </Button>
      </div>
    </Sheet>
  );
}
