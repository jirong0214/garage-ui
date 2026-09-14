import { ShieldOff } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useTranslation } from 'react-i18next';

/** Shown to authenticated users whose identity matches no team. */
export function NoAccess() {
  const { t } = useTranslation('auth');
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-6">
      <EmptyState
        icon={<ShieldOff />}
        tone="neutral"
        title={t('noAccess.title')}
        description={t('noAccess.description')}
      />
    </div>
  );
}
