import type { ExitCode } from "../../../../domain/types/index.js";
import { StreamManager } from "../stream/index.js";

// Last-resort report for a failure that escaped the runner's own error handling.
export function reportFatal(
  error: unknown,
  streams: Pick<StreamManager, "errorLine"> = new StreamManager("text", false),
): ExitCode {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  streams.errorLine(`fatal: ${(message as string | undefined) ?? String(error)}`);
  return 1;
}
