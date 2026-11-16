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
import type { TronTokenInfo } from "../application/ports/chain/tron/tron-gateway.js";
import type { TypedDataSignPayload } from "../application/services/signing/signing-service.js";
import type { PluginSignRequest } from "../application/services/plugins/plugin-signing.js";
import type { RecipientResolver } from "../application/services/recipient-resolver.js";

export type { PluginSignRequest };

// Signs inside the core; a plugin never receives the signer.
export interface PluginSigningService {
  assertCanSign(account: AccountSelector, family: ChainFamily): void;
  signerAddress(account: AccountSelector, family: ChainFamily): string;
  sign(
    scope: TransactionScope,
    request: PluginSignRequest<TypedDataSignPayload>,
  ): Promise<TypedDataSignature>;
}

export interface PluginTronGateway {
  getTrc20Balance(contract: string, address: string): Promise<string>;
  getTokenInfo(contract: string): Promise<TronTokenInfo>;
}

// Every call on a returned gateway runs under `check`.
export interface PluginGateways {
  get(network: NetworkDescriptor, family: "tron", check: DispatchCheck): PluginTronGateway;
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
  readonly recipients: PluginRecipients;
  readonly config: PluginConfig;
  // Checked before every submit to the plugin's own service.
  readonly broadcastGuard: BroadcastGuard;
  readonly clock: PluginClock;
}
