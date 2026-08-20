import {
  cancelObjectJob as generatedCancelObjectJob,
  createObjectJob as generatedCreateObjectJob,
  getObjectJob as generatedGetObjectJob,
  listObjectJobFailures as generatedListObjectJobFailures,
  listObjectJobs as generatedListObjectJobs,
} from '@garage-ui/api-client';

import {
  authenticatedClient,
  authorizationHeaders,
} from '../../../auth/session/Services/session-service';
import type { ServerProfile } from '../../../server/configuration/server-model';
import { toApiError } from '../../../../infrastructure/api/api-error';

import type {
  CreateObjectJobRequest,
  ObjectJob,
  ObjectJobFailureList,
} from '../Models/object-job';

type Result<T> = { data?: T; error?: unknown; response?: Response };
type Envelope<T> = { success?: boolean; data?: T; error?: unknown; message?: string };

export async function createObjectJob(
  profile: ServerProfile,
  request: CreateObjectJobRequest,
  idempotencyKey = createIdempotencyKey(),
): Promise<ObjectJob> {
  const result = await generatedCreateObjectJob({
    client: authenticatedClient(profile),
    headers: {
      ...(await authorizationHeaders(profile)),
      'Idempotency-Key': idempotencyKey,
    },
    body: request,
  });
  return unwrapEnvelope(result);
}

export async function listObjectJobs(
  profile: ServerProfile,
  limit = 20,
): Promise<ObjectJob[]> {
  const result = await generatedListObjectJobs({
    client: authenticatedClient(profile),
    headers: await authorizationHeaders(profile),
    query: { limit },
  });
  return unwrapEnvelope(result).jobs ?? [];
}

export async function getObjectJob(profile: ServerProfile, id: string): Promise<ObjectJob> {
  const result = await generatedGetObjectJob({
    client: authenticatedClient(profile),
    headers: await authorizationHeaders(profile),
    path: { id },
  });
  return unwrapEnvelope(result);
}

export async function cancelObjectJob(profile: ServerProfile, id: string): Promise<ObjectJob> {
  const result = await generatedCancelObjectJob({
    client: authenticatedClient(profile),
    headers: await authorizationHeaders(profile),
    path: { id },
  });
  return unwrapEnvelope(result);
}

export async function listObjectJobFailures(
  profile: ServerProfile,
  id: string,
  options: { offset?: number; limit?: number } = {},
): Promise<ObjectJobFailureList> {
  const result = await generatedListObjectJobFailures({
    client: authenticatedClient(profile),
    headers: await authorizationHeaders(profile),
    path: { id },
    query: {
      offset: options.offset ?? 0,
      limit: options.limit ?? 50,
    },
  });
  return unwrapEnvelope(result);
}

export function createIdempotencyKey(
  now = Date.now(),
  randomUUID: (() => string) | null =
    globalThis.crypto?.randomUUID?.bind(globalThis.crypto) ?? null,
): string {
  if (randomUUID) return randomUUID();
  return `${now.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function unwrapEnvelope<T>(result: Result<Envelope<T>>): T {
  const envelope = unwrap(result);
  if (!envelope.success || envelope.data === undefined || envelope.data === null) {
    throw toApiError(envelope, result.response);
  }
  return envelope.data;
}

function unwrap<T>(result: Result<T>): T {
  if (result.error || !result.data || !result.response?.ok) {
    throw toApiError(result.error, result.response);
  }
  return result.data;
}
