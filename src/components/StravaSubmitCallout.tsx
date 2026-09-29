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
          'border-[#FC4C02]/60 text-[#FF7A3D] bg-[#FC4C02]/10 hover:bg-[#FC4C02]/20'
        )}
      >
        <span className="lg:hidden">+ Activité Strava</span>
        <span className="hidden lg:inline">Ajouter une activité Strava</span>
      </a>
    );
  }

  return (
    <a
      href={STRAVA_SUBMIT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center justify-center w-full rounded-lg text-sm font-medium',
        'h-11 px-3 border transition-colors',
        'border-[#FC4C02]/60 text-[#FF7A3D] bg-[#FC4C02]/10 hover:bg-[#FC4C02]/20'
      )}
    >
      Ajouter une activité Strava
    </a>
  );
}
