import { describe, expect, it } from 'vitest';

import {
  destinationContainsSelection,
  renamedFolderPrefix,
  renamedObjectKey,
  selectionFromEntries,
} from './object-operation';

describe('object operations', () => {
  it('separates concrete keys from recursive prefixes', () => {
    expect(
      selectionFromEntries([
        { id: '1', key: '相册/a #?.jpg', name: 'a #?.jpg', folder: false, size: 1, modifiedAt: null },
        { id: '2', key: '相册/2026/', name: '2026', folder: true, size: 0, modifiedAt: null },
      ]),
    ).toEqual({ objects: ['相册/a #?.jpg'], prefixes: ['相册/2026/'] });
  });

  it('renames only the final path component without rewriting the prefix', () => {
    expect(renamedObjectKey('相册/old #?.jpg', '新名字 %.jpg')).toBe('相册/新名字 %.jpg');
  });

  it('renames a folder prefix while retaining its parent and directory marker', () => {
    expect(renamedFolderPrefix('相册/旧目录/', '新目录 #?%')).toBe('相册/新目录 #?%/');
  });

  it.each(['', '   ', '.', '..', 'nested/name'])('rejects invalid names: %j', (name) => {
    expect(() => renamedObjectKey('folder/old.txt', name)).toThrow();
  });

  it('blocks moving or copying a folder into itself or a descendant', () => {
    expect(destinationContainsSelection('a', 'a', 'photos/2026/', [], ['photos/'])).toBe(true);
    expect(destinationContainsSelection('a', 'a', '', [], ['photos/'])).toBe(true);
    expect(destinationContainsSelection('a', 'a', 'archive/', [], ['photos/'])).toBe(false);
    expect(destinationContainsSelection('a', 'b', 'photos/2026/', [], ['photos/'])).toBe(false);
    expect(destinationContainsSelection('a', 'a', 'docs/', ['docs/a.txt'], [])).toBe(true);
  });
});
