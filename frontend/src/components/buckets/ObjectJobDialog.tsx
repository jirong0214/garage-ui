import {useEffect, useMemo, useState} from 'react';
import {ChevronRight, Copy, Folder, Loader2, MoveRight} from 'lucide-react';
import {toast} from 'sonner';
import {objectJobsApi, objectsApi} from '@/lib/api';
import type {Bucket, ObjectJob, ObjectJobOperation, S3Object} from '@/types';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {IconTile} from '@/components/ui/icon-tile';
import {Select, SelectOption} from '@/components/ui/select';

interface ObjectJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operation: Extract<ObjectJobOperation, 'copy' | 'move'>;
  sourceBucket: string;
  objects: string[];
  prefixes: string[];
  destinationBuckets: Bucket[];
  onStarted: (job: ObjectJob) => void;
}

function prefixBreadcrumbs(prefix: string) {
  const segments = prefix.split('/').filter(Boolean);
  return segments.map((label, index) => ({
    label,
    prefix: `${segments.slice(0, index + 1).join('/')}/`,
  }));
}

export function ObjectJobDialog({
  open,
  onOpenChange,
  operation,
  sourceBucket,
  objects,
  prefixes,
  destinationBuckets,
  onStarted,
}: ObjectJobDialogProps) {
  const initialBucket = destinationBuckets.some((bucket) => bucket.name === sourceBucket)
    ? sourceBucket
    : (destinationBuckets[0]?.name ?? '');
  const [destinationBucket, setDestinationBucket] = useState(initialBucket);
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [folders, setFolders] = useState<S3Object[]>([]);
  const [nextToken, setNextToken] = useState<string>();
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const breadcrumbs = useMemo(() => prefixBreadcrumbs(currentPrefix), [currentPrefix]);
  const count = objects.length + prefixes.length;
  const Icon = operation === 'copy' ? Copy : MoveRight;

  useEffect(() => {
    if (!open) return;
    setDestinationBucket(initialBucket);
    setCurrentPrefix('');
    setOverwrite(false);
  }, [initialBucket, open, operation, sourceBucket]);

  useEffect(() => {
    if (!open || !destinationBucket) return;
    let cancelled = false;
    setLoadingFolders(true);
    objectsApi.list(destinationBucket, currentPrefix, 200)
      .then((result) => {
        if (cancelled) return;
        setFolders(result.objects.filter((object) => object.isFolder));
        setNextToken(result.nextContinuationToken);
      })
      .catch(() => {
        if (!cancelled) {
          setFolders([]);
          setNextToken(undefined);
          toast.error('Failed to load destination folders');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFolders(false);
      });
    return () => { cancelled = true; };
  }, [currentPrefix, destinationBucket, open]);

  const loadMore = async () => {
    if (!nextToken || loadingFolders) return;
    setLoadingFolders(true);
    try {
      const result = await objectsApi.list(destinationBucket, currentPrefix, 200, nextToken);
      setFolders((previous) => [
        ...previous,
        ...result.objects.filter((object) => object.isFolder),
      ]);
      setNextToken(result.nextContinuationToken);
    } catch {
      toast.error('Failed to load more folders');
    } finally {
      setLoadingFolders(false);
    }
  };

  const submit = async () => {
    if (!destinationBucket || submitting) return;
    setSubmitting(true);
    try {
      const job = await objectJobsApi.create({
        operation,
        sourceBucket,
        objects,
        prefixes,
        destinationBucket,
        destinationPrefix: currentPrefix,
        conflictPolicy: overwrite ? 'overwrite' : 'skip',
      });
      onStarted(job);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to start ${operation}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="form">
      <DialogContent>
        <DialogHeader>
          <IconTile icon={<Icon />} tone="primary" size="md" />
          <div className="min-w-0 flex-1">
            <DialogTitle>{operation === 'copy' ? 'Copy items' : 'Move items'}</DialogTitle>
            <DialogDescription>
              Choose a destination for {count} selected item{count === 1 ? '' : 's'}.
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Destination bucket</label>
            <Select
              value={destinationBucket}
              onChange={(value) => {
                setDestinationBucket(value);
                setCurrentPrefix('');
              }}
              disabled={submitting}
            >
              {destinationBuckets.map((bucket) => (
                <SelectOption key={bucket.name} value={bucket.name}>{bucket.name}</SelectOption>
              ))}
            </Select>
          </div>

          <div className="overflow-hidden rounded-md border border-[var(--border)]">
            <div className="flex min-h-10 items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-1.5 text-[13px]">
              <button
                type="button"
                className="font-medium hover:text-[var(--primary)]"
                onClick={() => setCurrentPrefix('')}
              >
                {destinationBucket}
              </button>
              {breadcrumbs.map((crumb) => (
                <span key={crumb.prefix} className="flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                  <button
                    type="button"
                    className="whitespace-nowrap font-medium hover:text-[var(--primary)]"
                    onClick={() => setCurrentPrefix(crumb.prefix)}
                  >
                    {crumb.label}
                  </button>
                </span>
              ))}
            </div>
            <div className="max-h-64 min-h-32 overflow-y-auto p-2">
              {loadingFolders && folders.length === 0 ? (
                <div className="flex h-28 items-center justify-center text-[var(--muted-foreground)]">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading folders
                </div>
              ) : folders.length === 0 ? (
                <div className="flex h-28 items-center justify-center text-sm text-[var(--muted-foreground)]">
                  No folders in this location
                </div>
              ) : (
                <div className="space-y-1">
                  {folders.map((folder) => {
                    const label = folder.key.slice(currentPrefix.length).replace(/\/$/, '');
                    return (
                      <button
                        key={folder.key}
                        type="button"
                        onClick={() => setCurrentPrefix(folder.key)}
                        className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-[var(--accent)]"
                      >
                        <Folder className="h-4 w-4 text-[var(--muted-foreground)]" />
                        <span className="truncate">{label}</span>
                        <ChevronRight className="ml-auto h-4 w-4 text-[var(--muted-foreground)]" />
                      </button>
                    );
                  })}
                  {nextToken && (
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => void loadMore()} disabled={loadingFolders}>
                      {loadingFolders && <Loader2 className="animate-spin" />} Load more
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md bg-[var(--surface-sunken)] px-3 py-2">
            <div className="text-xs text-[var(--muted-foreground)]">Destination</div>
            <div className="mt-0.5 break-all font-mono text-[13px]">
              {destinationBucket}/{currentPrefix}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={overwrite} onCheckedChange={setOverwrite} disabled={submitting} />
            Replace existing destination objects
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!destinationBucket || submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <Icon />}
            {operation === 'copy' ? 'Start copy' : 'Start move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
