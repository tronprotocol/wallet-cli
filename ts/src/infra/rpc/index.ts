/**
 * RpcClient (L1) — thin node wrappers (TRON via tronweb HTTP, EVM via viem JSON-RPC).
 * The `RpcClient` interface lives in SharedTypes so upper layers can mock it (plan §3 L1).
 * Note: builtin TRON networks carry an HTTP fullHost; tronweb is HTTP-based (the Java CLI
 * uses gRPC — for this symbolic TS slice HTTP keeps the client dependency-light).
 */
import { TronWeb } from "tronweb";
import { createPublicClient, http, encodeFunctionData, type PublicClient } from "viem";
import type { BroadcastResult, RpcClient, SignedTx } from "../../core/types/index.js";
import { ChainError, TransportError, UsageError } from "../../core/errors/index.js";

const ERC20_TRANSFER_ABI = [
  {
    name: "transfer", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export class EvmRpcClient implements RpcClient {
  #client: PublicClient;
  constructor(private readonly rpcUrl: string) {
    this.#client = createPublicClient({ transport: http(rpcUrl) });
  }
  async call(method: string, params: unknown): Promise<unknown> {
    return this.#client.request({ method: method as any, params: params as any });
  }
  async getNativeBalance(address: string): Promise<string> {
    try {
      const wei = await this.#client.getBalance({ address: address as `0x${string}` });
      return wei.toString();
    } catch (e) {
      throw new TransportError("rpc_error", `EVM getBalance failed: ${(e as Error).message}`);
    }
  }
  async broadcast(signed: SignedTx): Promise<BroadcastResult> {
    try {
      const hash = await this.#client.sendRawTransaction({
        serializedTransaction: signed as `0x${string}`,
      });
      return { hash };
    } catch (e) {
      throw new TransportError("rpc_error", `EVM broadcast failed: ${(e as Error).message}`);
    }
  }

  /** prepare a full native-transfer request (nonce/gas/fees filled by the node). */
  async prepareNativeTransfer(from: string, to: string, valueWei: string): Promise<any> {
    try {
      return await (this.#client as any).prepareTransactionRequest({
        account: from as `0x${string}`,
        to: to as `0x${string}`,
        value: BigInt(valueWei),
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (/insufficient funds|exceeds the balance/i.test(msg)) {
        throw new ChainError("insufficient_funds", "insufficient funds for gas + value");
      }
      throw new TransportError("rpc_error", `EVM build failed: ${msg.split("\n")[0]}`);
    }
  }

  /** prepare an ERC-20 transfer (to=contract, value=0, data=transfer calldata). */
  async prepareErc20Transfer(
    from: string,
    contract: string,
    to: string,
    amount: string,
    fees: { maxFeePerGas?: string; maxPriorityFeePerGas?: string; gasPrice?: string } = {},
  ): Promise<any> {
    const data = encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: "transfer", args: [to as `0x${string}`, BigInt(amount)] });
    try {
      return await (this.#client as any).prepareTransactionRequest({
        account: from as `0x${string}`,
        to: contract as `0x${string}`,
        data,
        value: 0n,
        ...(fees.maxFeePerGas ? { maxFeePerGas: BigInt(fees.maxFeePerGas) } : {}),
        ...(fees.maxPriorityFeePerGas ? { maxPriorityFeePerGas: BigInt(fees.maxPriorityFeePerGas) } : {}),
        ...(fees.gasPrice ? { gasPrice: BigInt(fees.gasPrice) } : {}),
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (/insufficient funds|exceeds the balance/i.test(msg)) {
        throw new ChainError("insufficient_funds", "insufficient funds for gas + value");
      }
      throw new TransportError("rpc_error", `EVM ERC-20 build failed: ${msg.split("\n")[0]}`);
    }
  }

  async getTransaction(hash: string): Promise<any> {
    try {
      return await this.#client.getTransaction({ hash: hash as `0x${string}` });
    } catch (e) {
      throw new TransportError("rpc_error", `EVM getTransaction failed: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  /** receipt or null when not yet mined. */
  async getTransactionReceipt(hash: string): Promise<any | null> {
    try {
      return await this.#client.getTransactionReceipt({ hash: hash as `0x${string}` });
    } catch {
      return null; // viem throws when the tx is not yet mined / unknown
    }
  }
}

/** a valid base58 owner used as the caller for read-only (constant) contract calls. */
const TRON_READ_OWNER = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

export class TronRpcClient implements RpcClient {
  #tw: InstanceType<typeof TronWeb>;
  constructor(fullHost: string) {
    // a dummy address keeps tronweb happy for read-only/builder use (no key → cannot sign)
    this.#tw = new TronWeb({ fullHost });
    this.#tw.setAddress(TRON_READ_OWNER);
  }
  get tronweb(): InstanceType<typeof TronWeb> {
    return this.#tw;
  }
  async call(method: string, params: unknown): Promise<unknown> {
    const fn = (this.#tw.trx as any)[method];
    if (typeof fn !== "function") throw new TransportError("rpc_error", `unknown trx method ${method}`);
    return fn.call(this.#tw.trx, params);
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
    let res: any;
    try {
      res = await this.#tw.trx.sendRawTransaction(signed as any);
    } catch (e) {
      throw new TransportError("rpc_error", `TRON broadcast failed: ${(e as Error).message}`);
    }
    // tronweb does NOT throw on node rejection — it returns { result:false, code, message }.
    if (res && res.result === false) {
      const reason = decodeTronMessage(res.message) || res.code || "rejected by node";
      throw new ChainError("transaction_rejected", `TRON broadcast rejected: ${reason}`, { code: res.code });
    }
    return { txId: res?.txid ?? res?.transaction?.txID, raw: res };
  }

  /** build an unsigned TRX transfer (tronweb fills ref block etc.). */
  async buildNativeTransfer(from: string, to: string, amountSun: string): Promise<any> {
    const amount = BigInt(amountSun);
    // tronweb's sendTrx amount param is a JS number; reject amounts that would lose precision
    // rather than silently corrupt the transferred value.
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new UsageError("invalid_amount", `amount ${amountSun} sun exceeds the safe-integer limit for this client`);
    }
    return this.#tw.transactionBuilder.sendTrx(to, Number(amount), from);
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
  async getAccount(address: string): Promise<any> {
    return this.#wrap("getAccount", () => this.#tw.trx.getAccount(address));
  }
  async getAccountResources(address: string): Promise<any> {
    return this.#wrap("getAccountResources", () => this.#tw.trx.getAccountResources(address));
  }
  async getBlock(numberOrLatest?: number): Promise<any> {
    return this.#wrap("getBlock", () =>
      numberOrLatest === undefined ? this.#tw.trx.getCurrentBlock() : this.#tw.trx.getBlockByNumber(numberOrLatest),
    );
  }
  async getTransactionById(txid: string): Promise<any> {
    return this.#wrap("getTransaction", () => this.#tw.trx.getTransaction(txid));
  }
  async getTransactionInfoById(txid: string): Promise<any> {
    return this.#wrap("getTransactionInfo", () => this.#tw.trx.getTransactionInfo(txid));
  }

  // ── TRC20 / TRC10 ──────────────────────────────────────────────────────────────
  async #constant(contract: string, fn: string, params: any[], owner = TRON_READ_OWNER): Promise<string[]> {
    const res: any = await this.#tw.transactionBuilder.triggerConstantContract(contract, fn, {}, params, owner);
    if (!res || res.result?.result !== true) {
      const reason = decodeTronMessage(res?.result?.message) || "constant call reverted";
      throw new ChainError("execution_error", `TRON ${fn} failed: ${reason}`);
    }
    return res.constant_result ?? [];
  }

  async getTrc20Balance(contract: string, address: string): Promise<string> {
    return this.#wrap("trc20 balanceOf", async () => {
      const [hex] = await this.#constant(contract, "balanceOf(address)", [{ type: "address", value: address }]);
      return hex ? BigInt("0x" + hex).toString() : "0";
    });
  }

  async getTokenInfo(contract: string): Promise<any> {
    return this.#wrap("trc20 tokenInfo", async () => {
      const c: any = await this.#tw.contract().at(contract);
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
      const acct: any = await this.#tw.trx.getAccount(address);
      const entry = (acct?.assetV2 ?? []).find((a: any) => String(a.key) === String(assetId));
      return BigInt(entry?.value ?? 0).toString();
    });
  }
  async getTrc10Info(assetId: string): Promise<any> {
    return this.#wrap("trc10 info", () => this.#tw.trx.getTokenFromID(assetId) as Promise<any>);
  }

  async buildTrc20Transfer(from: string, to: string, contract: string, amount: string, feeLimit: number): Promise<any> {
    return this.#wrap("build trc20 transfer", async () => {
      const { transaction } = await this.#tw.transactionBuilder.triggerSmartContract(
        contract,
        "transfer(address,uint256)",
        { feeLimit },
        [{ type: "address", value: to }, { type: "uint256", value: amount }],
        from,
      );
      return transaction;
    });
  }
  async buildTrc10Transfer(from: string, to: string, assetId: string, amount: string): Promise<any> {
    const n = BigInt(amount);
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new UsageError("invalid_amount", `amount ${amount} exceeds the safe-integer limit for this client`);
    }
    return this.#wrap("build trc10 transfer", () =>
      this.#tw.transactionBuilder.sendToken(to, Number(n), assetId, from) as Promise<any>,
    );
  }

  // ── estimate (real fee report for --dry-run) ─────────────────────────────────
  async estimateEnergy(from: string, contract: string, fn: string, params: any[]): Promise<number> {
    return this.#wrap("estimateEnergy", async () => {
      const res: any = await this.#tw.transactionBuilder.triggerConstantContract(contract, fn, {}, params, from);
      return Number(res?.energy_used ?? res?.energy_required ?? 0);
    });
  }
  async estimateResources(from: string, contract: string, fn: string, params: any[]): Promise<FeeEstimate> {
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
  async buildFreezeV2(owner: string, amountSun: string, resource: "ENERGY" | "BANDWIDTH"): Promise<any> {
    const n = this.#safeNumber(amountSun);
    return this.#wrap("freezeBalanceV2", () =>
      this.#tw.transactionBuilder.freezeBalanceV2(n, resource, owner) as Promise<any>,
    );
  }
  async buildUnfreezeV2(owner: string, amountSun: string, resource: "ENERGY" | "BANDWIDTH"): Promise<any> {
    const n = this.#safeNumber(amountSun);
    return this.#wrap("unfreezeBalanceV2", () =>
      this.#tw.transactionBuilder.unfreezeBalanceV2(n, resource, owner) as Promise<any>,
    );
  }
  async buildWithdrawExpireUnfreeze(owner: string): Promise<any> {
    return this.#wrap("withdrawExpireUnfreeze", () =>
      this.#tw.transactionBuilder.withdrawExpireUnfreeze(owner) as Promise<any>,
    );
  }
  async buildCancelAllUnfreezeV2(owner: string): Promise<any> {
    return this.#wrap("cancelUnfreezeBalanceV2", () =>
      this.#tw.transactionBuilder.cancelUnfreezeBalanceV2(owner) as Promise<any>,
    );
  }

  // ── prices ─────────────────────────────────────────────────────────────────────
  async getEnergyPrices(): Promise<string> {
    return this.#wrap("getEnergyPrices", () => this.#tw.trx.getEnergyPrices() as Promise<string>);
  }
  async getBandwidthPrices(): Promise<string> {
    return this.#wrap("getBandwidthPrices", () => this.#tw.trx.getBandwidthPrices() as Promise<string>);
  }

  // ── contract ──────────────────────────────────────────────────────────────────
  async triggerConstantContract(contract: string, fn: string, params: any[], owner = TRON_READ_OWNER): Promise<string[]> {
    return this.#wrap("triggerConstantContract", () => this.#constant(contract, fn, params, owner));
  }
  async triggerSmartContract(
    from: string,
    contract: string,
    fn: string,
    params: any[],
    opts: { feeLimit?: number; callValue?: number } = {},
  ): Promise<any> {
    return this.#wrap("triggerSmartContract", async () => {
      const { transaction } = await this.#tw.transactionBuilder.triggerSmartContract(
        contract,
        fn,
        { feeLimit: opts.feeLimit, callValue: opts.callValue },
        params,
        from,
      );
      return transaction;
    });
  }
  async deployContract(from: string, p: { abi: any; bytecode: string; feeLimit: number; parameters?: any[] }): Promise<any> {
    return this.#wrap("createSmartContract", () =>
      this.#tw.transactionBuilder.createSmartContract(
        { abi: p.abi, bytecode: p.bytecode, feeLimit: p.feeLimit, parameters: p.parameters } as any,
        from,
      ) as Promise<any>,
    );
  }
  async getContract(address: string): Promise<any> {
    return this.#wrap("getContract", () => this.#tw.trx.getContract(address) as Promise<any>);
  }
  async getContractInfo(address: string): Promise<any> {
    return this.#wrap("getContractInfo", () => (this.#tw.trx as any).getContractInfo(address) as Promise<any>);
  }

  #safeNumber(sun: string): number {
    const n = BigInt(sun);
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new UsageError("invalid_amount", `amount ${sun} sun exceeds the safe-integer limit for this client`);
    }
    return Number(n);
  }
}

export interface FeeEstimate extends Record<string, unknown> {
  feeModel: "tron-resource";
  energy: number;
}

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
