import { describe, expect, it } from 'vitest';

import {
  keepBothObjectName,
  normalizeUploadObjectName,
  uploadObjectKey,
} from './upload-object-key';

describe('upload object keys', () => {
  it('joins an object name to an S3 prefix without URL encoding it', () => {
    expect(uploadObjectKey('相册/2026/', '空格 #?%.jpg')).toBe(
      '相册/2026/空格 #?%.jpg',
    );
  });

  it('rejects names that escape the selected prefix', () => {
    expect(() => normalizeUploadObjectName('../secret')).toThrow(
      'path separators',
    );
    expect(() => normalizeUploadObjectName('  ')).toThrow('required');
  });

  it('adds a keep-both suffix before the extension', () => {
    expect(keepBothObjectName('photo.jpg', 2)).toBe('photo (2).jpg');
    expect(keepBothObjectName('.env', 1)).toBe('.env (1)');
  });
});
