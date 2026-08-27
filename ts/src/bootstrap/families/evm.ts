/**
 * The EVM family plugin — the composition root's entry for `evm`.
 *
 * The plugin supplies the family's identity, signing strategy and gateway factory;
 * `registerEvmChainCommands` binds the commands EVM can serve. Paths with no binding here still
 * refuse cleanly at dispatch (`family_mismatch`).
 *
 * Twenty-one commands are bound: the two signing commands (which need nothing from the chain —
 * the family difference lives entirely inside `evmSignStrategy` — and so reuse the very binding
 * objects the TRON family registers), plus the account, block, chain, tx, token and contract
 * commands that sit on the JSON-RPC gateway.
 */
import { FAMILIES } from "../../domain/family/index.js";
import { evmSignStrategy } from "../../adapters/outbound/chain/evm/signing-strategy.js";
import { EvmRpcClient } from "../../adapters/outbound/chain/evm/evm.js";
import { MessageService } from "../../application/use-cases/message-service.js";
import { TypedDataService } from "../../application/use-cases/typed-data-service.js";
import type { SignerResolver } from "../../application/services/signer/index.js";
import type { CommandRegistry } from "../../adapters/inbound/cli/registry/index.js";
import { messageSignBinding, messageSignSpec } from "../../adapters/inbound/cli/commands/shared.js";
import {
  typedDataSignBinding,
  typedDataSignSpec,
} from "../../adapters/inbound/cli/commands/typed-data.js";
import {
  accountBalanceBinding,
  accountBalanceSpec,
  accountInfoEvmBinding,
  accountInfoSpec,
  accountPortfolioEvmBinding,
  accountPortfolioSpec,
} from "../../adapters/inbound/cli/commands/account.js";
import { blockEvmBinding, blockSpec } from "../../adapters/inbound/cli/commands/block.js";
import {
  chainNodeEvmBinding,
  chainNodeSpec,
  chainPricesEvmBinding,
  chainPricesSpec,
} from "../../adapters/inbound/cli/commands/chain.js";
import { AccountBalanceService } from "../../application/use-cases/account-balance-service.js";
import { EvmAccountService } from "../../application/use-cases/evm/account-service.js";
import { EvmBlockService } from "../../application/use-cases/evm/block-service.js";
import { EvmChainService } from "../../application/use-cases/evm/chain-service.js";
import {
  tokenAddEvmBinding,
  tokenAddSpec,
  tokenBalanceEvmBinding,
  tokenBalanceSpec,
  tokenInfoEvmBinding,
  tokenInfoSpec,
  tokenListBinding,
  tokenListSpec,
  tokenRemoveEvmBinding,
  tokenRemoveSpec,
} from "../../adapters/inbound/cli/commands/token.js";
import {
  contractCallEvmBinding,
  contractCallSpec,
  contractDeployEvmBinding,
  contractDeploySpec,
  contractSendEvmBinding,
  contractSendSpec,
} from "../../adapters/inbound/cli/commands/contract.js";
import { TokenBookService } from "../../application/use-cases/token-book-service.js";
import { EvmTokenService } from "../../application/use-cases/evm/token-service.js";
import { EvmContractService } from "../../application/use-cases/evm/contract-service.js";
import {
  txBroadcastEvmBinding,
  txBroadcastSpec,
  txSendEvmBinding,
  txSendSpec,
  txInfoEvmBinding,
  txInfoSpec,
  txSignEvmBinding,
  txSignSpec,
  txStatusEvmBinding,
  txStatusSpec,
} from "../../adapters/inbound/cli/commands/tx.js";
import { EvmTransactionService } from "../../application/use-cases/evm/transaction-service.js";
import type { TxPipeline } from "../../application/services/pipeline/index.js";
import type { RecipientResolver } from "../../application/services/recipient-resolver.js";
import type { TokenRepository } from "../../application/ports/token-repository.js";
import type { PriceProvider } from "../../application/ports/price-provider.js";
import type { ChainGatewayProvider } from "../../application/ports/chain/gateway-provider.js";
import type { FamilyPlugin } from "./types.js";

export const evmFamily: FamilyPlugin<"evm"> = {
  meta: FAMILIES.evm,
  signStrategy: evmSignStrategy,
  createGateway: (network, timeoutMs) => new EvmRpcClient(network, timeoutMs),
};

export interface EvmChainCommandDependencies {
  signers: SignerResolver;
  gateways: ChainGatewayProvider;
  /** the family-neutral native-balance service, shared with every other family. */
  balances: AccountBalanceService;
  tokens: TokenRepository;
  prices: PriceProvider;
  /** the family-neutral address-book listing, shared with every other family. */
  tokenBook: TokenBookService;
  transactions: TxPipeline;
  recipients: RecipientResolver;
}

export function registerEvmChainCommands(
  reg: CommandRegistry,
  deps: EvmChainCommandDependencies,
): void {
  reg.addChain(messageSignSpec, "evm", messageSignBinding(new MessageService(deps.signers)));
  reg.addChain(typedDataSignSpec, "evm", typedDataSignBinding(new TypedDataService(deps.signers)));

  const account = new EvmAccountService(deps.gateways, deps.tokens, deps.prices);
  reg.addChain(accountBalanceSpec, "evm", accountBalanceBinding(deps.balances));
  reg.addChain(accountInfoSpec, "evm", accountInfoEvmBinding(account));
  reg.addChain(accountPortfolioSpec, "evm", accountPortfolioEvmBinding(account));
  reg.addChain(blockSpec, "evm", blockEvmBinding(new EvmBlockService(deps.gateways)));
  const chain = new EvmChainService(deps.gateways);
  reg.addChain(chainNodeSpec, "evm", chainNodeEvmBinding(chain));
  reg.addChain(chainPricesSpec, "evm", chainPricesEvmBinding(chain));

  const transaction = new EvmTransactionService(
    deps.gateways,
    deps.tokens,
    deps.transactions,
    deps.recipients,
  );
  reg.addChain(txSendSpec, "evm", txSendEvmBinding(transaction));
  reg.addChain(txSignSpec, "evm", txSignEvmBinding(transaction));
  reg.addChain(txBroadcastSpec, "evm", txBroadcastEvmBinding(transaction));
  reg.addChain(txStatusSpec, "evm", txStatusEvmBinding(transaction));
  reg.addChain(txInfoSpec, "evm", txInfoEvmBinding(transaction));

  const token = new EvmTokenService(deps.gateways, deps.tokens);
  reg.addChain(tokenBalanceSpec, "evm", tokenBalanceEvmBinding(token));
  reg.addChain(tokenInfoSpec, "evm", tokenInfoEvmBinding(token));
  reg.addChain(tokenAddSpec, "evm", tokenAddEvmBinding(token));
  reg.addChain(tokenListSpec, "evm", tokenListBinding(deps.tokenBook));
  reg.addChain(tokenRemoveSpec, "evm", tokenRemoveEvmBinding(token));
  const contract = new EvmContractService(deps.gateways, deps.transactions);
  reg.addChain(contractCallSpec, "evm", contractCallEvmBinding(contract));
  reg.addChain(contractSendSpec, "evm", contractSendEvmBinding(contract));
  reg.addChain(contractDeploySpec, "evm", contractDeployEvmBinding(contract));
}
