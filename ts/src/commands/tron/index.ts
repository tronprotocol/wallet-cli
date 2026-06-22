/**
 * TronModule (L4) — TRON's own command surface (plan §3 L4 / §5; spec §3). No universal
 * provider: TRON-specific build/estimate/codecs live in the per-group files; only infra
 * (TxPipeline, SignerResolver, RpcClient) is shared. Implements the ChainModule contract.
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
import { tokenCommands } from "./token.js";
import { txCommands } from "./tx.js";
import { resourceCommands } from "./resource.js";
import { blockCommands } from "./block.js";
import { contractCommands } from "./contract.js";
import { messageCommands } from "./message.js";

export class TronModule implements ChainModule {
  readonly family = "tron" as const;
  constructor(private readonly services: Services) {}

  networks(): NetworkDescriptor[] {
    return Object.values(BUILTIN_NETWORKS).filter((n) => n.family === "tron");
  }

  capabilities(): CapabilityDescriptor[] {
    return [
      { key: "account.balance.native", summary: "native TRX/SUN balance" },
      { key: "account.balance.token", summary: "TRC10/TRC20 token balance" },
      { key: "account.tokenbook", summary: "token address-book (add/list/remove)" },
      { key: "account.portfolio", summary: "native + token holdings with USD valuation" },
      { key: "tx.native.transfer", summary: "transfer TRX (SUN)" },
      { key: "tx.token.transfer", summary: "transfer TRC10/TRC20" },
      { key: "tx.estimate", summary: "energy/bandwidth fee estimate" },
      { key: "tx.broadcast", summary: "broadcast a presigned transaction" },
      { key: "message.sign", summary: "sign a message (TIP-191/V2)" },
      { key: "contract.call", summary: "constant + state-changing contract calls" },
      { key: "contract.deploy", summary: "deploy a smart contract" },
      { key: "resources.energy", summary: "energy resource queries" },
      { key: "resources.bandwidth", summary: "bandwidth resource queries" },
      { key: "staking.freeze", summary: "freeze/unfreeze (Stake 2.0)" },
      { key: "staking.delegate", summary: "delegate/undelegate resource (Stake 2.0)" },
    ];
  }

  registerCommands(reg: CommandRegistryLike): void {
    const groups = [
      accountCommands(this.services),
      tokenCommands(),
      txCommands(this.services),
      resourceCommands(this.services),
      blockCommands(),
      contractCommands(this.services),
      messageCommands(this.services),
    ];
    for (const cmds of groups) for (const cmd of cmds) reg.add(cmd);
  }
}
