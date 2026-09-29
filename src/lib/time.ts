/**
 * Format timestamp as ISO 8601 string (UTC)
 */
export function formatTimestampUTC(t: number): string {
  return new Date(t).toISOString();
}

/**
 * Format timestamp as local date/time string
 */
export function formatTimestampLocal(t: number): string {
  return new Date(t).toLocaleString();
}

/**
 * Format timestamp as time only (HH:MM:SS)
 */
export function formatTime(t: number, useLocal = false): string {
  const date = new Date(t);
  if (useLocal) {
    return date.toLocaleTimeString();
  }
  return date.toISOString().substring(11, 19); // HH:MM:SS
}

/**
 * Format duration in milliseconds as human-readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Plage de dates lisible, en heure locale :
 * « 9 mai 2026 · 12:45 → 19:30 », ou deux dates completes si la plage change de jour.
 */
export function formatDateRange(start: string, end: string | null): string {
  const s = new Date(start);
  const day = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (!end) return `${day(s)} · ${time(s)}`;
  const e = new Date(end);
  return day(s) === day(e) ? `${day(s)} · ${time(s)} → ${time(e)}` : `${day(s)} ${time(s)} → ${day(e)} ${time(e)}`;
}
