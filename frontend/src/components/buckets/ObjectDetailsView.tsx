import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { objectsApi } from '@/lib/api';
import { useBuckets } from '@/hooks/useApi';
import { useBucketCan } from '@/hooks/usePermissions';
import type { ObjectMetadata } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IconTile } from '@/components/ui/icon-tile';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ObjectPreview } from '@/components/buckets/ObjectPreview';
import { ArrowLeft, ChevronRight, Copy, Download, File, Link2, Loader2, Maximize2, Minimize2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadObject, formatBytes } from '@/lib/file-utils';
import { buildPublicObjectUrl, cn, copyText, formatDate } from '@/lib/utils';
import { ShareObjectDialog } from '@/components/buckets/ShareObjectDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function CardSection({
  title,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]', className)}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
        <h3 className="text-[14px] font-semibold tracking-[-0.01em]">{title}</h3>
        {action}
      </div>
      <div className={contentClassName}>{children}</div>
    </section>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 px-5 py-3.5 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-[12.5px] font-medium text-[var(--muted-foreground)]">{label}</dt>
      <dd className="text-[13.5px] text-[var(--foreground)] break-words">{children}</dd>
    </div>
  );
}

export function ObjectDetailsView() {
  const navigate = useNavigate();
  const { bucketName, '*': encodedObjectKey } = useParams();
  const objectKey = encodedObjectKey ? decodeURIComponent(encodedObjectKey) : undefined;

  const { data: buckets = [] } = useBuckets();
  const bucket = buckets.find((b) => b.name === bucketName);
  const canBucket = useBucketCan();
  const canDelete = canBucket(bucket, 'object.delete');
  const canRead = canBucket(bucket, 'object.read');

  const [metadata, setMetadata] = useState<ObjectMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);

  useEffect(() => {
    if (!bucketName || !objectKey) {
      setError('Bucket name and object key are required');
      setIsLoading(false);
      return;
    }
    const fetchMetadata = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await objectsApi.getMetadata(bucketName, objectKey);
        setMetadata(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load object metadata');
      } finally {
        setIsLoading(false);
      }
    };
    fetchMetadata();
  }, [bucketName, objectKey]);

  useEffect(() => {
    if (!previewFullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewFullscreen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [previewFullscreen]);

  const parentPath = objectKey?.split('/').slice(0, -1).join('/') ?? '';
  const fileName = objectKey?.split('/').pop() || objectKey || '';
  const backHref = `/buckets/${bucketName}/objects${parentPath ? `?prefix=${encodeURIComponent(parentPath + '/')}` : ''}`;
  const pathSegments = parentPath ? parentPath.split('/').filter(Boolean) : [];

  const copy = async (text: string, label = 'Copied') => {
    try {
      await copyText(text);
      toast.success(label);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleDownload = () => {
    if (!bucketName || !objectKey) return;
    downloadObject(bucketName, objectKey);
  };

  const handleDelete = async () => {
    if (!bucketName || !objectKey) return;
    try {
      setDeleting(true);
      await objectsApi.delete(bucketName, objectKey);
      toast.success('Object deleted');
      navigate(backHref);
    } catch {
      // error toast handled by axios interceptor
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-[var(--muted-foreground)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading object details…
      </div>
    );
  }

  if (error || !metadata) {
    return (
      <div className="px-7 py-6">
        <Button variant="secondary" onClick={() => navigate(backHref)} className="mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-5 py-4 text-[13.5px] text-[var(--destructive)]">
          {error || 'Object not found'}
        </div>
      </div>
    );
  }

  const previewFullscreenLabel = previewFullscreen ? 'Exit fullscreen preview' : 'Open fullscreen preview';
  const previewCard = (
    <CardSection
      title="Preview"
      className={cn(previewFullscreen && 'absolute inset-0 z-40 flex flex-col rounded-none border-0')}
      contentClassName={cn(previewFullscreen && 'min-h-0 flex-1')}
      action={
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setPreviewFullscreen((fullscreen) => !fullscreen)}
                aria-label={previewFullscreenLabel}
                title={previewFullscreenLabel}
              >
                {previewFullscreen ? <Minimize2 /> : <Maximize2 />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{previewFullscreenLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      }
    >
      {canRead && bucketName && objectKey ? (
        <ObjectPreview
          bucket={bucketName}
          objectKey={objectKey}
          size={metadata.size}
          contentType={metadata.contentType}
          onDownload={handleDownload}
          fullscreen={previewFullscreen}
        />
      ) : (
        <div className="px-5 py-10 text-center text-[13px] text-[var(--muted-foreground)]">
          No preview available for this object.
        </div>
      )}
    </CardSection>
  );
  const previewHost = document.getElementById('app-content');

  return (
    <div className="px-7 py-6 space-y-6">
      {/* Back + breadcrumb */}
      <div className="flex items-center gap-2 text-[13px] text-[var(--muted-foreground)]">
        <Link
          to={backHref}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Objects
        </Link>
        {pathSegments.map((seg, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 opacity-50" />
            <span className="font-mono">{seg}</span>
          </span>
        ))}
        <ChevronRight className="h-3.5 w-3.5 opacity-50" />
        <span className="truncate font-mono text-[var(--foreground)]">{fileName}</span>
      </div>

      {/* Hero */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <IconTile icon={<File />} tone="primary" size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold tracking-[-0.02em]">{fileName}</h1>
            <button
              type="button"
              onClick={() => copy(metadata.key, 'Object key copied')}
              title="Copy key"
              className="group mt-1 inline-flex max-w-full items-center gap-1.5 truncate font-mono text-[13px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <span className="truncate">{metadata.key}</span>
              <Copy className="h-3 w-3 flex-shrink-0 opacity-60 group-hover:opacity-100" />
            </button>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge>{formatBytes(metadata.size)}</Badge>
              <Badge>{metadata.contentType || 'application/octet-stream'}</Badge>
              {metadata.storageClass && <Badge>{metadata.storageClass}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {bucket?.publicUrl && (
            <Button variant="secondary" onClick={() => copy(buildPublicObjectUrl(bucket.publicUrl!, metadata.key), 'Public URL copied')}>
              <Copy className="h-4 w-4" /> Copy public URL
            </Button>
          )}
          {canRead && (
            <Button variant="secondary" onClick={() => setShareOpen(true)}>
              <Link2 className="h-4 w-4" /> Signed URL
            </Button>
          )}
          <Button variant="secondary" onClick={handleDownload}>
            <Download className="h-4 w-4" /> Download
          </Button>
          {canDelete && (
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </section>

      {/* Preview */}
      {previewFullscreen && previewHost ? createPortal(previewCard, previewHost) : previewCard}

      {/* Details */}
      <CardSection title="Details">
        <dl className="divide-y divide-[var(--border)]">
          <DetailRow label="Size">{formatBytes(metadata.size)}</DetailRow>
          <DetailRow label="Content type">{metadata.contentType || 'application/octet-stream'}</DetailRow>
          <DetailRow label="Storage class">{metadata.storageClass || 'Standard'}</DetailRow>
          <DetailRow label="Last modified">{formatDate(metadata.lastModified)}</DetailRow>
          <DetailRow label="ETag">
            <button
              type="button"
              onClick={() => copy(metadata.etag, 'ETag copied')}
              className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[12.5px] hover:bg-[var(--accent)]"
            >
              <span className="truncate">{metadata.etag}</span>
              <Copy className="h-3 w-3 flex-shrink-0 opacity-60" />
            </button>
          </DetailRow>
          {metadata.versionId && (
            <DetailRow label="Version ID">
              <span className="font-mono text-[12.5px]">{metadata.versionId}</span>
            </DetailRow>
          )}
        </dl>
      </CardSection>

      {/* Custom metadata */}
      {metadata.metadata && Object.keys(metadata.metadata).length > 0 && (
        <CardSection title="Custom metadata">
          <dl className="divide-y divide-[var(--border)]">
            {Object.entries(metadata.metadata).map(([key, value]) => (
              <DetailRow key={key} label={key}>
                <span className="font-mono text-[12.5px]">{value}</span>
              </DetailRow>
            ))}
          </dl>
        </CardSection>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete "${fileName}"?`}
        description="Applications referencing this object will no longer be able to read it."
        confirmLabel="Delete object"
        loading={deleting}
        onConfirm={handleDelete}
      />
      {bucketName && objectKey && (
        <ShareObjectDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          bucketName={bucketName}
          objectKey={objectKey}
        />
      )}
    </div>
  );
}
