import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { objectsApi } from '@/lib/api';
import {
  getPreviewKind,
  getPreviewMime,
  getPreviewSizeLimit,
  looksBinary,
  type PreviewKind,
} from '@/lib/preview-utils';

export interface ObjectPreviewState {
  kind: PreviewKind;
  status: 'loading' | 'ready' | 'too-large' | 'unsupported' | 'binary' | 'error';
  objectUrl: string | null;
  text: string | null;
  mediaUrl: string | null;
  retry: () => void;
  onMediaError: () => void;
}

// Documents (image, pdf, text) are fetched as blobs through the normal
// authenticated API path. Media (video, audio) gets a short-lived tokenized
// URL instead, because media elements cannot send an Authorization header
// and must stream with Range requests rather than load fully.
export function useObjectPreview(
  bucket: string,
  objectKey: string,
  size: number,
  contentType?: string,
): ObjectPreviewState {
  const kind = getPreviewKind(contentType, objectKey);
  const sizeLimit = getPreviewSizeLimit(kind);
  const isDocument = kind === 'image' || kind === 'pdf' || kind === 'text';
  const isMedia = kind === 'video' || kind === 'audio';
  const tooLarge = isDocument && sizeLimit !== null && size > sizeLimit;

  const blobQuery = useQuery({
    queryKey: ['object-preview', bucket, objectKey],
    queryFn: () => objectsApi.get(bucket, objectKey),
    enabled: isDocument && !tooLarge,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

  const urlQuery = useQuery({
    queryKey: ['object-preview-url', bucket, objectKey],
    queryFn: () => objectsApi.getPreviewUrl(bucket, objectKey),
    enabled: isMedia,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [isBinary, setIsBinary] = useState(false);
  const previewKey = `${bucket}\0${objectKey}`;
  const [failedMediaKey, setFailedMediaKey] = useState<string | null>(null);
  const remintedKeyRef = useRef<string | null>(null);
  const mediaFailed = failedMediaKey === previewKey;

  useEffect(() => {
    const blob = blobQuery.data;
    if (!blob) return;
    let cancelled = false;
    const typed = new Blob([blob], { type: getPreviewMime(kind, contentType, objectKey) });
    const url = URL.createObjectURL(typed);
    // The object URL is an external browser resource derived from the completed query.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setObjectUrl(url);
    if (kind === 'text') {
      blob.text().then((decoded) => {
        if (cancelled) return;
        if (looksBinary(decoded.slice(0, 4096))) setIsBinary(true);
        else setText(decoded);
      });
    }
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
      setObjectUrl(null);
      setText(null);
      setIsBinary(false);
    };
  }, [blobQuery.data, kind, contentType, objectKey]);

  const onMediaError = () => {
    if (remintedKeyRef.current === previewKey) {
      setFailedMediaKey(previewKey);
      return;
    }
    remintedKeyRef.current = previewKey;
    urlQuery.refetch();
  };

  const retry = () => {
    remintedKeyRef.current = null;
    setFailedMediaKey(null);
    if (isDocument) blobQuery.refetch();
    if (isMedia) urlQuery.refetch();
  };

  let status: ObjectPreviewState['status'];
  if (kind === 'none') status = 'unsupported';
  else if (tooLarge) status = 'too-large';
  else if (isBinary) status = 'binary';
  else if (mediaFailed || blobQuery.isError || urlQuery.isError) status = 'error';
  else if (isMedia) status = urlQuery.data ? 'ready' : 'loading';
  else if (kind === 'text') status = text !== null ? 'ready' : 'loading';
  else status = objectUrl ? 'ready' : 'loading';

  return {
    kind,
    status,
    objectUrl,
    text,
    mediaUrl: urlQuery.data?.url ?? null,
    retry,
    onMediaError,
  };
}
