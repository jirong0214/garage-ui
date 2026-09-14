import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function LoadingSpinner() {
  const { t } = useTranslation('common');
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t('status.loading')}</p>
      </div>
    </div>
  );
}
