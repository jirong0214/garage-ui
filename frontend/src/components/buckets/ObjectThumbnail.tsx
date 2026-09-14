import {useEffect, useRef, useState} from 'react';
import {
  FileArchive,
  FileAudio,
  FileBox,
  FileCode,
  FileIcon,
  FileImage,
  FileJson,
  FileKey,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  FolderIcon,
  Presentation,
  type LucideIcon,
} from 'lucide-react';
import {objectsApi} from '@/lib/api';
import {getObjectFileKind, type ObjectFileKind} from '@/lib/object-file-type';
import type {S3Object} from '@/types';
import {useTranslation} from 'react-i18next';

interface ObjectThumbnailProps {
  variant?: 'list' | 'grid';
  bucketName: string;
  object: S3Object;
}

const supportedContentTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/x-ms-bmp',
  'image/tiff',
]);
const supportedExtension = /\.(?:jpe?g|png|gif|webp|bmp|tiff?)$/i;

const THUMBNAIL_CACHE_MAX_ENTRIES = 256;
const THUMBNAIL_CACHE_MAX_BYTES = 32 * 1024 * 1024;

interface ThumbnailCacheEntry {
  blob: Blob;
  url: string;
  references: number;
}

const thumbnailMemoryCache = new Map<string, ThumbnailCacheEntry>();
let thumbnailMemoryCacheBytes = 0;

function trimThumbnailMemoryCache(protectedKey?: string) {
  while (
    thumbnailMemoryCache.size > THUMBNAIL_CACHE_MAX_ENTRIES ||
    thumbnailMemoryCacheBytes > THUMBNAIL_CACHE_MAX_BYTES
  ) {
    const disposable = [...thumbnailMemoryCache].find(
      ([key, entry]) => key !== protectedKey && entry.references === 0,
    );
    if (!disposable) return;
    const [key, entry] = disposable;
    thumbnailMemoryCache.delete(key);
    thumbnailMemoryCacheBytes -= entry.blob.size;
    URL.revokeObjectURL(entry.url);
  }
}

function peekCachedThumbnail(key: string) {
  return thumbnailMemoryCache.get(key);
}

function retainCachedThumbnail(key: string, url: string) {
  const entry = thumbnailMemoryCache.get(key);
  if (!entry || entry.url !== url) return;
  entry.references += 1;
  thumbnailMemoryCache.delete(key);
  thumbnailMemoryCache.set(key, entry);
}

function releaseCachedThumbnail(key: string, url: string) {
  const entry = thumbnailMemoryCache.get(key);
  if (!entry || entry.url !== url) return;
  entry.references = Math.max(0, entry.references - 1);
  trimThumbnailMemoryCache();
}

function cacheThumbnail(key: string, blob: Blob) {
  const existing = thumbnailMemoryCache.get(key);
  if (existing) {
    thumbnailMemoryCache.delete(key);
    thumbnailMemoryCache.set(key, existing);
    return existing;
  }
  const entry: ThumbnailCacheEntry = {blob, url: URL.createObjectURL(blob), references: 0};
  thumbnailMemoryCache.set(key, entry);
  thumbnailMemoryCacheBytes += blob.size;
  trimThumbnailMemoryCache(key);
  return thumbnailMemoryCache.get(key) ?? entry;
}

function discardCachedThumbnail(key: string, url: string) {
  const entry = thumbnailMemoryCache.get(key);
  if (!entry || entry.url !== url) return;
  thumbnailMemoryCache.delete(key);
  thumbnailMemoryCacheBytes -= entry.blob.size;
  URL.revokeObjectURL(entry.url);
}

export function clearObjectThumbnailMemoryCache() {
  for (const entry of thumbnailMemoryCache.values()) URL.revokeObjectURL(entry.url);
  thumbnailMemoryCache.clear();
  thumbnailMemoryCacheBytes = 0;
}

function supportsThumbnail(object: S3Object) {
  const contentType = object.contentType?.split(';', 1)[0].trim().toLowerCase();
  return supportedContentTypes.has(contentType ?? '') || supportedExtension.test(object.key);
}

const fileKindIcons: Record<ObjectFileKind, LucideIcon> = {
  folder: FolderIcon,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  text: FileText,
  code: FileCode,
  json: FileJson,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  archive: FileArchive,
  font: FileType,
  key: FileKey,
  binary: FileBox,
  unknown: FileIcon,
};

export function ObjectThumbnail({bucketName, object, variant = 'list'}: ObjectThumbnailProps) {
  const {t} = useTranslation('objects');
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [failedURL, setFailedURL] = useState<string | null>(null);
  const thumbnailSize = variant === 'grid' ? 192 : 96;
  const shouldLoad = variant === 'list' || visible || typeof IntersectionObserver === 'undefined';
  useEffect(() => {
    if (variant !== 'grid') return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      {rootMargin: '200px'},
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [variant]);
  const supported = !object.isFolder && supportsThumbnail(object);
  const version = object.etag || `${object.lastModified}:${object.size}`;
  const requestKey = JSON.stringify([bucketName, object.key, version, thumbnailSize]);
  const [thumbnail, setThumbnail] = useState<{requestKey: string; url: string} | null>(() => {
    if (!supported) return null;
    const cached = peekCachedThumbnail(requestKey);
    return cached ? {requestKey, url: cached.url} : null;
  });
  const objectURL = thumbnail?.requestKey === requestKey ? thumbnail.url : null;
  const fileKind = getObjectFileKind(object);
  const FallbackIcon = fileKindIcons[fileKind];

  useEffect(() => {
    if (!supported || !shouldLoad) return;
    if (objectURL) return;
    const cached = peekCachedThumbnail(requestKey);
    if (cached) {
      setThumbnail({requestKey, url: cached.url});
      return;
    }
    const controller = new AbortController();
    objectsApi
      .getThumbnail(bucketName, object.key, version, thumbnailSize, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        const entry = cacheThumbnail(requestKey, blob);
        setThumbnail({requestKey, url: entry.url});
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [bucketName, object.key, objectURL, requestKey, supported, version, shouldLoad, thumbnailSize]);

  useEffect(() => {
    if (!objectURL) return;
    retainCachedThumbnail(requestKey, objectURL);
    return () => releaseCachedThumbnail(requestKey, objectURL);
  }, [objectURL, requestKey]);

  return (
    <div
      ref={containerRef}
      title={t(`fileKinds.${fileKind}`)}
      className={`flex shrink-0 items-center justify-center ${variant === 'grid' ? 'size-24' : 'size-10'}`}
    >
      {objectURL && objectURL !== failedURL ? (
        <img
          src={objectURL}
          alt=""
          className={`h-full w-full rounded ${variant === 'grid' ? 'object-contain' : 'object-cover'}`}
          loading="lazy"
          onError={() => {
            discardCachedThumbnail(requestKey, objectURL);
            setFailedURL(objectURL);
          }}
        />
      ) : (
        <FallbackIcon
          className={`${variant === 'grid' ? 'h-16 w-16' : 'h-7 w-7'} ${fileKind === 'folder' && variant === 'grid' ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}`}
          data-file-kind={fileKind}
        />
      )}
    </div>
  );
}
