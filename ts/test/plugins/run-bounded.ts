// Runs an ES module script in a child node process with tsx and a time limit, so code that could
// block forever (an open of a FIFO) fails the test instead of hanging the runner.
import { spawnSync } from "node:child_process";

export function runBounded(script: string, timeoutMs = 20_000) {
  const r = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    encoding: "utf8",
    timeout: timeoutMs,
  });
  return { status: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr };
}
