import {useEffect, useMemo, useState} from 'react';
import {Copy, Loader2, MoveRight, Pencil} from 'lucide-react';
import {toast} from 'sonner';
import {objectsApi} from '@/lib/api';
import {queryClient, queryKeys} from '@/lib/query-client';
import type {Bucket, ObjectTransferResult} from '@/types';
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
import {Input} from '@/components/ui/input';
import {Select, SelectOption} from '@/components/ui/select';

export type ObjectTransferMode = 'copy' | 'move' | 'rename';

interface ObjectTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ObjectTransferMode;
  sourceBucket: string;
  sourceKey: string;
  destinationBuckets: Bucket[];
  onCompleted?: (result: ObjectTransferResult) => void;
}

const modeContent = {
  copy: {title: 'Copy object', action: 'Copy', icon: Copy},
  move: {title: 'Move object', action: 'Move', icon: MoveRight},
  rename: {title: 'Rename object', action: 'Rename', icon: Pencil},
} as const;

function splitObjectKey(key: string) {
  const slash = key.lastIndexOf('/');
  return {
    directory: slash >= 0 ? key.slice(0, slash + 1) : '',
    name: slash >= 0 ? key.slice(slash + 1) : key,
  };
}

function ObjectTransferDialogInstance({
  open,
  onOpenChange,
  mode,
  sourceBucket,
  sourceKey,
  destinationBuckets,
  onCompleted,
}: ObjectTransferDialogProps) {
  const source = useMemo(() => splitObjectKey(sourceKey), [sourceKey]);
  const initialBucket = destinationBuckets.some((bucket) => bucket.name === sourceBucket)
    ? sourceBucket
    : (destinationBuckets[0]?.name ?? '');
  const [destinationBucket, setDestinationBucket] = useState(initialBucket);
  const [destinationKey, setDestinationKey] = useState(sourceKey);
  const [newName, setNewName] = useState(source.name);
  const [overwrite, setOverwrite] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDestinationBucket(initialBucket);
    setDestinationKey(sourceKey);
    setNewName(source.name);
    setOverwrite(false);
  }, [initialBucket, open, source.name, sourceKey]);

  const normalizedDestinationKey = mode === 'rename'
    ? `${source.directory}${newName.trim()}`
    : destinationKey.trim().replace(/^\/+/, '');
  const normalizedDestinationBucket = mode === 'rename' ? sourceBucket : destinationBucket;
  const sameObject = normalizedDestinationBucket === sourceBucket && normalizedDestinationKey === sourceKey;
  const renameInvalid = mode === 'rename' && (!newName.trim() || newName.includes('/'));
  const invalid = !normalizedDestinationBucket || !normalizedDestinationKey || sameObject || renameInvalid;
  const content = modeContent[mode];
  const Icon = content.icon;

  const submit = async () => {
    if (invalid || submitting) return;
    setSubmitting(true);
    try {
      const request = {
        sourceKey,
        destinationBucket: normalizedDestinationBucket,
        destinationKey: normalizedDestinationKey,
        overwrite,
      };
      const result = mode === 'copy'
        ? await objectsApi.copy(sourceBucket, request)
        : await objectsApi.move(sourceBucket, request);
      await Promise.all([
        queryClient.invalidateQueries({queryKey: queryKeys.objects.all}),
        queryClient.invalidateQueries({queryKey: queryKeys.buckets.all}),
        queryClient.invalidateQueries({queryKey: queryKeys.dashboard.all}),
      ]);
      toast.success(mode === 'copy' ? 'Object copied' : mode === 'rename' ? 'Object renamed' : 'Object moved');
      onCompleted?.(result);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${mode} object`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <IconTile icon={<Icon />} tone="primary" size="md" />
          <div className="min-w-0 flex-1">
            <DialogTitle>{content.title}</DialogTitle>
            <DialogDescription className="break-all">{sourceBucket}/{sourceKey}</DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {mode === 'rename' ? (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="object-new-name">New name</label>
              <Input
                id="object-new-name"
                autoFocus
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
              />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Destination bucket</label>
                <Select value={destinationBucket} onChange={setDestinationBucket} disabled={submitting}>
                  {destinationBuckets.map((bucket) => (
                    <SelectOption key={bucket.name} value={bucket.name}>{bucket.name}</SelectOption>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="object-destination-key">Destination path</label>
                <Input
                  id="object-destination-key"
                  autoFocus
                  className="font-mono text-[13px]"
                  value={destinationKey}
                  onChange={(event) => setDestinationKey(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
                />
              </div>
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={overwrite}
              onCheckedChange={setOverwrite}
              disabled={submitting}
            />
            Replace an existing destination object
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={invalid || submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <Icon />}
            {content.action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ObjectTransferDialog(props: ObjectTransferDialogProps) {
  if (!props.open) return null;
  return <ObjectTransferDialogInstance key={`${props.mode}\0${props.sourceBucket}\0${props.sourceKey}`} {...props} />;
}
