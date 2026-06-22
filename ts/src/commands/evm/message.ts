/**
 * EVM message group (L4) — personal_sign (EIP-191). Intent + input shape match TRON, so the
 * command comes from the shared factory; this file just scopes it to EVM.
 */
import type { CommandDefinition } from "../../core/types/index.js";
import type { Services } from "../services.js";
import { messageSignCommand } from "../shared.js";

export function messageCommands(services: Services): CommandDefinition[] {
  return [messageSignCommand("evm", services)];
}
