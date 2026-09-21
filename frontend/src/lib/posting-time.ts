/** Human-readable time until a posting expires. */
export function formatTimeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days}d left`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `${hours}h left`;
  const minutes = Math.max(1, Math.floor(ms / (60 * 1000)));
  return `${minutes}m left`;
}

/**
 * Badge tone for expiry urgency. Expiry is the decision on My postings —
 * renew, close, or let it lapse — so near-term dates must not look like far ones.
 * Uses status tones (warning/danger), never decorative accent.
 */
export function expiryTone(
  expiresAt: string,
): 'neutral' | 'warning' | 'danger' {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'danger';
  const days = ms / (24 * 60 * 60 * 1000);
  if (days < 1) return 'danger';
  if (days <= 7) return 'warning';
  return 'neutral';
}

/** Sentence-case a posting status enum for display. */
export function formatPostingStatus(status: string): string {
  if (!status) return status;
  return status.charAt(0).toUpperCase() + status.slice(1);
}
