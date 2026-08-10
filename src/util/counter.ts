/**
 * Tracks the number of requests currently in flight, so that a shutdown can
 * wait for them to finish.
 */
export class Counter {
  private count = 0;
  private waiters: (() => void)[] = [];

  public wait(): Promise<void> {
    if (this.count === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  public increment(): void {
    this.count += 1;
  }

  public decrement(): void {
    this.count -= 1;
    if (this.count > 0) {
      return;
    }
    // Resolve every pending waiter and clear the list, so that a later
    // increment does not resolve an already-settled promise again.
    const { waiters } = this;
    this.waiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }
}
