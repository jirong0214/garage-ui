import type { BrowserEntry } from '@/features/objects/browse/Models/browser-entry';

export type ObjectJobOperation = 'copy' | 'move';

export type ObjectSelection = {
  objects: string[];
  prefixes: string[];
};

export function selectionFromEntries(entries: readonly BrowserEntry[]): ObjectSelection {
  return {
    objects: entries.filter((entry) => !entry.folder).map((entry) => entry.key),
    prefixes: entries.filter((entry) => entry.folder).map((entry) => entry.key),
  };
}

export function renamedObjectKey(sourceKey: string, newName: string): string {
  const normalizedName = newName.trim();
  if (!normalizedName || normalizedName === '.' || normalizedName === '..') {
    throw new Error('Object name is required.');
  }
  if (normalizedName.includes('/') || normalizedName.includes('\0')) {
    throw new Error('Object name cannot contain a slash or null character.');
  }
  const separator = sourceKey.lastIndexOf('/');
  return separator < 0
    ? normalizedName
    : `${sourceKey.slice(0, separator + 1)}${normalizedName}`;
}

export function renamedFolderPrefix(sourcePrefix: string, newName: string): string {
  const withoutMarker = sourcePrefix.endsWith('/') ? sourcePrefix.slice(0, -1) : sourcePrefix;
  return `${renamedObjectKey(withoutMarker, newName)}/`;
}

export function destinationContainsSelection(
  sourceBucket: string,
  destinationBucket: string,
  destinationPrefix: string,
  selectedObjects: readonly string[],
  selectedPrefixes: readonly string[],
): boolean {
  if (sourceBucket !== destinationBucket) return false;
  if (selectedObjects.some((key) => destinationPrefix === parentPrefix(key))) return true;
  return selectedPrefixes.some(
    (prefix) =>
      destinationPrefix === parentPrefix(prefix) ||
      destinationPrefix === prefix ||
      destinationPrefix.startsWith(prefix),
  );
}

function parentPrefix(key: string): string {
  const normalized = key.endsWith('/') ? key.slice(0, -1) : key;
  const separator = normalized.lastIndexOf('/');
  return separator < 0 ? '' : normalized.slice(0, separator + 1);
}
