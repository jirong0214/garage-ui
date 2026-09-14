import { useState, useEffect, useCallback, useRef } from 'react';
import { objectsApi } from '@/lib/api';
import type { S3Object, UploadTask } from '@/types';
import { toast } from 'sonner';
import i18n, { currentLocale } from '@/i18n';

// How long to wait after the last keystroke before actually searching. Keeps
// typing from firing a request (and a client-side re-filter) on every key.
const SEARCH_DEBOUNCE_MS = 750;
const CONTINUOUS_CACHE_TTL_MS = 5 * 60 * 1000;
const CONTINUOUS_CACHE_LIMIT = 12;

interface ContinuousCacheEntry {
  objects: S3Object[];
  isTruncated: boolean;
  nextToken?: string;
  savedAt: number;
}

const continuousCache = new Map<string, ContinuousCacheEntry>();

function makeContinuousCacheKey(
  bucketName: string | null,
  currentPath: string,
  searchQuery: string,
  deepSearch: boolean,
  itemsPerPage: number,
) {
  return JSON.stringify([bucketName ?? '', currentPath, searchQuery, deepSearch, itemsPerPage]);
}

function readContinuousCache(key: string): ContinuousCacheEntry | undefined {
  const entry = continuousCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.savedAt > CONTINUOUS_CACHE_TTL_MS) {
    continuousCache.delete(key);
    return undefined;
  }
  return entry;
}

function writeContinuousCache(key: string, entry: Omit<ContinuousCacheEntry, 'savedAt'>) {
  continuousCache.delete(key);
  continuousCache.set(key, {...entry, savedAt: Date.now()});
  while (continuousCache.size > CONTINUOUS_CACHE_LIMIT) {
    const oldestKey = continuousCache.keys().next().value;
    if (oldestKey === undefined) break;
    continuousCache.delete(oldestKey);
  }
}

export function useBucketObjects(bucketName: string | null, currentPath: string = '', searchQuery: string = '', deepSearch: boolean = false) {
  const initialContinuousKey = makeContinuousCacheKey(bucketName, currentPath, searchQuery.trim(), deepSearch, 50);
  const initialContinuous = readContinuousCache(initialContinuousKey);
  const [objects, setObjects] = useState<S3Object[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [nextContinuationToken, setNextContinuationToken] = useState<string | undefined>(undefined);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [continuousObjects, setContinuousObjects] = useState<S3Object[]>(initialContinuous?.objects ?? []);
  const [continuousIsTruncated, setContinuousIsTruncated] = useState(initialContinuous?.isTruncated ?? false);
  const [continuousNextToken, setContinuousNextToken] = useState<string | undefined>(initialContinuous?.nextToken);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<Error | null>(null);
  const [currentContinuationToken, setCurrentContinuationToken] = useState<string | undefined>(undefined);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const previousPathRef = useRef<string>(currentPath);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const clearTasksTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic sequence guarding against stale responses: when a newer fetch or
  // search starts, older in-flight responses are discarded instead of clobbering
  // the current view (e.g. a slow search resolving after the query was cleared).
  const fetchSeqRef = useRef(0);
  const loadingMoreRef = useRef(false);

  // Prefix search (the default) narrows the Garage listing to keys starting with
  // the query, within the current folder — server-side, paginated, and O(matches)
  // like the AWS S3 / R2 consoles. Deep search instead uses a recursive scan
  // (see searchObjects) and does not touch listPrefix.
  const listPrefix = debouncedSearch && !deepSearch ? currentPath + debouncedSearch : currentPath;
  const continuousCacheKey = makeContinuousCacheKey(
    bucketName,
    currentPath,
    debouncedSearch,
    deepSearch,
    itemsPerPage,
  );

  const fetchObjects = useCallback(async (continuationToken?: string, isRefresh = false, isNav = false) => {
    if (!bucketName) return;

    const seq = ++fetchSeqRef.current;
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else if (isNav) {
        setIsNavigating(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      const response = await objectsApi.list(bucketName, listPrefix, itemsPerPage, continuationToken);
      if (seq !== fetchSeqRef.current) return;
      setObjects(response.objects);
      setIsTruncated(response.isTruncated);
      setNextContinuationToken(response.nextContinuationToken);
      setCurrentContinuationToken(continuationToken);
      if (!continuationToken) {
        const cached = !isRefresh ? readContinuousCache(continuousCacheKey) : undefined;
        const freshKeys = new Set(response.objects.map((object) => object.key));
        const restoredObjects = cached
          ? [...response.objects, ...cached.objects.filter((object) => !freshKeys.has(object.key))]
          : response.objects;
        const restoredIsTruncated = cached ? cached.isTruncated : response.isTruncated;
        const restoredNextToken = cached ? cached.nextToken : response.nextContinuationToken;
        setContinuousObjects(restoredObjects);
        setContinuousIsTruncated(restoredIsTruncated);
        setContinuousNextToken(restoredNextToken);
        writeContinuousCache(continuousCacheKey, {
          objects: restoredObjects,
          isTruncated: restoredIsTruncated,
          nextToken: restoredNextToken,
        });
        setLoadMoreError(null);
      }
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setError(err as Error);
      console.error('Failed to fetch objects:', err);
    } finally {
      if (seq === fetchSeqRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsNavigating(false);
      }
    }
  }, [bucketName, continuousCacheKey, listPrefix, itemsPerPage]);

  const loadMoreObjects = useCallback(async () => {
    if (!bucketName || !continuousIsTruncated || !continuousNextToken || loadingMoreRef.current) return;

    const seq = fetchSeqRef.current;
    const token = continuousNextToken;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const response = await objectsApi.list(bucketName, listPrefix, itemsPerPage, token);
      if (seq !== fetchSeqRef.current) return;
      setContinuousObjects((previous) => {
        const existingKeys = new Set(previous.map((object) => object.key));
        const appended = [...previous, ...response.objects.filter((object) => !existingKeys.has(object.key))];
        writeContinuousCache(continuousCacheKey, {
          objects: appended,
          isTruncated: response.isTruncated,
          nextToken: response.nextContinuationToken,
        });
        return appended;
      });
      setContinuousIsTruncated(response.isTruncated);
      setContinuousNextToken(response.nextContinuationToken);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setLoadMoreError(err as Error);
    } finally {
      loadingMoreRef.current = false;
      if (seq === fetchSeqRef.current) setIsLoadingMore(false);
    }
  }, [bucketName, continuousCacheKey, continuousIsTruncated, continuousNextToken, itemsPerPage, listPrefix]);

  const searchObjects = useCallback(async (query: string) => {
    if (!bucketName) return;

    const seq = ++fetchSeqRef.current;
    try {
      setIsLoading(true);
      setError(null);
      const response = await objectsApi.search(bucketName, query, currentPath || undefined);
      if (seq !== fetchSeqRef.current) return;
      setObjects(response.objects);
      setContinuousObjects(response.objects);
      setIsTruncated(response.isTruncated);
      setContinuousIsTruncated(response.isTruncated);
      // Search results are not token-paginated.
      setNextContinuationToken(undefined);
      setContinuousNextToken(undefined);
      setLoadMoreError(null);
      writeContinuousCache(continuousCacheKey, {
        objects: response.objects,
        isTruncated: response.isTruncated,
      });
      setCurrentContinuationToken(undefined);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setError(err as Error);
      console.error('Failed to search objects:', err);
    } finally {
      if (seq === fetchSeqRef.current) setIsLoading(false);
    }
  }, [bucketName, continuousCacheKey, currentPath]);

  // Debounce the search query so we don't fire a recursive scan per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (!bucketName) return;

    // Deep search: recursive substring scan across the current subtree.
    if (debouncedSearch && deepSearch) {
      searchObjects(debouncedSearch);
      return;
    }

    // Normal listing, or prefix-filtered listing (listPrefix carries the query).
    const isPathChange = previousPathRef.current !== currentPath && objects.length > 0;
    previousPathRef.current = currentPath;

    fetchObjects(undefined, false, isPathChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucketName, currentPath, itemsPerPage, debouncedSearch, deepSearch]);

  useEffect(() => {
    return () => {
      if (clearTasksTimerRef.current) clearTimeout(clearTasksTimerRef.current);
    };
  }, []);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!bucketName) return false;

    const hasRelativePaths = files.some((file) => !!file.webkitRelativePath);

    const folders = new Set<string>();
    files.forEach((file) => {
      if (file.webkitRelativePath) {
        const parts = file.webkitRelativePath.split('/');
        if (parts.length > 1) {
          folders.add(parts[0]);
        }
      }
    });

    const tasks: UploadTask[] = files.map((file, index) => {
      const relativePath = file.webkitRelativePath || file.name;
      const key = currentPath ? `${currentPath}${relativePath}` : relativePath;
      return {
        id: `${Date.now()}-${index}`,
        file,
        key,
        bucket: bucketName,
        progress: 0,
        status: 'pending' as const,
      };
    });

    setUploadTasks(tasks);

    const results = await Promise.all(tasks.map(async (task) => {
      try {
        setUploadTasks(prev => prev.map(t =>
          t.id === task.id ? { ...t, status: 'uploading' as const } : t
        ));

        await objectsApi.upload(bucketName, task.key, task.file, (progress) => {
          setUploadTasks(prev => prev.map(t => {
            if (t.id !== task.id || t.progress === progress) return t;
            return { ...t, progress };
          }));
        });

        setUploadTasks(prev => prev.map(t =>
          t.id === task.id ? { ...t, status: 'completed' as const, progress: 100 } : t
        ));
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : i18n.t('objects:upload.failed');
        setUploadTasks(prev => prev.map(t =>
          t.id === task.id ? { ...t, status: 'error' as const, error: errorMessage } : t
        ));
        console.error(`Failed to upload ${task.key}:`, error);
        return false;
      }
    }));

    const successCount = results.filter(Boolean).length;
    const errorCount = results.length - successCount;

    if (errorCount === 0) {
      if (hasRelativePaths && folders.size > 0) {
        const folderNames = Array.from(folders).join(', ');
        toast.success(i18n.t('objects:upload.successFromFolders', {
          files: i18n.t('count.file', { count: successCount }),
          folders: i18n.t('count.directory', { count: folders.size }),
          names: folderNames,
        }));
      } else {
        toast.success(i18n.t('objects:upload.success', { count: successCount }));
      }
    } else if (successCount > 0) {
      toast.warning(i18n.t('objects:upload.partial', {
        success: i18n.t('count.file', { count: successCount }),
        failed: i18n.t('count.file', { count: errorCount }),
      }));
    } else {
      toast.error(i18n.t('objects:upload.failedSummary', { failed: i18n.t('count.file', { count: errorCount }) }));
    }

    if (clearTasksTimerRef.current) clearTimeout(clearTasksTimerRef.current);
    clearTasksTimerRef.current = setTimeout(() => {
      setUploadTasks([]);
      clearTasksTimerRef.current = null;
    }, 3000);

    await fetchObjects(currentContinuationToken, true);
    return successCount > 0;
  }, [bucketName, currentPath, currentContinuationToken, fetchObjects]);

  const deleteObject = useCallback(async (key: string) => {
    if (!bucketName) return false;

    try {
      setObjects(prev => prev.filter(obj => obj.key !== key));
      setContinuousObjects(prev => prev.filter(obj => obj.key !== key));

      await objectsApi.delete(bucketName, key);
      toast.success(i18n.t('objects:deletedNamed', { key }));
      await fetchObjects(currentContinuationToken, true);
      return true;
    } catch (error) {
      console.error('Delete object error:', error);
      await fetchObjects(currentContinuationToken, true);
      return false;
    }
  }, [bucketName, currentContinuationToken, fetchObjects]);

  // Deletes the selected object keys and recursively deletes every object under
  // each selected folder prefix.
  const deleteMultipleObjects = useCallback(async (keys: string[], prefixes: string[] = []) => {
    if (!bucketName || (keys.length === 0 && prefixes.length === 0)) return false;

    try {
      const keySet = new Set(keys);
      setObjects(prev => prev.filter(obj =>
        !keySet.has(obj.key) && !prefixes.some(prefix => obj.key.startsWith(prefix))
      ));
      setContinuousObjects(prev => prev.filter(obj =>
        !keySet.has(obj.key) && !prefixes.some(prefix => obj.key.startsWith(prefix))
      ));

      await objectsApi.deleteMultiple(bucketName, keys, prefixes);

      const fileLabel = keys.length > 0 ? i18n.t('count.file', { count: keys.length }) : '';
      const folderLabel = prefixes.length > 0 ? i18n.t('count.directory', { count: prefixes.length }) : '';
      const summary = new Intl.ListFormat(currentLocale(), { type: 'conjunction' })
        .format([fileLabel, folderLabel].filter(Boolean));
      toast.success(i18n.t('objects:deletedSummary', { summary }));

      await fetchObjects(currentContinuationToken, true);
      return true;
    } catch (error) {
      console.error('Bulk delete error:', error);
      await fetchObjects(currentContinuationToken, true);
      return false;
    }
  }, [bucketName, currentContinuationToken, fetchObjects]);

  const createDirectory = useCallback(async (dirName: string) => {
    if (!bucketName) return false;

    try {
      const dirKey = currentPath ? `${currentPath}${dirName}/` : `${dirName}/`;
      await objectsApi.createDirectory(bucketName, dirKey);
      toast.success(i18n.t('objects:directoryCreated', { name: dirName }));
      await fetchObjects(currentContinuationToken, true);
      return true;
    } catch (error) {
      console.error('Create directory error:', error);
      return false;
    }
  }, [bucketName, currentPath, currentContinuationToken, fetchObjects]);

  return {
    objects,
    continuousObjects,
    // The debounced query the current results reflect — use this (not the raw
    // input) to filter/label results so the view waits instead of twitching.
    debouncedSearch,
    isLoading,
    isRefreshing,
    isNavigating,
    error,
    isTruncated,
    nextContinuationToken,
    continuousIsTruncated,
    isLoadingMore,
    loadMoreError,
    currentContinuationToken,
    itemsPerPage,
    setItemsPerPage,
    fetchObjects,
    loadMoreObjects,
    uploadFiles,
    uploadTasks,
    deleteObject,
    deleteMultipleObjects,
    createDirectory,
  };
}
