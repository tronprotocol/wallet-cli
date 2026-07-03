import type { Config, OutputMode } from "../../../../domain/types/index.js";
import type { TransactionScope } from "../../../../application/contracts/index.js";
import type { NetworkRegistry } from "../../../../application/ports/network-registry.js";
import type { PromptPort } from "../../../../application/ports/prompt.js";
import type { SecretResolver, StreamManager } from "./runtime.js";

/** CLI command context; application workflows receive only narrower execution scopes. */
export interface ExecutionContext extends TransactionScope {
  readonly config: Config;
  readonly networkRegistry: NetworkRegistry;
  readonly streams: StreamManager;
  readonly secrets: SecretResolver;
  readonly prompt: PromptPort;
  readonly output: OutputMode;
  readonly network?: string;
}
