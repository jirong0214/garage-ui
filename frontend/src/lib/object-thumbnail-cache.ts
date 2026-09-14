const MAX_ENTRIES = 256;
const MAX_BYTES = 32 * 1024 * 1024;

export interface ThumbnailCacheEntry {
  blob: Blob;
  url: string;
  references: number;
}

const cache = new Map<string, ThumbnailCacheEntry>();
let cacheBytes = 0;

function trim(protectedKey?: string) {
  while (cache.size > MAX_ENTRIES || cacheBytes > MAX_BYTES) {
    const disposable = [...cache].find(
      ([key, entry]) => key !== protectedKey && entry.references === 0,
    );
    if (!disposable) return;
    const [key, entry] = disposable;
    cache.delete(key);
    cacheBytes -= entry.blob.size;
    URL.revokeObjectURL(entry.url);
  }
}

export function peekCachedThumbnail(key: string) {
  return cache.get(key);
}

export function retainCachedThumbnail(key: string, url: string) {
  const entry = cache.get(key);
  if (!entry || entry.url !== url) return;
  entry.references += 1;
  cache.delete(key);
  cache.set(key, entry);
}

export function releaseCachedThumbnail(key: string, url: string) {
  const entry = cache.get(key);
  if (!entry || entry.url !== url) return;
  entry.references = Math.max(0, entry.references - 1);
  trim();
}

export function cacheThumbnail(key: string, blob: Blob) {
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  const entry: ThumbnailCacheEntry = {blob, url: URL.createObjectURL(blob), references: 0};
  cache.set(key, entry);
  cacheBytes += blob.size;
  trim(key);
  return cache.get(key) ?? entry;
}

export function discardCachedThumbnail(key: string, url: string) {
  const entry = cache.get(key);
  if (!entry || entry.url !== url) return;
  cache.delete(key);
  cacheBytes -= entry.blob.size;
  URL.revokeObjectURL(entry.url);
}

export function clearObjectThumbnailMemoryCache() {
  for (const entry of cache.values()) URL.revokeObjectURL(entry.url);
  cache.clear();
  cacheBytes = 0;
}
