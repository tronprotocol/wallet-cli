import { mkdtemp, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { X402DaemonLog } from "../../../application/ports/x402-server.js";

// Creates the log in a new private temp directory; it never opens an existing file.
export async function createX402DaemonLog(): Promise<X402DaemonLog> {
  const directory = await mkdtemp(join(tmpdir(), "wallet-cli-x402-"));
  const path = join(directory, "access.log");
  const handle = await open(path, "wx", 0o600);
  return { path, fd: handle.fd, close: () => handle.close() };
}
