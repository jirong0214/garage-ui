import {
  postApiV1BucketsByBucketObjectsMove,
  type ModelsObjectTransferResponse,
} from '@garage-ui/api-client';

import {
  authenticatedClient,
  authorizationHeaders,
} from '@/features/auth/session/Services/session-service';
import type { ServerProfile } from '@/features/server/configuration/server-model';
import { toApiError } from '@/infrastructure/api/api-error';

type Result = { data?: unknown; error?: unknown; response?: Response };

export async function renameObject(
  profile: ServerProfile,
  bucket: string,
  sourceKey: string,
  destinationKey: string,
): Promise<ModelsObjectTransferResponse> {
  const result = await postApiV1BucketsByBucketObjectsMove({
    client: authenticatedClient(profile),
    headers: await authorizationHeaders(profile),
    path: { bucket },
    body: {
      sourceKey,
      destinationBucket: bucket,
      destinationKey,
      overwrite: false,
    },
  });
  return unwrapEnvelope<ModelsObjectTransferResponse>(result);
}

function unwrapEnvelope<T>(result: Result): T {
  if (result.error || !result.data || !result.response?.ok) {
    throw toApiError(result.error, result.response);
  }
  const envelope = result.data as { success?: boolean; data?: T };
  if (!envelope.success || !envelope.data) throw toApiError(envelope, result.response);
  return envelope.data;
}
