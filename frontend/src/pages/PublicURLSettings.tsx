import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Globe2 } from 'lucide-react';
import { settingsApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';
import { useBuckets } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from 'sonner';

export function PublicURLSettings() {
  const queryClient = useQueryClient();
  const { data: buckets = [] } = useBuckets();
  const { data: settings, isLoading } = useQuery({
    queryKey: queryKeys.settings.publicURLs(),
    queryFn: settingsApi.getPublicURLs,
  });
  const [template, setTemplate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setTemplate(settings.template);
  }, [settings]);

  const placeholderCount = useMemo(
    () => template.split('{bucket}').length - 1,
    [template],
  );
  const templateValid = template.trim() === '' || placeholderCount === 1;
  const changed = settings !== undefined && template !== settings.template;

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await settingsApi.updatePublicURLs({
        template,
        overrides: settings.overrides,
      });
      queryClient.setQueryData(queryKeys.settings.publicURLs(), updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.buckets.all });
      toast.success('Public URL settings updated');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Public URLs" />
      <div className="space-y-7 px-6 py-6">
        <section className="max-w-3xl border border-[var(--border)] bg-[var(--card)]">
          <header className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3">
            <Globe2 className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="text-[15px] font-semibold">Default URL template</h2>
          </header>
          <div className="space-y-2 px-5 py-5">
            <label htmlFor="public-url-template" className="text-[13.5px] font-medium">URL template</label>
            <Input
              id="public-url-template"
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              placeholder="https://{bucket}.example.com"
              disabled={isLoading}
            />
            {!templateValid && (
              <p className="text-[12.5px] text-[var(--destructive)]">
                The template must contain {'{bucket}'} exactly once.
              </p>
            )}
            {templateValid && template && (
              <p className="break-all text-[12.5px] text-[var(--muted-foreground)]">
                {template.replace('{bucket}', 'example-bucket')}
              </p>
            )}
          </div>
          <footer className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-sunken)] px-5 py-3">
            <Button
              variant="secondary"
              onClick={() => setTemplate(settings?.template ?? '')}
              disabled={!changed || saving}
            >
              Reset
            </Button>
            <Button onClick={handleSave} disabled={!changed || !templateValid || saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </footer>
        </section>

        <section>
          <h2 className="mb-3 text-[15px] font-semibold">Buckets</h2>
          <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {[...buckets].sort((a, b) => a.name.localeCompare(b.name)).map((bucket) => {
              const hasOverride = Object.prototype.hasOwnProperty.call(settings?.overrides ?? {}, bucket.name);
              const override = settings?.overrides[bucket.name];
              const mode = !hasOverride ? 'Inherited' : override ? 'Custom' : 'Disabled';
              const effectiveURL = !hasOverride
                ? template.replace('{bucket}', bucket.name)
                : override ?? '';
              return (
                <div key={bucket.name} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.5fr)_auto] sm:items-center sm:gap-4">
                  <span className="truncate text-[13.5px] font-medium">{bucket.name}</span>
                  <Badge variant={mode === 'Disabled' ? 'neutral' : 'primary'}>{mode}</Badge>
                  <span className="min-w-0 truncate text-[12.5px] text-[var(--muted-foreground)]">
                    {effectiveURL || 'No public URL'}
                  </span>
                  <Link
                    to={`/buckets/${encodeURIComponent(bucket.name)}/website`}
                    className="inline-flex h-8 items-center gap-1.5 text-[12.5px] font-medium text-[var(--primary)] hover:underline"
                  >
                    Configure <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
