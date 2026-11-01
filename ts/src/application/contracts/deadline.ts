import { ExecutionError } from "../../domain/errors/index.js";

// The one error a command deadline produces; it is also the reason its signal aborts with.
export class DeadlineExpiredError extends ExecutionError {
  constructor(message = "the command did not finish within its time limit") {
    super("timeout", message);
  }
}

// Read-only view of the command deadline. remainingMs() is Infinity when the command has no limit.
export interface ExecutionDeadline {
  readonly signal: AbortSignal;
  remainingMs(): number;
  // True once the time is spent, even before the timer has fired.
  expired(): boolean;
  // Throws DeadlineExpiredError when expired().
  assertActive(): void;
}

// Stops the clock while a human answers a TTY prompt. Each pause returns its own resume; the clock
// runs again after the last resume, and an expired deadline stays expired.
export interface DeadlinePause {
  pause(): () => void;
}

// What an outbound adapter calls immediately before it dispatches a request, after any queue or retry.
export interface DispatchCheck {
  readonly signal: AbortSignal;
  // Throws when the request must not be sent.
  assertDispatchable(): void;
}
