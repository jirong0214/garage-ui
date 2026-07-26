import { describe, expect, it } from 'vitest';

import type { BrowserEntry } from '../Models/browser-entry';
import { createBrowserEntries, formatBytes, sortBrowserEntries } from './browser-entries';

const entries: BrowserEntry[] = [
  { id: 'b', key: 'b', name: 'file 10', folder: false, size: 10, modifiedAt: '2025-01-01T00:00:00Z' },
  { id: 'a', key: 'a', name: 'file 2', folder: false, size: 20, modifiedAt: '2026-01-01T00:00:00Z' },
  { id: 'f', key: 'f/', name: 'Folder', folder: true, size: 0, modifiedAt: null },
];

describe('browser entries', () => {
  it('maps prefixes and object keys relative to the active prefix', () => {
    expect(
      createBrowserEntries(
        'docs/',
        ['docs/manuals/'],
        [{
          key: 'docs/指南 #1?.pdf',
          size: 12,
          last_modified: '2026-01-01T00:00:00Z',
          content_type: 'application/pdf',
          etag: 'version-1',
        }],
      ),
    ).toEqual([
      {
        id: 'prefix:docs/manuals/',
        key: 'docs/manuals/',
        name: 'manuals',
        folder: true,
        size: 0,
        modifiedAt: null,
      },
      {
        id: 'object:docs/指南 #1?.pdf',
        key: 'docs/指南 #1?.pdf',
        name: '指南 #1?.pdf',
        folder: false,
        size: 12,
        modifiedAt: '2026-01-01T00:00:00Z',
        contentType: 'application/pdf',
        etag: 'version-1',
      },
    ]);
  });

  it('keeps folders first and applies name, newest-date, and largest-size ordering', () => {
    expect(sortBrowserEntries(entries, 'name').map((entry) => entry.id)).toEqual(['f', 'a', 'b']);
    expect(sortBrowserEntries(entries, 'date').map((entry) => entry.id)).toEqual(['f', 'a', 'b']);
    expect(sortBrowserEntries(entries, 'size').map((entry) => entry.id)).toEqual(['f', 'a', 'b']);
  });

  it('formats common byte sizes', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
