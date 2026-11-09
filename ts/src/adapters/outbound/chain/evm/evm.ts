import {
  Interface,
  type InterfaceAbi,
  Transaction,
  TypedDataEncoder,
  getCreateAddress,
  toUtf8String,
  type TransactionLike,
} from "ethers";
import { ChainError, UsageError, errorMessage, inputRef } from "../../../../domain/errors/index.js";
import { decimalToSafeNumber, quantityToSafeNumber } from "../../../../domain/numbers/index.js";
import { classifyEvmRejection, isAlreadyKnown, isDefiniteSubmitRefusal } from "./node-errors.js";
import { evmChecksumAddress, isEvmAddress } from "../../../../domain/address/index.js";
import { decodeErc20Transfer } from "../../../../domain/evm/index.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import {
  DeadlineExpiredError,
  type DispatchCheck,
} from "../../../../application/contracts/deadline.js";
import { activeDispatch, withDispatchCheck } from "../../http/dispatch-context.js";
import type {
  DeployConstructorArgs,
  EvmBlockView,
  EvmGateway,
  EvmRawTransaction,
  EvmRpcJson,
  EvmTxView,
} from "../../../../application/ports/chain/evm/evm-gateway.js";
import {
  UNWIRED_BROADCAST_GUARD,
  type BroadcastGuard,
} from "../../../../application/contracts/broadcast-guard.js";
import {
  FetchHttpTransport,
  HttpTransportError,
  httpTransportFailure,
  networkHttpConfig,
  type HttpEndpointConfig,
  type HttpTransport,
} from "../../http/index.js";
import type {
  BroadcastResult,
  EvmReceipt,
  EvmUnsignedTx,
  NetworkDescriptor,
  SignedTx,
  TypedDataPayload,
  UnsignedTx,
} from "../../../../domain/types/index.js";
import { isTxHash } from "../../../../domain/family/index.js";
import {
  weiAmount,
  baseUnitAmount,
  type Wei,
  type BaseUnits,
} from "../../../../domain/amounts/index.js";

interface JsonRpcResponse {
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class EvmRpcClient implements EvmGateway {
  #id = 0;
  readonly #transport: HttpTransport;
  readonly #broadcastGuard: BroadcastGuard;

  constructor(
    endpointOrNetwork: string | NetworkDescriptor | HttpEndpointConfig,
    transport?: HttpTransport,
    guard: BroadcastGuard = UNWIRED_BROADCAST_GUARD,
  ) {
    let config: HttpEndpointConfig;
    try {
      config =
        typeof endpointOrNetwork === "string"
          ? { endpoint: endpointOrNetwork, headers: {} }
          : "endpoint" in endpointOrNetwork
            ? endpointOrNetwork
            : networkHttpConfig(endpointOrNetwork);
    } catch (error) {
      const failure =
        error instanceof HttpTransportError ? httpTransportFailure(error) : "invalid HTTP endpoint";
      throw new ChainError("rpc_error", `EVM RPC configuration failed: ${failure}`);
    }
    this.#transport = transport ?? new FetchHttpTransport(config);
    this.#broadcastGuard = guard;
  }

  async getNativeBalance(address: string): Promise<Wei> {
    return weiAmount(toDecimalString(await this.#call("eth_getBalance", [address, "latest"])));
  }

  async getTransactionCount(
    address: string,
    block: "latest" | "pending" = "latest",
  ): Promise<string> {
    return toDecimalString(await this.#call("eth_getTransactionCount", [address, block]));
  }

  // Hex bytecode; 0x means no deployed code.
  async getCode(address: string): Promise<string> {
    return toData(await this.#call("eth_getCode", [address, "latest"]));
  }

  async getBlockNumber(): Promise<string> {
    return toDecimalString(await this.#call("eth_blockNumber", []));
  }

  async getBlock(numberOrTag?: string): Promise<EvmBlockView | null> {
    const raw = await this.#rawBlock(numberOrTag);
    return raw === null ? null : normalizeBlock(raw);
  }

  // Null means absent, but a missing result is invalid.
  async #rawBlock(numberOrTag?: string): Promise<RpcObject | null> {
    const target =
      numberOrTag === undefined
        ? "latest"
        : /^\d+$/.test(numberOrTag)
          ? `0x${BigInt(numberOrTag).toString(16)}`
          : numberOrTag;
    return rpcObjectOrNull(
      await this.#call("eth_getBlockByNumber", [target, false]),
      "eth_getBlockByNumber",
    );
  }

  // False when synced; otherwise the node's progress object.
  async syncing(): Promise<boolean> {
    return (await this.#call("eth_syncing", [])) !== false;
  }

  async peerCount(): Promise<string> {
    return toDecimalString(await this.#call("net_peerCount", []));
  }

  // Preserve a zero base fee as EIP-1559 data; the suggested priority fee is optional.
  async feeData(): Promise<{
    baseFeeWei?: Wei;
    gasPriceWei: Wei;
    suggestedPriorityWei?: Wei;
  }> {
    // Validate the block response before treating a missing base fee as legacy.
    const [head, gasPrice, priority] = await Promise.all([
      this.#rawBlock("latest"),
      this.#call("eth_gasPrice", []),
      // Unsupported nodes give no tip; a call the command deadline stopped still fails.
      this.#call("eth_maxPriorityFeePerGas", []).catch((e: unknown) => {
        if (e instanceof DeadlineExpiredError || activeDispatch()?.check.signal.aborted) throw e;
        return undefined;
      }),
    ]);
    const baseFee = head?.baseFeePerGas;
    return {
      ...(baseFee === undefined || baseFee === null
        ? {}
        : { baseFeeWei: weiAmount(toDecimalString(baseFee)) }),
      gasPriceWei: weiAmount(toDecimalString(gasPrice)),
      ...(priority === undefined
        ? {}
        : { suggestedPriorityWei: weiAmount(toDecimalString(priority)) }),
    };
  }

  // The node-reported chain ID, in decimal.
  async chainId(): Promise<string> {
    return toDecimalString(await this.#call("eth_chainId", []));
  }

  // Gas estimate in decimal.
  async estimateGas(tx: Record<string, unknown>): Promise<string> {
    return toDecimalString(await this.#call("eth_estimateGas", [toRpcQuantities(tx)]));
  }

  // Accept only a 32-byte hash or an already-known response as successful submission.
  async sendRawTransaction(
    raw: string,
    check: DispatchCheck,
  ): Promise<{ hash?: string; alreadyKnown?: boolean }> {
    this.#broadcastGuard.assertAllowed();
    const method = "eth_sendRawTransaction";
    const body = await withDispatchCheck(check, () => this.#request(method, [raw]));
    if (body.error !== undefined && body.error !== null) {
      if (
        typeof body.error !== "object" ||
        Array.isArray(body.error) ||
        typeof body.error.code !== "number" ||
        typeof body.error.message !== "string"
      ) {
        throw new ChainError(
          "invalid_node_response",
          "EVM broadcast returned a malformed JSON-RPC error",
        );
      }
      const message = body.error.message;
      if (isAlreadyKnown(message)) return { alreadyKnown: true };
      const known = classifyEvmRejection(method, message);
      // Include node wording in the message because text output omits details.
      if (known) {
        throw new ChainError(known.code, `${known.message}: ${message}`, { nodeMessage: message });
      }
      if (isDefiniteSubmitRefusal(body.error.code)) {
        throw new ChainError("transaction_rejected", `EVM broadcast rejected: ${message}`, {
          nodeMessage: message,
        });
      }
      throw new ChainError(
        "rpc_error",
        `EVM broadcast outcome unknown (JSON-RPC error ${body.error.code}): ${message}`,
        { nodeMessage: message },
      );
    }
    if (typeof body.result !== "string" || !isTxHash("evm", body.result)) {
      throw new ChainError(
        "invalid_node_response",
        `EVM broadcast returned no transaction hash: ${JSON.stringify(body.result ?? null)}`,
      );
    }
    return { hash: body.result };
  }

  // Null means pending; a missing result is invalid.
  // A mined receipt can still indicate failure; feeWei is the actual gasUsed × effectiveGasPrice.
  async getTransactionReceipt(hash: string): Promise<EvmReceipt | null> {
    const raw = await this.#call("eth_getTransactionReceipt", [hash]);
    if (raw === null) return null;
    if (raw === undefined || typeof raw !== "object") {
      throw new ChainError(
        "invalid_node_response",
        "the node's answer to eth_getTransactionReceipt had neither a result nor an error field, " +
          "in violation of JSON-RPC",
      );
    }
    const r = raw as Record<string, unknown>;
    const gasUsed = r.gasUsed === undefined ? undefined : BigInt(String(r.gasUsed));
    const price =
      r.effectiveGasPrice === undefined ? undefined : BigInt(String(r.effectiveGasPrice));
    return {
      success: r.status === "0x1",
      ...(gasUsed === undefined ? {} : { gasUsed: gasUsed.toString(10) }),
      ...(gasUsed !== undefined && price !== undefined
        ? { feeWei: (gasUsed * price).toString(10) }
        : {}),
      ...(price === undefined ? {} : { effectiveGasPriceWei: price.toString(10) }),
      ...(r.blockNumber === undefined
        ? {}
        : {
            blockNumber: quantityToSafeNumber(
              r.blockNumber,
              "receipt blockNumber",
              rpcIntegerError,
            ),
          }),
      ...(typeof r.contractAddress === "string" ? { contractAddress: r.contractAddress } : {}),
      raw: raw as EvmRpcJson,
    };
  }

  // Return RPC errors in the envelope for method-specific classification.
  async #request(method: string, params: unknown[]): Promise<JsonRpcResponse> {
    this.#id += 1;
    let text: string;
    try {
      text = await this.#transport.requestText({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: this.#id, method, params }),
      });
    } catch (e) {
      if (e instanceof DeadlineExpiredError) throw e;
      if (e instanceof HttpTransportError && e.kind === "timeout") {
        throw new ChainError("timeout", `${method} timed out`);
      }
      const failure =
        e instanceof HttpTransportError ? httpTransportFailure(e) : "network request failed";
      throw new ChainError("rpc_error", `${method} failed: ${failure}`);
    }
    const malformedCode =
      method === "eth_sendRawTransaction" ? "invalid_node_response" : "rpc_error";
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch (e) {
      throw new ChainError(
        malformedCode,
        `${method} returned malformed JSON: ${(e as Error).message}`,
      );
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new ChainError(malformedCode, `${method} returned a malformed JSON-RPC response`);
    }
    return body as JsonRpcResponse;
  }

  encodeErc20Transfer(to: string, rawAmount: BaseUnits): string {
    try {
      return ERC20_WRITE.encodeFunctionData("transfer", [to, BigInt(rawAmount)]);
    } catch (e) {
      throw new UsageError(
        "invalid_value",
        `could not encode an ERC-20 transfer: ${(e as Error).message}`,
      );
    }
  }

  async broadcast(signed: SignedTx, check: DispatchCheck): Promise<BroadcastResult> {
    this.#broadcastGuard.assertAllowed();
    const raw = (signed as { raw?: unknown })?.raw;
    if (typeof raw !== "string" || raw === "") {
      throw new ChainError(
        "invalid_transaction",
        "a signed EVM transaction must carry its raw serialisation",
      );
    }
    return this.sendRawTransaction(raw, check);
  }

  // Encode the signed or unsigned transaction as hex for offline exchange.
  encodeTransactionHex(tx: unknown): string {
    const raw = (tx as { raw?: unknown })?.raw;
    if (typeof raw === "string" && raw !== "") return raw;
    try {
      const transaction = Transaction.from(tx as TransactionLike);
      return transaction.signature ? transaction.serialized : transaction.unsignedSerialized;
    } catch (e) {
      throw new ChainError(
        "invalid_transaction",
        `EVM transaction could not be serialised: ${(e as Error).message}`,
      );
    }
  }

  decodeRawTransaction(hex: string): EvmRawTransaction {
    return decodeEvmRawTransaction(hex);
  }

  transactionChainId(tx: UnsignedTx): string | undefined {
    return evmTransactionChainId(tx);
  }

  unsignedTransactionHash(tx: UnsignedTx): string {
    try {
      return Transaction.from(tx as TransactionLike).unsignedHash;
    } catch (e) {
      throw new UsageError(
        "invalid_payload",
        `EVM transaction could not be encoded: ${(e as Error).message}`,
      );
    }
  }

  signedTransactionParts(raw: string): { unsignedHash: string; signature: string } | undefined {
    try {
      const parsed = Transaction.from(raw);
      if (parsed.signature === null) return undefined;
      return { unsignedHash: parsed.unsignedHash, signature: parsed.signature.serialized };
    } catch {
      return undefined;
    }
  }

  typedDataDigest(payload: TypedDataPayload): string {
    return evmTypedDataDigest(payload);
  }

  encodeFunctionCall(signature: string, params: Array<{ type: string; value: unknown }>): string {
    try {
      const iface = new Interface([`function ${signature}`]);
      return iface.encodeFunctionData(
        signature.slice(0, signature.indexOf("(")),
        params.map((p) => p.value),
      );
    } catch (e) {
      throw new UsageError(
        "invalid_value",
        `could not encode ${signature}: ${(e as Error).message}`,
      );
    }
  }

  encodeDeploy(bytecode: string, args: DeployConstructorArgs): string {
    const body = bytecode.trim().replace(/^0x/, "");
    if (args.source === "none") return `0x${body}`;
    try {
      const iface =
        args.source === "abi"
          ? new Interface(args.abi as InterfaceAbi)
          : args.source === "signature"
            ? new Interface([normalizeConstructorSignature(args.signature)])
            : new Interface([`constructor(${args.types.join(",")})`]);
      return `0x${body}${iface.encodeDeploy(args.values).replace(/^0x/, "")}`;
    } catch (e) {
      const reason = (e as Error).message;
      throw new UsageError(
        "invalid_value",
        args.source === "abi"
          ? errorMessage`could not encode the constructor arguments against the ABI: ${reason}`
          : errorMessage`could not encode the constructor arguments against ${inputRef(
              args.source === "signature" ? "constructorSignature" : "constructorParams",
            )}: ${reason}`,
      );
    }
  }

  // CREATE address from sender and nonce; no receipt is required.
  contractAddressFor(from: string, nonce: string): string {
    try {
      return getCreateAddress({ from, nonce: decimalToSafeNumber(nonce, "nonce", valueError) });
    } catch (e) {
      throw new ChainError(
        "invalid_value",
        `could not derive the contract address: ${(e as Error).message}`,
      );
    }
  }

  // Null means this node has no record; a missing result is invalid.
  async getTransactionByHash(hash: string): Promise<EvmTxView | null> {
    const raw = rpcObjectOrNull(
      await this.#call("eth_getTransactionByHash", [hash]),
      "eth_getTransactionByHash",
    );
    return raw === null ? null : normalizeTransaction(raw);
  }

  async clientVersion(): Promise<string> {
    return String(await this.#call("web3_clientVersion", []));
  }

  async callFunction(
    contract: string,
    signature: string,
    params: Array<{ type: string; value: unknown }>,
  ): Promise<string> {
    return this.call(contract, this.encodeFunctionCall(signature, params));
  }

  // Both calldata and the result are hex byte strings.
  async call(to: string, data: string): Promise<string> {
    return toData(await this.#call("eth_call", [{ to, data }, "latest"]));
  }

  async getErc20Balance(contract: string, owner: string): Promise<BaseUnits> {
    const raw = await this.call(contract, ERC20.encodeFunctionData("balanceOf", [owner])).catch(
      (e: unknown) => {
        if (isContractAnswer(e)) return "0x";
        throw e;
      },
    );
    // An empty response means no token balance was returned, not a zero balance.
    if (raw === "0x" || raw === "") {
      throw new ChainError(
        "token_metadata_unavailable",
        `${contract} did not answer balanceOf — it may not be a token contract`,
      );
    }
    return baseUnitAmount(ERC20.decodeFunctionResult("balanceOf", raw)[0] as bigint);
  }

  // Treat empty returns and reverts as absent metadata; propagate node failures.
  async #viewCall(contract: string, data: string): Promise<string | undefined> {
    let raw: string;
    try {
      raw = await this.call(contract, data);
    } catch (e) {
      if (isContractAnswer(e)) return undefined;
      throw e;
    }
    return raw === "0x" || raw === "" ? undefined : raw;
  }

  // Never invent missing decimals: they scale transfer amounts. Transport failures propagate.
  async getErc20Metadata(
    contract: string,
  ): Promise<{ symbol?: string; decimals?: number; name?: string }> {
    const [symbol, decimals, name] = await Promise.all([
      this.#text(contract, "symbol"),
      this.#decimals(contract),
      this.#text(contract, "name"),
    ]);
    return {
      ...(symbol === undefined ? {} : { symbol }),
      ...(decimals === undefined ? {} : { decimals }),
      ...(name === undefined ? {} : { name }),
    };
  }

  // Accept ABI string or bytes32 metadata.
  async #text(contract: string, fn: "symbol" | "name"): Promise<string | undefined> {
    const raw = await this.#viewCall(contract, ERC20.encodeFunctionData(fn, []));
    if (raw === undefined) return undefined;
    try {
      return ERC20.decodeFunctionResult(fn, raw)[0] as string;
    } catch {
      try {
        return decodeBytes32(raw);
      } catch {
        return undefined;
      }
    }
  }

  async #decimals(contract: string): Promise<number | undefined> {
    const raw = await this.#viewCall(contract, ERC20.encodeFunctionData("decimals", []));
    if (raw === undefined) return undefined;
    try {
      return decimalToSafeNumber(
        String(ERC20.decodeFunctionResult("decimals", raw)[0]),
        "decimals",
        rpcIntegerError,
      );
    } catch {
      return undefined;
    }
  }

  async #call(method: string, params: unknown[]): Promise<unknown> {
    const body = await this.#request(method, params);
    if (body.error) {
      const message = body.error.message ?? "";
      const known = classifyEvmRejection(method, message);
      if (known) {
        // Include node wording in the message because text output omits details.
        throw new ChainError(known.code, `${known.message}: ${message}`, {
          nodeMessage: message,
          ...(typeof body.error.data === "string" && /^0x[0-9a-f]+$/i.test(body.error.data)
            ? { revertData: body.error.data }
            : {}),
        });
      }
      throw new ChainError("rpc_error", `${method} failed: ${message}`);
    }
    return body.result;
  }
}

function isContractAnswer(e: unknown): boolean {
  return e instanceof ChainError && e.code === "execution_reverted";
}

function normalizeConstructorSignature(signature: string): string {
  const s = signature.trim();
  if (s.startsWith("constructor")) return s;
  return `constructor${s.startsWith("(") ? s : `(${s})`}`;
}

// Convert only known quantity fields to hex; addresses and calldata are byte strings.
const RPC_QUANTITY_FIELDS = [
  "value",
  "gas",
  "gasLimit",
  "gasPrice",
  "maxFeePerGas",
  "maxPriorityFeePerGas",
  "maxFeePerBlobGas",
  "nonce",
] as const;

function toRpcQuantities(tx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...tx };
  for (const field of RPC_QUANTITY_FIELDS) {
    const value = out[field];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.startsWith("0x")) continue;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
      continue;
    }
    try {
      out[field] = `0x${BigInt(value).toString(16)}`;
    } catch {
      throw new ChainError("invalid_value", `${field} is not a quantity: ${String(value)}`);
    }
  }
  return out;
}

type RpcObject = { readonly [field: string]: EvmRpcJson };

// A missing result is invalid; a non-object result contradicts the method.
function rpcObjectOrNull(result: unknown, method: string): RpcObject | null {
  if (result === null) return null;
  if (result === undefined) {
    throw new ChainError(
      "invalid_node_response",
      `the node's answer to ${method} had neither a result nor an error field, ` +
        "in violation of JSON-RPC",
    );
  }
  if (typeof result !== "object" || Array.isArray(result)) {
    throw new ChainError(
      "invalid_node_response",
      `the node's answer to ${method} is not an object`,
    );
  }
  return result as RpcObject;
}

// A mined block always carries its number and timestamp; their absence is a malformed answer.
function normalizeBlock(block: RpcObject): EvmBlockView {
  const gasUsed = optionalQuantity(block.gasUsed, "block gasUsed");
  const gasLimit = optionalQuantity(block.gasLimit, "block gasLimit");
  const baseFeeWei = optionalQuantity(block.baseFeePerGas, "block baseFeePerGas");
  return {
    number: quantityToSafeNumber(block.number, "block number", nodeResponseError),
    timestamp: quantityToSafeNumber(block.timestamp, "block timestamp", nodeResponseError),
    ...(typeof block.hash === "string" ? { hash: block.hash } : {}),
    ...(typeof block.parentHash === "string" ? { parentHash: block.parentHash } : {}),
    ...(Array.isArray(block.transactions) ? { transactionCount: block.transactions.length } : {}),
    ...(gasUsed === undefined ? {} : { gasUsed }),
    ...(gasLimit === undefined ? {} : { gasLimit }),
    ...(baseFeeWei === undefined ? {} : { baseFeeWei }),
    raw: block,
  };
}

// Sender, value and calldata decide the reported parties and amount, so a missing one is an error.
function normalizeTransaction(tx: RpcObject): EvmTxView {
  if (typeof tx.input !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(tx.input)) {
    throw new ChainError("invalid_node_response", "transaction input must be hex data");
  }
  const valueWei = optionalQuantity(tx.value, "transaction value");
  if (valueWei === undefined) {
    throw new ChainError("invalid_node_response", "transaction value is missing");
  }
  const erc20Transfer = decodeErc20Transfer(tx.input);
  return {
    from: nodeAddress(tx.from, "transaction from"),
    ...(tx.to === undefined || tx.to === null ? {} : { to: nodeAddress(tx.to, "transaction to") }),
    valueWei,
    input: tx.input,
    ...(tx.nonce === undefined || tx.nonce === null
      ? {}
      : { nonce: quantityToSafeNumber(tx.nonce, "transaction nonce", nodeResponseError) }),
    ...(erc20Transfer === undefined ? {} : { erc20Transfer }),
    raw: tx,
  };
}

function optionalQuantity(value: EvmRpcJson | undefined, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value)) {
    return BigInt(value).toString(10);
  }
  throw new ChainError("invalid_node_response", `${field} must be a hex quantity`);
}

function nodeAddress(value: EvmRpcJson | undefined, field: string): string {
  if (typeof value !== "string" || !isEvmAddress(value)) {
    throw new ChainError("invalid_node_response", `${field} must be an EVM address`);
  }
  return evmChecksumAddress(hexToBytes(value.slice(2).toLowerCase()));
}

function nodeResponseError(message: string) {
  return new ChainError("invalid_node_response", message);
}

function rpcIntegerError(message: string) {
  return new ChainError("rpc_error", message);
}

function valueError(message: string) {
  return new ChainError("invalid_value", message);
}

// Convert hex quantities through BigInt to preserve base-unit precision.
function toDecimalString(hex: unknown): string {
  if (typeof hex !== "string") {
    throw new ChainError("rpc_error", `expected a hex quantity, got ${typeof hex}`);
  }
  return BigInt(hex).toString(10);
}

// Preserve hex byte strings without numeric conversion.
function toData(value: unknown): string {
  if (typeof value !== "string") {
    throw new ChainError("rpc_error", `expected hex data, got ${typeof value}`);
  }
  return value;
}

const ERC20 = new Interface([
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
]);

// bytes32 metadata is NUL-padded on the right.
function decodeBytes32(raw: string): string {
  const text = toUtf8String(
    `0x${raw
      .replace(/^0x/, "")
      .slice(0, 64)
      .replace(/(00)+$/, "")}`,
  );
  if (text === "") throw new ChainError("rpc_error", "empty bytes32 text");
  return text;
}

const ERC20_WRITE = new Interface(["function transfer(address,uint256) returns (bool)"]);

export function decodeEvmRawTransaction(hex: string): EvmRawTransaction {
  let parsed: Transaction;
  let chainId: string | undefined;
  try {
    parsed = Transaction.from(hex);
    chainId = boundChainId(parsed);
  } catch (e) {
    throw new ChainError(
      "invalid_transaction",
      `not a valid EVM transaction: ${(e as Error).message}`,
    );
  }
  const signed = parsed.signature !== null;
  return {
    ...(chainId === undefined ? {} : { chainId }),
    signed,
    ...(signed && parsed.from !== null ? { from: parsed.from } : {}),
    ...(parsed.to === null ? {} : { to: parsed.to }),
    nonce: parsed.nonce,
    gasLimit: parsed.gasLimit.toString(),
    ...(parsed.maxFeePerGas === null ? {} : { maxFeePerGasWei: parsed.maxFeePerGas.toString() }),
    ...(parsed.gasPrice === null ? {} : { gasPriceWei: parsed.gasPrice.toString() }),
    valueWei: parsed.value.toString(),
    ...(signed ? { hash: parsed.hash!, serialized: parsed.serialized } : {}),
    transaction: JSON.parse(JSON.stringify(parsed.toJSON())) as EvmUnsignedTx,
  };
}

// ethers derives EIP712Domain from domain and rejects a duplicate types entry.
export function evmTypedDataDigest(payload: TypedDataPayload): string {
  const structTypes = Object.fromEntries(
    Object.entries(payload.types).filter(([name]) => name !== "EIP712Domain"),
  );
  try {
    return TypedDataEncoder.hash(payload.domain as never, structTypes, payload.message);
  } catch (e) {
    throw new UsageError(
      "invalid_payload",
      `typed data could not be hashed: ${(e as Error).message}`,
    );
  }
}

export function evmTransactionChainId(tx: UnsignedTx): string | undefined {
  try {
    return boundChainId(Transaction.from(tx as TransactionLike));
  } catch (e) {
    throw new UsageError(
      "invalid_payload",
      `EVM transaction could not be encoded: ${(e as Error).message}`,
    );
  }
}

// Typed transactions always sign their chain id, even 0; a legacy one with chain id 0 has no EIP-155 binding.
// An explicit type is read as given: inferType() also validates fees and would preempt the signer's own error.
function boundChainId(tx: Transaction): string | undefined {
  return (tx.type ?? tx.inferType()) === 0 && tx.chainId === 0n ? undefined : tx.chainId.toString();
}
