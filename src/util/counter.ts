export class Counter {
  private count = 0;
  private resolve: (() => void) | undefined;

  public wait(): Promise<void> {
    return new Promise((resolve) => {
      if (this.count === 0) {
        resolve();
      } else {
        this.resolve = resolve;
      }
    });
  }

  public increment() {
    this.count += 1;
  }

  public decrement() {
    this.count -= 1;
    if (this.count === 0 && this.resolve !== undefined) {
      this.resolve();
    }
  }
}
