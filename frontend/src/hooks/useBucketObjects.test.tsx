import {act, renderHook, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {objectsApi} from '@/lib/api';
import {useBucketObjects} from './useBucketObjects';

vi.mock('@/lib/api', () => ({
  objectsApi: {
    list: vi.fn(),
    search: vi.fn(),
    upload: vi.fn(),
    delete: vi.fn(),
    deleteMultiple: vi.fn(),
    createDirectory: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {success: vi.fn(), warning: vi.fn(), error: vi.fn()},
}));

const object = (key: string) => ({key, size: 1, lastModified: '2026-09-11T00:00:00Z'});

describe('useBucketObjects continuous loading', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads 50 at a time, appends unique objects, and retries a failed continuation', async () => {
    vi.mocked(objectsApi.list)
      .mockResolvedValueOnce({
        bucket: 'photos',
        prefixes: [],
        count: 2,
        objects: [object('a'), object('b')],
        isTruncated: true,
        nextContinuationToken: 'page-2',
      })
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({
        bucket: 'photos',
        prefixes: [],
        count: 2,
        objects: [object('b'), object('c')],
        isTruncated: false,
      });

    const {result, unmount} = renderHook(() => useBucketObjects('photos'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(objectsApi.list).toHaveBeenCalledWith('photos', '', 50, undefined);
    expect(result.current.continuousObjects.map((item) => item.key)).toEqual(['a', 'b']);

    await act(() => result.current.loadMoreObjects());
    expect(result.current.loadMoreError?.message).toBe('network unavailable');
    expect(result.current.continuousObjects.map((item) => item.key)).toEqual(['a', 'b']);

    await act(() => result.current.loadMoreObjects());
    expect(objectsApi.list).toHaveBeenLastCalledWith('photos', '', 50, 'page-2');
    expect(result.current.continuousObjects.map((item) => item.key)).toEqual(['a', 'b', 'c']);
    expect(result.current.continuousIsTruncated).toBe(false);
    expect(result.current.loadMoreError).toBeNull();

    unmount();
    vi.mocked(objectsApi.list).mockResolvedValueOnce({
      bucket: 'photos',
      prefixes: [],
      count: 2,
      objects: [object('a'), object('b')],
      isTruncated: true,
      nextContinuationToken: 'page-2',
    });
    const restored = renderHook(() => useBucketObjects('photos'));
    expect(restored.result.current.continuousObjects.map((item) => item.key)).toEqual(['a', 'b', 'c']);
    await waitFor(() => expect(restored.result.current.isLoading).toBe(false));
    expect(restored.result.current.continuousObjects.map((item) => item.key)).toEqual(['a', 'b', 'c']);
  });
});
