/** A sleeping timer, not a database poll. Durable state supplies each next delay. */
export class DueWork {
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private stopped = false;
  private requested = false;
  constructor(
    private readonly work: () => Promise<number>,
    private readonly failed: () => void,
    private readonly retryMs = 30_000,
    private readonly keepAlive = false,
  ) {}
  start(): void {
    this.wake();
  }
  wake(): void {
    if (this.stopped) return;
    if (this.running) {
      this.requested = true;
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.run();
    }, 0);
    if (!this.keepAlive) this.timer.unref();
  }
  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }
  private async run(): Promise<void> {
    if (this.stopped || this.running) return;
    this.running = true;
    let delay = this.retryMs;
    try {
      delay = await this.work();
    } catch {
      this.failed();
    } finally {
      this.running = false;
      if (!this.stopped) {
        delay = this.requested
          ? 0
          : Math.max(250, Math.min(2_147_483_647, Number.isFinite(delay) ? delay : this.retryMs));
        this.requested = false;
        this.timer = setTimeout(() => {
          void this.run();
        }, delay);
        if (!this.keepAlive) this.timer.unref();
      }
    }
  }
}

export const IDLE_RECHECK_MS = 15 * 60_000;
