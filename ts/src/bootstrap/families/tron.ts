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
import type { TxPipeline } from "../../application/services/pipeline/index.js";
import type { AccountStore } from "../../application/ports/account-store.js";
import { SecureTransactionArtifactWriter } from "../../adapters/outbound/persistence/transaction-artifact-writer.js";
import type { FamilyPlugin } from "./types.js";
import type { TronLinkCollaborationPort } from "../../application/ports/tronlink-collaboration.js";
import type { GasFreeProvider } from "../../application/ports/gasfree-provider.js";
import type { RecipientResolver } from "../../application/services/recipient-resolver.js";
import { GasFreeService } from "../../application/use-cases/tron/gasfree-service.js";
import {
  gasFreeInfoSpec,
  gasFreeInfoTronBinding,
  gasFreeTraceSpec,
  gasFreeTraceTronBinding,
  gasFreeTransferSpec,
  gasFreeTransferTronBinding,
} from "../../adapters/inbound/cli/commands/gasfree.js";

export const tronFamily: FamilyPlugin<"tron"> = {
  meta: FAMILIES.tron,
  signStrategy: tronSignStrategy,
  createGateway: (network, timeoutMs) => new TronRpcClient(network, timeoutMs),
};

export interface TronChainCommandDependencies {
  gateways: ChainGatewayProvider;
  tokens: TokenRepository;
  prices: PriceProvider;
  signers: SignerResolver;
  transactions: TxPipeline;
  accounts: AccountStore;
  timeoutMs: number;
  tronlink: TronLinkCollaborationPort;
  gasfree: GasFreeProvider;
  recipients: RecipientResolver;
  balances: AccountBalanceService;
  tokenBook: TokenBookService;
}

export function registerTronChainCommands(
  reg: CommandRegistry,
  deps: TronChainCommandDependencies,
): void {
  const account = new TronAccountService(
    deps.gateways,
    new TronGridHistoryReader(deps.timeoutMs),
    deps.tokens,
    deps.prices,
    deps.transactions,
  );
  const token = new TronTokenService(deps.gateways, deps.tokens);
  const message = new MessageService(deps.signers);
  const typedData = new TypedDataService(deps.signers);
  const transaction = new TronTransactionService(
    deps.gateways,
    deps.tokens,
    deps.transactions,
    deps.recipients,
  );
  const signing = new TronSigService(deps.gateways, deps.signers);
  const multisig = new TronMultisigService(deps.gateways, signing);
  const multisigCollaboration = new TronMultisigCollaborationService(
    deps.tronlink,
    deps.gateways,
    multisig,
  );
  const gasfree = new GasFreeService(deps.gasfree, deps.gateways, deps.signers, deps.recipients);
  const permission = new TronPermissionService(deps.gateways, deps.accounts, deps.transactions);
  const stake = new TronStakeService(deps.gateways, deps.transactions);
  const asset = new TronAssetService(deps.gateways, deps.transactions);
  const exchange = new TronExchangeService(deps.gateways, deps.transactions);
  const vote = new TronVoteService(deps.gateways, deps.transactions, stake);
  const reward = new TronRewardService(deps.gateways, deps.transactions);
  const chain = new TronChainService(deps.gateways);
  const contract = new TronContractService(deps.gateways, deps.transactions);
  const proposal = new TronProposalService(deps.gateways, deps.transactions);
  const witness = new TronWitnessService(deps.gateways, deps.transactions);

  reg.addChain(blockSpec, "tron", blockTronBinding(new TronBlockService(deps.gateways)));
  // Registration order is what the group help lists, so these follow the §10.3 running order:
  // the two-family read commands first, then the TRON-only ones.
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
  reg.addChain(
    txSignSpec,
    "tron",
    txSignTronBinding(transaction, signing, multisig, new SecureTransactionArtifactWriter()),
  );
  reg.addChain(txBroadcastSpec, "tron", txBroadcastTronBinding(multisig));
  reg.addChain(txStatusSpec, "tron", txStatusTronBinding(transaction));
  reg.addChain(txInfoSpec, "tron", txInfoTronBinding(transaction));
  // TRON-only, so they sit at the end of the `tx` group listing (§10.3).
  reg.addChain(txApprovalsSpec, "tron", txApprovalsTronBinding(multisig));
  reg.addChain(txTronLinkMultisigSpec, "tron", txTronLinkMultisigBinding(multisigCollaboration));
  reg.addChain(gasFreeInfoSpec, "tron", gasFreeInfoTronBinding(gasfree));
  reg.addChain(gasFreeTransferSpec, "tron", gasFreeTransferTronBinding(gasfree));
  reg.addChain(gasFreeTraceSpec, "tron", gasFreeTraceTronBinding(gasfree));
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
  // `chain params` is TRON-only and goes last in the group listing (§10.3).
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
