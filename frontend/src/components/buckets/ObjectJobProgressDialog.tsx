import {useEffect, useRef, useState} from 'react';
import axios from 'axios';
import {CheckCircle2, Loader2, OctagonX, StopCircle, TriangleAlert} from 'lucide-react';
import {objectJobsApi} from '@/lib/api';
import {formatBytes} from '@/lib/file-utils';
import type {ObjectJob} from '@/types';
import {Button} from '@/components/ui/button';
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

const terminalStatuses = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled']);

interface ObjectJobProgressDialogProps {
  jobId: string | null;
  onClose: () => void;
  onCompleted: (job: ObjectJob) => void;
}

export function ObjectJobProgressDialog({jobId, onClose, onCompleted}: ObjectJobProgressDialogProps) {
  const [job, setJob] = useState<ObjectJob | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const completedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      completedRef.current = undefined;
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await objectJobsApi.get(jobId);
        if (cancelled) return;
        setJob(next);
        if (terminalStatuses.has(next.status)) {
          if (completedRef.current !== next.id) {
            completedRef.current = next.id;
            onCompleted(next);
          }
          return;
        }
        timer = setTimeout(poll, 800);
      } catch (error) {
        if (!cancelled) {
          if (axios.isAxiosError(error) && error.response?.status === 404) {
            onClose();
            return;
          }
          timer = setTimeout(poll, 2000);
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, onClose, onCompleted]);

  if (!jobId) return null;
  const terminal = job ? terminalStatuses.has(job.status) : false;
  const scanning = !job || job.status === 'queued' || job.status === 'scanning';
  const progress = Math.max(0, Math.min(100, job?.progress ?? 0));
  const tone = job?.status === 'completed'
    ? 'primary'
    : job?.status === 'completed_with_errors' || job?.status === 'failed'
      ? 'destructive'
      : 'primary';
  const StatusIcon = job?.status === 'completed'
    ? CheckCircle2
    : job?.status === 'completed_with_errors'
      ? TriangleAlert
      : job?.status === 'failed' || job?.status === 'cancelled'
        ? OctagonX
        : Loader2;

  const cancel = async () => {
    if (!job || terminal || cancelling) return;
    setCancelling(true);
    try {
      setJob(await objectJobsApi.cancel(job.id));
    } catch {
      // The shared API interceptor presents the server error.
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && terminal) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <IconTile icon={<StatusIcon className={!terminal ? 'animate-spin' : ''} />} tone={tone} size="md" />
          <div className="min-w-0 flex-1">
            <DialogTitle>{job ? `${job.operation[0].toUpperCase()}${job.operation.slice(1)} items` : 'Preparing operation'}</DialogTitle>
            <DialogDescription>
              {scanning ? 'Scanning selected folders…' : job?.status.replaceAll('_', ' ')}
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span>{scanning ? 'Discovering objects' : `${job?.processed ?? 0} of ${job?.discovered ?? 0}`}</span>
              {!scanning && <span className="font-medium">{Math.round(progress)}%</span>}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <div
                className={`h-full rounded-full bg-[var(--primary)] transition-[width] duration-300 ${scanning ? 'w-1/3 animate-pulse' : ''}`}
                style={scanning ? undefined : {width: `${progress}%`}}
              />
            </div>
          </div>
          {job && (
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Succeeded" value={job.succeeded} />
              <Stat label="Skipped" value={job.skipped} />
              <Stat label="Failed" value={job.failed} />
              <Stat label="Processed" value={formatBytes(job.bytesProcessed)} />
            </div>
          )}
          {job?.currentKey && (
            <div className="truncate font-mono text-xs text-[var(--muted-foreground)]" title={job.currentKey}>
              {job.currentKey}
            </div>
          )}
          {job?.error && (
            <div className="rounded-md border border-[var(--destructive)]/40 bg-[var(--destructive)]/5 px-3 py-2 text-sm text-[var(--destructive)]">
              {job.error}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {terminal ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <Button variant="secondary" onClick={() => void cancel()} disabled={!job || cancelling}>
              {cancelling ? <Loader2 className="animate-spin" /> : <StopCircle />}
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({label, value}: {label: string; value: string | number}) {
  return (
    <div className="rounded-md bg-[var(--surface-sunken)] px-3 py-2">
      <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
      <div className="mt-0.5 font-semibold">{value}</div>
    </div>
  );
}
