import { startX402Daemon } from "./x402-daemon.js";
import type {
  X402ServerPort,
  X402ServerHandle,
  X402ServeInput,
} from "../application/ports/x402-server.js";
import type { NetworkDescriptor } from "../domain/types/index.js";

/** Release listeners on normal roundtrip completion as well as process shutdown. */
export class ManagedX402Server implements X402ServerPort {
  constructor(private readonly server: X402ServerPort) {}
  validate(network: NetworkDescriptor, input: X402ServeInput): void {
    this.server.validate(network, input);
  }
  async start(network: NetworkDescriptor, input: X402ServeInput): Promise<X402ServerHandle> {
    this.server.validate(network, input);
    if (input.daemon && process.env.WALLET_CLI_X402_DAEMON_CHILD !== "1") return startX402Daemon();
    const handle = await this.server.start(network, input);
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
    if (input.daemon && process.send) process.send({ x402Ready: handle.details });
    return { details: handle.details, close };
  }
}
