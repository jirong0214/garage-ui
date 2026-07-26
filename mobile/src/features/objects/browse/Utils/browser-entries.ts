import type { BrowserEntry, BrowserObject } from '../Models/browser-entry';
import type { BrowserSortMode } from '../Models/browser-preferences';

export function createBrowserEntries(
  prefix: string,
  prefixes: string[],
  objects: BrowserObject[],
): BrowserEntry[] {
  return [
    ...prefixes.map((key) => ({
      id: `prefix:${key}`,
      key,
      name: key.slice(prefix.length).replace(/\/$/, ''),
      folder: true,
      size: 0,
      modifiedAt: null,
    })),
    ...objects
      .filter((object): object is BrowserObject & { key: string } => Boolean(object.key))
      .map((object) => ({
        id: `object:${object.key}`,
        key: object.key,
        name: object.key.slice(prefix.length),
        folder: false,
        size: object.size ?? 0,
        modifiedAt: object.last_modified ?? null,
        contentType: object.content_type,
        etag: object.etag,
      })),
  ];
}

export function sortBrowserEntries(
  entries: BrowserEntry[],
  sortMode: BrowserSortMode,
): BrowserEntry[] {
  return [...entries].sort((left, right) => {
    if (left.folder !== right.folder) return left.folder ? -1 : 1;

    const nameOrder = compareNames(left.name, right.name);
    if (sortMode === 'name') return nameOrder;
    if (sortMode === 'size') return right.size - left.size || nameOrder;

    return timestamp(right.modifiedAt) - timestamp(left.modifiedAt) || nameOrder;
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function compareNames(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const result = Date.parse(value);
  return Number.isNaN(result) ? 0 : result;
}
