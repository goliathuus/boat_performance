export const STRAVA_SUBMIT_URL = 'https://web-transfer-nine.vercel.app/';

/** Lien de suivi en direct d'un evenement, a envoyer a toute la flotte. */
export function trackingJoinUrl(eventCode: string): string {
  return `${STRAVA_SUBMIT_URL}?suivi=${encodeURIComponent(eventCode)}`;
}
