/**
 * TronRpcClient — thin TRON node wrapper via tronweb HTTP fullHost. Implements the
 * Broadcaster port plus TRON-specific reads, TRC10/TRC20, Stake 2.0, and contract operations.
 * (builtin TRON networks carry an HTTP fullHost; tronweb is HTTP-based.)
 */
import { TronWeb } from "tronweb";
import type { Types } from "tronweb";
import type { BroadcastResult, SignedTx } from "../../../../domain/types/index.js";
import type { RpcResourceCode } from "../../../../domain/resources/index.js";
import type { Broadcaster } from "../../../../application/ports/chain/broadcaster.js";
import type {
  TronContractParameter,
  TronGateway,
  TronTokenInfo,
  TronTx,
  TronTxInfo,
} from "../../../../application/ports/chain/tron-gateway.js";
import { ChainError, TransportError, UsageError } from "../../../../domain/errors/index.js";
import { tronHexToBase58 } from "../../../../domain/address/index.js";
import { parseTronTx, parseTronTxInfo } from "./tron-responses.js";
import { assertBuiltTx } from "./tx-guard.js";

/** a valid base58 owner used as the caller for read-only (constant) contract calls. */
const TRON_READ_OWNER = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

/** 41-prefixed hex TRON address → base58; passes through values that are already base58/empty.
 *  TronGrid's native /transactions endpoint returns hex even with visible=true. */
export function hexToBase58(addr: unknown): string {
  return tronHexToBase58(addr);
}

export class TronRpcClient implements TronGateway, Broadcaster {
  #tw: InstanceType<typeof TronWeb>;
  constructor(fullHost: string) {
    // a dummy address keeps tronweb happy for read-only/builder use (no key → cannot sign)
    this.#tw = new TronWeb({ fullHost });
    this.#tw.setAddress(TRON_READ_OWNER);
  }
  get tronweb(): InstanceType<typeof TronWeb> {
    return this.#tw;
  }
  async getNativeBalance(address: string): Promise<string> {
    try {
      const sun = await this.#tw.trx.getBalance(address);
      return BigInt(sun).toString();
    } catch (e) {
      throw new TransportError("rpc_error", `TRON getBalance failed: ${(e as Error).message}`);
    }
  }
  async broadcast(signed: SignedTx): Promise<BroadcastResult> {
    let res: Types.BroadcastReturn<Types.SignedTransaction>;
    try {
      res = await this.#tw.trx.sendRawTransaction(signed as Types.SignedTransaction);
    } catch (e) {
      throw new TransportError("rpc_error", `TRON broadcast failed: ${(e as Error).message}`);
    }
    // tronweb does NOT throw on node rejection — it returns { result:false, code, message }.
    if (res.result === false) {
      const reason = decodeTronMessage(res.message) || res.code || "rejected by node";
      throw new ChainError("transaction_rejected", `TRON broadcast rejected: ${reason}`, { code: res.code });
    }
    return { txId: res.txid ?? res.transaction?.txID, raw: res };
  }

  /** build an unsigned TRX transfer (tronweb fills ref block etc.). */
  async buildNativeTransfer(from: string, to: string, amountSun: string): Promise<Types.Transaction> {
    // tronweb's sendTrx amount param is a JS number; reject amounts that would lose precision.
    const tx = await this.#tw.transactionBuilder.sendTrx(to, this.#safeNumber(amountSun), from);
    return assertBuiltTx(tx, "TransferContract");
  }

  // ── generic error wrapper for node reads/builds ──────────────────────────────
  async #wrap<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw new TransportError("rpc_error", `TRON ${label} failed: ${(e as Error).message?.split("\n")[0]}`);
    }
  }

  // ── account / query ──────────────────────────────────────────────────────────
  async getAccount(address: string): Promise<Types.Account> {
    return this.#wrap("getAccount", () => this.#tw.trx.getAccount(address));
  }
  async getAccountResources(address: string): Promise<Types.AccountResourceMessage> {
    return this.#wrap("getAccountResources", () => this.#tw.trx.getAccountResources(address));
  }
  async getBlock(numberOrLatest?: number): Promise<Types.Block> {
    return this.#wrap("getBlock", () =>
      numberOrLatest === undefined ? this.#tw.trx.getCurrentBlock() : this.#tw.trx.getBlockByNumber(numberOrLatest),
    );
  }
  async getTransactionById(txid: string): Promise<TronTx> {
    return this.#wrap("getTransaction", async () => parseTronTx(await this.#tw.trx.getTransaction(txid)));
  }
  async getTransactionInfoById(txid: string): Promise<TronTxInfo> {
    return this.#wrap("getTransactionInfo", async () => parseTronTxInfo(await this.#tw.trx.getTransactionInfo(txid)));
  }

  // ── TRC20 / TRC10 ──────────────────────────────────────────────────────────────
  async #constant(
    contract: string, fn: string, params: Types.ContractFunctionParameter[], owner = TRON_READ_OWNER,
  ): Promise<string[]> {
    const res = await this.#tw.transactionBuilder.triggerConstantContract(contract, fn, {}, params, owner);
    if (res.result?.result !== true) {
      const reason = decodeTronMessage(res.result?.message) || "constant call reverted";
      throw new ChainError("execution_error", `TRON ${fn} failed: ${reason}`);
    }
    return (res.constant_result ?? []) as string[];
  }

  async getTrc20Balance(contract: string, address: string): Promise<string> {
    return this.#wrap("trc20 balanceOf", async () => {
      const [hex] = await this.#constant(contract, "balanceOf(address)", [{ type: "address", value: address }]);
      return hex ? BigInt("0x" + hex).toString() : "0";
    });
  }

  async getTokenInfo(contract: string): Promise<TronTokenInfo> {
    return this.#wrap("trc20 tokenInfo", async () => {
      const c = await this.#tw.contract().at(contract);
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        c.name().call().catch(() => undefined),
        c.symbol().call().catch(() => undefined),
        c.decimals().call().catch(() => undefined),
        c.totalSupply().call().catch(() => undefined),
      ]);
      return {
        contract,
        name: name?.toString?.() ?? name,
        symbol: symbol?.toString?.() ?? symbol,
        decimals: decimals !== undefined ? Number(decimals) : undefined,
        totalSupply: totalSupply !== undefined ? BigInt(totalSupply.toString()).toString() : undefined,
      };
    });
  }

  async getTrc10Balance(assetId: string, address: string): Promise<string> {
    return this.#wrap("trc10 balance", async () => {
      const acct = await this.#tw.trx.getAccount(address);
      const entry = (acct.assetV2 ?? []).find((a) => String(a.key) === String(assetId));
      return BigInt(entry?.value ?? 0).toString();
    });
  }
  async getTrc10Info(assetId: string): Promise<TronTokenInfo> {
    return this.#wrap("trc10 info", async () =>
      await this.#tw.trx.getTokenFromID(assetId) as unknown as TronTokenInfo,
    );
  }

  async buildTrc20Transfer(from: string, to: string, contract: string, amount: string, feeLimit: number): Promise<Types.Transaction> {
    return this.#wrap("build trc20 transfer", async () => {
      // txLocal: build & ABI-encode the call locally so the node never supplies the calldata.
      const { transaction } = await this.#tw.transactionBuilder.triggerSmartContract(
        contract,
        "transfer(address,uint256)",
        { feeLimit, txLocal: true },
        [{ type: "address", value: to }, { type: "uint256", value: amount }],
        from,
      );
      return assertBuiltTx(transaction, "TriggerSmartContract");
    });
  }
  async buildTrc10Transfer(from: string, to: string, assetId: string, amount: string): Promise<Types.Transaction> {
    const n = this.#safeNumber(amount);
    return this.#wrap("build trc10 transfer", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.sendToken(to, n, assetId, from), "TransferAssetContract"),
    );
  }

  // ── estimate (real fee report for --dry-run) ─────────────────────────────────
  async estimateEnergy(from: string, contract: string, fn: string, params: TronContractParameter[]): Promise<number> {
    return this.#wrap("estimateEnergy", async () => {
      const res = await this.#tw.transactionBuilder.triggerConstantContract(contract, fn, {}, params as Types.ContractFunctionParameter[], from);
      return Number(res.energy_used ?? res.energy_required ?? 0);
    });
  }
  async estimateResources(from: string, contract: string, fn: string, params: TronContractParameter[]): Promise<FeeEstimate> {
    const [energy, prices, resources] = await Promise.all([
      this.estimateEnergy(from, contract, fn, params),
      this.getEnergyPrices().catch(() => undefined),
      this.getAccountResources(from).catch(() => undefined),
    ]);
    return {
      feeModel: "tron-resource",
      energy,
      energyPriceSun: prices,
      availableEnergy: resources ? Number(resources.EnergyLimit ?? 0) - Number(resources.EnergyUsed ?? 0) : undefined,
    };
  }

  // ── staking (Stake 2.0) ──────────────────────────────────────────────────────
  async buildFreezeV2(owner: string, amountSun: string, resource: RpcResourceCode): Promise<Types.Transaction> {
    const n = this.#safeNumber(amountSun);
    return this.#wrap("freezeBalanceV2", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.freezeBalanceV2(n, resource, owner), "FreezeBalanceV2Contract"),
    );
  }
  async buildUnfreezeV2(owner: string, amountSun: string, resource: RpcResourceCode): Promise<Types.Transaction> {
    const n = this.#safeNumber(amountSun);
    return this.#wrap("unfreezeBalanceV2", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.unfreezeBalanceV2(n, resource, owner), "UnfreezeBalanceV2Contract"),
    );
  }
  async buildWithdrawExpireUnfreeze(owner: string): Promise<Types.Transaction> {
    return this.#wrap("withdrawExpireUnfreeze", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.withdrawExpireUnfreeze(owner), "WithdrawExpireUnfreezeContract"),
    );
  }
  async buildCancelAllUnfreezeV2(owner: string): Promise<Types.Transaction> {
    return this.#wrap("cancelUnfreezeBalanceV2", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.cancelUnfreezeBalanceV2(owner), "CancelAllUnfreezeV2Contract"),
    );
  }
  async buildDelegateResource(
    owner: string, amountSun: string, resource: RpcResourceCode,
    receiver: string, lock: boolean, lockPeriod?: number,
  ): Promise<Types.Transaction> {
    const n = this.#safeNumber(amountSun);
    return this.#wrap("delegateResource", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.delegateResource(n, receiver, resource, owner, lock, lockPeriod), "DelegateResourceContract"),
    );
  }
  async buildUndelegateResource(
    owner: string, amountSun: string, resource: RpcResourceCode, receiver: string,
  ): Promise<Types.Transaction> {
    const n = this.#safeNumber(amountSun);
    return this.#wrap("undelegateResource", async () =>
      assertBuiltTx(await this.#tw.transactionBuilder.undelegateResource(n, receiver, resource, owner), "UnDelegateResourceContract"),
    );
  }

  // ── prices ─────────────────────────────────────────────────────────────────────
  async getEnergyPrices(): Promise<string> {
    return this.#wrap("getEnergyPrices", () => this.#tw.trx.getEnergyPrices());
  }
  async getBandwidthPrices(): Promise<string> {
    return this.#wrap("getBandwidthPrices", () => this.#tw.trx.getBandwidthPrices());
  }

  // ── contract ──────────────────────────────────────────────────────────────────
  async triggerConstantContract(
    contract: string, fn: string, params: TronContractParameter[], owner = TRON_READ_OWNER,
  ): Promise<string[]> {
    return this.#wrap("triggerConstantContract", () => this.#constant(contract, fn, params as Types.ContractFunctionParameter[], owner));
  }
  async triggerSmartContract(
    from: string,
    contract: string,
    fn: string,
    params: TronContractParameter[],
    opts: { feeLimit?: number; callValue?: number } = {},
  ): Promise<Types.Transaction> {
    return this.#wrap("triggerSmartContract", async () => {
      // txLocal: ABI-encode the call client-side so the node never supplies the calldata/params.
      const { transaction } = await this.#tw.transactionBuilder.triggerSmartContract(
        contract,
        fn,
        { feeLimit: opts.feeLimit, callValue: opts.callValue, txLocal: true },
        params as Types.ContractFunctionParameter[],
        from,
      );
      return assertBuiltTx(transaction, "TriggerSmartContract");
    });
  }
  async deployContract(
    from: string,
    p: { abi: unknown; bytecode: string; feeLimit: number; parameters?: unknown[] },
  ): Promise<Types.Transaction> {
    return this.#wrap("createSmartContract", async () =>
      assertBuiltTx(
        await this.#tw.transactionBuilder.createSmartContract(
          { abi: p.abi as Types.CreateSmartContractOptions["abi"], bytecode: p.bytecode, feeLimit: p.feeLimit, parameters: p.parameters },
          from,
        ),
        "CreateSmartContract",
      ),
    );
  }
  async getContract(address: string): Promise<unknown> {
    return this.#wrap("getContract", () => this.#tw.trx.getContract(address));
  }
  async getContractInfo(address: string): Promise<unknown> {
    return this.#wrap("getContractInfo", () => this.#tw.trx.getContractInfo(address));
  }

  #safeNumber(sun: string): number {
    const n = BigInt(sun);
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new UsageError("invalid_amount", `amount ${sun} exceeds the safe-integer limit for this client`);
    }
    return Number(n);
  }
}

export interface FeeEstimate extends Record<string, unknown> {
  feeModel: "tron-resource";
  energy: number;
}

/** TRC20 metadata read via the contract's view methods; each field absent when the call reverts. */
/** tronweb error messages are often hex-encoded ASCII; decode best-effort. */
function decodeTronMessage(message?: string): string {
  if (!message) return "";
  if (/^[0-9a-fA-F]+$/.test(message) && message.length % 2 === 0) {
    try {
      return Buffer.from(message, "hex").toString("utf8");
    } catch {
      return message;
    }
  }
  return message;
}
