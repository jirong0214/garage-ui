import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Globe } from 'lucide-react';
import { useBuckets } from '@/hooks/useApi';
import { bucketsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export function BucketWebsite() {
  const { t } = useTranslation(['buckets', 'common']);
  const { bucketName = '' } = useParams<{ bucketName: string }>();
  const queryClient = useQueryClient();
  const { data: buckets = [], isLoading } = useBuckets();
  const bucket = buckets.find((b) => b.name === bucketName);

  const [enabled, setEnabled] = useState(false);
  const [indexDocument, setIndexDocument] = useState('index.html');
  const [errorDocument, setErrorDocument] = useState('');
  const [saving, setSaving] = useState(false);

  // Sync local form state whenever the underlying bucket changes.
  useEffect(() => {
    if (!bucket) return;
    setEnabled(bucket.websiteAccess);
    setIndexDocument(bucket.websiteConfig?.indexDocument ?? 'index.html');
    setErrorDocument(bucket.websiteConfig?.errorDocument ?? '');
  }, [bucket]);

  if (isLoading) {
    return <div className="px-7 py-6 text-[13.5px] text-[var(--muted-foreground)]">{t('common:status.loading')}</div>;
  }
  if (!bucket) {
    return (
      <div className="px-7 py-6">
        <EmptyState
          icon={<AlertTriangle />}
          tone="neutral"
          title={t('buckets:notFound')}
          description={t('buckets:notFoundDescription')}
        />
      </div>
    );
  }

  const wasEnabled = bucket.websiteAccess;
  const disabling = wasEnabled && !enabled;

  const handleReset = () => {
    setEnabled(bucket.websiteAccess);
    setIndexDocument(bucket.websiteConfig?.indexDocument ?? 'index.html');
    setErrorDocument(bucket.websiteConfig?.errorDocument ?? '');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await bucketsApi.updateBucketWebsite(bucketName, {
        enabled,
        indexDocument: enabled ? indexDocument : undefined,
        errorDocument: enabled && errorDocument ? errorDocument : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ['buckets'] });
      toast.success(disabling ? t('buckets:websiteConfig.disabled') : t('buckets:websiteConfig.updated'));
    } catch {
      // error toast handled by axios interceptor
    } finally {
      setSaving(false);
    }
  };

  const saveDisabled = saving || (enabled && !indexDocument);

  return (
    <div className="px-7 py-6">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <header className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3">
          <Globe className="h-4 w-4 text-[var(--primary)]" />
          <h2 className="text-[15px] font-semibold">{t('buckets:websiteConfig.title')}</h2>
        </header>

        <div className="space-y-6 px-5 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[14px] font-medium">{t('buckets:websiteConfig.access')}</p>
              <p className="mt-0.5 text-[12.5px] text-[var(--muted-foreground)]">
                {t('buckets:websiteConfig.accessDescription')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={enabled ? 'primary' : 'neutral'}>
                {enabled ? t('common:status.enabled') : t('common:status.disabled')}
              </Badge>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>

          {enabled && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[13.5px] font-medium">
                  {t('buckets:websiteConfig.indexDocument')} <span className="text-[var(--destructive)]">*</span>
                </label>
                <Input
                  value={indexDocument}
                  onChange={(e) => setIndexDocument(e.target.value)}
                  placeholder="index.html"
                />
                <p className="text-[12.5px] text-[var(--muted-foreground)]">
                  {t('buckets:websiteConfig.indexHelp')}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[13.5px] font-medium">{t('buckets:websiteConfig.errorDocument')}</label>
                <Input
                  value={errorDocument}
                  onChange={(e) => setErrorDocument(e.target.value)}
                  placeholder={t('buckets:websiteConfig.errorPlaceholder')}
                />
                <p className="text-[12.5px] text-[var(--muted-foreground)]">
                  {t('buckets:websiteConfig.errorHelp')}
                </p>
              </div>

              <div className="border-t border-[var(--border)] pt-4">
                <p className="text-[13.5px] font-medium">{t('buckets:websiteConfig.publicUrl')}</p>
                <p className="mt-1 break-all text-[12.5px] text-[var(--muted-foreground)]">
                  {bucket.publicUrl || t('buckets:websiteConfig.urlPending')}
                </p>
              </div>
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-sunken)] px-5 py-3">
          <Button variant="secondary" onClick={handleReset} disabled={saving}>{t('buckets:reset')}</Button>
          <Button
            onClick={handleSave}
            variant={disabling ? 'destructive' : 'primary'}
            disabled={saveDisabled}
          >
            {saving ? t('common:actions.saving') : disabling ? t('buckets:websiteConfig.disable') : t('buckets:saveChanges')}
          </Button>
        </footer>
      </section>
    </div>
  );
}
