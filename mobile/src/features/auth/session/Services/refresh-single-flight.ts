export class RefreshSingleFlight {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  run<T>(serverId: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(serverId) as Promise<T> | undefined;
    if (existing) return existing;

    const pending = operation().finally(() => {
      if (this.inFlight.get(serverId) === pending) {
        this.inFlight.delete(serverId);
      }
    });
    this.inFlight.set(serverId, pending);
    return pending;
  }
}
