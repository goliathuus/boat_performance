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
      setError('Failed to copy link');
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
      setError(err instanceof Error ? err.message : 'Failed to regenerate link');
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
      setError(err instanceof Error ? err.message : 'Failed to update share status');
    } finally {
      setLoading(false);
    }
  };

  if (compact) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy public link'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')}>
          Open
        </Button>
        <span className={`text-xs ${localShareEnabled ? 'text-green-600' : 'text-amber-600'}`}>
          {localShareEnabled ? 'Public link enabled' : 'Public link disabled'}
        </span>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <div className="border rounded-md p-3 space-y-2 bg-muted/20">
      <div className="text-sm font-medium">Public link</div>
      <div className="text-xs font-mono break-all">{shareUrl}</div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')}>
          Open
        </Button>
        <Button size="sm" variant="outline" onClick={handleRegenerate} disabled={loading}>
          Regenerate
        </Button>
        <Button size="sm" variant="outline" onClick={handleToggle} disabled={loading}>
          {localShareEnabled ? 'Disable' : 'Enable'}
        </Button>
      </div>
      <div className={`text-xs ${localShareEnabled ? 'text-green-600' : 'text-amber-600'}`}>
        {localShareEnabled ? 'Link enabled' : 'Link disabled'}
      </div>
      {error && <div className="text-xs text-destructive">{error}</div>}
    </div>
  );
}

