import type { FeeReport, UnsignedTx } from "../../../domain/types/index.js";
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

export interface TronFeeEstimate extends FeeReport {
  feeModel: "tron-resource";
  energy: number;
}

/** TRON-specific application boundary; chain-specific capabilities remain explicit. */
export interface TronGateway extends Broadcaster {
  getNativeBalance(address: string): Promise<string>;
  getAccount(address: string): Promise<unknown>;
  getAccountResources(address: string): Promise<TronAccountResources>;
  getBlock(number?: number): Promise<unknown>;
  getTransactionById(txid: string): Promise<TronTx>;
  getTransactionInfoById(txid: string): Promise<TronTxInfo>;
  getTrc20Balance(contract: string, address: string): Promise<string>;
  getTokenInfo(contract: string): Promise<TronTokenInfo>;
  getTrc10Balance(assetId: string, address: string): Promise<string>;
  getTrc10Info(assetId: string): Promise<TronTokenInfo>;
  buildNativeTransfer(from: string, to: string, amountSun: string): Promise<UnsignedTx>;
  buildTrc20Transfer(
    from: string,
    to: string,
    contract: string,
    amount: string,
    feeLimit: number,
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
    lockPeriod?: number,
  ): Promise<UnsignedTx>;
  buildUndelegateResource(
    owner: string,
    amountSun: string,
    resource: RpcResourceCode,
    receiver: string,
  ): Promise<UnsignedTx>;
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
    options?: { feeLimit?: number; callValue?: number },
  ): Promise<UnsignedTx>;
  deployContract(
    from: string,
    input: { abi: unknown; bytecode: string; feeLimit: number; parameters?: unknown[] },
  ): Promise<UnsignedTx>;
  getContract(address: string): Promise<unknown>;
  getContractInfo(address: string): Promise<unknown>;
}
