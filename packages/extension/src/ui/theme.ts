import { useCallback, useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';

export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

/** chrome.storage.local key of the saved choice. */
export const THEME_KEY = 'ui.theme';
/** localStorage mirror, read synchronously by public/theme-init.js before the first paint. */
export const THEME_CACHE_KEY = 'autochrome.theme';

export const normalizeTheme = (value: unknown): Theme =>
  value === 'light' || value === 'dark' ? value : 'system';

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

function cache(theme: Theme): void {
  try {
    localStorage.setItem(THEME_CACHE_KEY, theme);
  } catch {
    // Blocked storage only costs a possible flash on the next load.
  }
}

function cached(): Theme {
  try {
    return normalizeTheme(localStorage.getItem(THEME_CACHE_KEY));
  } catch {
    return 'system';
  }
}

/**
 * Applies the saved theme to this page and keeps it in step with changes made in another one
 * (side panel, approve popup, debug page). Call once, before the first render.
 */
export function initTheme(): void {
  applyTheme(cached());
  const sync = (value: unknown) => {
    const theme = normalizeTheme(value);
    cache(theme);
    applyTheme(theme);
  };
  void browser.storage.local.get(THEME_KEY).then((stored) => sync(stored[THEME_KEY]));
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[THEME_KEY]) sync(changes[THEME_KEY].newValue);
  });
}

/** The current theme choice and a setter that saves it and applies it right away. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(cached);

  useEffect(() => {
    let current = true;
    void browser.storage.local.get(THEME_KEY).then((stored) => {
      if (current) setTheme(normalizeTheme(stored[THEME_KEY]));
    });
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'local' && changes[THEME_KEY])
        setTheme(normalizeTheme(changes[THEME_KEY].newValue));
    };
    browser.storage.onChanged.addListener(listener);
    return () => {
      current = false;
      browser.storage.onChanged.removeListener(listener);
    };
  }, []);

  const choose = useCallback((next: Theme) => {
    setTheme(next);
    cache(next);
    applyTheme(next);
    void browser.storage.local.set({ [THEME_KEY]: next });
  }, []);

  return [theme, choose];
}
