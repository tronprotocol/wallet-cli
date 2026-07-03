/**
 * TronModule — TRON's own command surface. No universal
 * provider: TRON-specific build/estimate/codecs live in the per-group files; only infra
 * (TxPipeline, SignerResolver, RpcProvider) is shared. Implements the ChainModule contract.
 */
import type { ChainModule, CommandRegistryLike } from "../../contracts/index.js";
import type { TronAccountService } from "../../../../../application/use-cases/tron/account-service.js";
import type { TronTokenService } from "../../../../../application/use-cases/tron/token-service.js";
import type { TronTransactionService } from "../../../../../application/use-cases/tron/transaction-service.js";
import type { TronStakeService } from "../../../../../application/use-cases/tron/stake-service.js";
import type { TronBlockService } from "../../../../../application/use-cases/tron/block-service.js";
import type { TronContractService } from "../../../../../application/use-cases/tron/contract-service.js";
import type { MessageService } from "../../../../../application/use-cases/message-service.js";
import { accountCommands } from "./account.js";
import { tokenCommands } from "./token.js";
import { txCommands } from "./tx.js";
import { stakeCommands } from "./stake.js";
import { blockCommands } from "./block.js";
import { contractCommands } from "./contract.js";
import { messageCommands } from "./message.js";

export interface TronUseCases {
  tronAccount: TronAccountService;
  tronToken: TronTokenService;
  tronTransaction: TronTransactionService;
  tronStake: TronStakeService;
  tronBlock: TronBlockService;
  tronContract: TronContractService;
  message: MessageService;
}

export class TronModule implements ChainModule {
  readonly family = "tron" as const;
  constructor(private readonly services: TronUseCases) {}

  registerCommands(reg: CommandRegistryLike): void {
    const groups = [
      accountCommands(this.services.tronAccount),
      tokenCommands(this.services.tronToken),
      txCommands(this.services.tronTransaction),
      stakeCommands(this.services.tronStake),
      blockCommands(this.services.tronBlock),
      contractCommands(this.services.tronContract),
      messageCommands(this.services.message),
    ];
    for (const cmds of groups) for (const cmd of cmds) reg.add(cmd);
  }
}
