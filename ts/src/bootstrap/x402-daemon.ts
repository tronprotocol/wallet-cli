import { fork, spawn } from "node:child_process";
import { mkdtemp, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExecutionError } from "../domain/errors/index.js";
import type { X402ServerHandle } from "../application/ports/x402-server.js";

/** Start the same CLI in a detached process; only announce success after its listener is ready. */
export async function startX402Daemon(): Promise<X402ServerHandle> {
  const directory = await mkdtemp(join(tmpdir(), "wallet-cli-x402-"));
  const logFile = join(directory, "access.log");
  const log = await open(logFile, "wx", 0o600);
  // Bun executables have a virtual entrypoint that cannot be forked as a script.
  const standalone =
    Boolean(process.versions.bun) &&
    /^(?:\/\$bunfs\/|[A-Za-z]:[\\/]~BUN[\\/])/.test(process.argv[1] ?? "");
  const options = {
    detached: true,
    stdio: ["ignore", "ignore", log.fd, "ipc"] as ["ignore", "ignore", number, "ipc"],
    env: { ...process.env, WALLET_CLI_X402_DAEMON_CHILD: "1" },
  };
  const child = standalone
    ? spawn(process.execPath, process.argv.slice(2), options)
    : fork(process.argv[1]!, process.argv.slice(2), options);
  await log.close();
  try {
    const details = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => fail(), 30_000);
      const cleanup = () => {
        clearTimeout(timer);
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
      const ready = (message: unknown) => {
        if (!message || typeof message !== "object" || !("x402Ready" in message)) return;
        cleanup();
        resolve((message as { x402Ready: Record<string, unknown> }).x402Ready);
      };
      child.once("error", fail);
      child.once("exit", fail);
      child.on("message", ready);
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
