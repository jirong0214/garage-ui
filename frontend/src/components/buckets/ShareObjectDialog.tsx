import { useState } from 'react';
import { Copy, Link2, Loader2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';

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
  const [signedURL, setSignedURL] = useState('');

  const generateSignedURL = async () => {
    try {
      setLoading(true);
      const url = await objectsApi.getPresignedUrl(bucketName, objectKey, Number(expiresIn));
      setSignedURL(url);
      toast.success('Signed URL created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create signed URL');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await copyText(signedURL);
      toast.success('Signed URL copied');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleExpiryChange = (value: string) => {
    setExpiresIn(value);
    setSignedURL('');
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
            <Select value={expiresIn} onChange={handleExpiryChange} disabled={loading}>
              {expiryOptions.map((option) => (
                <SelectOption key={option.value} value={option.value}>{option.label}</SelectOption>
              ))}
            </Select>
          </div>
          {signedURL && (
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={signedURL}
                aria-label="Signed URL"
                className="min-w-0 font-mono text-[12px]"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Copy signed URL"
                title="Copy signed URL"
                onClick={handleCopy}
              >
                <Copy />
              </Button>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={generateSignedURL} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Link2 />}
            {signedURL ? 'Regenerate URL' : 'Generate URL'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
