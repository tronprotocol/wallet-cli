export class DeadlineExceeded extends Error {
  constructor() {
    super("watch deadline reached");
    this.name = "DeadlineExceeded";
  }
}

/** One monotonic budget shared by discovery, commands, polling and retries. */
export class WatchDeadline {
  private readonly expiresAt: number;
  constructor(
    timeout: number,
    private readonly now: () => number
  ) {
    this.expiresAt = timeout > 0 ? now() + timeout : Infinity;
  }
  remaining(): number {
    return Math.max(0, this.expiresAt - this.now());
  }
}
