import { NavLink, Outlet, useMatch, useParams } from 'react-router-dom';
import { Database, Copy, Upload } from 'lucide-react';
import { IconTile } from '@/components/ui/icon-tile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, copyText } from '@/lib/utils';
import { useBuckets } from '@/hooks/useApi';
import { useBucketCan } from '@/hooks/usePermissions';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';

interface TabSpec {
  to: string;
  labelKey: 'tabs.objects' | 'tabs.permissions' | 'tabs.website' | 'tabs.settings';
  end?: boolean;
  perms?: string[];
}

const tabs: TabSpec[] = [
  { to: 'objects', labelKey: 'tabs.objects', perms: ['object.list'] },
  { to: 'permissions', labelKey: 'tabs.permissions', perms: ['permission.allow_bucket_key', 'permission.deny_bucket_key'] },
  { to: 'website', labelKey: 'tabs.website', perms: ['bucket.update'] },
  { to: 'settings', labelKey: 'tabs.settings', perms: ['bucket.update'] },
];

function formatBytes(n?: number) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  for (const u of units) {
    if (v < 1024) return `${v.toFixed(v >= 10 ? 0 : 1)} ${u}`;
    v /= 1024;
  }
  return `${v.toFixed(0)} PB`;
}

export function BucketDetailShell() {
  const { t } = useTranslation(['buckets', 'common']);
  const { bucketName = '' } = useParams<{ bucketName: string }>();
  const { data: buckets = [] } = useBuckets();
  const bucket = buckets.find((b) => b.name === bucketName);
  const isObjectsTab = useMatch('/buckets/:bucketName/objects') !== null;
  const canBucket = useBucketCan();
  const visibleTabs = tabs.filter((t) => !t.perms || t.perms.every((p) => canBucket(bucket, p)));

  const s3Url = `s3://${bucketName}`;
  const copyUrl = async () => {
    try {
      await copyText(s3Url);
      toast.success(t('buckets:urlCopied'));
    } catch {
      toast.error(t('common:errors.copyFailed'));
    }
  };

  return (
    <div className="flex flex-col">
      {/* Bucket summary */}
      <section className="px-7 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <IconTile icon={<Database />} tone="primary" />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1">
                <p className="truncate font-mono text-[13.5px] text-[var(--muted-foreground)]">{s3Url}</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={copyUrl}
                        aria-label={t('buckets:copyUrl')}
                      >
                        <Copy />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('buckets:copyUrl')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge variant="success">{t('buckets:active')}</Badge>
                {bucket?.objectCount != null && <Badge>{t('common:count.object', { count: bucket.objectCount })}</Badge>}
                {bucket?.size != null && <Badge>{formatBytes(bucket.size)}</Badge>}
              </div>
            </div>
          </div>
          {isObjectsTab && canBucket(bucket, 'object.write') && (
            <Button
              variant="primary"
              className="shrink-0"
              onClick={() => document.dispatchEvent(new CustomEvent('bucket:upload'))}
            >
              <Upload /> {t('common:actions.upload')}
            </Button>
          )}
        </div>
      </section>

      {/* Tabs */}
      <nav className="flex h-12 items-center gap-0 border-b border-[var(--border)] px-7">
        {visibleTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'relative -mb-px inline-flex h-12 items-center px-3.5 text-[14px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-sm',
                isActive
                  ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]'
                  : 'text-[var(--muted-foreground)] border-b-2 border-transparent hover:text-[var(--foreground)]',
              )
            }
          >
            {t(`buckets:${tab.labelKey}`)}
          </NavLink>
        ))}
      </nav>

      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
