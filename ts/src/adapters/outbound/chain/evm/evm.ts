/**
 * EvmRpcClient — the EVM family's gateway, speaking JSON-RPC over HTTP.
 *
 * Deliberately a thin client rather than an ethers Provider: a CLI makes one-shot calls and
 * exits, so the polling, network auto-detection and event machinery a Provider brings would be
 * cost without benefit. This mirrors the TRON adapter's plain `fetch` + `AbortSignal.timeout`.
 */
import {
  Interface,
  type InterfaceAbi,
  Transaction,
  getCreateAddress,
  toUtf8String,
  type TransactionLike,
} from "ethers";
import { ChainError } from "../../../../domain/errors/index.js";
import { decimalToSafeNumber, quantityToSafeNumber } from "../../../../domain/numbers/index.js";
import { classifyEvmRejection, isAlreadyKnown } from "./node-errors.js";
import type {
  DeployConstructorArgs,
  EvmGateway,
} from "../../../../application/ports/chain/gateway-provider.js";
import { assertBroadcastAllowed } from "../../../../application/services/broadcast-guard.js";

interface JsonRpcResponse {
  result?: unknown;
  error?: { code: number; message: string };
}

export class EvmRpcClient implements EvmGateway {
  #id = 0;

  constructor(
    private readonly endpoint: string,
    private readonly timeoutMs = 60_000,
  ) {}

  async getNativeBalance(address: string): Promise<string> {
    return toDecimalString(await this.#call("eth_getBalance", [address, "latest"]));
  }

  /** the account's nonce — a QUANTITY. */
  async getTransactionCount(
    address: string,
    block: "latest" | "pending" = "latest",
  ): Promise<string> {
    return toDecimalString(await this.#call("eth_getTransactionCount", [address, block]));
  }

  /** deployed bytecode — DATA, so it stays hex. `0x` means "no code": an ordinary account. */
  async getCode(address: string): Promise<string> {
    return toData(await this.#call("eth_getCode", [address, "latest"]));
  }

  async getBlockNumber(): Promise<string> {
    return toDecimalString(await this.#call("eth_blockNumber", []));
  }

  /**
   * The node's block object, verbatim — hex QUANTITY values, second-resolution timestamp and
   * all. `block` is an inspection command, so fidelity to what the node said beats a tidier
   * shape; the families are deliberately NOT aligned here, and the text renderer is what makes
   * each one readable.
   *
   * `numberOrTag` is the one thing that is translated, because the RPC will not accept anything
   * else: a decimal height becomes a QUANTITY, while a tag ("latest", "finalized", "safe") goes
   * through untouched. Resolves to null when the chain has no such block rather than throwing —
   * callers asking for "finalized" on a chain that does not serve it need a value to degrade on.
   */
  async getBlock(numberOrTag?: string): Promise<unknown> {
    const target =
      numberOrTag === undefined
        ? "latest"
        : /^\d+$/.test(numberOrTag)
          ? `0x${BigInt(numberOrTag).toString(16)}`
          : numberOrTag;
    return (await this.#call("eth_getBlockByNumber", [target, false])) ?? null;
  }

  /** false when the node is in sync; an object of progress counters while it catches up. */
  async syncing(): Promise<unknown> {
    return this.#call("eth_syncing", []);
  }

  /** connected peers — a QUANTITY. Most hosted endpoints do not expose this and will error. */
  async peerCount(): Promise<string> {
    return toDecimalString(await this.#call("net_peerCount", []));
  }

  /**
   * The three numbers the fee model needs, as decimal wei.
   *
   * `baseFeeWei` is absent only when the block genuinely carries no `baseFeePerGas`. A base fee of
   * ZERO must survive as "0": BSC reports exactly that, and collapsing it to undefined would make
   * the fee model read the chain as legacy.
   *
   * The suggested tip is optional — not every endpoint implements `eth_maxPriorityFeePerGas` —
   * so a refusal degrades that one field instead of failing the read.
   */
  async feeData(): Promise<{
    baseFeeWei?: string;
    gasPriceWei: string;
    suggestedPriorityWei?: string;
  }> {
    const [head, gasPrice, priority] = await Promise.all([
      this.#call("eth_getBlockByNumber", ["latest", false]),
      this.#call("eth_gasPrice", []),
      this.#call("eth_maxPriorityFeePerGas", []).catch(() => undefined),
    ]);
    const baseFee = (head as Record<string, unknown> | null)?.baseFeePerGas;
    return {
      ...(baseFee === undefined || baseFee === null
        ? {}
        : { baseFeeWei: toDecimalString(baseFee) }),
      gasPriceWei: toDecimalString(gasPrice),
      ...(priority === undefined ? {} : { suggestedPriorityWei: toDecimalString(priority) }),
    };
  }

  /** the chain id the NODE reports, as a decimal string. Asked rather than assumed: this is what
   *  `chain node` is for — confirming the endpoint is the chain you think it is. */
  async chainId(): Promise<string> {
    return toDecimalString(await this.#call("eth_chainId", []));
  }

  /** the node's gas estimate for a transaction, as a decimal string. */
  async estimateGas(tx: Record<string, unknown>): Promise<string> {
    return toDecimalString(await this.#call("eth_estimateGas", [toRpcQuantities(tx)]));
  }

  /**
   * Submit a signed transaction.
   *
   * Acceptance is WHITE-LISTED: `eth_sendRawTransaction` answers with a 32-byte transaction hash,
   * so anything else — a different shape, a missing result, an error object — is a rejection.
   * The TRON adapter learned this the hard way: a blacklist test never fired against responses
   * that simply omit the field, and every rejected transaction was reported as submitted.
   *
   * The one rejection that is not a failure is "already known": the transaction is already in the
   * mempool, so the submission succeeded earlier and re-running the command must not turn a
   * standing fact into an error.
   */
  async sendRawTransaction(raw: string): Promise<{ hash?: string; alreadyKnown?: boolean }> {
    assertBroadcastAllowed();
    const body = await this.#send("eth_sendRawTransaction", [raw]);
    if (body.error) {
      const message = body.error.message ?? "";
      if (isAlreadyKnown(message)) return { alreadyKnown: true };
      const known = classifyEvmRejection(message);
      throw new ChainError(
        known?.code ?? "transaction_rejected",
        known?.message ?? `EVM broadcast rejected: ${message}`,
        { nodeMessage: message },
      );
    }
    if (typeof body.result !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(body.result)) {
      throw new ChainError(
        "transaction_rejected",
        `EVM broadcast returned no transaction hash: ${JSON.stringify(body.result ?? null)}`,
      );
    }
    return { hash: body.result };
  }

  /**
   * The mined receipt, or null while the transaction is still pending.
   *
   * `success` comes from `status`, NOT from the receipt existing: `status: "0x0"` is a transaction
   * that was mined, paid for its gas, and reverted. `feeWei` is what was actually paid
   * (gasUsed × effectiveGasPrice), not the ceiling the transaction authorised.
   */
  async getTransactionReceipt(hash: string): Promise<Record<string, unknown> | null> {
    const raw = await this.#call("eth_getTransactionReceipt", [hash]);
    if (raw === null || typeof raw !== "object") return null;
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
      // The two numbers feeWei is the product of. A receipt that states only the total leaves the
      // reader unable to tell an expensive call from a cheap one at a high gas price.
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
      ...(r.contractAddress === undefined || r.contractAddress === null
        ? {}
        : { contractAddress: r.contractAddress }),
      raw,
    };
  }

  /** the JSON-RPC envelope, unthrown — callers that classify errors themselves need to see it. */
  async #send(method: string, params: unknown[]): Promise<JsonRpcResponse> {
    return this.#request(method, params);
  }

  async #request(method: string, params: unknown[]): Promise<JsonRpcResponse> {
    this.#id += 1;
    let response: { ok: boolean; status?: number; text(): Promise<string> };
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: this.#id, method, params }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new ChainError("rpc_error", `${method} failed: ${(e as Error).message}`);
    }
    if (!response.ok) {
      throw new ChainError("rpc_error", `${method} failed: HTTP ${response.status}`);
    }
    let body: unknown;
    try {
      body = JSON.parse(await response.text());
    } catch (e) {
      throw new ChainError(
        "rpc_error",
        `${method} returned malformed JSON: ${(e as Error).message}`,
      );
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new ChainError("rpc_error", `${method} returned a malformed JSON-RPC response`);
    }
    return body as JsonRpcResponse;
  }

  /** calldata for `transfer(address,uint256)`; the amount is already in the token's base units. */
  encodeErc20Transfer(to: string, rawAmount: string): string {
    try {
      return ERC20_WRITE.encodeFunctionData("transfer", [to, BigInt(rawAmount)]);
    } catch (e) {
      throw new ChainError(
        "invalid_value",
        `could not encode an ERC-20 transfer: ${(e as Error).message}`,
      );
    }
  }

  /**
   * The Broadcaster port. A signed EVM transaction is `{ raw, hash }`; only `raw` goes on the
   * wire. The hash is not read back from here — the pipeline prefers the locally derived one
   * (see `authoritativeTxId`), which is the whole reason the signer carries it.
   */
  async broadcast(signed: unknown): Promise<Record<string, unknown>> {
    assertBroadcastAllowed();
    const raw = (signed as { raw?: unknown })?.raw;
    if (typeof raw !== "string" || raw === "") {
      throw new ChainError(
        "invalid_transaction",
        "a signed EVM transaction must carry its raw serialisation",
      );
    }
    return this.sendRawTransaction(raw);
  }

  /**
   * Serialise a transaction to the hex `tx sign --hex` and `tx broadcast --hex` exchange.
   *
   * An unsigned transaction serialises to its unsigned form and a signed one to its signed form,
   * so `tx send --build-only` produces exactly what `tx sign` reads back. A signed transaction
   * arrives as `{ raw, hash }` and its `raw` is already that serialisation.
   */
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

  /** calldata for a `{type, value}` call, without sending it — the write half of callFunction. */
  encodeFunctionCall(signature: string, params: Array<{ type: string; value: unknown }>): string {
    try {
      const iface = new Interface([`function ${signature}`]);
      return iface.encodeFunctionData(
        signature.slice(0, signature.indexOf("(")),
        params.map((p) => p.value),
      );
    } catch (e) {
      throw new ChainError(
        "invalid_value",
        `could not encode ${signature}: ${(e as Error).message}`,
      );
    }
  }

  /** deployment calldata: the creation bytecode with the constructor's ABI-encoded arguments. */
  encodeDeploy(bytecode: string, args: DeployConstructorArgs): string {
    const body = bytecode.trim().replace(/^0x/, "");
    if (args.source === "none") return `0x${body}`;
    try {
      const iface =
        args.source === "abi"
          ? new Interface(args.abi as InterfaceAbi)
          : new Interface([normalizeConstructorSignature(args.signature)]);
      return `0x${body}${iface.encodeDeploy(args.values).replace(/^0x/, "")}`;
    } catch (e) {
      const from = args.source === "abi" ? "the ABI" : `${args.flag}`;
      throw new ChainError(
        "invalid_value",
        `could not encode the constructor arguments against ${from}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Where a CREATE deployment will land. Derived from the sender and nonce alone, so it is known
   * the moment the transaction is signed — the user does not have to wait for a receipt to learn
   * the address, and when a receipt does arrive the two can be compared.
   */
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

  /**
   * The node's transaction object, or null when this node has no record of the hash.
   *
   * Null is deliberately ambiguous here: it covers "never existed", "still propagating" and
   * "this node pruned it". Distinguishing those is the caller's job, because only the caller
   * knows what other evidence it has.
   */
  async getTransactionByHash(hash: string): Promise<Record<string, unknown> | null> {
    const raw = await this.#call("eth_getTransactionByHash", [hash]);
    return raw === null || typeof raw !== "object" ? null : (raw as Record<string, unknown>);
  }

  async clientVersion(): Promise<string> {
    return String(await this.#call("web3_clientVersion", []));
  }

  /**
   * A read-only call named by its signature, with `{type, value}` parameters — the same input
   * shape the TRON family takes, encoded here rather than in a use case because ABI encoding is
   * a wire-format concern (TronWeb does the same job inside the TRON adapter).
   *
   * A bad signature or a value that does not fit its declared type fails as `invalid_value`
   * before any request is sent, rather than as an opaque node error afterwards.
   */
  async callFunction(
    contract: string,
    signature: string,
    params: Array<{ type: string; value: unknown }>,
  ): Promise<string> {
    return this.call(contract, this.encodeFunctionCall(signature, params));
  }

  /**
   * A read-only contract call; `data` and the result are both DATA, so both stay hex.
   *
   * A revert is the CONTRACT's answer, not a transport failure, so it gets its own code
   * (§11 `execution_reverted`) carrying whatever reason the node decoded. `rpc_error` here would
   * read as "the network is broken" for what is in fact a definite reply.
   */
  async call(to: string, data: string): Promise<string> {
    try {
      return toData(await this.#call("eth_call", [{ to, data }, "latest"]));
    } catch (e) {
      const message = (e as Error).message ?? "";
      if (isNotAContractAnswer(message)) {
        throw new ChainError("execution_reverted", message, { contract: to });
      }
      throw e;
    }
  }

  async getErc20Balance(contract: string, owner: string): Promise<string> {
    // Two shapes of "there is no token here": an address with no code answers empty, and a
    // contract without balanceOf reverts. Both are the same answer to the caller, and both must
    // read as such — a revert surfacing as rpc_error says "the network is broken" instead.
    const raw = await this.call(contract, ERC20.encodeFunctionData("balanceOf", [owner])).catch(
      (e: unknown) => {
        if (isNotAContractAnswer((e as Error).message ?? "")) return "0x";
        throw e;
      },
    );
    // An address with no code returns empty rather than reverting, so "0x" here means "this is
    // not a token contract", not "the balance is zero".
    if (raw === "0x" || raw === "") {
      throw new ChainError(
        "token_metadata_unavailable",
        `${contract} did not answer balanceOf — it may not be a token contract`,
      );
    }
    return (ERC20.decodeFunctionResult("balanceOf", raw)[0] as bigint).toString(10);
  }

  /**
   * A view call whose absence is an answer: `undefined` means "this contract does not implement
   * it" — an empty return (no code at the address) or a revert. Anything else is rethrown.
   *
   * The distinction is the whole point. Catching every failure would turn an unreachable node
   * into "this token has no metadata", and a caller cannot tell that from a real answer, so it
   * escalates a network outage into a claim about the contract.
   */
  async #viewCall(contract: string, data: string): Promise<string | undefined> {
    let raw: string;
    try {
      raw = await this.call(contract, data);
    } catch (e) {
      if (isNotAContractAnswer((e as Error).message ?? "")) return undefined;
      throw e;
    }
    return raw === "0x" || raw === "" ? undefined : raw;
  }

  /**
   * Best-effort ERC-20 metadata. Each field is read independently and a field the contract does
   * not answer comes back undefined — never defaulted. `decimals` in particular scales every
   * human-entered amount, so inventing 18 for a contract that stayed silent would quietly
   * misprice transfers; the caller decides what to do about the gap.
   *
   * "Best-effort" covers what the CONTRACT did not answer, never what the NODE did not deliver:
   * a transport failure propagates.
   */
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

  /** `symbol()`/`name()` as string, falling back to the bytes32 form early tokens (MKR) use. */
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
      // A value that is not a uint8 is the contract answering something else, not a node fault.
      return undefined;
    }
  }

  async #call(method: string, params: unknown[]): Promise<unknown> {
    const body = await this.#request(method, params);
    if (body.error) {
      throw new ChainError("rpc_error", `${method} failed: ${body.error.message}`);
    }
    return body.result;
  }
}

/**
 * Does this failure mean "the address holds no such contract method", as opposed to "the node
 * could not answer"? A revert and an empty return are the contract speaking; a refused connection
 * or an HTTP error is not, and must never be reported as a fact about the contract.
 */
function isNotAContractAnswer(message: string): boolean {
  return /execution reverted|invalid opcode|out of gas/i.test(message);
}

/** Accept `constructor(uint256,string)`, `(uint256,string)` or a bare `uint256,string` — the
 *  three ways someone writes the same thing — and hand ethers the one form it parses. */
function normalizeConstructorSignature(signature: string): string {
  const s = signature.trim();
  if (s.startsWith("constructor")) return s;
  return `constructor${s.startsWith("(") ? s : `(${s})`}`;
}

/**
 * The outbound half of the EIP-1474 split: a transaction object leaving for the node.
 *
 * Everything above this port speaks decimal (see the EvmGateway doc comment), and a QUANTITY on
 * the wire must be `0x`-prefixed. Node clients disagree about enforcing it — go-ethereum rejects
 * a bare decimal, reth accepts it — so a load-balanced endpoint fronting both fails a fraction of
 * requests and looks like an unreliable network rather than a malformed one.
 *
 * The field list is explicit rather than "anything that parses as a number": `to`, `from` and
 * `data` are DATA, and hex-encoding an address would be silent corruption.
 */
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
    // Already hex (or something this function has no business rewriting) — leave it alone.
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

function rpcIntegerError(message: string) {
  return new ChainError("rpc_error", message);
}

function valueError(message: string) {
  return new ChainError("invalid_value", message);
}

/**
 * JSON-RPC quantities are hex. Every amount downstream is a decimal base-unit string, and a wei
 * balance exceeds Number.MAX_SAFE_INTEGER, so this goes through BigInt — never parseInt.
 */
function toDecimalString(hex: unknown): string {
  if (typeof hex !== "string") {
    throw new ChainError("rpc_error", `expected a hex quantity, got ${typeof hex}`);
  }
  return BigInt(hex).toString(10);
}

/**
 * The other half of the EIP-1474 split. DATA is a byte string — a hash, an address, bytecode —
 * so it is carried through verbatim. Running it through `toDecimalString` would turn a 32-byte
 * hash into a meaningless integer, which is why the conversion is chosen per field rather than
 * inferred from the value looking hex-ish.
 */
function toData(value: unknown): string {
  if (typeof value !== "string") {
    throw new ChainError("rpc_error", `expected hex data, got ${typeof value}`);
  }
  return value;
}

/**
 * The minimal ERC-20 read surface. ethers owns the ABI encoding here for the same reason it owns
 * the transaction and typed-data encoding elsewhere: it is specification-heavy work that never
 * touches a private key. Offsets, dynamic types and selectors are exactly what not to hand-roll.
 */
const ERC20 = new Interface([
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
]);

/** the pre-standard `bytes32` spelling of symbol()/name(): fixed width, NUL-padded on the right. */
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

/** the write half of the ERC-20 surface; kept separate so the read interface stays read-only. */
const ERC20_WRITE = new Interface(["function transfer(address,uint256) returns (bool)"]);
