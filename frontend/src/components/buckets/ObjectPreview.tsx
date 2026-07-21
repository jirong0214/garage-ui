import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeepScale, TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { Download, Loader2, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

function CodeBlock({ text, objectKey }: { text: string; objectKey: string }) {
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
    <pre className="overflow-x-auto px-5 py-4 font-mono text-[12.5px] leading-relaxed">
      {html !== null ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{text}</code>}
    </pre>
  );
}

function ImagePreview({ src, alt }: { src: string; alt: string }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  const toggleFullscreen = () => setIsFullscreen((current) => !current);

  const fullscreenLabel = isFullscreen ? 'Exit fullscreen preview' : 'Open fullscreen preview';

  const fullscreenControl = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            aria-label={fullscreenLabel}
            title={fullscreenLabel}
            className="border border-white/20 bg-black/65 text-white shadow-md hover:bg-black/85 hover:text-white"
          >
            {isFullscreen ? <Minimize2 /> : <Maximize2 />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{fullscreenLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const imageLayer = (
    <div className="relative inline-flex max-h-full max-w-full">
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={cn(
          'block h-auto w-auto select-none object-contain',
          isFullscreen ? 'max-h-screen max-w-full' : 'max-h-[85vh] max-w-full',
        )}
      />
      {isFullscreen ? (
        <KeepScale className="absolute right-3 top-3">
          {fullscreenControl}
        </KeepScale>
      ) : (
        <div className="absolute right-3 top-3">
          {fullscreenControl}
        </div>
      )}
    </div>
  );

  const surface = (
    <div
      onClick={(event) => {
        if (isFullscreen && event.target === event.currentTarget) {
          setIsFullscreen(false);
        }
      }}
      className={cn(
        'relative flex w-full items-center justify-center overflow-hidden',
        !isFullscreen && 'bg-[var(--surface-sunken)]',
        isFullscreen && 'fixed inset-0 z-[100] h-[100dvh] w-screen bg-black/60',
      )}
    >
      {isFullscreen ? (
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
            wrapperStyle={{ width: '100vw', height: '100dvh', touchAction: 'none' }}
            contentStyle={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
            contentProps={{
              onClick: (event) => {
                if (event.target === event.currentTarget) setIsFullscreen(false);
              },
            }}
          >
            {imageLayer}
          </TransformComponent>
        </TransformWrapper>
      ) : imageLayer}
    </div>
  );

  return isFullscreen ? createPortal(surface, document.body) : surface;
}

export function ObjectPreview({
  bucket,
  objectKey,
  size,
  contentType,
  onDownload,
}: {
  bucket: string;
  objectKey: string;
  size: number;
  contentType?: string;
  onDownload: () => void;
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
      return <ImagePreview src={preview.objectUrl!} alt={objectKey} />;
    case 'video':
      return (
        <div className="flex justify-center bg-black">
          <video
            ref={(el) => {
              mediaRef.current = el;
            }}
            controls
            preload="metadata"
            src={preview.mediaUrl!}
            onError={handleMediaError}
            onLoadedMetadata={handleLoadedMetadata}
            className="max-h-[85vh] w-full"
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
      return <iframe src={preview.objectUrl!} title={objectKey} className="h-[85vh] w-full" />;
    case 'text':
      return <CodeBlock text={preview.text!} objectKey={objectKey} />;
    default:
      return <Notice message="No preview available for this object." onDownload={onDownload} />;
  }
}
