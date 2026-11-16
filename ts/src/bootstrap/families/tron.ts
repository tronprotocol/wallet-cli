import { processBroadcastGuard } from "../../application/services/broadcast-guard.js";
import { FAMILIES } from "../../domain/family/index.js";
import { tronSignStrategy } from "../../adapters/outbound/chain/tron/signing-strategy.js";
import { TronRpcClient } from "../../adapters/outbound/chain/tron/tron.js";
import { TronGridHistoryReader } from "../../adapters/outbound/chain/tron/history-reader.js";
import { blockSpec, blockTronBinding } from "../../adapters/inbound/cli/commands/block.js";
import {
  accountActivateSpec,
  accountActivateTronBinding,
  accountBalanceSpec,
  accountBalanceBinding,
  accountHistorySpec,
  accountHistoryTronBinding,
  accountInfoSpec,
  accountInfoTronBinding,
  accountPortfolioSpec,
  accountPortfolioTronBinding,
  accountSetSpec,
  accountSetTronBinding,
} from "../../adapters/inbound/cli/commands/account.js";
import {
  tokenAddSpec,
  tokenAddTronBinding,
  tokenBalanceSpec,
  tokenBalanceTronBinding,
  tokenInfoSpec,
  tokenInfoTronBinding,
  tokenListSpec,
  tokenListBinding,
  tokenRemoveSpec,
  tokenRemoveTronBinding,
} from "../../adapters/inbound/cli/commands/token.js";
import { messageSignSpec, messageSignBinding } from "../../adapters/inbound/cli/commands/shared.js";
import {
  typedDataSignSpec,
  typedDataSignBinding,
} from "../../adapters/inbound/cli/commands/typed-data.js";
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
  txTronLinkMultisigBinding,
  txTronLinkMultisigSpec,
  txStatusSpec,
  txStatusTronBinding,
} from "../../adapters/inbound/cli/commands/tx.js";
import { stakeDefinitions } from "../../adapters/inbound/cli/commands/stake.js";
import { assetDefinitions } from "../../adapters/inbound/cli/commands/asset.js";
import { exchangeDefinitions } from "../../adapters/inbound/cli/commands/exchange.js";
import {
  chainDefinitions,
  chainNodeSpec,
  chainNodeTronBinding,
  chainPricesSpec,
  chainPricesTronBinding,
} from "../../adapters/inbound/cli/commands/chain.js";
import type { AccountBalanceService } from "../../application/use-cases/account-balance-service.js";
import type { TokenBookService } from "../../application/use-cases/token-book-service.js";
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
  contractClearAbiSpec,
  contractClearAbiTronBinding,
  contractSetOriginEnergyLimitSpec,
  contractSetOriginEnergyLimitTronBinding,
  contractSetUserResourcePercentSpec,
  contractSetUserResourcePercentTronBinding,
  contractCreate2Spec,
  contractCreate2TronBinding,
} from "../../adapters/inbound/cli/commands/contract.js";
import {
  proposalApproveSpec,
  proposalApproveTronBinding,
  proposalCreateSpec,
  proposalCreateTronBinding,
  proposalDeleteSpec,
  proposalDeleteTronBinding,
  proposalListSpec,
  proposalListTronBinding,
  proposalShowSpec,
  proposalShowTronBinding,
} from "../../adapters/inbound/cli/commands/proposal.js";
import {
  witnessCreateSpec,
  witnessCreateTronBinding,
  witnessSetBrokerageSpec,
  witnessSetBrokerageTronBinding,
  witnessUpdateSpec,
  witnessUpdateTronBinding,
} from "../../adapters/inbound/cli/commands/witness.js";
import type { CommandRegistry } from "../../adapters/inbound/cli/registry/index.js";
import { TronAccountService } from "../../application/use-cases/tron/account-service.js";
import { TronTokenService } from "../../application/use-cases/tron/token-service.js";
import { TronTransactionService } from "../../application/use-cases/tron/transaction-service.js";
import { TronContractService } from "../../application/use-cases/tron/contract-service.js";
import { TronStakeService } from "../../application/use-cases/tron/stake-service.js";
import type { WallClock } from "../../application/contracts/wall-clock.js";
import { TronAssetService } from "../../application/use-cases/tron/asset-service.js";
import { TronExchangeService } from "../../application/use-cases/tron/exchange-service.js";
import { TronVoteService } from "../../application/use-cases/tron/vote-service.js";
import { TronRewardService } from "../../application/use-cases/tron/reward-service.js";
import { TronChainService } from "../../application/use-cases/tron/chain-service.js";
import { TronProposalService } from "../../application/use-cases/tron/proposal-service.js";
import { TronWitnessService } from "../../application/use-cases/tron/witness-service.js";
import { TronBlockService } from "../../application/use-cases/tron/block-service.js";
import { MessageService } from "../../application/use-cases/message-service.js";
import { TypedDataService } from "../../application/use-cases/typed-data-service.js";
import { TronPermissionService } from "../../application/use-cases/tron/permission-service.js";
import { TronSigService } from "../../application/use-cases/tron/sig-service.js";
import { TronMultisigService } from "../../application/use-cases/tron/multisig-service.js";
import { TronMultisigCollaborationService } from "../../application/use-cases/tron/multisig-collaboration-service.js";
import type { ChainGatewayProvider } from "../../application/ports/chain/gateway-provider.js";
import type { TokenRepository } from "../../application/ports/token-repository.js";
import type { PriceProvider } from "../../application/ports/price-provider.js";
import type { SignerResolver } from "../../application/services/signer/index.js";
import type { SigningService } from "../../application/services/signing/signing-service.js";
import type { TxPipeline } from "../../application/services/pipeline/index.js";
import type { AccountStore } from "../../application/ports/account-store.js";
import { SecureTransactionArtifactWriter } from "../../adapters/outbound/persistence/transaction-artifact-writer.js";
import type { FamilyPlugin } from "./types.js";
import type { TronLinkCollaborationPort } from "../../application/ports/tronlink-collaboration.js";
import type { RecipientResolver } from "../../application/services/recipient-resolver.js";

export const tronFamily: FamilyPlugin<"tron"> = {
  meta: FAMILIES.tron,
  signStrategy: tronSignStrategy,
  createGateway: (network) => new TronRpcClient(network, undefined, processBroadcastGuard),
};

export interface TronChainCommandDependencies {
  gateways: ChainGatewayProvider;
  tokens: TokenRepository;
  prices: PriceProvider;
  signers: SignerResolver;
  signing: SigningService;
  transactions: TxPipeline;
  accounts: AccountStore;
  tronlink: TronLinkCollaborationPort;
  recipients: RecipientResolver;
  balances: AccountBalanceService;
  tokenBook: TokenBookService;
  clock: WallClock;
}

export function registerTronChainCommands(
  reg: CommandRegistry,
  deps: TronChainCommandDependencies,
): void {
  const account = new TronAccountService(
    deps.gateways,
    new TronGridHistoryReader(),
    deps.tokens,
    deps.prices,
    deps.transactions,
    deps.clock,
  );
  const token = new TronTokenService(deps.gateways, deps.tokens);
  const message = new MessageService(deps.signers, deps.signing);
  const typedData = new TypedDataService(deps.signers, deps.signing);
  const transaction = new TronTransactionService(
    deps.gateways,
    deps.tokens,
    deps.transactions,
    deps.recipients,
    deps.clock,
  );
  const artifacts = new SecureTransactionArtifactWriter();
  const signing = new TronSigService(
    deps.gateways,
    deps.signers,
    deps.signing,
    artifacts,
    deps.clock,
  );
  const multisig = new TronMultisigService(deps.gateways, signing, artifacts, deps.clock);
  const multisigCollaboration = new TronMultisigCollaborationService(
    deps.tronlink,
    deps.gateways,
    multisig,
    deps.clock,
  );
  const permission = new TronPermissionService(
    deps.gateways,
    deps.accounts,
    deps.transactions,
    deps.clock,
  );
  const stake = new TronStakeService(deps.gateways, deps.transactions, deps.clock);
  const asset = new TronAssetService(deps.gateways, deps.transactions, deps.clock);
  const exchange = new TronExchangeService(deps.gateways, deps.transactions, deps.clock);
  const vote = new TronVoteService(deps.gateways, deps.transactions, deps.clock);
  const reward = new TronRewardService(deps.gateways, deps.transactions, deps.clock);
  const chain = new TronChainService(deps.gateways, deps.clock);
  const contract = new TronContractService(deps.gateways, deps.transactions, deps.clock);
  const proposal = new TronProposalService(deps.gateways, deps.transactions, deps.clock);
  const witness = new TronWitnessService(deps.gateways, deps.transactions, deps.clock);

  reg.addChain(blockSpec, "tron", blockTronBinding(new TronBlockService(deps.gateways)));
  // Registration order determines group help order; shared commands come first.
  reg.addChain(accountBalanceSpec, "tron", accountBalanceBinding(deps.balances));
  reg.addChain(accountInfoSpec, "tron", accountInfoTronBinding(account));
  reg.addChain(accountPortfolioSpec, "tron", accountPortfolioTronBinding(account));
  reg.addChain(accountHistorySpec, "tron", accountHistoryTronBinding(account));
  reg.addChain(accountActivateSpec, "tron", accountActivateTronBinding(account));
  reg.addChain(accountSetSpec, "tron", accountSetTronBinding(account));
  reg.addChain(tokenBalanceSpec, "tron", tokenBalanceTronBinding(token));
  reg.addChain(tokenInfoSpec, "tron", tokenInfoTronBinding(token));
  reg.addChain(tokenAddSpec, "tron", tokenAddTronBinding(token));
  reg.addChain(tokenListSpec, "tron", tokenListBinding(deps.tokenBook));
  reg.addChain(tokenRemoveSpec, "tron", tokenRemoveTronBinding(token));
  reg.addChain(messageSignSpec, "tron", messageSignBinding(message));
  reg.addChain(typedDataSignSpec, "tron", typedDataSignBinding(typedData));
  reg.addChain(txSendSpec, "tron", txSendTronBinding(transaction));
  reg.addChain(txSignSpec, "tron", txSignTronBinding(signing, multisig));
  reg.addChain(txBroadcastSpec, "tron", txBroadcastTronBinding(multisig));
  reg.addChain(txStatusSpec, "tron", txStatusTronBinding(transaction));
  reg.addChain(txInfoSpec, "tron", txInfoTronBinding(transaction));
  reg.addChain(txApprovalsSpec, "tron", txApprovalsTronBinding(multisig));
  reg.addChain(txTronLinkMultisigSpec, "tron", txTronLinkMultisigBinding(multisigCollaboration));
  reg.addChain(permissionShowSpec, "tron", permissionShowTronBinding(permission));
  reg.addChain(permissionUpdateSpec, "tron", permissionUpdateTronBinding(permission));
  for (const definition of stakeDefinitions(stake)) {
    reg.addChain(definition.spec, "tron", definition.binding);
  }
  for (const definition of assetDefinitions(asset)) {
    reg.addChain(definition.spec, "tron", definition.binding);
  }
  for (const definition of exchangeDefinitions(exchange)) {
    reg.addChain(definition.spec, "tron", definition.binding);
  }
  reg.addChain(voteCastSpec, "tron", voteCastTronBinding(vote));
  reg.addChain(voteListSpec, "tron", voteListTronBinding(vote));
  reg.addChain(voteStatusSpec, "tron", voteStatusTronBinding(vote));
  reg.addChain(rewardBalanceSpec, "tron", rewardBalanceTronBinding(reward));
  reg.addChain(rewardWithdrawSpec, "tron", rewardWithdrawTronBinding(reward));
  reg.addChain(chainNodeSpec, "tron", chainNodeTronBinding(chain));
  reg.addChain(chainPricesSpec, "tron", chainPricesTronBinding(chain));
  for (const definition of chainDefinitions(chain)) {
    reg.addChain(definition.spec, "tron", definition.binding);
  }
  reg.addChain(contractCallSpec, "tron", contractCallTronBinding(contract));
  reg.addChain(contractSendSpec, "tron", contractSendTronBinding(contract));
  reg.addChain(contractDeploySpec, "tron", contractDeployTronBinding(contract));
  reg.addChain(contractInfoSpec, "tron", contractInfoTronBinding(contract));
  reg.addChain(contractClearAbiSpec, "tron", contractClearAbiTronBinding(contract));
  reg.addChain(
    contractSetOriginEnergyLimitSpec,
    "tron",
    contractSetOriginEnergyLimitTronBinding(contract),
  );
  reg.addChain(
    contractSetUserResourcePercentSpec,
    "tron",
    contractSetUserResourcePercentTronBinding(contract),
  );
  reg.addChain(contractCreate2Spec, "tron", contractCreate2TronBinding(contract));
  reg.addChain(proposalListSpec, "tron", proposalListTronBinding(proposal));
  reg.addChain(proposalShowSpec, "tron", proposalShowTronBinding(proposal));
  reg.addChain(proposalCreateSpec, "tron", proposalCreateTronBinding(proposal));
  reg.addChain(proposalApproveSpec, "tron", proposalApproveTronBinding(proposal));
  reg.addChain(proposalDeleteSpec, "tron", proposalDeleteTronBinding(proposal));
  reg.addChain(witnessCreateSpec, "tron", witnessCreateTronBinding(witness));
  reg.addChain(witnessUpdateSpec, "tron", witnessUpdateTronBinding(witness));
  reg.addChain(witnessSetBrokerageSpec, "tron", witnessSetBrokerageTronBinding(witness));
}
