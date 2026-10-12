import type { AgentService } from "../../application/use-cases/agent-service.js";
import {
  showSpec,
  showTronBinding,
  registerSpec,
  registerTronBinding,
  updateSpec,
  updateTronBinding,
  transferSpec,
  transferTronBinding,
  approveSpec,
  approveTronBinding,
  operatorAddSpec,
  operatorAddTronBinding,
  operatorRemoveSpec,
  operatorRemoveTronBinding,
  operatorCheckSpec,
  operatorCheckTronBinding,
} from "../../adapters/inbound/cli/commands/erc8004.js";
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
import type { MarketDataPort } from "../../application/ports/sunswap/market-data.js";
import type { LiquidityPort } from "../../application/ports/sunswap/liquidity.js";
import type { LaunchpadPort } from "../../application/ports/sunpump/launchpad.js";
import type { SunPumpMarketDataPort } from "../../application/ports/sunpump/market-data.js";
import type { SunPumpTokenLaunchPort } from "../../application/ports/sunpump/token-launch.js";
import type { RouterPort } from "../../application/ports/sunswap/router.js";
import type { RouterExecutionPort } from "../../application/ports/sunswap/router-execution.js";
import type { Permit2Port } from "../../application/ports/sunswap/permit2.js";
import type { RecipientResolver } from "../../application/services/recipient-resolver.js";
import { GasFreeService } from "../../application/use-cases/tron/gasfree-service.js";
import { SunSwapMarketQueryService } from "../../application/use-cases/tron/sunswap/market-query-service.js";
import { SunSwapLiquidityService } from "../../application/use-cases/tron/sunswap/liquidity-service.js";
import { SunSwapRemoveLiquidityService } from "../../application/use-cases/tron/sunswap/remove-liquidity-service.js";
import { SunSwapCollectFeesService } from "../../application/use-cases/tron/sunswap/collect-fees-service.js";
import { SunSwapPositionInfoService } from "../../application/use-cases/tron/sunswap/position-info-service.js";
import { SunPumpCurveTradeService } from "../../application/use-cases/tron/sunpump/curve-trade-service.js";
import { SunPumpMarketQueryService } from "../../application/use-cases/tron/sunpump/market-query-service.js";
import { SunPumpTokenLaunchService } from "../../application/use-cases/tron/sunpump/token-launch-service.js";
import { SunSwapSwapService } from "../../application/use-cases/tron/sunswap/swap-service.js";
import {
  sunswapSwapSpec,
  sunswapSwapTronBinding,
} from "../../adapters/inbound/cli/commands/sunswap/swap.js";
import {
  sunpumpBuySpec,
  sunpumpBuyTronBinding,
} from "../../adapters/inbound/cli/commands/sunpump/buy.js";
import {
  sunpumpSellSpec,
  sunpumpSellTronBinding,
} from "../../adapters/inbound/cli/commands/sunpump/sell.js";
import {
  sunpumpTokenListSpec,
  sunpumpTokenListTronBinding,
} from "../../adapters/inbound/cli/commands/sunpump/token-list.js";
import {
  sunpumpTokenInfoSpec,
  sunpumpTokenInfoTronBinding,
} from "../../adapters/inbound/cli/commands/sunpump/token-info.js";
import {
  sunpumpTokenSearchSpec,
  sunpumpTokenSearchTronBinding,
} from "../../adapters/inbound/cli/commands/sunpump/token-search.js";
import {
  sunpumpLaunchSpec,
  sunpumpLaunchTronBinding,
} from "../../adapters/inbound/cli/commands/sunpump/launch.js";
import { SunSwapTokenResolver } from "../../application/services/sunswap-token-resolver.js";
import {
  sunswapPriceSpec,
  sunswapPriceTronBinding,
} from "../../adapters/inbound/cli/commands/sunswap/price.js";
import {
  sunswapAddLiquiditySpec,
  sunswapAddLiquidityTronBinding,
} from "../../adapters/inbound/cli/commands/sunswap/add-liquidity.js";
import {
  sunswapRemoveLiquiditySpec,
  sunswapRemoveLiquidityTronBinding,
} from "../../adapters/inbound/cli/commands/sunswap/remove-liquidity.js";
import {
  sunswapCollectFeesSpec,
  sunswapCollectFeesTronBinding,
} from "../../adapters/inbound/cli/commands/sunswap/collect-fees.js";
import {
  sunswapPositionListSpec,
  sunswapPositionListTronBinding,
} from "../../adapters/inbound/cli/commands/sunswap/position-list.js";
import {
  sunswapPositionInfoSpec,
  sunswapPositionInfoTronBinding,
} from "../../adapters/inbound/cli/commands/sunswap/position-info.js";
import {
  sunswapPoolListSpec,
  sunswapPoolListTronBinding,
} from "../../adapters/inbound/cli/commands/sunswap/pool-list.js";
import {
  sunswapPoolSearchSpec,
  sunswapPoolSearchTronBinding,
} from "../../adapters/inbound/cli/commands/sunswap/pool-search.js";
import {
  sunswapTokenListSpec,
  sunswapTokenListTronBinding,
} from "../../adapters/inbound/cli/commands/sunswap/token-list.js";
import {
  sunswapTokenSearchSpec,
  sunswapTokenSearchTronBinding,
} from "../../adapters/inbound/cli/commands/sunswap/token-search.js";
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
  agents: AgentService;
  gateways: ChainGatewayProvider;
  tokens: TokenRepository;
  prices: PriceProvider;
  signers: SignerResolver;
  transactions: TxPipeline;
  accounts: AccountStore;
  timeoutMs: number;
  tronlink: TronLinkCollaborationPort;
  gasfree: GasFreeProvider;
  /** SunSwap market data; the capability gate keeps it out of reach on a network without it. */
  sunswapMarket: MarketDataPort;
  /** SunSwap liquidity contracts; keyed on a different capability, since Nile has these and no
   *  market service. Bound when the commands that use it land. */
  sunswapLiquidity: LiquidityPort;
  sunpumpLaunchpad: LaunchpadPort;
  sunpumpMarket: SunPumpMarketDataPort;
  /** the SunPump create endpoint. Its own port: the service creates the token and picks its owner,
   *  so nothing about it goes through a signer or the transaction pipeline. */
  sunpumpLaunch: SunPumpTokenLaunchPort;
  sunswapRouter: RouterPort;
  sunswapRouterPlanner: RouterExecutionPort;
  sunswapPermits: Permit2Port;
  /** config alias book, so a refusal can name a network the way a person types it. */
  aliases: Record<string, string>;
  recipients: RecipientResolver;
  balances: AccountBalanceService;
  tokenBook: TokenBookService;
}

export function registerTronChainCommands(
  reg: CommandRegistry,
  deps: TronChainCommandDependencies,
): void {
  reg.addChain(showSpec, "tron", showTronBinding(deps.agents));
  reg.addChain(registerSpec, "tron", registerTronBinding(deps.agents));
  reg.addChain(updateSpec, "tron", updateTronBinding(deps.agents));
  reg.addChain(transferSpec, "tron", transferTronBinding(deps.agents));
  reg.addChain(approveSpec, "tron", approveTronBinding(deps.agents));
  reg.addChain(operatorAddSpec, "tron", operatorAddTronBinding(deps.agents));
  reg.addChain(operatorRemoveSpec, "tron", operatorRemoveTronBinding(deps.agents));
  reg.addChain(operatorCheckSpec, "tron", operatorCheckTronBinding(deps.agents));

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
  // One resolver, shared: the liquidity commands must resolve a symbol to the same address the
  // price came from, and two copies of that rule would diverge the first time either was edited.
  const sunswapTokens = new SunSwapTokenResolver(deps.tokens, deps.aliases);
  const sunswap = new SunSwapMarketQueryService(
    deps.sunswapMarket,
    deps.tokens,
    deps.aliases,
    sunswapTokens,
  );
  const sunswapLiquidity = new SunSwapLiquidityService(
    deps.sunswapLiquidity,
    deps.gateways,
    deps.transactions,
    sunswapTokens,
    deps.sunswapPermits,
    deps.signers,
  );
  const sunpumpMarket = new SunPumpMarketQueryService(deps.sunpumpMarket);
  const sunpumpLaunch = new SunPumpTokenLaunchService(deps.sunpumpLaunch);
  const sunpumpCurve = new SunPumpCurveTradeService(
    deps.sunpumpLaunchpad,
    deps.gateways,
    deps.transactions,
  );
  const sunswapSwap = new SunSwapSwapService(
    deps.sunpumpLaunchpad,
    deps.gateways,
    deps.transactions,
    sunswapTokens,
    deps.sunswapRouter,
    deps.sunswapLiquidity,
    deps.sunswapRouterPlanner,
    deps.sunswapPermits,
    deps.signers,
  );
  const sunswapCollectFees = new SunSwapCollectFeesService(
    deps.sunswapLiquidity,
    deps.gateways,
    deps.transactions,
    sunswapTokens,
  );
  // Chain-first: the position manager and the pool answer everything but the USD values, which
  // is why it takes the liquidity port first and the market only for prices.
  const sunswapPositionInfo = new SunSwapPositionInfoService(
    deps.sunswapLiquidity,
    deps.sunswapMarket,
  );
  const sunswapRemoveLiquidity = new SunSwapRemoveLiquidityService(
    deps.sunswapLiquidity,
    deps.gateways,
    deps.transactions,
    sunswapTokens,
  );
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
  // Registration order is what the group help lists, so these follow the documented running order:
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
  // TRON-only, so they sit at the end of the `tx` group listing.
  reg.addChain(txApprovalsSpec, "tron", txApprovalsTronBinding(multisig));
  reg.addChain(txTronLinkMultisigSpec, "tron", txTronLinkMultisigBinding(multisigCollaboration));
  reg.addChain(gasFreeInfoSpec, "tron", gasFreeInfoTronBinding(gasfree));
  reg.addChain(gasFreeTransferSpec, "tron", gasFreeTransferTronBinding(gasfree));
  reg.addChain(gasFreeTraceSpec, "tron", gasFreeTraceTronBinding(gasfree));
  reg.addChain(sunswapAddLiquiditySpec, "tron", sunswapAddLiquidityTronBinding(sunswapLiquidity));
  reg.addChain(
    sunswapRemoveLiquiditySpec,
    "tron",
    sunswapRemoveLiquidityTronBinding(sunswapRemoveLiquidity),
  );
  reg.addChain(sunswapCollectFeesSpec, "tron", sunswapCollectFeesTronBinding(sunswapCollectFees));
  reg.addChain(sunswapSwapSpec, "tron", sunswapSwapTronBinding(sunswapSwap));
  reg.addChain(sunpumpBuySpec, "tron", sunpumpBuyTronBinding(sunpumpCurve));
  reg.addChain(sunpumpTokenListSpec, "tron", sunpumpTokenListTronBinding(sunpumpMarket));
  reg.addChain(sunpumpTokenInfoSpec, "tron", sunpumpTokenInfoTronBinding(sunpumpMarket));
  reg.addChain(sunpumpTokenSearchSpec, "tron", sunpumpTokenSearchTronBinding(sunpumpMarket));
  reg.addChain(sunpumpSellSpec, "tron", sunpumpSellTronBinding(sunpumpCurve));
  reg.addChain(sunpumpLaunchSpec, "tron", sunpumpLaunchTronBinding(sunpumpLaunch));
  reg.addChain(sunswapPositionListSpec, "tron", sunswapPositionListTronBinding(sunswap));
  reg.addChain(
    sunswapPositionInfoSpec,
    "tron",
    sunswapPositionInfoTronBinding(sunswapPositionInfo),
  );
  reg.addChain(sunswapPoolListSpec, "tron", sunswapPoolListTronBinding(sunswap));
  reg.addChain(sunswapPoolSearchSpec, "tron", sunswapPoolSearchTronBinding(sunswap));
  reg.addChain(sunswapTokenListSpec, "tron", sunswapTokenListTronBinding(sunswap));
  reg.addChain(sunswapTokenSearchSpec, "tron", sunswapTokenSearchTronBinding(sunswap));
  reg.addChain(sunswapPriceSpec, "tron", sunswapPriceTronBinding(sunswap));
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
  // `chain params` is TRON-only and goes last in the group listing.
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
