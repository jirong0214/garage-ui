import {render, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {objectsApi} from '@/lib/api';
import {ObjectThumbnail} from './ObjectThumbnail';

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
  });

  afterEach(() => {
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
});
