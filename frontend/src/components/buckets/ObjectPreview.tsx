import { useEffect, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useObjectPreview } from '@/hooks/useObjectPreview';
import { getHighlightLanguage, TEXT_HIGHLIGHT_MAX_BYTES } from '@/lib/preview-utils';
import { formatBytes } from '@/lib/file-utils';
import { cn } from '@/lib/utils';

function Notice({
  message,
  onDownload,
  onRetry,
}: {
  message: string;
  onDownload?: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-10 text-center text-[13px] text-[var(--muted-foreground)]">
      <p>{message}</p>
      {(onRetry || onDownload) && (
        <div className="flex gap-2">
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          )}
          {onDownload && (
            <Button variant="secondary" onClick={onDownload}>
              <Download className="h-4 w-4" /> Download
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function CodeBlock({ text, objectKey, fullscreen }: { text: string; objectKey: string; fullscreen: boolean }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    // Highlighting is progressive enhancement. Large files and any import or
    // highlight failure fall back to the plain text already on screen.
    if (text.length > TEXT_HIGHLIGHT_MAX_BYTES) return;
    let cancelled = false;
    import('@/lib/highlight')
      .then(({ highlight }) => {
        if (!cancelled) setHtml(highlight(text, getHighlightLanguage(objectKey)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [text, objectKey]);

  return (
    <pre className={cn('overflow-auto px-5 py-4 font-mono text-[12.5px] leading-relaxed', fullscreen && 'h-full')}>
      {html !== null ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{text}</code>}
    </pre>
  );
}

function ImagePreview({ src, alt, fullscreen }: { src: string; alt: string; fullscreen: boolean }) {
  const imageLayer = (
    <div className="inline-flex max-h-full max-w-full">
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={cn(
          'block h-auto w-auto select-none object-contain',
          fullscreen ? 'max-h-full max-w-full' : 'max-h-[85vh] max-w-full',
        )}
      />
    </div>
  );

  return (
    <div className={cn('flex w-full items-center justify-center overflow-hidden bg-[var(--surface-sunken)]', fullscreen && 'h-full')}>
      {fullscreen ? (
        <TransformWrapper
          minScale={1}
          maxScale={5}
          centerOnInit
          centerZoomedOut
          limitToBounds={false}
          wheel={{ disabled: true }}
          doubleClick={{ mode: 'toggle', step: 1.5 }}
        >
          <TransformComponent
            wrapperStyle={{ width: '100%', height: '100%', touchAction: 'none' }}
            contentStyle={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
          >
            {imageLayer}
          </TransformComponent>
        </TransformWrapper>
      ) : imageLayer}
    </div>
  );
}

export function ObjectPreview({
  bucket,
  objectKey,
  size,
  contentType,
  onDownload,
  fullscreen = false,
}: {
  bucket: string;
  objectKey: string;
  size: number;
  contentType?: string;
  onDownload: () => void;
  fullscreen?: boolean;
}) {
  const preview = useObjectPreview(bucket, objectKey, size, contentType);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const resumeAtRef = useRef(0);

  const handleMediaError = () => {
    resumeAtRef.current = mediaRef.current?.currentTime ?? 0;
    preview.onMediaError();
  };

  const handleLoadedMetadata = () => {
    if (resumeAtRef.current > 0 && mediaRef.current) {
      mediaRef.current.currentTime = resumeAtRef.current;
      resumeAtRef.current = 0;
    }
  };

  switch (preview.status) {
    case 'unsupported':
      return <Notice message="No preview available for this object." onDownload={onDownload} />;
    case 'too-large':
      return (
        <Notice
          message={`File is too large to preview (${formatBytes(size)}), download it instead.`}
          onDownload={onDownload}
        />
      );
    case 'binary':
      return <Notice message="This file doesn't appear to be text." onDownload={onDownload} />;
    case 'error':
      return <Notice message="Could not load the preview." onRetry={preview.retry} onDownload={onDownload} />;
    case 'loading':
      return (
        <div className="flex items-center justify-center gap-2 px-5 py-10 text-[13px] text-[var(--muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading preview…
        </div>
      );
  }

  switch (preview.kind) {
    case 'image':
      return <ImagePreview src={preview.objectUrl!} alt={objectKey} fullscreen={fullscreen} />;
    case 'video':
      return (
        <div className={cn('flex justify-center bg-black', fullscreen && 'h-full')}>
          <video
            ref={(el) => {
              mediaRef.current = el;
            }}
            controls
            preload="metadata"
            src={preview.mediaUrl!}
            onError={handleMediaError}
            onLoadedMetadata={handleLoadedMetadata}
            className={cn('w-full', fullscreen ? 'h-full max-h-full' : 'max-h-[85vh]')}
          />
        </div>
      );
    case 'audio':
      return (
        <div>
          <audio
            ref={(el) => {
              mediaRef.current = el;
            }}
            controls
            src={preview.mediaUrl!}
            onError={handleMediaError}
            onLoadedMetadata={handleLoadedMetadata}
            className="block w-full"
          />
        </div>
      );
    case 'pdf':
      return <iframe src={preview.objectUrl!} title={objectKey} className={cn('w-full', fullscreen ? 'h-full' : 'h-[85vh]')} />;
    case 'text':
      return <CodeBlock text={preview.text!} objectKey={objectKey} fullscreen={fullscreen} />;
    default:
      return <Notice message="No preview available for this object." onDownload={onDownload} />;
  }
}
