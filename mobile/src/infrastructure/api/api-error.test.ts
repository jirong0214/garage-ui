import { describe, expect, it } from 'vitest';

import { ApiError, toApiError } from './api-error';

describe('toApiError', () => {
  it('converts an API envelope and preserves request metadata', () => {
    const response = new Response(null, {
      status: 403,
      headers: { 'x-request-id': 'request-42' },
    });
    const error = toApiError({ error: { code: 'forbidden', message: 'Access denied' } }, response);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: 'Access denied',
      status: 403,
      code: 'forbidden',
      requestId: 'request-42',
    });
  });

  it('uses a safe fallback for unknown failures', () => {
    expect(toApiError(null).message).toBe('The request could not be completed.');
  });
});
