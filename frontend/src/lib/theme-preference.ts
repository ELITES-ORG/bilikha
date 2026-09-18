/**
 * Theme preference — System, Light, or Dark (ADR 0026 amendment / plan 0024).
 *
 * System is the default and means "nothing stored": the media query governs.
 * The blocking script in index.html mirrors the storage key and valid values
 * here so the first paint matches; keep them in step.
 */

export type ThemePreference = 'system' | 'light' | 'dark';

/** localStorage key — must match the inline script in index.html. */
export const THEME_STORAGE_KEY = 'bilikha-theme';

/**
 * `--color-paper` as sRGB hex for the theme-color meta. Must match the values
 * already in index.html for the light and dark media metas.
 */
export const THEME_COLOR_PAPER = {
  light: '#fcfbf8',
  dark: '#14110e',
} as const;

export function parseThemePreference(raw: string | null | undefined): ThemePreference {
  if (raw === 'light' || raw === 'dark') return raw;
  return 'system';
}

export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

function syncThemeColorMeta(preference: ThemePreference): void {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  const first = metas.item(0);
  const second = metas.item(1);
  if (!first || !second) return;

  if (preference === 'system') {
    first.content = THEME_COLOR_PAPER.light;
    first.media = '(prefers-color-scheme: light)';
    second.content = THEME_COLOR_PAPER.dark;
    second.media = '(prefers-color-scheme: dark)';
    return;
  }

  const color = THEME_COLOR_PAPER[preference];
  first.content = color;
  first.removeAttribute('media');
  second.content = color;
  second.removeAttribute('media');
}

/** Apply preference to the document without writing storage. */
export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', preference);
  }
  syncThemeColorMeta(preference);
}

/** Persist and apply. System clears storage so a fresh install stays media-only. */
export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Private browsing / blocked site data — still apply for this session.
  }
  applyThemePreference(preference);
}
