import type {
  AccountPermissionsView,
  BroadcastResult,
  FeeReport,
  TronTransactionArtifact,
  UnsignedTx,
} from "../../../domain/types/index.js";
import type { RpcResourceCode } from "../../../domain/resources/index.js";
import type { Broadcaster } from "./broadcaster.js";

export interface TronContractParameter {
  type: string;
  value: unknown;
}

export interface TronAccountResources {
  NetUsed?: number;
  freeNetUsed?: number;
  NetLimit?: number;
  freeNetLimit?: number;
  EnergyUsed?: number;
  EnergyLimit?: number;
}

export interface TronAccountAsset {
  key?: string;
  value?: string;
  [key: string]: unknown;
}

export interface TronFrozenBalance {
  type?: unknown;
  amount?: string;
  unfreeze_amount?: string;
  frozen_balance?: string;
  [key: string]: unknown;
}

export interface TronVoteAllocation {
  vote_address?: unknown;
  voteAddress?: unknown;
  vote_count?: unknown;
  voteCount?: unknown;
  [key: string]: unknown;
}

/** Account payload normalized at the adapter boundary; all SUN/token quantities are strings. */
export interface TronAccount {
  balance?: string;
  allowance?: string;
  asset?: TronAccountAsset[];
  assetV2?: TronAccountAsset[];
  frozen?: TronFrozenBalance[];
  frozenV2?: TronFrozenBalance[];
  unfrozenV2?: TronFrozenBalance[];
  votes?: TronVoteAllocation[];
  [key: string]: unknown;
}

export interface TronWitness {
  address: string;
  voteCount: string;
  url?: string;
  totalProduced?: number;
  totalMissed?: number;
  latestBlockNum?: number;
  latestSlotNum?: number;
  isJobs?: boolean;
  [key: string]: unknown;
}

export interface TronVote {
  witness: string;
  count: string;
}

export interface TronTokenInfo {
  contract?: string;
  name?: unknown;
  abbr?: unknown;
  symbol?: unknown;
  decimals?: number;
  precision?: number;
  totalSupply?: string;
  [key: string]: unknown;
}

export interface TronTxInfo {
  blockNumber?: number;
  fee?: number;
  receipt?: { result?: string; energy_usage_total?: number; [key: string]: unknown };
  [key: string]: unknown;
}

export interface TronTxContract {
  type?: string;
  parameter?: { value?: Record<string, unknown>; [key: string]: unknown };
  [key: string]: unknown;
}

export interface TronTx {
  ret?: Array<{ contractRet?: string; [key: string]: unknown }>;
  raw_data?: { contract?: TronTxContract[]; [key: string]: unknown };
  [key: string]: unknown;
}

/** Protocol-level transfer fields decoded by the outbound TRON adapter. */
export interface DecodedTronTransaction {
  kind: "trx" | "trc10" | "trc20" | "contract" | "unknown";
  from?: string;
  to?: string;
  rawAmount?: string;
  tokenContract?: string;
}

/** Contract RPC variants normalized at the outbound boundary. */
export interface TronContractMetadata {
  name?: string;
  methods: string[];
  contract: unknown;
  info?: unknown;
}

export interface TronFeeEstimate extends FeeReport {
  feeModel: "tron-resource";
  energy: number;
}

/** one V2 delegation record; addresses base58, SUN quantities strings, expiry epoch-ms or null. */
export interface TronDelegatedResource {
  from: string;
  to: string;
  balanceForEnergySun: string;
  balanceForBandwidthSun: string;
  expireTimeForEnergy: number | null;
  expireTimeForBandwidth: number | null;
}

/** getnodeinfo subset the CLI consumes; best-effort — public gateways may omit fields. */
export interface TronNodeInfo {
  block?: string;          // "Num:84120345,ID:…"
  solidityBlock?: string;
  currentConnectCount?: number;
  activeConnectCount?: number;
  configNodeInfo?: { codeVersion?: string; p2pVersion?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface TronSignWeight {
  permission: {
    id: number;
    name: string;
    threshold: number;
    operationsHex?: string;
    keys: Array<{ address: string; weight: number }>;
  } | null;
  approvedList: string[];
  currentWeight: number;
  resultCode: string;
  message?: string;
}

/** TRON-specific application boundary; chain-specific capabilities remain explicit. */
export interface TronGateway extends Broadcaster {
  prepareTransaction(
    transaction: UnsignedTx,
    options: { permissionId: number; expiration?: number },
  ): UnsignedTx;
  encodeTransactionHex(transaction: UnsignedTx): string;
  decodeTransactionHex(hex: string): TronTransactionArtifact;
  getAccountPermissions(address: string): Promise<AccountPermissionsView>;
  buildAccountPermissionUpdate(owner: string, permissions: AccountPermissionsView): Promise<UnsignedTx>;
  getSignWeight(transaction: UnsignedTx): Promise<TronSignWeight>;
  getApprovedList(transaction: UnsignedTx): Promise<string[]>;
  broadcastHex(hex: string): Promise<BroadcastResult>;
  getUpdateAccountPermissionFee(): Promise<number>;
  getMultiSignFee(): Promise<number>;
  getNativeBalance(address: string): Promise<string>;
  getAccount(address: string): Promise<TronAccount>;
  getAccountById(accountId: string): Promise<TronAccount>;
  getAccountResources(address: string): Promise<TronAccountResources>;
  getBlock(number?: string): Promise<unknown>;
  getTransactionById(txid: string): Promise<TronTx>;
  getTransactionInfoById(txid: string): Promise<TronTxInfo>;
  getChainParameters(): Promise<Array<{ key: string; value?: number }>>;
  getEnergyPrices(): Promise<string>;
  getBandwidthPrices(): Promise<string>;
  getNodeInfo(): Promise<TronNodeInfo>;
  getDelegatedResourceV2(from: string, to: string): Promise<TronDelegatedResource[]>;
  getDelegatedIndexV2(address: string): Promise<{ fromAccounts: string[]; toAccounts: string[] }>;
  getCanDelegatedMaxSize(address: string, resource: RpcResourceCode): Promise<string>;
  getCanWithdrawUnfreezeAmount(address: string): Promise<string>;
  getAvailableUnfreezeCount(address: string): Promise<number>;
  decodeTransaction(transaction: TronTx): DecodedTronTransaction;
  getTrc20Balance(contract: string, address: string): Promise<string>;
  getTokenInfo(contract: string): Promise<TronTokenInfo>;
  getTrc10Balance(assetId: string, address: string): Promise<string>;
  getTrc10Info(assetId: string): Promise<TronTokenInfo>;
  buildNativeTransfer(from: string, to: string, amountSun: string): Promise<UnsignedTx>;
  buildAccountCreate(owner: string, target: string): Promise<UnsignedTx>;
  buildAccountUpdate(owner: string, accountName: string): Promise<UnsignedTx>;
  buildSetAccountId(owner: string, accountId: string): Promise<UnsignedTx>;
  buildTrc20Transfer(
    from: string,
    to: string,
    contract: string,
    amount: string,
    feeLimit: string,
  ): Promise<UnsignedTx>;
  buildTrc10Transfer(
    from: string,
    to: string,
    assetId: string,
    amount: string,
  ): Promise<UnsignedTx>;
  estimateResources(
    from: string,
    contract: string,
    method: string,
    parameters: TronContractParameter[],
  ): Promise<TronFeeEstimate>;
  buildFreezeV2(owner: string, amountSun: string, resource: RpcResourceCode): Promise<UnsignedTx>;
  buildUnfreezeV2(owner: string, amountSun: string, resource: RpcResourceCode): Promise<UnsignedTx>;
  buildWithdrawExpireUnfreeze(owner: string): Promise<UnsignedTx>;
  buildCancelAllUnfreezeV2(owner: string): Promise<UnsignedTx>;
  buildDelegateResource(
    owner: string,
    amountSun: string,
    resource: RpcResourceCode,
    receiver: string,
    lock: boolean,
    lockPeriod?: string,
  ): Promise<UnsignedTx>;
  buildUndelegateResource(
    owner: string,
    amountSun: string,
    resource: RpcResourceCode,
    receiver: string,
  ): Promise<UnsignedTx>;
  buildVoteWitness(owner: string, votes: TronVote[]): Promise<UnsignedTx>;
  buildWithdrawBalance(owner: string): Promise<UnsignedTx>;
  getWitnesses(limit: number): Promise<TronWitness[]>;
  getBrokerage(address: string): Promise<number>;
  getReward(address: string): Promise<string>;
  triggerConstantContract(
    contract: string,
    method: string,
    parameters: TronContractParameter[],
    owner?: string,
  ): Promise<string[]>;
  triggerSmartContract(
    from: string,
    contract: string,
    method: string,
    parameters: TronContractParameter[],
    options?: { feeLimit?: string; callValue?: string },
  ): Promise<UnsignedTx>;
  deployContract(
    from: string,
    input: { abi: unknown; bytecode: string; feeLimit: string; parameters?: unknown[] },
  ): Promise<UnsignedTx>;
  getContract(address: string): Promise<unknown>;
  getContractInfo(address: string): Promise<unknown>;
  getContractMetadata(address: string): Promise<TronContractMetadata>;
}
