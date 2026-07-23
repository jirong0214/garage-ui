import {useEffect, useState} from 'react';
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
import {getObjectFileKind, objectFileKindLabels, type ObjectFileKind} from '@/lib/object-file-type';
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

export function ObjectThumbnail({bucketName, object}: ObjectThumbnailProps) {
  const [thumbnail, setThumbnail] = useState<{requestKey: string; url: string} | null>(null);
  const supported = !object.isFolder && supportsThumbnail(object);
  const version = object.etag || `${object.lastModified}:${object.size}`;
  const requestKey = `${bucketName}\0${object.key}\0${version}`;
  const objectURL = thumbnail?.requestKey === requestKey ? thumbnail.url : null;
  const fileKind = getObjectFileKind(object);
  const FallbackIcon = fileKindIcons[fileKind];

  useEffect(() => {
    if (!supported) return;
    const controller = new AbortController();
    let url: string | null = null;
    objectsApi.getThumbnail(bucketName, object.key, version, 96, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setThumbnail({requestKey, url});
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [bucketName, object.key, requestKey, supported, version]);

  return (
    <div
      title={objectFileKindLabels[fileKind]}
      className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--border)] bg-[var(--surface-sunken)]"
    >
      {objectURL ? (
        <img src={objectURL} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <FallbackIcon className="h-4 w-4 text-muted-foreground" data-file-kind={fileKind} />
      )}
    </div>
  );
}
