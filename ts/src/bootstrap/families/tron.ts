import { FAMILIES } from "../../domain/family/index.js";
import { tronSignStrategy } from "../../adapters/outbound/chain/tron/signing-strategy.js";
import { TronRpcClient } from "../../adapters/outbound/chain/tron/tron.js";
import { TronGridHistoryReader } from "../../adapters/outbound/chain/tron/history-reader.js";
import { TronModule } from "../../adapters/inbound/cli/commands/tron/index.js";
import { TronAccountService } from "../../application/use-cases/tron/account-service.js";
import { TronTokenService } from "../../application/use-cases/tron/token-service.js";
import { TronTransactionService } from "../../application/use-cases/tron/transaction-service.js";
import { TronContractService } from "../../application/use-cases/tron/contract-service.js";
import { TronStakeService } from "../../application/use-cases/tron/stake-service.js";
import { TronBlockService } from "../../application/use-cases/tron/block-service.js";
import { MessageService } from "../../application/use-cases/message-service.js";
import type { FamilyPlugin } from "./types.js";

export const tronFamily: FamilyPlugin<"tron"> = {
  meta: FAMILIES.tron,
  signStrategy: tronSignStrategy,
  createGateway: (network, timeoutMs) => new TronRpcClient(network.httpEndpoint ?? "", timeoutMs),
  createModule: ({ gateways, tokens, prices, signers, transactions, timeoutMs }) =>
    new TronModule({
      tronAccount: new TronAccountService(
        gateways,
        new TronGridHistoryReader(timeoutMs),
        tokens,
        prices,
      ),
      tronToken: new TronTokenService(gateways, tokens),
      tronTransaction: new TronTransactionService(gateways, tokens, transactions),
      tronContract: new TronContractService(gateways, transactions),
      tronStake: new TronStakeService(gateways, transactions),
      tronBlock: new TronBlockService(gateways),
      message: new MessageService(signers),
    }),
};
