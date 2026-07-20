import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPublicObjectUrl, copyText } from './utils';

describe('buildPublicObjectUrl', () => {
  it('encodes each key segment while preserving directory separators', () => {
    expect(buildPublicObjectUrl('https://cdn.example.com/', '相册/hello world+#.png')).toBe(
      'https://cdn.example.com/%E7%9B%B8%E5%86%8C/hello%20world%2B%23.png',
    );
  });

  it('supports a configured base path', () => {
    expect(buildPublicObjectUrl('https://example.com/files/', 'a/b.txt')).toBe(
      'https://example.com/files/a/b.txt',
    );
  });
});

describe('copyText', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await copyText('value');
    expect(writeText).toHaveBeenCalledWith('value');
  });

  it('falls back when Clipboard API access is rejected', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('not allowed'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    await copyText('LAN value');

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });
});
