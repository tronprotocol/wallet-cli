import { startX402Daemon } from "./x402-daemon.js";
import type { ExecutionDeadline } from "../application/contracts/deadline.js";
import type { X402ServerHandle } from "../application/ports/x402-server.js";
import type {
  X402ListenOptions,
  X402Paywall,
  X402PaywallHost,
} from "../application/contracts/x402-paywall.js";
import type { X402DaemonLog } from "../adapters/outbound/x402/daemon-log.js";
import type { ProcessLifetime } from "./process-lifetime.js";

// Release listeners on normal completion and process shutdown.
export class ManagedX402Server implements X402PaywallHost {
  constructor(
    private readonly server: X402PaywallHost,
    private readonly createDaemonLog: () => Promise<X402DaemonLog>,
    private readonly lifetime: Pick<ProcessLifetime, "keepAlive">,
    // The resolved command duration, handed to a daemon child for its requests.
    private readonly timeoutMs: number,
  ) {}
  async start(
    paywall: X402Paywall,
    options: X402ListenOptions,
    startup: ExecutionDeadline,
  ): Promise<X402ServerHandle> {
    if (options.daemon && process.env.WALLET_CLI_X402_DAEMON_CHILD !== "1")
      return startX402Daemon(this.createDaemonLog, startup, this.timeoutMs);
    const handle = await this.server.start(paywall, options, startup);
    if (options.persistent) this.lifetime.keepAlive();
    let closing: Promise<void> | undefined;
    const close = () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      return (closing ??= handle.close());
    };
    const stop = () => {
      void close().then(
        () => {
          process.exitCode = 0;
        },
        () => {
          process.exitCode = 1;
        },
      );
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    if (options.daemon && process.send) process.send({ x402Ready: handle.details });
    return { details: handle.details, close };
  }
}
