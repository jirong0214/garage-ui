import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { objectsApi } from '@/lib/api';
import { copyText } from '@/lib/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectOption } from '@/components/ui/select';

interface ShareObjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bucketName: string;
  objectKey: string;
}

const expiryOptions = [
  { value: '900', label: '15 minutes' },
  { value: '3600', label: '1 hour' },
  { value: '86400', label: '24 hours' },
  { value: '604800', label: '7 days' },
];

export function ShareObjectDialog({ open, onOpenChange, bucketName, objectKey }: ShareObjectDialogProps) {
  const [expiresIn, setExpiresIn] = useState('3600');
  const [loading, setLoading] = useState(false);

  const copySignedURL = async () => {
    try {
      setLoading(true);
      const url = await objectsApi.getPresignedUrl(bucketName, objectKey, Number(expiresIn));
      await copyText(url);
      toast.success('Signed URL copied');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create signed URL');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="standard">
      <DialogContent>
        <DialogHeader>
          <div>
            <DialogTitle>Signed URL</DialogTitle>
            <DialogDescription className="break-all">{objectKey}</DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="text-[13px] font-medium text-[var(--foreground)]">
            Expires in
          </div>
          <div>
            <Select value={expiresIn} onChange={setExpiresIn} disabled={loading}>
              {expiryOptions.map((option) => (
                <SelectOption key={option.value} value={option.value}>{option.label}</SelectOption>
              ))}
            </Select>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={copySignedURL} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Link2 />}
            Create and copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
