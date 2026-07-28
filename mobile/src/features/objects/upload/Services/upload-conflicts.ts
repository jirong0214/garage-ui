import { headObject } from '@garage-ui/api-client';

import {
  authenticatedClient,
  authorizationHeaders,
} from '@/features/auth/session/Services/session-service';
import type { ServerProfile } from '@/features/server/configuration/server-model';
import { toApiError } from '@/infrastructure/api/api-error';

import { keepBothObjectName, uploadObjectKey } from '../Utils/upload-object-key';

export async function uploadObjectExists(
  profile: ServerProfile,
  bucket: string,
  key: string,
): Promise<boolean> {
  const result = await headObject({
    client: authenticatedClient(profile),
    headers: await authorizationHeaders(profile),
    path: { bucket },
    query: { key },
  });
  if (result.response?.status === 404) return false;
  if (result.response?.ok) return true;
  throw toApiError(result.error, result.response);
}

export async function nextAvailableUploadName(
  profile: ServerProfile,
  bucket: string,
  prefix: string,
  fileName: string,
): Promise<string> {
  for (let sequence = 1; sequence <= 999; sequence += 1) {
    const candidate = keepBothObjectName(fileName, sequence);
    if (!(await uploadObjectExists(profile, bucket, uploadObjectKey(prefix, candidate)))) {
      return candidate;
    }
  }
  throw new Error('Could not find an available file name.');
}
