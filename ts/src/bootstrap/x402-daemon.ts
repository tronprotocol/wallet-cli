import { fork, spawn, type ChildProcess, type ForkOptions } from "node:child_process";
import { TIMEOUT_MS_RULE, timeoutMsFromText } from "../domain/config/index.js";
import { ExecutionError } from "../domain/errors/index.js";
import type { ExecutionDeadline } from "../application/contracts/deadline.js";
import type { X402ServeDetails, X402ServerHandle } from "../application/ports/x402-server.js";
import type { X402DaemonLog } from "../adapters/outbound/x402/daemon-log.js";

const CHILD_TIMEOUT_ENV = "WALLET_CLI_X402_DAEMON_TIMEOUT_MS";

export type DaemonLauncher = (options: ForkOptions) => ChildProcess;

// Runs this CLI again with the same arguments as the detached child.
function launchSelf(options: ForkOptions): ChildProcess {
  // Bun executables have a virtual entrypoint that cannot be forked as a script.
  const standalone =
    Boolean(process.versions.bun) &&
    /^(?:\/\$bunfs\/|[A-Za-z]:[\\/]~BUN[\\/])/.test(process.argv[1] ?? "");
  return standalone
    ? spawn(process.execPath, process.argv.slice(2), options)
    : fork(process.argv[1]!, process.argv.slice(2), options);
}

// The duration the daemon parent resolved; undefined outside a daemon child.
export function daemonChildTimeoutMs(): number | undefined {
  if (process.env.WALLET_CLI_X402_DAEMON_CHILD !== "1") return undefined;
  const value = timeoutMsFromText(process.env[CHILD_TIMEOUT_ENV] ?? "");
  return TIMEOUT_MS_RULE.accepts(value) ? value : undefined;
}

// Announce the detached daemon only after its listener is ready within the start-up deadline;
// a child that fails or is late is stopped.
export async function startX402Daemon(
  createLog: () => Promise<X402DaemonLog>,
  startup: ExecutionDeadline,
  timeoutMs: number,
  launch: DaemonLauncher = launchSelf,
): Promise<X402ServerHandle> {
  startup.assertActive();
  const log = await createLog();
  const logFile = log.path;
  const child = launch({
    detached: true,
    stdio: ["ignore", "ignore", log.fd, "ipc"],
    env: {
      ...process.env,
      WALLET_CLI_X402_DAEMON_CHILD: "1",
      [CHILD_TIMEOUT_ENV]: String(timeoutMs),
    },
  });
  await log.close();
  try {
    const details = await new Promise<X402ServeDetails>((resolve, reject) => {
      const cleanup = () => {
        startup.signal.removeEventListener("abort", late);
        child.off("error", fail);
        child.off("exit", fail);
        child.off("message", ready);
      };
      const fail = () => {
        cleanup();
        reject(
          new ExecutionError("provider_error", "x402 daemon failed to start; inspect its log", {
            logFile,
          }),
        );
      };
      const late = () => {
        cleanup();
        reject(
          new ExecutionError(
            "timeout",
            "x402 daemon was not ready within the time limit and was stopped; inspect its log",
            { logFile },
          ),
        );
      };
      const ready = (message: unknown) => {
        if (!message || typeof message !== "object" || !("x402Ready" in message)) return;
        // The timer may not have fired yet; a late ready still fails.
        if (startup.expired()) return late();
        cleanup();
        resolve((message as { x402Ready: X402ServeDetails }).x402Ready);
      };
      child.once("error", fail);
      child.once("exit", fail);
      child.on("message", ready);
      if (startup.expired()) late();
      else startup.signal.addEventListener("abort", late, { once: true });
    });
    if (child.connected) child.disconnect();
    child.unref();
    return {
      details: { ...details, daemon: true, pid: child.pid, logFile },
      close: async () => {
        child.kill("SIGTERM");
      },
    };
  } catch (error) {
    child.kill("SIGTERM");
    if (child.connected) child.disconnect();
    throw error;
  }
}
