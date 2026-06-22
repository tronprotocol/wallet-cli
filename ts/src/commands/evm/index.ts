/**
 * EvmModule (L4) — EVM's own command surface. EVM-specific build/estimate (viem prepare,
 * EIP-1559 fee) live in the per-group files; only infra is shared. Implements the ChainModule
 * contract (plan §3 L4 / §5). EVM-only commands (typed-data sign, deploy…) will be added here.
 */
import type {
  CapabilityDescriptor,
  ChainModule,
  CommandRegistryLike,
  NetworkDescriptor,
} from "../../core/types/index.js";
import { BUILTIN_NETWORKS } from "../../infra/config/builtins.js";
import type { Services } from "../services.js";
import { accountCommands } from "./account.js";
import { txCommands } from "./tx.js";
import { messageCommands } from "./message.js";

export class EvmModule implements ChainModule {
  readonly family = "evm" as const;
  constructor(private readonly services: Services) {}

  networks(): NetworkDescriptor[] {
    return Object.values(BUILTIN_NETWORKS).filter((n) => n.family === "evm");
  }

  // command-backed capabilities only (single source of truth — must match a registered command).
  // network-specific traits like fee.eip1559 live on the NetworkDescriptor, not here.
  capabilities(): CapabilityDescriptor[] {
    return [
      { key: "account.balance.native", summary: "native ETH/wei balance" },
      { key: "tx.native.transfer", summary: "transfer native coin (wei)" },
      { key: "tx.token.transfer", summary: "transfer ERC-20" },
      { key: "tx.estimate", summary: "gas/fee estimate (dry-run)" },
      { key: "message.sign", summary: "personal_sign a message" },
    ];
  }

  registerCommands(reg: CommandRegistryLike): void {
    const groups = [
      accountCommands(),
      txCommands(this.services),
      messageCommands(this.services),
    ];
    for (const cmds of groups) for (const cmd of cmds) reg.add(cmd);
  }
}
