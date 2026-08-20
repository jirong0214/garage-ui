import { describe, expect, it } from 'vitest';

import { isObjectJobActive, objectJobCanCancel, type ObjectJob } from './object-job';

describe('object job state', () => {
  it('polls every non-terminal server state', () => {
    (['queued', 'scanning', 'running', 'cancelling'] as const).forEach((status) => {
      expect(isObjectJobActive({ status })).toBe(true);
    });
    (['completed', 'completed_with_errors', 'failed', 'cancelled'] as const).forEach(
      (status) => expect(isObjectJobActive({ status })).toBe(false),
    );
  });

  it('stops offering cancel after cancellation has been requested', () => {
    expect(objectJobCanCancel({ status: 'running' })).toBe(true);
    expect(objectJobCanCancel({ status: 'cancelling' })).toBe(false);
    expect(objectJobCanCancel({ status: 'completed' })).toBe(false);
  });

  it('treats a missing status as terminal defensively', () => {
    expect(isObjectJobActive({} as ObjectJob)).toBe(false);
  });
});
