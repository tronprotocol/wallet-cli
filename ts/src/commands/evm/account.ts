/**
 * EVM account group (L4) — native balance. Intent + input shape match TRON, so the command
 * comes from the shared factory; this file just scopes it to EVM.
 */
import type { CommandDefinition } from "../../core/types/index.js";
import { balanceCommand } from "../shared.js";

export function accountCommands(): CommandDefinition[] {
  return [balanceCommand("evm")];
}
