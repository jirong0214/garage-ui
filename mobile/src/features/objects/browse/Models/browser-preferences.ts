export const browserSortModes = ['name', 'date', 'size'] as const;

export type BrowserSortMode = (typeof browserSortModes)[number];

export type BrowserPreferences = {
  sortMode: BrowserSortMode;
  scrollOffset: number;
};

export const defaultBrowserPreferences: BrowserPreferences = {
  sortMode: 'name',
  scrollOffset: 0,
};

export function isBrowserSortMode(value: string): value is BrowserSortMode {
  return browserSortModes.some((mode) => mode === value);
}
