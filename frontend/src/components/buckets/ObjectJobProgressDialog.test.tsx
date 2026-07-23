import {render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {objectJobsApi} from '@/lib/api';
import {ObjectJobProgressDialog} from './ObjectJobProgressDialog';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    objectJobsApi: {
      ...actual.objectJobsApi,
      get: vi.fn(),
      cancel: vi.fn(),
    },
  };
});

vi.mock('sonner', () => ({toast: {success: vi.fn(), error: vi.fn()}}));

describe('ObjectJobProgressDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders terminal progress and reports completion once', async () => {
    const onCompleted = vi.fn();
    vi.mocked(objectJobsApi.get).mockResolvedValue({
      id: 'job-1',
      operation: 'move',
      status: 'completed_with_errors',
      phase: 'completed_with_errors',
      sourceBucket: 'pics',
      destinationBucket: 'archive',
      conflictPolicy: 'skip',
      discovered: 4,
      processed: 4,
      succeeded: 3,
      failed: 1,
      skipped: 0,
      bytesProcessed: 4096,
      bytesTotal: 4096,
      progress: 100,
      createdAt: '2026-07-23T00:00:00Z',
      finishedAt: '2026-07-23T00:00:01Z',
    });

    render(
      <ObjectJobProgressDialog
        jobId="job-1"
        onClose={vi.fn()}
        onCompleted={onCompleted}
      />,
    );

    expect(await screen.findByText('4 of 4')).toBeInTheDocument();
    expect(screen.getByText('Succeeded').nextSibling).toHaveTextContent('3');
    expect(screen.getByText('Failed').nextSibling).toHaveTextContent('1');
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
  });
});
