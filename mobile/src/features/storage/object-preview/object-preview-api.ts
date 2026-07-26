import {
  getObjectMetadata,
  getObjectPreviewUrl,
  type ModelsObjectInfo,
} from '@garage-ui/api-client';
import type { ImageSource } from 'expo-image';

import {
  authenticatedClient,
  authenticatedFetch,
  authorizationHeaders,
} from '@/features/auth/session/Services/session-service';
import type { ServerProfile } from '@/features/server/configuration/server-model';
import { toApiError } from '@/infrastructure/api/api-error';
import { objectKeyQuery } from '@/infrastructure/api/object-key';

const textPreviewBytes = 256 * 1024;

type Result<T> = { data?: T; error?: unknown; response?: Response };

function unwrap<T>(result: Result<T>): T {
  if (result.error || !result.data || !result.response?.ok) {
    throw toApiError(result.error, result.response);
  }
  return result.data;
}

function objectEndpoint(profile: ServerProfile, bucket: string, key: string): string {
  return `${profile.baseUrl}/api/v1/buckets/${encodeURIComponent(bucket)}/object?${objectKeyQuery(key)}`;
}

export async function fetchObjectMetadata(
  profile: ServerProfile,
  bucket: string,
  key: string,
): Promise<ModelsObjectInfo> {
  const result = await getObjectMetadata({
    client: authenticatedClient(profile),
    headers: await authorizationHeaders(profile),
    path: { bucket },
    query: { key },
  });
  const envelope = unwrap(result);
  if (!envelope.success || !envelope.data) throw toApiError(envelope, result.response);
  return envelope.data;
}

export async function mintObjectPreviewUrl(
  profile: ServerProfile,
  bucket: string,
  key: string,
): Promise<string> {
  const result = await getObjectPreviewUrl({
    client: authenticatedClient(profile),
    headers: await authorizationHeaders(profile),
    path: { bucket },
    query: { key },
  });
  const envelope = unwrap(result);
  if (!envelope.success || !envelope.data?.url) throw toApiError(envelope, result.response);
  return new URL(envelope.data.url, profile.baseUrl).toString();
}

export async function authenticatedThumbnailSource(
  profile: ServerProfile,
  bucket: string,
  key: string,
  version?: string,
): Promise<ImageSource> {
  const parameters = new URLSearchParams(objectKeyQuery(key));
  parameters.set('size', '128');
  if (version) parameters.set('v', version);
  return {
    uri: `${profile.baseUrl}/api/v1/buckets/${encodeURIComponent(bucket)}/object/thumbnail?${parameters}`,
    headers: await authorizationHeaders(profile),
    cacheKey: `${profile.id}:${bucket}:${key}:${version ?? 'current'}:128`,
  };
}

export async function fetchTextPreview(
  profile: ServerProfile,
  bucket: string,
  key: string,
): Promise<{ text: string; truncated: boolean }> {
  const response = await authenticatedFetch(profile)(objectEndpoint(profile, bucket, key), {
    headers: {
      ...(await authorizationHeaders(profile)),
      Range: `bytes=0-${textPreviewBytes - 1}`,
    },
  });
  if (!response.ok) throw toApiError(await safeErrorBody(response), response);
  const contentLength = Number(response.headers.get('content-length'));
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > textPreviewBytes) {
    throw toApiError({ message: 'The server returned an unbounded text preview.' }, response);
  }
  const total = response.headers.get('content-range')?.split('/').at(-1);
  return {
    text: await response.text(),
    truncated: response.status === 206 && total !== undefined && Number(total) > contentLength,
  };
}

async function safeErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { message: `Request failed with status ${response.status}.` };
  }
}
