import {useEffect, useState} from 'react';
import {FileIcon, FolderIcon} from 'lucide-react';
import {objectsApi} from '@/lib/api';
import type {S3Object} from '@/types';

interface ObjectThumbnailProps {
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

function supportsThumbnail(object: S3Object) {
  const contentType = object.contentType?.split(';', 1)[0].trim().toLowerCase();
  return supportedContentTypes.has(contentType ?? '') || supportedExtension.test(object.key);
}

export function ObjectThumbnail({bucketName, object}: ObjectThumbnailProps) {
  const [objectURL, setObjectURL] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const supported = !object.isFolder && supportsThumbnail(object);
  const version = object.etag || `${object.lastModified}:${object.size}`;

  useEffect(() => {
    setObjectURL(null);
    setFailed(false);
    if (!supported) return;
    const controller = new AbortController();
    let url: string | null = null;
    objectsApi.getThumbnail(bucketName, object.key, version, 96, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setObjectURL(url);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [bucketName, object.key, supported, version]);

  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--border)] bg-[var(--surface-sunken)]"
    >
      {object.isFolder ? (
        <FolderIcon className="h-4 w-4 text-muted-foreground" />
      ) : objectURL && !failed ? (
        <img src={objectURL} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <FileIcon className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}
