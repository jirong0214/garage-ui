import { useState } from 'react';
import { FolderPlus } from 'lucide-react';
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

interface CreateDirectoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath: string;
  onCreateDirectory: (name: string) => Promise<boolean>;
}

export function CreateDirectoryDialog({ open, onOpenChange, currentPath, onCreateDirectory }: CreateDirectoryDialogProps) {
  const { t } = useTranslation(['objects', 'common']);
  const [dirName, setDirName] = useState('');

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setDirName('');
    onOpenChange(nextOpen);
  };

  const handleCreate = async () => {
    if (!dirName) {
      toast.error(t('objects:directoryRequired'));
      return;
    }

    const success = await onCreateDirectory(dirName);
    if (success) {
      setDirName('');
      handleOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <IconTile icon={<FolderPlus />} tone="primary" size="md" />
          <div className="flex-1">
            <DialogTitle>{t('objects:createDirectory')}</DialogTitle>
            <DialogDescription>
              {t('objects:createDirectoryIn', { path: currentPath || t('objects:root') })}
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('objects:directoryName')}</label>
            <Input
              autoFocus
              placeholder={t('objects:directoryPlaceholder')}
              value={dirName}
              onChange={(e) => setDirName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreate();
                }
              }}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => handleOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={!dirName}>
            {t('common:actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
