import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useBuckets, useCreateBucket, useDeleteBucket } from '@/hooks/useApi';
import { usePermissions } from '@/hooks/usePermissions';
import { BucketListView } from '@/components/buckets/BucketListView';
import { CreateBucketDialog } from '@/components/buckets/CreateBucketDialog';
import { DangerousConfirmDialog } from '@/components/ui/dangerous-confirm-dialog';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import type { Bucket } from '@/types';
import { useTranslation } from 'react-i18next';

export function Buckets() {
  const { t } = useTranslation(['buckets', 'common']);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Bucket | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { hasAnyPerm } = usePermissions();
  const { data: buckets = [], isLoading } = useBuckets();
  const createMutation = useCreateBucket();
  const deleteMutation = useDeleteBucket();

  const createBucket = async (name: string, region?: string) => {
    try {
      await createMutation.mutateAsync({ name, region });
      return true;
    } catch {
      return false;
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMutation.mutateAsync(deleteTarget.name);
      setDeleteTarget(null);
    } catch {
      // error toast handled by axios interceptor
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('buckets:title')}
        subtitle={t('common:count.bucket', { count: buckets.length })}
        actions={
          hasAnyPerm('bucket.create') && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> {t('buckets:create')}
            </Button>
          )
        }
      />
      <div className="p-4 sm:p-6">
        <BucketListView
          buckets={buckets}
          searchQuery={searchQuery}
          isLoading={isLoading}
          onSearchChange={setSearchQuery}
          onViewBucket={(name) => navigate(`/buckets/${name}/objects`)}
          onOpenSettings={(b) => navigate(`/buckets/${b.name}/settings`)}
          onWebsiteSettings={(b) => navigate(`/buckets/${b.name}/website`)}
          onDeleteBucket={(b) => setDeleteTarget(b)}
        />
      </div>

      <CreateBucketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreateBucket={createBucket}
      />

      <DangerousConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={deleteTarget ? t('buckets:deleteTitle', { name: deleteTarget.name }) : ''}
        description={deleteTarget
          ? t('buckets:deleteDescription', { count: deleteTarget.objectCount ?? 0 })
          : undefined}
        confirmationText={deleteTarget?.name ?? ''}
        confirmLabel={t('buckets:delete')}
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
