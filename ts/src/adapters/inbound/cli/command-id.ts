import type { ChainFamily } from "../../../domain/types/index.js";

/** Canonical id = the logical path. Chain commands are no longer family-qualified; the family
 *  travels in the envelope's `chain` view, so `tron.` would be redundant with `chain.family`. */
export function commandId(cmd: { family?: ChainFamily; path: string[] }): string {
  return cmd.path.join(".");
}
