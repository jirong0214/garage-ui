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
import { useTranslation } from 'react-i18next';

interface ShareObjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bucketName: string;
  objectKey: string;
}

function ShareObjectDialogInstance({ open, onOpenChange, bucketName, objectKey }: ShareObjectDialogProps) {
  const { t } = useTranslation(['objects', 'common']);
  const expiryOptions = [
    { value: '900', label: t('objects:expiration.minutes15') },
    { value: '3600', label: t('objects:expiration.hour') },
    { value: '86400', label: t('objects:expiration.hours24') },
    { value: '604800', label: t('objects:expiration.days7') },
  ];
  const [expiresIn, setExpiresIn] = useState('3600');
  const [loading, setLoading] = useState(false);
  const [signedURL, setSignedURL] = useState('');

  const generateSignedURL = async () => {
    try {
      setLoading(true);
      const url = await objectsApi.getPresignedUrl(bucketName, objectKey, Number(expiresIn));
      setSignedURL(url);
      toast.success(t('objects:signedUrlCreated'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('objects:signedUrlFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await copyText(signedURL);
      toast.success(t('objects:signedUrlCopied'));
    } catch {
      toast.error(t('common:errors.copyFailed'));
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
            <DialogTitle>{t('objects:signedUrl')}</DialogTitle>
            <DialogDescription className="break-all">{objectKey}</DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="text-[13px] font-medium text-[var(--foreground)]">
            {t('objects:expiresIn')}
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
                aria-label={t('objects:signedUrl')}
                className="min-w-0 font-mono text-[12px]"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label={t('objects:copySignedUrl')}
                title={t('objects:copySignedUrl')}
                onClick={handleCopy}
              >
                <Copy />
              </Button>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>{t('common:actions.cancel')}</Button>
          <Button onClick={generateSignedURL} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Link2 />}
            {signedURL ? t('objects:regenerateUrl') : t('objects:generateUrl')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ShareObjectDialog(props: ShareObjectDialogProps) {
  if (!props.open) return null;

  return (
    <ShareObjectDialogInstance
      key={`${props.bucketName}\0${props.objectKey}`}
      {...props}
    />
  );
}
