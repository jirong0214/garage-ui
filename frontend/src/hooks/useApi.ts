import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bucketsApi, objectsApi, accessApi, garageApi, analyticsApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';
import { toast } from 'sonner';
import i18n from '@/i18n';
import type { AccessKeyUpdate, BucketPermission } from '@/types';


export function useBuckets(enabled = true) {
  return useQuery({
    queryKey: queryKeys.buckets.list(),
    queryFn: () => bucketsApi.list(),
    enabled,
  });
}

export function useBucket(name: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.buckets.detail(name),
    queryFn: () => bucketsApi.get(name),
    enabled: enabled && !!name,
  });
}

export function useCreateBucket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, region }: { name: string; region?: string }) =>
      bucketsApi.create(name, region),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      toast.success(i18n.t('buckets:created'));
    },
  });
}

export function useDeleteBucket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => bucketsApi.delete(name, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      toast.success(i18n.t('buckets:deleted'));
    },
  });
}

export function useGrantBucketPermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bucketName, accessKeyId, permissions }: {
      bucketName: string;
      accessKeyId: string;
      permissions: { read: boolean; write: boolean; owner: boolean };
    }) => bucketsApi.grantPermission(bucketName, accessKeyId, permissions),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets.detail(variables.bucketName) });
      queryClient.invalidateQueries({ queryKey: queryKeys.accessKeys.all });
      toast.success(i18n.t('success.permissionsGranted'));
    },
  });
}

export function useUpdateBucketQuotas() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      bucketName,
      maxSize,
      maxObjects,
    }: {
      bucketName: string;
      maxSize: number | null;
      maxObjects: number | null;
    }) => bucketsApi.updateBucketQuotas(bucketName, { maxSize, maxObjects }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets.detail(variables.bucketName) });
      toast.success(i18n.t('buckets:quotaUpdated'));
    },
  });
}


export function useObjects(bucket: string, prefix?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.objects.list(bucket, prefix),
    queryFn: () => objectsApi.list(bucket, prefix),
    enabled: enabled && !!bucket,
  });
}

export function useUploadObject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bucket, key, file }: { bucket: string; key: string; file: File }) =>
      objectsApi.upload(bucket, key, file),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.list(variables.bucket) });
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets.detail(variables.bucket) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      toast.success(i18n.t('success.fileUploaded'));
    },
  });
}

export function useUploadMultipleObjects() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bucket, files }: { bucket: string; files: File[] }) =>
      objectsApi.uploadMultiple(bucket, files),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.list(variables.bucket) });
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets.detail(variables.bucket) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      toast.success(i18n.t('success.filesUploaded'));
    },
  });
}

export function useDeleteObject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bucket, key }: { bucket: string; key: string }) =>
      objectsApi.delete(bucket, key),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.list(variables.bucket) });
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets.detail(variables.bucket) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      toast.success(i18n.t('success.fileDeleted'));
    },
  });
}

export function useDeleteMultipleObjects() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bucket, keys, prefixes }: { bucket: string; keys: string[]; prefixes?: string[] }) =>
      objectsApi.deleteMultiple(bucket, keys, prefixes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objects.list(variables.bucket) });
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets.detail(variables.bucket) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      toast.success(i18n.t('success.filesDeleted', { count: variables.keys.length }));
    },
  });
}


export function useAccessKeys() {
  return useQuery({
    queryKey: queryKeys.accessKeys.list(),
    queryFn: () => accessApi.listKeys(),
  });
}

export function useAccessKey(keyId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.accessKeys.detail(keyId),
    queryFn: () => accessApi.getKey(keyId),
    enabled: enabled && !!keyId,
  });
}

export function useCreateAccessKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, permissions }: { name: string; permissions?: BucketPermission[] }) =>
      accessApi.createKey(name, permissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accessKeys.all });
      toast.success(i18n.t('success.accessKeyCreated'));
    },
  });
}

export function useDeleteAccessKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keyId: string) => accessApi.deleteKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accessKeys.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.buckets.all });
      toast.success(i18n.t('success.accessKeyDeleted'));
    },
  });
}

export function useUpdateAccessKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ keyId, updates }: { keyId: string; updates: AccessKeyUpdate }) =>
      accessApi.updateKey(keyId, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accessKeys.detail(variables.keyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.accessKeys.list() });
      toast.success(i18n.t('success.accessKeyUpdated'));
    },
  });
}


export function useClusterHealth() {
  return useQuery({
    queryKey: queryKeys.cluster.health(),
    queryFn: () => garageApi.getClusterHealth(),
    staleTime: 30 * 1000, // Refresh health every 30 seconds
  });
}

export function useClusterStatus() {
  return useQuery({
    queryKey: queryKeys.cluster.status(),
    queryFn: () => garageApi.getClusterStatus(),
    staleTime: 60 * 1000, // Refresh status every minute
  });
}

export function useClusterStatistics() {
  return useQuery({
    queryKey: queryKeys.cluster.statistics(),
    queryFn: () => garageApi.getClusterStatistics(),
    staleTime: 60 * 1000, // Refresh statistics every minute
  });
}


export function useDashboardMetrics() {
  return useQuery({
    queryKey: queryKeys.dashboard.metrics(),
    queryFn: () => analyticsApi.getMetrics(),
    staleTime: 2 * 60 * 1000, // Refresh dashboard every 2 minutes
  });
}

// Combined hook for dashboard data
export function useDashboardData() {
  const metrics = useDashboardMetrics();
  const buckets = useBuckets();
  const health = useClusterHealth();

  return {
    metrics,
    buckets,
    health,
    isLoading: metrics.isLoading || buckets.isLoading || health.isLoading,
    isError: metrics.isError || buckets.isError || health.isError,
  };
}
