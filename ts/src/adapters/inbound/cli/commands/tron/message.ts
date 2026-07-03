/**
 * TRON message group — message signing (TIP-191/V2). The command itself comes from the
 * shared (family-agnostic) factory; this file just scopes it to TRON.
 */
import type { CommandDefinition } from "../../contracts/index.js";
import type { MessageService } from "../../../../../application/use-cases/message-service.js";
import { messageSignCommand } from "../shared.js";

export function messageCommands(service: MessageService): CommandDefinition[] {
  return [messageSignCommand("tron", service)];
}
