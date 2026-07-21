import {fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {objectsApi} from '@/lib/api';
import {ObjectDetailsView} from './ObjectDetailsView';

vi.mock('@/lib/api', () => ({
  objectsApi: {
    getMetadata: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/hooks/useApi', () => ({
  useBuckets: () => ({data: [{name: 'photos', publicUrl: 'https://cdn.example.com'}]}),
}));

vi.mock('@/hooks/usePermissions', () => ({
  useBucketCan: () => () => true,
}));

vi.mock('@/components/buckets/ObjectPreview', () => ({
  ObjectPreview: ({fullscreen}: {fullscreen?: boolean}) => (
    <div data-testid="object-preview" data-fullscreen={fullscreen ? 'true' : 'false'}>Object preview content</div>
  ),
}));

vi.mock('sonner', () => ({
  toast: {success: vi.fn(), error: vi.fn()},
}));

describe('ObjectDetailsView', () => {
  beforeEach(() => {
    vi.mocked(objectsApi.getMetadata).mockResolvedValue({
      key: 'summer/photo.jpg',
      size: 1024,
      lastModified: '2026-07-20T12:00:00Z',
      contentType: 'image/jpeg',
      etag: 'example-etag',
      storageClass: 'STANDARD',
    });
  });

  it('places the preview before object details', async () => {
    render(
      <MemoryRouter initialEntries={['/buckets/photos/objects/summer%2Fphoto.jpg']}>
        <Routes>
          <Route path="/buckets/:bucketName/objects/*" element={<ObjectDetailsView />} />
        </Routes>
      </MemoryRouter>,
    );

    const previewHeading = await screen.findByRole('heading', {name: 'Preview'});
    const detailsHeading = screen.getByRole('heading', {name: 'Details'});

    expect(previewHeading.compareDocumentPosition(detailsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('expands the whole Preview card inside the app content frame', async () => {
    render(
      <MemoryRouter initialEntries={['/buckets/photos/objects/summer%2Fphoto.jpg']}>
        <div id="app-content" className="relative">
          <Routes>
            <Route path="/buckets/:bucketName/objects/*" element={<ObjectDetailsView />} />
          </Routes>
        </div>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', {name: 'Preview'});
    fireEvent.click(screen.getByRole('button', {name: 'Open fullscreen preview'}));

    expect(screen.getByRole('heading', {name: 'Preview'}).closest('section')).toHaveClass('absolute', 'inset-0');
    expect(screen.getByTestId('object-preview')).toHaveAttribute('data-fullscreen', 'true');

    fireEvent.keyDown(document, {key: 'Escape'});
    expect(screen.getByRole('button', {name: 'Open fullscreen preview'})).toBeInTheDocument();
  });
});
