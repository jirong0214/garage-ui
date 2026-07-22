import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {objectsApi} from '@/lib/api';
import {ObjectTransferDialog} from './ObjectTransferDialog';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    objectsApi: {
      ...actual.objectsApi,
      copy: vi.fn(),
      move: vi.fn(),
    },
  };
});

vi.mock('sonner', () => ({toast: {success: vi.fn(), error: vi.fn()}}));

const buckets = [
  {name: 'pics', creationDate: '2026-01-01T00:00:00Z', websiteAccess: false},
  {name: 'archive', creationDate: '2026-01-01T00:00:00Z', websiteAccess: false},
];

describe('ObjectTransferDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renames by moving within the same directory and bucket', async () => {
    vi.mocked(objectsApi.move).mockResolvedValue({
      operation: 'move', sourceBucket: 'pics', sourceKey: 'phone/old.jpg',
      destinationBucket: 'pics', destinationKey: 'phone/new.jpg', sourceDeleted: true,
    });

    render(
      <ObjectTransferDialog
        open
        onOpenChange={vi.fn()}
        mode="rename"
        sourceBucket="pics"
        sourceKey="phone/old.jpg"
        destinationBuckets={buckets}
      />,
    );

    fireEvent.change(screen.getByLabelText('New name'), {target: {value: 'new.jpg'}});
    fireEvent.click(screen.getByRole('button', {name: 'Rename'}));

    await waitFor(() => expect(objectsApi.move).toHaveBeenCalledWith('pics', {
      sourceKey: 'phone/old.jpg',
      destinationBucket: 'pics',
      destinationKey: 'phone/new.jpg',
      overwrite: false,
    }));
  });

  it('copies to a new object path without deleting the source', async () => {
    vi.mocked(objectsApi.copy).mockResolvedValue({
      operation: 'copy', sourceBucket: 'pics', sourceKey: 'old.jpg',
      destinationBucket: 'pics', destinationKey: 'copies/old.jpg', sourceDeleted: false,
    });

    render(
      <ObjectTransferDialog
        open
        onOpenChange={vi.fn()}
        mode="copy"
        sourceBucket="pics"
        sourceKey="old.jpg"
        destinationBuckets={buckets}
      />,
    );

    fireEvent.change(screen.getByLabelText('Destination path'), {target: {value: 'copies/old.jpg'}});
    fireEvent.click(screen.getByRole('button', {name: 'Copy'}));

    await waitFor(() => expect(objectsApi.copy).toHaveBeenCalledWith('pics', {
      sourceKey: 'old.jpg',
      destinationBucket: 'pics',
      destinationKey: 'copies/old.jpg',
      overwrite: false,
    }));
  });
});
