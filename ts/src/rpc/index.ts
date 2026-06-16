/**
 * RpcClient (L1) — thin node wrappers (TRON via tronweb HTTP, EVM via viem JSON-RPC).
 * The `RpcClient` interface lives in SharedTypes so upper layers can mock it (plan §3 L1).
 * Note: builtin TRON networks carry an HTTP fullHost; tronweb is HTTP-based (the Java CLI
 * uses gRPC — for this symbolic TS slice HTTP keeps the client dependency-light).
 */
import { TronWeb } from "tronweb";
import { createPublicClient, http, type PublicClient } from "viem";
import type { BroadcastResult, RpcClient, SignedTx } from "../types/index.js";
import { ChainError, TransportError, UsageError } from "../errors/index.js";

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
}

export class TronRpcClient implements RpcClient {
  #tw: InstanceType<typeof TronWeb>;
  constructor(fullHost: string) {
    // a dummy private key keeps tronweb happy for read-only/builder use
    this.#tw = new TronWeb({ fullHost });
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
