import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isFallbackFullscreen, setIsFallbackFullscreen] = useState(false);
  const isFullscreen = isNativeFullscreen || isFallbackFullscreen;

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsNativeFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFallbackFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFallbackFullscreen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFallbackFullscreen]);

  const toggleFullscreen = async () => {
    if (isFallbackFullscreen) {
      setIsFallbackFullscreen(false);
      return;
    }

    if (document.fullscreenElement === containerRef.current) {
      try {
        await document.exitFullscreen();
      } catch {
        setIsNativeFullscreen(false);
      }
      return;
    }

    if (containerRef.current?.requestFullscreen) {
      try {
        await containerRef.current.requestFullscreen();
        return;
      } catch {
        // Mobile browsers and embedded webviews may expose the API but reject
        // fullscreen for non-video elements. Fall back to a viewport overlay.
      }
    }

    setIsFallbackFullscreen(true);
  };

  const fullscreenLabel = isFullscreen ? 'Exit fullscreen preview' : 'Open fullscreen preview';

  const surface = (
    <div
      ref={containerRef}
      className={cn(
        'relative flex w-full items-center justify-center overflow-hidden bg-[var(--surface-sunken)]',
        isNativeFullscreen && 'h-screen',
        isFallbackFullscreen && 'fixed inset-0 z-[100] h-[100dvh] w-screen',
      )}
    >
      <img
        src={src}
        alt={alt}
        className={cn(
          'block h-auto w-auto object-contain',
          isFullscreen ? 'max-h-screen max-w-full' : 'max-h-[85vh] max-w-full',
        )}
      />
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
              className="absolute right-3 top-3 border border-white/20 bg-black/65 text-white shadow-md hover:bg-black/85 hover:text-white"
            >
              {isFullscreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{fullscreenLabel}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );

  return isFallbackFullscreen ? createPortal(surface, document.body) : surface;
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
