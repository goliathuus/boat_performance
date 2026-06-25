import { STRAVA_SUBMIT_URL } from '@/lib/urls';
import { cn } from '@/lib/utils';

interface StravaSubmitCalloutProps {
  variant: 'login' | 'header';
}

export function StravaSubmitCallout({ variant }: StravaSubmitCalloutProps) {
  if (variant === 'header') {
    return (
      <a
        href={STRAVA_SUBMIT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium',
          'h-9 px-3 border transition-colors',
          'border-[#FC4C02] text-[#FC4C02] bg-background hover:bg-[#FC4C02]/10'
        )}
      >
        Ajouter une activité Strava
      </a>
    );
  }

  return (
    <a
      href={STRAVA_SUBMIT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center justify-center w-full rounded-md text-xs font-medium',
        'h-8 px-3 transition-colors text-white',
        'bg-[#FC4C02] hover:bg-[#E34402]'
      )}
    >
      Ajouter une activité Strava
    </a>
  );
}
