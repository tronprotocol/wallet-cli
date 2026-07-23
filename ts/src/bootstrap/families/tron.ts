import { FAMILIES } from "../../domain/family/index.js";
import { tronSignStrategy } from "../../adapters/outbound/chain/tron/signing-strategy.js";
import { TronRpcClient } from "../../adapters/outbound/chain/tron/tron.js";
import { TronGridHistoryReader } from "../../adapters/outbound/chain/tron/history-reader.js";
import { blockSpec, blockTronBinding } from "../../adapters/inbound/cli/commands/block.js";
import {
  accountBalanceSpec,
  accountBalanceTronBinding,
  accountHistorySpec,
  accountHistoryTronBinding,
  accountInfoSpec,
  accountInfoTronBinding,
  accountPortfolioSpec,
  accountPortfolioTronBinding,
} from "../../adapters/inbound/cli/commands/account.js";
import {
  tokenAddSpec,
  tokenAddTronBinding,
  tokenBalanceSpec,
  tokenBalanceTronBinding,
  tokenInfoSpec,
  tokenInfoTronBinding,
  tokenListSpec,
  tokenListTronBinding,
  tokenRemoveSpec,
  tokenRemoveTronBinding,
} from "../../adapters/inbound/cli/commands/token.js";
import { messageSignSpec, messageSignBinding } from "../../adapters/inbound/cli/commands/shared.js";
import { typedDataSignSpec, typedDataSignBinding } from "../../adapters/inbound/cli/commands/typed-data.js";
import {
  permissionShowSpec,
  permissionShowTronBinding,
  permissionUpdateSpec,
  permissionUpdateTronBinding,
} from "../../adapters/inbound/cli/commands/permission.js";
import {
  txBroadcastSpec,
  txBroadcastTronBinding,
  txApprovalsSpec,
  txApprovalsTronBinding,
  txInfoSpec,
  txInfoTronBinding,
  txSendSpec,
  txSendTronBinding,
  txSignSpec,
  txSignTronBinding,
  txStatusSpec,
  txStatusTronBinding,
} from "../../adapters/inbound/cli/commands/tx.js";
import { stakeDefinitions } from "../../adapters/inbound/cli/commands/stake.js";
import { chainDefinitions } from "../../adapters/inbound/cli/commands/chain.js";
import {
  voteCastSpec,
  voteCastTronBinding,
  voteListSpec,
  voteListTronBinding,
  voteStatusSpec,
  voteStatusTronBinding,
} from "../../adapters/inbound/cli/commands/vote.js";
import {
  rewardBalanceSpec,
  rewardBalanceTronBinding,
  rewardWithdrawSpec,
  rewardWithdrawTronBinding,
} from "../../adapters/inbound/cli/commands/reward.js";
import {
  contractCallSpec,
  contractCallTronBinding,
  contractDeploySpec,
  contractDeployTronBinding,
  contractInfoSpec,
  contractInfoTronBinding,
  contractSendSpec,
  contractSendTronBinding,
} from "../../adapters/inbound/cli/commands/contract.js";
import type { CommandRegistry } from "../../adapters/inbound/cli/registry/index.js";
import { TronAccountService } from "../../application/use-cases/tron/account-service.js";
import { TronTokenService } from "../../application/use-cases/tron/token-service.js";
import { TronTransactionService } from "../../application/use-cases/tron/transaction-service.js";
import { TronContractService } from "../../application/use-cases/tron/contract-service.js";
import { TronStakeService } from "../../application/use-cases/tron/stake-service.js";
import { TronVoteService } from "../../application/use-cases/tron/vote-service.js";
import { TronRewardService } from "../../application/use-cases/tron/reward-service.js";
import { TronChainService } from "../../application/use-cases/tron/chain-service.js";
import { TronBlockService } from "../../application/use-cases/tron/block-service.js";
import { MessageService } from "../../application/use-cases/message-service.js";
import { TypedDataService } from "../../application/use-cases/typed-data-service.js";
import { TronPermissionService } from "../../application/use-cases/tron/permission-service.js";
import { TronMultisigService } from "../../application/use-cases/tron/multisig-service.js";
import type { ChainGatewayProvider } from "../../application/ports/chain/gateway-provider.js";
import type { TokenRepository } from "../../application/ports/token-repository.js";
import type { PriceProvider } from "../../application/ports/price-provider.js";
import type { SignerResolver } from "../../application/services/signer/index.js";
import type { TxPipeline } from "../../application/services/pipeline/index.js";
import type { AccountStore } from "../../application/ports/account-store.js";
import { TransactionArtifactWriter } from "../../adapters/outbound/persistence/transaction-artifact-writer.js";
import type { FamilyPlugin } from "./types.js";

export const tronFamily: FamilyPlugin<"tron"> = {
  meta: FAMILIES.tron,
  signStrategy: tronSignStrategy,
  createGateway: (network, timeoutMs) => new TronRpcClient(network.httpEndpoint ?? "", timeoutMs),
};

export interface TronChainCommandDependencies {
  gateways: ChainGatewayProvider;
  tokens: TokenRepository;
  prices: PriceProvider;
  signers: SignerResolver;
  transactions: TxPipeline;
  accounts: AccountStore;
  timeoutMs: number;
}

export function registerTronChainCommands(reg: CommandRegistry, deps: TronChainCommandDependencies): void {
  const account = new TronAccountService(
    deps.gateways,
    new TronGridHistoryReader(deps.timeoutMs),
    deps.tokens,
    deps.prices,
  );
  const token = new TronTokenService(deps.gateways, deps.tokens);
  const message = new MessageService(deps.signers);
  const typedData = new TypedDataService(deps.signers);
  const transaction = new TronTransactionService(deps.gateways, deps.tokens, deps.transactions);
  const multisig = new TronMultisigService(deps.gateways, deps.signers);
  const permission = new TronPermissionService(deps.gateways, deps.accounts, deps.transactions);
  const stake = new TronStakeService(deps.gateways, deps.transactions);
  const vote = new TronVoteService(deps.gateways, deps.transactions, stake);
  const reward = new TronRewardService(deps.gateways, deps.transactions);
  const chain = new TronChainService(deps.gateways);
  const contract = new TronContractService(deps.gateways, deps.transactions);

  reg.addChain(blockSpec, "tron", blockTronBinding(new TronBlockService(deps.gateways)));
  reg.addChain(accountBalanceSpec, "tron", accountBalanceTronBinding(account));
  reg.addChain(accountInfoSpec, "tron", accountInfoTronBinding(account));
  reg.addChain(accountHistorySpec, "tron", accountHistoryTronBinding(account));
  reg.addChain(accountPortfolioSpec, "tron", accountPortfolioTronBinding(account));
  reg.addChain(tokenBalanceSpec, "tron", tokenBalanceTronBinding(token));
  reg.addChain(tokenInfoSpec, "tron", tokenInfoTronBinding(token));
  reg.addChain(tokenAddSpec, "tron", tokenAddTronBinding(token));
  reg.addChain(tokenListSpec, "tron", tokenListTronBinding(token));
  reg.addChain(tokenRemoveSpec, "tron", tokenRemoveTronBinding(token));
  reg.addChain(messageSignSpec, "tron", messageSignBinding(message));
  reg.addChain(typedDataSignSpec, "tron", typedDataSignBinding(typedData));
  reg.addChain(txSendSpec, "tron", txSendTronBinding(transaction));
  reg.addChain(txSignSpec, "tron", txSignTronBinding(
    transaction,
    multisig,
    new TransactionArtifactWriter(),
  ));
  reg.addChain(txApprovalsSpec, "tron", txApprovalsTronBinding(multisig));
  reg.addChain(txBroadcastSpec, "tron", txBroadcastTronBinding(multisig));
  reg.addChain(txStatusSpec, "tron", txStatusTronBinding(transaction));
  reg.addChain(txInfoSpec, "tron", txInfoTronBinding(transaction));
  reg.addChain(permissionShowSpec, "tron", permissionShowTronBinding(permission));
  reg.addChain(permissionUpdateSpec, "tron", permissionUpdateTronBinding(permission));
  for (const definition of stakeDefinitions(stake)) {
    reg.addChain(definition.spec, "tron", definition.binding);
  }
  reg.addChain(voteCastSpec, "tron", voteCastTronBinding(vote));
  reg.addChain(voteListSpec, "tron", voteListTronBinding(vote));
  reg.addChain(voteStatusSpec, "tron", voteStatusTronBinding(vote));
  reg.addChain(rewardBalanceSpec, "tron", rewardBalanceTronBinding(reward));
  reg.addChain(rewardWithdrawSpec, "tron", rewardWithdrawTronBinding(reward));
  for (const definition of chainDefinitions(chain)) {
    reg.addChain(definition.spec, "tron", definition.binding);
  }
  reg.addChain(contractCallSpec, "tron", contractCallTronBinding(contract));
  reg.addChain(contractSendSpec, "tron", contractSendTronBinding(contract));
  reg.addChain(contractDeploySpec, "tron", contractDeployTronBinding(contract));
  reg.addChain(contractInfoSpec, "tron", contractInfoTronBinding(contract));
}
