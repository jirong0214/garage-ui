import { useInfiniteQuery } from '@tanstack/react-query';

import type { ServerProfile } from '@/features/server/configuration/server-model';
import { fetchObjects } from '@/infrastructure/api/garage-api';

const pageSize = 50;

export function useObjectPages(
  server: ServerProfile | null,
  bucket: string,
  prefix: string,
  search: string,
) {
  return useInfiniteQuery({
    queryKey: ['objects', server?.id, bucket, prefix, search],
    queryFn: ({ pageParam }) =>
      fetchObjects(server!, bucket, {
        prefix,
        search,
        maxKeys: pageSize,
        continuationToken: pageParam,
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) =>
      lastPage.is_truncated && lastPage.next_continuation_token
        ? lastPage.next_continuation_token
        : undefined,
    enabled: Boolean(server && bucket),
  });
}
