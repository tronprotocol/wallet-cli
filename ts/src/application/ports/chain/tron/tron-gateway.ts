import type {
  AccountPermissionsView,
  BroadcastResult,
  RawNodePayload,
  TronFeeReport,
  TypedDataPayload,
  TronProtocolValue,
  TronTransactionArtifact,
  UnsignedTx,
} from "../../../../domain/types/index.js";
import type { Sun } from "../../../../domain/amounts/index.js";
import type { RpcResourceCode } from "../../../../domain/tron/resources/index.js";
import type { DispatchCheck } from "../../../contracts/deadline.js";
import type { Broadcaster } from "../broadcaster.js";

export interface TronContractParameter {
  type: string;
  value: unknown;
}

declare const rawNodeJson: unique symbol;

// Node JSON passed through for verbatim display; opaque so inner layers cannot read its fields.
export interface TronRawJson<Kind extends string> extends RawNodePayload {
  readonly [rawNodeJson]: Kind;
}
export type TronRawBlock = TronRawJson<"block">;
export type TronRawAccount = TronRawJson<"account">;
export type TronRawContract = TronRawJson<"contract">;
export type TronRawContractInfo = TronRawJson<"contract-info">;

// Resource units; voting power in TP. Bandwidth includes the free allowance.
export interface TronResourceUsage {
  energy: { used: number; limit: number };
  bandwidth: { used: number; limit: number };
  votingPower: { total: number; used: number };
}

// Staked TRX in SUN by resource; tronPowerSun is stake that yields voting power only.
export interface TronStakeTotals {
  energySun: string;
  bandwidthSun: string;
  tronPowerSun: string;
  totalSun: string;
}

export interface TronUnfreezing {
  amountSun: string;
  // Epoch milliseconds.
  withdrawableAt: number;
}

// Times are epoch milliseconds.
export interface TronAccountState {
  // Base58; absent when the account is not activated.
  address?: string;
  balanceSun: string;
  // Decoded on-chain account name and id; absent when unset.
  name?: string;
  id?: string;
  createdAt?: number;
  // Absent when the account has never withdrawn rewards.
  latestWithdrawAt?: number;
  stake: TronStakeTotals;
  unfreezing: TronUnfreezing[];
  votes: TronVote[];
  raw: TronRawAccount;
}

// address is the node's hex address, absent when the account is not activated; balance is SUN.
export interface TronAccount {
  address?: string;
  balance?: string;
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
}

export type TronProposalState = "PENDING" | "DISAPPROVED" | "APPROVED" | "CANCELED";

// int64 parameter values remain exact decimal strings.
export interface TronProposal {
  id: number;
  proposerAddress: string;
  parameters: Record<string, string>;
  expirationTime: number;
  createTime: number;
  approvals: string[];
  state: TronProposalState;
}

export interface TronTransactionBuildOptions {
  permissionId?: number;
}

export interface TronVote {
  witness: string;
  count: string;
}

// Text fields are decoded.
export interface TronTokenInfo {
  contract?: string;
  name?: string;
  abbr?: string;
  symbol?: string;
  decimals?: number;
  precision?: number;
  totalSupply?: string;
}

// Non-visible broadcasts require numeric JSON int64 fields; issuance must stay within safe integers.
export interface TronAssetTranche {
  frozen_amount: number;
  frozen_days: number;
}

export interface TronAssetTrancheView {
  frozen_amount: string;
  frozen_days: number;
}

// Text fields are decoded UTF-8; quantities are token base units.
// trx_num/num is the ICO rate in SUN per base unit (int32 pair).
export interface TronAsset {
  id: string;
  owner_address: string;
  name: string;
  abbr?: string;
  description?: string;
  url?: string;
  // Exact decimal int64.
  total_supply: string;
  trx_num: number;
  num: number;
  precision?: number;
  start_time: number;
  end_time: number;
  free_asset_net_limit?: number;
  public_free_asset_net_limit?: number;
  frozen_supply?: TronAssetTrancheView[];
}

export interface TronAssetUpdate {
  description: string;
  url: string;
  freeAssetNetLimit: number;
  publicFreeAssetNetLimit: number;
}

// Quantities are token base units.
export interface TronAssetIssuance {
  name: string;
  abbr: string;
  description: string;
  url: string;
  totalSupply: number;
  trxNum: number;
  num: number;
  precision: number;
  startTime: number;
  endTime: number;
  freeAssetNetLimit: number;
  publicFreeAssetNetLimit: number;
  frozenSupply: TronAssetTranche[];
}

// Token IDs are decoded: "_" for TRX, numeric ID for TRC10; balances are base units.
// Side order is preserved from creation.
export interface TronExchange {
  exchangeId: number;
  creatorAddress: string;
  createTime: number;
  firstTokenId: string;
  firstTokenBalance: string;
  secondTokenId: string;
  secondTokenBalance: string;
}

declare const rawTxInfo: unique symbol;
declare const rawTransaction: unique symbol;

// Node JSON passed through verbatim for display; inner layers never read it.
export interface TronRawTxInfo extends RawNodePayload {
  readonly [rawTxInfo]: true;
}
export interface TronRawTransaction extends RawNodePayload {
  readonly [rawTransaction]: true;
}

// "unknown": the node reported no execution result; native transactions never carry one.
export type TronExecution = "success" | "failed" | "unknown";

// Hex fields are as the node returns them.
export interface TronTxLog {
  readonly address?: string;
  readonly topics?: string[];
  readonly data?: string;
}

export interface TronInternalTransaction {
  readonly caller_address?: string;
  readonly transferTo_address?: string;
  readonly rejected?: boolean;
  // callValue is an exact base-unit decimal string.
  readonly callValueInfo?: Array<{ readonly callValue?: string; readonly tokenId?: string }>;
}

// Number fields are proven safe integers; string amounts are exact base-unit decimal strings.
export interface TronTxInfo {
  // Absent while the node has not included the transaction.
  readonly blockNumber?: number;
  readonly execution: TronExecution;
  // Present only for a failed execution: the receipt result code, or "FAILED".
  readonly failureReason?: string;
  // receipt.result as the node reported it.
  readonly receiptResult?: string;
  readonly feeSun?: number;
  readonly energyUsed?: number;
  readonly energyFeeSun?: number;
  readonly netUsed?: number;
  readonly netFeeSun?: number;
  readonly withdrawnSun?: Sun;
  readonly unfreezeAmount?: Sun;
  readonly assetIssueId?: string;
  readonly exchangeId?: number;
  readonly exchangeReceived?: string;
  readonly exchangeInjectedOther?: string;
  readonly exchangeWithdrawnOther?: string;
  // Absent when the node returned none or a malformed one.
  readonly contractResult?: string[];
  readonly log?: TronTxLog[];
  readonly internal_transactions?: TronInternalTransaction[];
  readonly raw: TronRawTxInfo;
}

export interface TronTx {
  // Absent when the node does not know the transaction.
  readonly txId?: string;
  // ret[0].contractRet as the node reported it.
  readonly contractResult?: string;
  readonly parties: DecodedTronTransaction;
  readonly raw: TronRawTransaction;
}

export interface DecodedTronTransaction {
  kind: "trx" | "trc10" | "trc20" | "contract" | "unknown";
  from?: string;
  to?: string;
  rawAmount?: string;
  tokenContract?: string;
}

export interface TronContractMetadata {
  name?: string;
  methods: string[];
  originAddress?: string;
  contract: TronRawContract;
  // Absent when the node returned no contract info.
  info?: TronRawContractInfo;
}

export interface TronFeeEstimate extends TronFeeReport {
  energy: number;
}

// Base58 addresses, SUN strings, expiry in epoch milliseconds or null.
export interface TronDelegatedResource {
  from: string;
  to: string;
  balanceForEnergySun: string;
  balanceForBandwidthSun: string;
  expireTimeForEnergy: number | null;
  expireTimeForBandwidth: number | null;
}

// Fields are absent when the node does not report them.
export interface TronNodeInfo {
  solidBlockNumber?: number;
  peers?: { connected: number; active: number };
  codeVersion?: string;
  p2pVersion?: string;
}

// Timestamps are epoch milliseconds.
export interface TronHeadBlock {
  number: number;
  timestampMs: number;
}

export interface TronBlock extends TronHeadBlock {
  transactionCount: number;
  raw: TronRawBlock;
}

// One step of a node price timeline: SUN per resource unit from sinceMs on.
export interface TronPricePoint {
  sinceMs: number;
  sunPerUnit: number;
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

// "different": the node's block at that height is another block. "not-reached": the node holds no
// such block and its head block is older than the transaction.
export type TronReferenceBlockStatus = "held" | "different" | "not-reached";

export interface TronGateway extends Broadcaster {
  prepareTransaction(
    transaction: TronTransactionArtifact,
    options: { permissionId: number; expiration?: number },
  ): TronTransactionArtifact;
  encodeTransactionHex(transaction: TronTransactionArtifact): string;
  // Rejects JSON whose raw_data, raw_data_hex and txID disagree; returns the caller's object unchanged.
  encodeTransactionJson(json: TronProtocolValue): {
    transaction: TronTransactionArtifact;
    hex: string;
  };
  decodeTransactionHex(hex: string): TronTransactionArtifact;
  getAccountPermissions(address: string): Promise<AccountPermissionsView>;
  buildAccountPermissionUpdate(
    owner: string,
    permissions: AccountPermissionsView,
  ): Promise<TronTransactionArtifact>;
  getSignWeight(transaction: TronTransactionArtifact): Promise<TronSignWeight>;
  getApprovedList(transaction: TronTransactionArtifact): Promise<string[]>;
  broadcastHex(hex: string, check: DispatchCheck): Promise<BroadcastResult>;
  getUpdateAccountPermissionFee(): Promise<number>;
  getMultiSignFee(): Promise<number>;
  getNativeBalance(address: string): Promise<Sun>;
  getAccount(address: string): Promise<TronAccount>;
  getAccountState(address: string): Promise<TronAccountState>;
  getAccountStateById(accountId: string): Promise<TronAccountState>;
  getAccountResources(address: string): Promise<TronResourceUsage>;
  // Latest block when number is omitted; null when the node holds no block at that height.
  getBlock(number?: string): Promise<TronBlock | null>;
  getHeadBlock(): Promise<TronHeadBlock>;
  // TAPOS: whether this node holds the block the transaction references; reads the head block.
  referenceBlockStatus(transaction: UnsignedTx): Promise<TronReferenceBlockStatus>;
  // 0x hex TIP-712 digest a signature over payload commits to; computed locally.
  typedDataDigest(payload: TypedDataPayload): string;
  getTransactionById(txid: string): Promise<TronTx>;
  getTransactionInfoById(txid: string): Promise<TronTxInfo>;
  // Net base units received, verified from transaction logs or internal native transfers.
  receivedAmount(txid: string, token: string, recipient: string): Promise<string | undefined>;
  // Values are proven safe integers.
  getChainParameters(): Promise<Array<{ key: string; value?: number }>>;
  // Non-empty, oldest first; the last point is the current price.
  getEnergyPrices(): Promise<TronPricePoint[]>;
  getBandwidthPrices(): Promise<TronPricePoint[]>;
  getNodeInfo(): Promise<TronNodeInfo>;
  getDelegatedResourceV2(from: string, to: string): Promise<TronDelegatedResource[]>;
  getDelegatedIndexV2(address: string): Promise<{ fromAccounts: string[]; toAccounts: string[] }>;
  getCanDelegatedMaxSize(address: string, resource: RpcResourceCode): Promise<string>;
  getCanWithdrawUnfreezeAmount(address: string): Promise<string>;
  getAvailableUnfreezeCount(address: string): Promise<number>;
  decodeTransaction(transaction: TronTransactionArtifact): DecodedTronTransaction;
  getTrc20Balance(contract: string, address: string): Promise<string>;
  getTokenInfo(contract: string): Promise<TronTokenInfo>;
  getTrc10Balance(assetId: string, address: string): Promise<string>;
  // The node's asset record, including fields TronAsset does not name.
  getTrc10Info(assetId: string): Promise<TronAsset>;
  buildNativeTransfer(
    from: string,
    to: string,
    amountSun: string,
  ): Promise<TronTransactionArtifact>;
  buildAccountCreate(owner: string, target: string): Promise<TronTransactionArtifact>;
  buildAccountUpdate(owner: string, accountName: string): Promise<TronTransactionArtifact>;
  buildSetAccountId(owner: string, accountId: string): Promise<TronTransactionArtifact>;
  buildTrc20Transfer(
    from: string,
    to: string,
    contract: string,
    amount: string,
    feeLimit: Sun,
  ): Promise<TronTransactionArtifact>;
  buildTrc10Transfer(
    from: string,
    to: string,
    assetId: string,
    amount: string,
  ): Promise<TronTransactionArtifact>;

  getAssetById(assetId: string): Promise<TronAsset | undefined>;
  // Names can identify multiple assets.
  getAssetsByName(name: string): Promise<TronAsset[]>;
  // An account may issue at most one asset.
  getAssetByIssuer(address: string): Promise<TronAsset | undefined>;
  // One server-side page only.
  listAssets(limit: number, offset: number): Promise<TronAsset[]>;
  buildAssetIssue(owner: string, issuance: TronAssetIssuance): Promise<TronTransactionArtifact>;
  buildAssetUpdate(owner: string, update: TronAssetUpdate): Promise<TronTransactionArtifact>;
  buildAssetParticipate(
    owner: string,
    issuer: string,
    assetId: string,
    amountSun: string,
  ): Promise<TronTransactionArtifact>;
  buildAssetUnfreeze(owner: string): Promise<TronTransactionArtifact>;

  getExchangeById(exchangeId: number): Promise<TronExchange | undefined>;
  // Server-side page in ID order.
  listExchanges(limit: number, offset: number): Promise<TronExchange[]>;
  buildExchangeCreate(
    owner: string,
    firstTokenId: string,
    firstBalance: string,
    secondTokenId: string,
    secondBalance: string,
  ): Promise<TronTransactionArtifact>;
  buildExchangeInject(
    owner: string,
    exchangeId: number,
    tokenId: string,
    quant: string,
  ): Promise<TronTransactionArtifact>;
  buildExchangeWithdraw(
    owner: string,
    exchangeId: number,
    tokenId: string,
    quant: string,
  ): Promise<TronTransactionArtifact>;
  // expected is the on-chain slippage floor; lower output reverts.
  buildExchangeTrade(
    owner: string,
    exchangeId: number,
    tokenId: string,
    quant: string,
    expected: string,
  ): Promise<TronTransactionArtifact>;
  estimateResources(
    from: string,
    contract: string,
    method: string,
    parameters: TronContractParameter[],
    callValueSun?: Sun,
  ): Promise<TronFeeEstimate>;
  buildFreezeV2(
    owner: string,
    amountSun: string,
    resource: RpcResourceCode,
  ): Promise<TronTransactionArtifact>;
  buildUnfreezeV2(
    owner: string,
    amountSun: string,
    resource: RpcResourceCode,
  ): Promise<TronTransactionArtifact>;
  buildWithdrawExpireUnfreeze(owner: string): Promise<TronTransactionArtifact>;
  buildCancelAllUnfreezeV2(owner: string): Promise<TronTransactionArtifact>;
  buildDelegateResource(
    owner: string,
    amountSun: string,
    resource: RpcResourceCode,
    receiver: string,
    lock: boolean,
    lockPeriod?: string,
  ): Promise<TronTransactionArtifact>;
  buildUndelegateResource(
    owner: string,
    amountSun: string,
    resource: RpcResourceCode,
    receiver: string,
  ): Promise<TronTransactionArtifact>;
  buildVoteWitness(owner: string, votes: TronVote[]): Promise<TronTransactionArtifact>;
  buildWithdrawBalance(owner: string): Promise<TronTransactionArtifact>;
  getWitnesses(limit: number): Promise<TronWitness[]>;
  getWitness(address: string): Promise<TronWitness | null>;
  getProposals(): Promise<TronProposal[]>;
  getProposal(id: number): Promise<TronProposal | null>;
  buildProposalCreate(
    owner: string,
    parameters: Array<{ key: number; value: bigint }>,
    options?: TronTransactionBuildOptions,
  ): Promise<TronTransactionArtifact>;
  buildProposalApprove(
    owner: string,
    proposalId: number,
    addApproval: boolean,
    options?: TronTransactionBuildOptions,
  ): Promise<TronTransactionArtifact>;
  buildProposalDelete(
    owner: string,
    proposalId: number,
    options?: TronTransactionBuildOptions,
  ): Promise<TronTransactionArtifact>;
  buildWitnessCreate(
    owner: string,
    url: string,
    options?: TronTransactionBuildOptions,
  ): Promise<TronTransactionArtifact>;
  buildWitnessUpdate(
    owner: string,
    url: string,
    options?: TronTransactionBuildOptions,
  ): Promise<TronTransactionArtifact>;
  buildWitnessSetBrokerage(
    owner: string,
    brokerage: number,
    options?: TronTransactionBuildOptions,
  ): Promise<TronTransactionArtifact>;
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
    options?: { feeLimit?: Sun; callValue?: Sun; permissionId?: number },
  ): Promise<TronTransactionArtifact>;
  deployContract(
    from: string,
    input: {
      abi: unknown;
      bytecode: string;
      feeLimit: Sun;
      parameters?: unknown[];
      permissionId?: number;
    },
  ): Promise<TronTransactionArtifact>;
  // Base58 address a prepared deployment creates; preparation changes it with the txID.
  deployedContractAddress(transaction: TronTransactionArtifact): string | undefined;
  getContractMetadata(address: string): Promise<TronContractMetadata>;
  buildClearContractAbi(
    owner: string,
    contract: string,
    options?: TronTransactionBuildOptions,
  ): Promise<TronTransactionArtifact>;
  buildUpdateOriginEnergyLimit(
    owner: string,
    contract: string,
    energy: number | string,
    options?: TronTransactionBuildOptions,
  ): Promise<TronTransactionArtifact>;
  buildUpdateUserResourcePercent(
    owner: string,
    contract: string,
    percent: number,
    options?: TronTransactionBuildOptions,
  ): Promise<TronTransactionArtifact>;
}
