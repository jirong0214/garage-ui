import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ServerProfile } from '../../../server/configuration/server-model';
import { ApiError } from '../../../../infrastructure/api/api-error';
import {
  cancelObjectJob,
  createIdempotencyKey,
  createObjectJob,
  getObjectJob,
  listObjectJobFailures,
  listObjectJobs,
} from './object-jobs-api';

const apiMocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  failures: vi.fn(),
  list: vi.fn(),
}));

vi.mock('@garage-ui/api-client', () => ({
  cancelObjectJob: apiMocks.cancel,
  createObjectJob: apiMocks.create,
  getObjectJob: apiMocks.get,
  listObjectJobFailures: apiMocks.failures,
  listObjectJobs: apiMocks.list,
}));

vi.mock('../../../auth/session/Services/session-service', () => ({
  authenticatedClient: vi.fn(() => ({ name: 'authenticated-client' })),
  authorizationHeaders: vi.fn(async () => ({ Authorization: 'Bearer session-token' })),
}));

const profile: ServerProfile = {
  id: 'server-1',
  baseUrl: 'https://garage.example.test',
  apiVersion: '1',
  createdAt: '2026-08-20T00:00:00Z',
};

function response(status = 200): Response {
  return new Response(null, { status });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('object jobs API', () => {
  it('creates through the generated client with auth and a retry-safe key', async () => {
    apiMocks.create.mockResolvedValue({
      data: { success: true, data: { id: 'job-1', status: 'queued' } },
      response: response(202),
    });

    await expect(
      createObjectJob(
        profile,
        { operation: 'delete', sourceBucket: 'bucket', objects: ['a / 中文#?%.txt'] },
        'request-1',
      ),
    ).resolves.toMatchObject({ id: 'job-1' });
    expect(apiMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer session-token',
          'Idempotency-Key': 'request-1',
        },
        body: expect.objectContaining({ objects: ['a / 中文#?%.txt'] }),
      }),
    );
  });

  it('unwraps list, detail, cancel, and failure envelopes', async () => {
    apiMocks.list.mockResolvedValue({
      data: { success: true, data: { jobs: [{ id: 'job-1' }] } },
      response: response(),
    });
    apiMocks.get.mockResolvedValue({
      data: { success: true, data: { id: 'job-1', status: 'running' } },
      response: response(),
    });
    apiMocks.cancel.mockResolvedValue({
      data: { success: true, data: { id: 'job-1', status: 'cancelling' } },
      response: response(),
    });
    apiMocks.failures.mockResolvedValue({
      data: { success: true, data: { failures: [{ sourceKey: 'a', error: 'denied' }], total: 1 } },
      response: response(),
    });

    await expect(listObjectJobs(profile, 50)).resolves.toHaveLength(1);
    await expect(getObjectJob(profile, 'job-1')).resolves.toMatchObject({ status: 'running' });
    await expect(cancelObjectJob(profile, 'job-1')).resolves.toMatchObject({ status: 'cancelling' });
    await expect(listObjectJobFailures(profile, 'job-1')).resolves.toMatchObject({ total: 1 });
    expect(apiMocks.list).toHaveBeenCalledWith(expect.objectContaining({ query: { limit: 50 } }));
    expect(apiMocks.failures).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: 'job-1' }, query: { offset: 0, limit: 50 } }),
    );
  });

  it('converts generated client errors to the standard ApiError', async () => {
    apiMocks.get.mockResolvedValue({
      error: { error: { code: 'not_found', message: 'Object job not found' } },
      response: response(404),
    });

    const error = await getObjectJob(profile, 'missing').catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'not_found', message: 'Object job not found' });
  });

  it('prefers UUIDs for idempotency keys and has a bounded fallback', () => {
    expect(createIdempotencyKey(123, () => 'uuid-1')).toBe('uuid-1');
    const fallback = createIdempotencyKey(123, null);
    expect(fallback.startsWith('3f-')).toBe(true);
    expect(fallback.length).toBeLessThanOrEqual(200);
  });
});
