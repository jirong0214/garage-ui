import { describe, expect, it, vi } from 'vitest';

import { RefreshSingleFlight } from './refresh-single-flight';

describe('RefreshSingleFlight', () => {
  it('shares one refresh operation for concurrent requests to the same server', async () => {
    const coordinator = new RefreshSingleFlight();
    let resolveRefresh: ((value: string) => void) | undefined;
    const operation = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const first = coordinator.run('server-a', operation);
    const second = coordinator.run('server-a', operation);
    resolveRefresh?.('rotated-token');

    await expect(Promise.all([first, second])).resolves.toEqual([
      'rotated-token',
      'rotated-token',
    ]);
    expect(operation).toHaveBeenCalledOnce();
  });

  it('allows a new refresh after the previous operation settles', async () => {
    const coordinator = new RefreshSingleFlight();
    const operation = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    await expect(coordinator.run('server-a', operation)).resolves.toBe('first');
    await expect(coordinator.run('server-a', operation)).resolves.toBe('second');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not combine refreshes for different servers', async () => {
    const coordinator = new RefreshSingleFlight();
    const operationA = vi.fn().mockResolvedValue('a');
    const operationB = vi.fn().mockResolvedValue('b');

    await expect(
      Promise.all([
        coordinator.run('server-a', operationA),
        coordinator.run('server-b', operationB),
      ]),
    ).resolves.toEqual(['a', 'b']);
    expect(operationA).toHaveBeenCalledOnce();
    expect(operationB).toHaveBeenCalledOnce();
  });
});
