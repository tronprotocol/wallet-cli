import type {
  AccountSelector,
  ChainFamily,
  NetworkBlock,
  NetworkDescriptor,
  SignedTxOf,
  TypedDataSignature,
  UnsignedTx,
} from "../domain/types/index.js";
import type { DispatchCheck } from "../application/contracts/deadline.js";
import type { TransactionScope } from "../application/contracts/execution-scope.js";
import type { BroadcastGuard } from "../application/contracts/broadcast-guard.js";
import type { TronGateway } from "../application/ports/chain/tron/tron-gateway.js";
import type { EvmGateway } from "../application/ports/chain/evm/evm-gateway.js";
import type { NativeBalanceReader } from "../application/ports/chain/native-balance-reader.js";
import type { TokenRepository } from "../application/ports/token-repository.js";
import type { TronContractCalls } from "../application/services/plugins/tron-contract-calls.js";
import type {
  MessagePayload,
  TransactionPayload,
  TypedDataSignPayload,
} from "../application/services/signing/signing-service.js";
import type { TronContractService } from "../application/use-cases/tron/contract-service.js";
import type { EvmContractService } from "../application/use-cases/evm/contract-service.js";
import type { PluginSignRequest } from "../application/services/plugins/plugin-signing.js";
import type { RecipientResolver } from "../application/services/recipient-resolver.js";

export type { MessagePayload, PluginSignRequest, TransactionPayload, TypedDataSignPayload };

// Signs inside the core; a plugin never receives the signer.
export interface PluginSigningService {
  assertCanSign(account: AccountSelector, family: ChainFamily): void;
  // Unlocks a software signer before the command's network work starts.
  prepare(account: AccountSelector, family: ChainFamily): void;
  signerAddress(account: AccountSelector, family: ChainFamily): string;
  // A transaction a service built for the account to sign.
  sign<T extends UnsignedTx>(
    scope: TransactionScope,
    request: PluginSignRequest<TransactionPayload<T>>,
  ): Promise<SignedTxOf<T>>;
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

export type PluginEvmGateway = Pick<EvmGateway, "getTransactionReceipt" | "getErc20Balance">;

export type PluginNativeBalance = Pick<NativeBalanceReader, "getNativeBalance">;

// One TRON contract call through the transaction lifecycle; the core builds, signs and sends it.
export type PluginTronCalls = Pick<TronContractCalls, "run">;

// The token book: curated tokens, and the tokens an account added.
export type PluginTokens = Pick<TokenRepository, "official" | "effective">;

export interface PluginNetworks {
  // Network aliases from the configuration, alias to canonical id.
  aliases(): Readonly<Record<string, string>>;
  // A configured network by id or alias; refuses an unknown one.
  resolve(id: string | undefined): NetworkDescriptor;
}

export interface PluginAccounts {
  // Refuses a selector that names no account of the family, or more than one.
  checkAccount(account: AccountSelector, family: ChainFamily): void;
}

export interface PluginLifetime {
  // Keeps the process alive after the command returns and ends the command deadline.
  keepAlive(): void;
}

// Every call on a returned gateway runs under `check`.
export interface PluginGateways {
  get(network: NetworkDescriptor, family: "tron", check: DispatchCheck): PluginTronGateway;
  get(network: NetworkDescriptor, family: "evm", check: DispatchCheck): PluginEvmGateway;
  // The network's native balance, whatever its family.
  client(network: NetworkDescriptor, check: DispatchCheck): PluginNativeBalance;
}

export type PluginRecipients = Pick<RecipientResolver, "resolve">;

export interface PluginConfig {
  // The user's block of that name on the network; the plugin applies its own defaults and checks.
  networkBlock(network: NetworkDescriptor, name: string): NetworkBlock;
  // The configured value of a credential key this plugin declares; throws for any other key.
  credential(key: string): string | undefined;
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
  readonly lifetime: PluginLifetime;
  readonly accounts: PluginAccounts;
}
