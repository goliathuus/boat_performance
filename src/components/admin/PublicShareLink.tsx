import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { regenerateEventShareToken, setEventShareEnabled } from '@/lib/supabase-admin';

interface PublicShareLinkProps {
  eventId: string;
  shareToken: string;
  shareEnabled: boolean;
  compact?: boolean;
  onUpdated?: (next: { share_token: string; share_enabled: boolean }) => void;
}

export function PublicShareLink({
  eventId,
  shareToken,
  shareEnabled,
  compact = false,
  onUpdated,
}: PublicShareLinkProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localShareToken, setLocalShareToken] = useState(shareToken);
  const [localShareEnabled, setLocalShareEnabled] = useState(shareEnabled);

  useEffect(() => {
    setLocalShareToken(shareToken);
    setLocalShareEnabled(shareEnabled);
  }, [shareToken, shareEnabled]);

  const shareUrl = useMemo(() => `${window.location.origin}/public/${localShareToken}`, [localShareToken]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Impossible de copier le lien');
    }
  };

  const handleRegenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await regenerateEventShareToken(eventId);
      setLocalShareToken(result.share_token);
      setLocalShareEnabled(result.share_enabled);
      onUpdated?.({ share_token: result.share_token, share_enabled: result.share_enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de régénérer le lien');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await setEventShareEnabled(eventId, !localShareEnabled);
      setLocalShareToken(result.share_token);
      setLocalShareEnabled(result.share_enabled);
      onUpdated?.({ share_token: result.share_token, share_enabled: result.share_enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de modifier le partage');
    } finally {
      setLoading(false);
    }
  };

  if (compact) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={handleCopy}>
          {copied ? 'Lien copié' : 'Copier le lien public'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')}>
          Ouvrir
        </Button>
        <span className={`text-xs ${localShareEnabled ? 'text-emerald-300' : 'text-amber-300'}`}>
          {localShareEnabled ? 'Lien public actif' : 'Lien public désactivé'}
        </span>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-foreground/10 bg-background/40 p-3 space-y-2">
      <div className="text-sm font-medium">Lien public</div>
      <div className="text-xs font-mono break-all">{shareUrl}</div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={handleCopy}>
          {copied ? 'Copié' : 'Copier'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')}>
          Ouvrir
        </Button>
        <Button size="sm" variant="outline" onClick={handleRegenerate} disabled={loading}>
          Régénérer
        </Button>
        <Button size="sm" variant="outline" onClick={handleToggle} disabled={loading}>
          {localShareEnabled ? 'Désactiver' : 'Activer'}
        </Button>
      </div>
      <div className={`text-xs ${localShareEnabled ? 'text-emerald-300' : 'text-amber-300'}`}>
        {localShareEnabled ? 'Lien actif' : 'Lien désactivé'}
      </div>
      {error && <div className="text-xs text-destructive">{error}</div>}
    </div>
  );
}

