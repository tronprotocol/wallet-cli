/**
 * TRON message group (L4) — message signing (TIP-191/V2). Intent + input shape match EVM,
 * so the command itself comes from the shared factory; this file just scopes it to TRON.
 */
import type { CommandDefinition } from "../../core/types/index.js";
import type { Services } from "../services.js";
import { messageSignCommand } from "../shared.js";

export function messageCommands(services: Services): CommandDefinition[] {
  return [messageSignCommand("tron", services)];
}
