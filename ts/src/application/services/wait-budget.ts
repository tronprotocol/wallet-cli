const POLL_INTERVAL_MS = 1500;

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

// Polls until `attempt` yields a value or the wait budget is spent. Each attempt gets a signal for the
// remaining budget and none starts after the deadline; a zero budget still makes one unbounded attempt.
export async function pollWithinWaitBudget<T>(
  budgetMs: number,
  attempt: (signal: AbortSignal | undefined) => Promise<T | undefined>,
): Promise<T | undefined> {
  let remaining = Math.max(0, budgetMs);
  const deadline = Date.now() + remaining;
  for (;;) {
    const result = await attempt(remaining > 0 ? AbortSignal.timeout(remaining) : undefined);
    if (result !== undefined) return result;
    remaining = deadline - Date.now();
    if (remaining <= 0) return undefined;
    await sleep(Math.min(POLL_INTERVAL_MS, remaining));
    remaining = deadline - Date.now();
    if (remaining <= 0) return undefined;
  }
}
