import { useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IconTile } from '@/components/ui/icon-tile';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface CreateBucketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateBucket: (name: string) => Promise<boolean>;
}

export function CreateBucketDialog({ open, onOpenChange, onCreateBucket }: CreateBucketDialogProps) {
  const { t } = useTranslation(['buckets', 'common']);
  const [bucketName, setBucketName] = useState('');

  useEffect(() => { if (!open) setBucketName(''); }, [open]);

  const handleCreate = async () => {
    if (!bucketName) {
      toast.error(t('buckets:bucketNameRequired'));
      return;
    }

    const success = await onCreateBucket(bucketName);
    if (success) {
      setBucketName('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <IconTile icon={<Database />} tone="primary" size="md" />
          <div className="flex-1">
            <DialogTitle>{t('buckets:createTitle')}</DialogTitle>
            <DialogDescription>
              {t('buckets:createDialogDescription')}
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('buckets:bucketName')}</label>
            <Input
              autoFocus
              placeholder={t('buckets:bucketNamePlaceholder')}
              value={bucketName}
              onChange={(e) => setBucketName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreate();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              {t('buckets:bucketNameHelp')}
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={!bucketName}
          >
            {t('common:actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
