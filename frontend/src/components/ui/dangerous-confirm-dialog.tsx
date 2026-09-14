import * as React from 'react';
import { Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { IconTile } from './icon-tile';
import { Button } from './button';
import { Input } from './input';
import { Trans, useTranslation } from 'react-i18next';

interface DangerousConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Exact string the user must type to enable the confirm button. */
  confirmationText: string;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: React.ReactNode;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function DangerousConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmationText,
  confirmLabel,
  cancelLabel,
  icon,
  loading = false,
  onConfirm,
}: DangerousConfirmDialogProps) {
  const { t } = useTranslation('common');
  const [value, setValue] = React.useState('');
  React.useEffect(() => { if (!open) setValue(''); }, [open]);

  const matches = value === confirmationText;

  const submit = () => { if (matches && !loading) onConfirm(); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="destructive">
      <DialogContent>
        <DialogHeader>
          <IconTile icon={icon ?? <Trash2 />} tone="destructive" size="md" />
          <div className="flex-1">
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-[13.5px] text-[var(--muted-foreground)]">
            <Trans
              ns="common"
              i18nKey="dialog.typeToConfirm"
              values={{ value: confirmationText }}
              components={{ code: <code className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 font-mono text-[13px] text-[var(--foreground)]" /> }}
            />
          </p>
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={confirmationText}
            aria-label={t('dialog.typeValue', { value: confirmationText })}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel ?? t('actions.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={!matches || loading}
          >
            {loading ? t('actions.working') : (confirmLabel ?? t('actions.delete'))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
