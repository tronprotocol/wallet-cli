import type { ChainFamily } from "../../../domain/types/index.js";

export function commandId(cmd: { family?: ChainFamily; path: string[] }): string {
  return cmd.path.join(".");
}
