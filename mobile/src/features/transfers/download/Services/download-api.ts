import { getObjectPresignedUrl } from '@garage-ui/api-client';

import {
  authenticatedClient,
  authorizationHeaders,
} from '@/features/auth/session/Services/session-service';
import type { ServerProfile } from '@/features/server/configuration/server-model';
import { toApiError } from '@/infrastructure/api/api-error';

export async function mintDownloadUrl(
  profile: ServerProfile,
  bucket: string,
  key: string,
): Promise<string> {
  const result = await getObjectPresignedUrl({
    client: authenticatedClient(profile),
    headers: await authorizationHeaders(profile),
    path: { bucket },
    query: { key, expires_in: 3600 },
  });
  if (result.error || !result.response?.ok || !result.data?.success || !result.data.data?.url) {
    throw toApiError(result.error ?? result.data, result.response);
  }
  return new URL(result.data.data.url, profile.baseUrl).toString();
}
