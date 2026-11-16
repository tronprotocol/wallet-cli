import type {
  AccountSelector,
  ChainFamily,
  NetworkBlock,
  NetworkDescriptor,
  TypedDataSignature,
} from "../domain/types/index.js";
import type { DispatchCheck } from "../application/contracts/deadline.js";
import type { TransactionScope } from "../application/contracts/execution-scope.js";
import type { BroadcastGuard } from "../application/contracts/broadcast-guard.js";
import type { TronGateway } from "../application/ports/chain/tron/tron-gateway.js";
import type { EvmGateway } from "../application/ports/chain/evm/evm-gateway.js";
import type { TokenRepository } from "../application/ports/token-repository.js";
import type { TronContractCalls } from "../application/services/plugins/tron-contract-calls.js";
import type {
  MessagePayload,
  TypedDataSignPayload,
} from "../application/services/signing/signing-service.js";
import type { TronContractService } from "../application/use-cases/tron/contract-service.js";
import type { EvmContractService } from "../application/use-cases/evm/contract-service.js";
import type { PluginSignRequest } from "../application/services/plugins/plugin-signing.js";
import type { RecipientResolver } from "../application/services/recipient-resolver.js";

export type { MessagePayload, PluginSignRequest, TypedDataSignPayload };

// Signs inside the core; a plugin never receives the signer.
export interface PluginSigningService {
  assertCanSign(account: AccountSelector, family: ChainFamily): void;
  signerAddress(account: AccountSelector, family: ChainFamily): string;
  // A personal message, signed as `message sign` signs it.
  sign(scope: TransactionScope, request: PluginSignRequest<MessagePayload>): Promise<string>;
  sign(
    scope: TransactionScope,
    request: PluginSignRequest<TypedDataSignPayload>,
  ): Promise<TypedDataSignature>;
}

// Contract reads and writes with the transaction lifecycle of `contract call` and `contract send`.
export interface PluginContracts {
  readonly tron: Pick<TronContractService, "call" | "send">;
  readonly evm: Pick<EvmContractService, "call" | "send">;
}

export type PluginTronGateway = Pick<
  TronGateway,
  | "getTrc20Balance"
  | "getTokenInfo"
  | "getAccount"
  | "getTransactionInfoById"
  | "receivedAmount"
  | "triggerConstantContract"
>;

export type PluginEvmGateway = Pick<EvmGateway, "getTransactionReceipt">;

// One TRON contract call through the transaction lifecycle; the core builds, signs and sends it.
export type PluginTronCalls = Pick<TronContractCalls, "run">;

// The token book: curated tokens, and the tokens an account added.
export type PluginTokens = Pick<TokenRepository, "official" | "effective">;

export interface PluginNetworks {
  // Network aliases from the configuration, alias to canonical id.
  aliases(): Readonly<Record<string, string>>;
}

// Every call on a returned gateway runs under `check`.
export interface PluginGateways {
  get(network: NetworkDescriptor, family: "tron", check: DispatchCheck): PluginTronGateway;
  get(network: NetworkDescriptor, family: "evm", check: DispatchCheck): PluginEvmGateway;
}

export type PluginRecipients = Pick<RecipientResolver, "resolve">;

// Service credentials the core configuration stores.
export type ServiceCredentialKey = "gasfreeApiKey" | "gasfreeApiSecret" | "baiApiKey";

export interface PluginConfig {
  // The user's block of that name on the network; the plugin applies its own defaults and checks.
  networkBlock(network: NetworkDescriptor, name: string): NetworkBlock;
  credential(key: ServiceCredentialKey): string | undefined;
}

export interface PluginClock {
  // Wall-clock milliseconds since the epoch.
  now(): number;
}

export interface HostServices {
  readonly signing: PluginSigningService;
  readonly gateways: PluginGateways;
  readonly contracts: PluginContracts;
  readonly tronCalls: PluginTronCalls;
  readonly tokens: PluginTokens;
  readonly networks: PluginNetworks;
  readonly recipients: PluginRecipients;
  readonly config: PluginConfig;
  // Checked before every submit to the plugin's own service.
  readonly broadcastGuard: BroadcastGuard;
  readonly clock: PluginClock;
}
