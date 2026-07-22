import {act, render, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {objectsApi} from '@/lib/api';
import {ObjectThumbnail} from './ObjectThumbnail';

vi.mock('@/lib/api', () => ({
  objectsApi: {getThumbnail: vi.fn()},
}));

describe('ObjectThumbnail', () => {
  let intersectionCallback: IntersectionObserverCallback;

  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = '';
      thresholds = [];
    });
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:thumbnail'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('requests an image only after its row approaches the viewport', async () => {
    vi.mocked(objectsApi.getThumbnail).mockResolvedValue(new Blob(['png'], {type: 'image/png'}));
    const {container} = render(
      <ObjectThumbnail
        bucketName="pics"
        object={{key: 'folder/photo.jpg', size: 10, lastModified: '2026-07-22T00:00:00Z', contentType: 'image/jpeg'}}
      />,
    );

    expect(objectsApi.getThumbnail).not.toHaveBeenCalled();
    act(() => {
      intersectionCallback([{isIntersecting: true}] as IntersectionObserverEntry[], {} as IntersectionObserver);
    });

    await waitFor(() => {
      expect(objectsApi.getThumbnail).toHaveBeenCalledWith(
        'pics',
        'folder/photo.jpg',
        '2026-07-22T00:00:00Z:10',
        96,
        expect.any(AbortSignal),
      );
      expect(container.querySelector('img')).toHaveAttribute('src', 'blob:thumbnail');
    });
  });

  it('does not request unsupported file types', () => {
    render(
      <ObjectThumbnail
        bucketName="pics"
        object={{key: 'document.pdf', size: 10, lastModified: '2026-07-22T00:00:00Z', contentType: 'application/pdf'}}
      />,
    );
    expect(objectsApi.getThumbnail).not.toHaveBeenCalled();
  });
});
