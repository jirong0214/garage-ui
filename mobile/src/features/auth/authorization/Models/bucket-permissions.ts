import type {
  ModelsAccessControlCapabilities,
  ModelsBucketInfo,
} from '@garage-ui/api-client';

export type ObjectPermission = 'object.list' | 'object.read' | 'object.write' | 'object.delete';

export type BucketAuthorization = {
  canList: boolean;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
};

const allObjectPermissions: readonly ObjectPermission[] = [
  'object.list',
  'object.read',
  'object.write',
  'object.delete',
];

export function bucketAuthorization(
  bucket: Pick<ModelsBucketInfo, 'effective_permissions'> | undefined,
  accessControl: ModelsAccessControlCapabilities | undefined,
): BucketAuthorization {
  const permissions = effectiveObjectPermissions(bucket, accessControl);
  return {
    canList: permissions.has('object.list'),
    canRead: permissions.has('object.read'),
    canWrite: permissions.has('object.write'),
    canDelete: permissions.has('object.delete'),
  };
}

export function effectiveObjectPermissions(
  bucket: Pick<ModelsBucketInfo, 'effective_permissions'> | undefined,
  accessControl: ModelsAccessControlCapabilities | undefined,
): ReadonlySet<ObjectPermission> {
  if (accessControl?.is_admin || accessControl?.enabled === false) {
    return new Set(allObjectPermissions);
  }

  return new Set(
    (bucket?.effective_permissions ?? []).filter(isObjectPermission),
  );
}

export function canReceiveObjects(
  bucket: Pick<ModelsBucketInfo, 'effective_permissions'>,
  accessControl: ModelsAccessControlCapabilities | undefined,
): boolean {
  const authorization = bucketAuthorization(bucket, accessControl);
  return authorization.canRead && authorization.canWrite;
}

function isObjectPermission(value: string): value is ObjectPermission {
  return allObjectPermissions.includes(value as ObjectPermission);
}
