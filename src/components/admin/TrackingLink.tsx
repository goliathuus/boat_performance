import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { trackingJoinUrl } from '@/lib/urls';

/**
 * Lien d'inscription au suivi en direct d'un evenement : un seul lien pour
 * toute la flotte, affiche uniquement dans la page Gestion (admin).
 * Chaque participant l'ouvre sur son telephone, tape le nom de son bateau et
 * configure OwnTracks (parcours rapide de web_transfer, ?suivi=CODE).
 */
export function TrackingLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url = trackingJoinUrl(code);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copiez le lien d’inscription :', url);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={copy} title={url}>
        {copied ? 'Lien d’inscription copié' : 'Copier le lien d’inscription'}
      </Button>
      <span className="text-xs text-muted-foreground">À envoyer aux bateaux : chacun s’inscrit et configure son suivi en direct</span>
    </div>
  );
}
