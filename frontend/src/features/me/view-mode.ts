export type AccountViewMode = 'hiring' | 'creative';

const STORAGE_KEY = 'bilikha:account-view-mode';

export function readStoredViewMode(): AccountViewMode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'hiring' || raw === 'creative') return raw;
    return null;
  } catch {
    return null;
  }
}

export function writeStoredViewMode(mode: AccountViewMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Private browsing / quota — preference is best-effort.
  }
}

/** Default for accounts with a profile when nothing is stored. */
export function defaultViewMode(): AccountViewMode {
  return 'creative';
}
