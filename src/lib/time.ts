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
