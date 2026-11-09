import type { CommandDeadline } from "../application/services/command-deadline.js";

// Whether the process ends when the command returns. A server that keeps listening after start-up
// marks itself long-lived, which also ends the command deadline for the rest of its life.
export class ProcessLifetime {
  #longLived = false;

  constructor(private readonly deadline: CommandDeadline) {}

  get longLived(): boolean {
    return this.#longLived;
  }

  keepAlive(): void {
    this.#longLived = true;
    this.deadline.release();
  }
}
