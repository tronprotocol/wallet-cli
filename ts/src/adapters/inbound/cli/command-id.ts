/**
 * Canonical command identifier — derived purely from `family` + `path`, never stored.
 * This is the value surfaced as the `command` field in every result/error envelope, and the
 * stable handle agents key on. Chain commands are family-qualified so the same logical path
 * (e.g. tx send) yields a per-chain id (tron.tx.send); neutral commands
 * are just their path (create, import.mnemonic, config.get, networks).
 */
import type { ChainFamily } from "../../../domain/types/index.js";

export function commandId(cmd: { family?: ChainFamily; path: string[] }): string {
  return cmd.family ? [cmd.family, ...cmd.path].join(".") : cmd.path.join(".");
}
