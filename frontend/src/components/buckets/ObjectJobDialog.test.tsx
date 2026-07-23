import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {objectJobsApi, objectsApi} from '@/lib/api';
import {ObjectJobDialog} from './ObjectJobDialog';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    objectsApi: {...actual.objectsApi, list: vi.fn()},
    objectJobsApi: {...actual.objectJobsApi, create: vi.fn()},
  };
});

vi.mock('sonner', () => ({toast: {success: vi.fn(), error: vi.fn()}}));

const buckets = [
  {name: 'pics', creationDate: '2026-01-01T00:00:00Z', websiteAccess: false},
  {name: 'archive', creationDate: '2026-01-01T00:00:00Z', websiteAccess: false},
];

describe('ObjectJobDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(objectsApi.list).mockResolvedValue({
      bucket: 'pics',
      objects: [{
        key: 'albums/',
        size: 0,
        lastModified: '2026-07-20T12:00:00Z',
        isFolder: true,
      }],
      prefixes: ['albums/'],
      count: 1,
      isTruncated: false,
    });
  });

  it('browses the destination and starts a recursive copy job', async () => {
    const onStarted = vi.fn();
    vi.mocked(objectJobsApi.create).mockResolvedValue({
      id: 'job-1',
      operation: 'copy',
      status: 'queued',
      phase: 'queued',
      sourceBucket: 'pics',
      objects: ['cover.jpg'],
      prefixes: ['source/'],
      destinationBucket: 'pics',
      destinationPrefix: 'albums/',
      conflictPolicy: 'skip',
      discovered: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      bytesProcessed: 0,
      bytesTotal: 0,
      progress: 0,
      createdAt: '2026-07-23T00:00:00Z',
    });

    render(
      <ObjectJobDialog
        open
        onOpenChange={vi.fn()}
        operation="copy"
        sourceBucket="pics"
        objects={['cover.jpg']}
        prefixes={['source/']}
        destinationBuckets={buckets}
        onStarted={onStarted}
      />,
    );

    await waitFor(() => expect(objectsApi.list).toHaveBeenCalledWith('pics', '', 200));
    fireEvent.click(await screen.findByRole('button', {name: /albums/i}));
    await waitFor(() => expect(objectsApi.list).toHaveBeenCalledWith('pics', 'albums/', 200));
    fireEvent.click(screen.getByRole('button', {name: 'Start copy'}));

    await waitFor(() => expect(objectJobsApi.create).toHaveBeenCalledWith({
      operation: 'copy',
      sourceBucket: 'pics',
      objects: ['cover.jpg'],
      prefixes: ['source/'],
      destinationBucket: 'pics',
      destinationPrefix: 'albums/',
      conflictPolicy: 'skip',
    }));
    expect(onStarted).toHaveBeenCalledWith(expect.objectContaining({id: 'job-1'}));
  });
});
