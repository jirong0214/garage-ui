import { describe, expect, it } from 'vitest';

import { bucketAuthorization, canReceiveObjects } from './bucket-permissions';

describe('bucketAuthorization', () => {
  it('grants every object action to an admin', () => {
    expect(bucketAuthorization(undefined, { enabled: true, is_admin: true })).toEqual({
      canList: true,
      canRead: true,
      canWrite: true,
      canDelete: true,
    });
  });

  it('uses the server-computed effective permissions for scoped users', () => {
    expect(
      bucketAuthorization(
        { effective_permissions: ['object.list', 'object.read'] },
        { enabled: true, is_admin: false },
      ),
    ).toEqual({ canList: true, canRead: true, canWrite: false, canDelete: false });
  });

  it('requires read and write on a destination bucket', () => {
    expect(
      canReceiveObjects(
        { effective_permissions: ['object.read', 'object.write'] },
        { enabled: true },
      ),
    ).toBe(true);
    expect(
      canReceiveObjects(
        { effective_permissions: ['object.write'] },
        { enabled: true },
      ),
    ).toBe(false);
  });
});
