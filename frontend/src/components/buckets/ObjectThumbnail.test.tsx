import {act, fireEvent, render, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {objectsApi} from '@/lib/api';
import {clearObjectThumbnailMemoryCache, ObjectThumbnail} from './ObjectThumbnail';

vi.mock('@/lib/api', () => ({
  objectsApi: {getThumbnail: vi.fn()},
}));

describe('ObjectThumbnail', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:thumbnail'),
      revokeObjectURL: vi.fn(),
    });
    clearObjectThumbnailMemoryCache();
  });

  afterEach(() => {
    clearObjectThumbnailMemoryCache();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('requests an image as soon as the paginated row is rendered', async () => {
    vi.mocked(objectsApi.getThumbnail).mockResolvedValue(new Blob(['png'], {type: 'image/png'}));
    const {container} = render(
      <ObjectThumbnail
        bucketName="pics"
        object={{key: 'folder/photo.jpg', size: 10, lastModified: '2026-07-22T00:00:00Z', contentType: 'image/jpeg'}}
      />,
    );

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

  it.each([
    ['photo.webp', 'image/webp'],
    ['scan.bmp', 'image/bmp'],
    ['scan.tif', 'image/tiff'],
    ['scan.tiff', 'application/octet-stream'],
  ])('requests supported format %s', async (key, contentType) => {
    vi.mocked(objectsApi.getThumbnail).mockResolvedValue(new Blob(['png'], {type: 'image/png'}));
    render(
      <ObjectThumbnail
        bucketName="pics"
        object={{key, size: 10, lastModified: '2026-07-22T00:00:00Z', contentType}}
      />,
    );
    await waitFor(() => expect(objectsApi.getThumbnail).toHaveBeenCalled());
  });

  it('does not request unsupported file types', () => {
    const {container} = render(
      <ObjectThumbnail
        bucketName="pics"
        object={{key: 'document.pdf', size: 10, lastModified: '2026-07-22T00:00:00Z', contentType: 'application/pdf'}}
      />,
    );
    expect(objectsApi.getThumbnail).not.toHaveBeenCalled();
    expect(container.querySelector('[data-file-kind="document"]')).toHaveClass('lucide-file-text');
    expect(container.querySelector('[data-file-kind="document"]')?.parentElement).toHaveAttribute('title', 'Document');
    expect(container.querySelector('[data-file-kind="document"]')?.parentElement).not.toHaveClass('border', 'bg-[var(--surface-sunken)]');
  });

  it('shows a MIME icon while a thumbnail is loading and when generation fails', async () => {
    vi.mocked(objectsApi.getThumbnail).mockRejectedValue(new Error('unsupported image'));
    const {container} = render(
      <ObjectThumbnail
        bucketName="pics"
        object={{key: 'photo.jpg', size: 10, lastModified: '2026-07-22T00:00:00Z', contentType: 'image/jpeg'}}
      />,
    );

    expect(container.querySelector('[data-file-kind="image"]')).toHaveClass('lucide-file-image');
    await waitFor(() => expect(objectsApi.getThumbnail).toHaveBeenCalled());
    expect(container.querySelector('[data-file-kind="image"]')).toHaveClass('lucide-file-image');
  });

  it('uses the extension when S3 reports a generic content type', () => {
    const {container} = render(
      <ObjectThumbnail
        bucketName="pics"
        object={{key: 'installer.dmg', size: 10, lastModified: '2026-07-22T00:00:00Z', contentType: 'application/octet-stream'}}
      />,
    );

    expect(container.querySelector('[data-file-kind="binary"]')).toHaveClass('lucide-file-box');
  });
  it('defers grid thumbnails until near the viewport and releases the URL on unmount', async () => {
    let intersect: IntersectionObserverCallback = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    vi.mocked(objectsApi.getThumbnail).mockResolvedValue(new Blob(['png'], {type: 'image/png'}));
    const {container, unmount} = render(<ObjectThumbnail bucketName="pics" variant="grid"
      object={{key: 'photo.jpg', size: 10, lastModified: 'today'}} />);
    expect(objectsApi.getThumbnail).not.toHaveBeenCalled();
    act(() => intersect([{isIntersecting: true}] as IntersectionObserverEntry[], {} as IntersectionObserver));
    await waitFor(() => expect(container.querySelector('img')).toBeInTheDocument());
    expect(objectsApi.getThumbnail).toHaveBeenCalledWith('pics', 'photo.jpg', 'today:10', 192, expect.any(AbortSignal));
    expect(container.querySelector('img')).toHaveClass('object-contain');
    unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:thumbnail');
    expect(vi.mocked(objectsApi.getThumbnail).mock.calls[0][4]?.aborted).toBe(true);
  });

  it('falls back to the file icon if the browser cannot decode the thumbnail', async () => {
    vi.mocked(objectsApi.getThumbnail).mockResolvedValue(new Blob(['broken'], {type: 'image/png'}));
    const {container} = render(<ObjectThumbnail bucketName="pics" object={{key: 'photo.jpg', size: 10, lastModified: 'today'}} />);
    await waitFor(() => expect(container.querySelector('img')).toBeInTheDocument());
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('[data-file-kind="image"]')).toBeInTheDocument();
  });

  it('restores a cached thumbnail on the first render without requesting it again', async () => {
    let intersect: IntersectionObserverCallback = () => {};
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback; }
      observe = vi.fn();
      disconnect = vi.fn();
    });
    vi.mocked(objectsApi.getThumbnail).mockResolvedValue(new Blob(['cached'], {type: 'image/png'}));
    const object = {key: 'cached.jpg', size: 10, lastModified: 'today', etag: 'version-1'};
    const first = render(<ObjectThumbnail bucketName="pics" variant="grid" object={object} />);
    act(() => intersect([{isIntersecting: true}] as IntersectionObserverEntry[], {} as IntersectionObserver));
    await waitFor(() => expect(first.container.querySelector('img')).toBeInTheDocument());
    first.unmount();

    const second = render(<ObjectThumbnail bucketName="pics" variant="grid" object={object} />);
    expect(second.container.querySelector('img')).toHaveAttribute('src', 'blob:thumbnail');
    expect(objectsApi.getThumbnail).toHaveBeenCalledTimes(1);
  });

});
