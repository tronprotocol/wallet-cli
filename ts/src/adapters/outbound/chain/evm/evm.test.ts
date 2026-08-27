import { describe, it, expect, afterEach, vi } from "vitest";
import { barBroadcasts } from "../../../../application/services/broadcast-guard.js";
import { Transaction } from "ethers";
import { EvmRpcClient } from "./evm.js";
import { HttpTransportError, type HttpTransport } from "../../http/index.js";

const ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** captures the outgoing JSON-RPC request and replies with `result` */
function stubRpc(result: unknown) {
  const seen: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      seen.push(JSON.parse(init.body));
      return {
        ok: true,
        text: async () => JSON.stringify({ jsonrpc: "2.0", id: 1, result }),
      };
    }),
  );
  return seen;
}

describe("EvmRpcClient.getNativeBalance", () => {
  it("sends JSON-RPC through the injected HTTP transport seam", async () => {
    const requests: unknown[] = [];
    const transport: HttpTransport = {
      requestText: async (request) => {
        requests.push(request);
        return JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x0" });
      },
    };

    await new EvmRpcClient("https://node.example", 5_000, transport).getNativeBalance(ADDR);

    expect(requests).toEqual([
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBalance",
          params: [ADDR, "latest"],
        }),
      },
    ]);
  });

  it("asks eth_getBalance for the latest block", async () => {
    const seen = stubRpc("0x0");
    await new EvmRpcClient("https://node.example", 5_000).getNativeBalance(ADDR);

    expect(seen[0]).toMatchObject({
      jsonrpc: "2.0",
      method: "eth_getBalance",
      params: [ADDR, "latest"],
    });
  });

  // JSON-RPC speaks hex; every amount downstream is a decimal base-unit STRING, and a balance
  // in wei overflows Number, so this must go through BigInt and never through parseInt.
  it.each([
    ["0x0", "0"],
    ["0xde0b6b3a7640000", "1000000000000000000"],
    ["0xffffffffffffffffffffffff", "79228162514264337593543950335"],
  ])("converts %s to the decimal wei string %s", async (hex, expected) => {
    stubRpc(hex);
    const balance = await new EvmRpcClient("https://node.example", 5_000).getNativeBalance(ADDR);

    expect(balance).toBe(expected);
  });

  it("surfaces a JSON-RPC error object as rpc_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "boom" } }),
      })),
    );

    await expect(
      new EvmRpcClient("https://node.example", 5_000).getNativeBalance(ADDR),
    ).rejects.toMatchObject({ code: "rpc_error" });
  });

  it("surfaces a non-200 response as rpc_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 429, text: async () => "" })),
    );

    await expect(
      new EvmRpcClient("https://node.example", 5_000).getNativeBalance(ADDR),
    ).rejects.toMatchObject({ code: "rpc_error" });
  });

  it("surfaces malformed JSON as rpc_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => "{not-json" })),
    );

    await expect(
      new EvmRpcClient("https://node.example", 5_000).getNativeBalance(ADDR),
    ).rejects.toMatchObject({ code: "rpc_error" });
  });

  it("aborts a hung call at timeoutMs instead of hanging", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      ),
    );

    await expect(
      new EvmRpcClient("https://node.example", 20).getNativeBalance(ADDR),
    ).rejects.toThrow();
  });
});

/**
 * JSON-RPC carries two hex kinds (EIP-1474) and they must NOT be treated alike:
 *   QUANTITY — `0x1a`, a minimally-encoded number → decimal string, via BigInt.
 *   DATA     — `0x6080…`, a byte string (hashes, addresses, code) → kept verbatim.
 * Converting DATA would silently destroy it, so the conversion is per-field against each
 * method's known shape, never a "looks like hex" sweep over the response.
 */
describe("EvmRpcClient QUANTITY vs DATA", () => {
  it("returns a nonce as a decimal string", async () => {
    const seen = stubRpc("0x2a");
    const nonce = await new EvmRpcClient("https://node.example", 5_000).getTransactionCount(ADDR);

    expect(nonce).toBe("42");
    expect(seen[0]).toMatchObject({ method: "eth_getTransactionCount", params: [ADDR, "latest"] });
  });

  it("returns contract code as hex, untouched", async () => {
    stubRpc("0x60806040");
    const code = await new EvmRpcClient("https://node.example", 5_000).getCode(ADDR);

    expect(code).toBe("0x60806040");
  });

  it("reports an account with no code as 0x, not as the number zero", async () => {
    stubRpc("0x");
    expect(await new EvmRpcClient("https://node.example", 5_000).getCode(ADDR)).toBe("0x");
  });

  it("returns the head block height as a decimal string", async () => {
    stubRpc("0x12d687");
    expect(await new EvmRpcClient("https://node.example", 5_000).getBlockNumber()).toBe("1234567");
  });
});

const RPC_BLOCK = {
  number: "0x12d687",
  // seconds since the epoch, hex — reported as-is, unlike TRON's millisecond number.
  timestamp: "0x66b1c0d0",
  hash: "0xaabbccdd00000000000000000000000000000000000000000000000000000001",
  parentHash: "0xaabbccdd00000000000000000000000000000000000000000000000000000000",
  transactions: ["0xdead", "0xbeef"],
};

describe("EvmRpcClient.getBlock", () => {
  it("asks for the latest block, without full transaction objects", async () => {
    const seen = stubRpc(RPC_BLOCK);
    await new EvmRpcClient("https://node.example", 5_000).getBlock();

    expect(seen[0]).toMatchObject({ method: "eth_getBlockByNumber", params: ["latest", false] });
  });

  it("asks for a specific height as a QUANTITY, not a decimal string", async () => {
    const seen = stubRpc(RPC_BLOCK);
    await new EvmRpcClient("https://node.example", 5_000).getBlock("1234567");

    expect(seen[0]).toMatchObject({ params: ["0x12d687", false] });
  });

  it("passes a block tag through unchanged", async () => {
    const seen = stubRpc(RPC_BLOCK);
    await new EvmRpcClient("https://node.example", 5_000).getBlock("finalized");

    expect(seen[0]).toMatchObject({ params: ["finalized", false] });
  });

  it("returns the node's object verbatim — hex quantities and all", async () => {
    // `block` is an inspection command: the JSON contract here is "what the node said". The
    // families are deliberately not aligned, so nothing is converted, renamed or dropped.
    stubRpc(RPC_BLOCK);
    const block = await new EvmRpcClient("https://node.example", 5_000).getBlock();

    expect(block).toEqual(RPC_BLOCK);
  });

  it("returns null for a height the chain does not have", async () => {
    stubRpc(null);
    expect(await new EvmRpcClient("https://node.example", 5_000).getBlock("999999999")).toBeNull();
  });
});

const TOKEN = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
/** ABI fixtures, produced with ethers' coder rather than written from memory. */
const ENC = {
  stringUSDT:
    "0x0000000000000000000000000000000000000000000000000000000000000020" +
    "0000000000000000000000000000000000000000000000000000000000000004" +
    "5553445400000000000000000000000000000000000000000000000000000000",
  // Byte-for-byte what MKR (0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2) returns for symbol() on
  // Ethereum mainnet: 32 bytes, not the 96-byte offset/length/data layout a `string` return uses.
  bytes32MKR: "0x4d4b520000000000000000000000000000000000000000000000000000000000",
  uint8_6: "0x0000000000000000000000000000000000000000000000000000000000000006",
  uint256_1e18: `0x${(10n ** 18n).toString(16).padStart(64, "0")}`,
};

describe("EvmRpcClient.call", () => {
  it("sends eth_call against the latest block", async () => {
    const seen = stubRpc("0x");
    await new EvmRpcClient("https://node.example", 5_000).call(TOKEN, "0xdeadbeef");

    expect(seen[0]).toMatchObject({
      method: "eth_call",
      params: [{ to: TOKEN, data: "0xdeadbeef" }, "latest"],
    });
  });
});

describe("EvmRpcClient.getErc20Balance", () => {
  it("encodes balanceOf(address) and decodes the uint256 to a decimal string", async () => {
    const seen = stubRpc(ENC.uint256_1e18);
    const balance = await new EvmRpcClient("https://node.example", 5_000).getErc20Balance(
      TOKEN,
      ADDR,
    );

    // 0x70a08231 is the balanceOf(address) selector, followed by the left-padded owner.
    expect((seen[0] as { params: [{ data: string }] }).params[0].data).toBe(
      "0x70a08231000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    );
    expect(balance).toBe("1000000000000000000");
  });

  it("reports a non-token address as an unreadable balance rather than decoding 0x", async () => {
    stubRpc("0x");
    await expect(
      new EvmRpcClient("https://node.example", 5_000).getErc20Balance(TOKEN, ADDR),
    ).rejects.toMatchObject({ code: "token_metadata_unavailable" });
  });
});

describe("EvmRpcClient.getErc20Metadata", () => {
  /** replies per selector, so one stub can serve symbol/decimals/name in one call. */
  function stubBySelector(map: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body) as { params: [{ data: string }] };
        const selector = body.params[0].data.slice(0, 10);
        const hit = map[selector];
        return {
          ok: true,
          text: async () =>
            hit === undefined
              ? JSON.stringify({ id: 1, error: { code: -32000, message: "execution reverted" } })
              : JSON.stringify({ id: 1, result: hit }),
        };
      }),
    );
  }

  it("reads a string symbol, decimals and name", async () => {
    stubBySelector({
      "0x95d89b41": ENC.stringUSDT,
      "0x313ce567": ENC.uint8_6,
      "0x06fdde03": ENC.stringUSDT,
    });
    const meta = await new EvmRpcClient("https://node.example", 5_000).getErc20Metadata(TOKEN);

    expect(meta).toMatchObject({ symbol: "USDT", decimals: 6 });
  });

  // MKR and other early tokens declare `symbol()` as bytes32, which the string decoder rejects.
  // The symbol is a label, so a legacy encoding must not cost the user the whole entry.
  it("falls back to bytes32 for a legacy symbol", async () => {
    stubBySelector({ "0x95d89b41": ENC.bytes32MKR, "0x313ce567": ENC.uint8_6 });
    const meta = await new EvmRpcClient("https://node.example", 5_000).getErc20Metadata(TOKEN);

    expect(meta.symbol).toBe("MKR");
  });

  // decimals scales every human amount, so an unreadable one is reported as absent, never
  // defaulted — the caller decides, and for `token add` that decision is to refuse.
  it("leaves decimals undefined when the contract does not answer", async () => {
    stubBySelector({ "0x95d89b41": ENC.stringUSDT });
    const meta = await new EvmRpcClient("https://node.example", 5_000).getErc20Metadata(TOKEN);

    expect(meta.symbol).toBe("USDT");
    expect(meta.decimals).toBeUndefined();
  });

  it("never guesses a default of 18", async () => {
    stubBySelector({});
    const meta = await new EvmRpcClient("https://node.example", 5_000).getErc20Metadata(TOKEN);

    expect(meta.decimals).toBeUndefined();
    expect(meta.symbol).toBeUndefined();
  });
});

describe("EvmRpcClient.callFunction", () => {
  it("encodes a signature and its typed parameters into calldata", async () => {
    const seen = stubRpc("0x");
    await new EvmRpcClient("https://node.example", 5_000).callFunction(
      TOKEN,
      "balanceOf(address)",
      [{ type: "address", value: ADDR }],
    );

    expect((seen[0] as { params: [{ data: string }] }).params[0].data).toBe(
      `0x70a08231${"0".repeat(24)}${ADDR.slice(2).toLowerCase()}`,
    );
  });

  it("encodes a no-argument call as the bare selector", async () => {
    const seen = stubRpc("0x");
    await new EvmRpcClient("https://node.example", 5_000).callFunction(TOKEN, "decimals()", []);

    expect((seen[0] as { params: [{ data: string }] }).params[0].data).toBe("0x313ce567");
  });

  it("returns the result untouched", async () => {
    const raw = `0x${7n.toString(16).padStart(64, "0")}`;
    stubRpc(raw);

    expect(
      await new EvmRpcClient("https://node.example", 5_000).callFunction(TOKEN, "decimals()", []),
    ).toBe(raw);
  });

  // A malformed signature or a value that does not fit its declared type must fail as bad input,
  // before any request leaves the process — not as an opaque node error afterwards.
  it("rejects an unparsable signature without calling the node", async () => {
    const seen = stubRpc("0x");

    await expect(
      new EvmRpcClient("https://node.example", 5_000).callFunction(TOKEN, "not a signature", []),
    ).rejects.toMatchObject({ code: "invalid_value" });
    expect(seen).toEqual([]);
  });

  it("rejects a value that does not fit its declared ABI type", async () => {
    const seen = stubRpc("0x");

    await expect(
      new EvmRpcClient("https://node.example", 5_000).callFunction(TOKEN, "balanceOf(address)", [
        { type: "address", value: "not-an-address" },
      ]),
    ).rejects.toMatchObject({ code: "invalid_value" });
    expect(seen).toEqual([]);
  });
});

describe("EvmRpcClient.feeData", () => {
  /** replies per JSON-RPC method, so one stub serves the three reads feeData makes. */
  function stubByMethod(map: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const { method } = JSON.parse(init.body) as { method: string };
        const hit = map[method];
        return {
          ok: true,
          text: async () =>
            hit === undefined
              ? JSON.stringify({ id: 1, error: { code: -32601, message: "not supported" } })
              : JSON.stringify({ id: 1, result: hit }),
        };
      }),
    );
  }

  it("reports base fee, gas price and the suggested tip as decimal wei", async () => {
    stubByMethod({
      eth_getBlockByNumber: { baseFeePerGas: "0x940cfe0" },
      eth_gasPrice: "0x9425680",
      eth_maxPriorityFeePerGas: "0x186a0",
    });
    const fee = await new EvmRpcClient("https://node.example", 5_000).feeData();

    expect(fee).toEqual({
      baseFeeWei: String(0x940cfe0),
      gasPriceWei: String(0x9425680),
      suggestedPriorityWei: String(0x186a0),
    });
  });

  // BSC reports a base fee of exactly zero. It must survive as "0", not collapse to undefined,
  // or the fee model would read the chain as legacy.
  it("keeps a zero base fee distinct from a missing one", async () => {
    stubByMethod({
      eth_getBlockByNumber: { baseFeePerGas: "0x0" },
      eth_gasPrice: "0x2faf080",
      eth_maxPriorityFeePerGas: "0x2faf080",
    });

    expect((await new EvmRpcClient("https://node.example", 5_000).feeData()).baseFeeWei).toBe("0");
  });

  it("omits the base fee on a chain whose blocks carry none", async () => {
    stubByMethod({ eth_getBlockByNumber: { number: "0x1" }, eth_gasPrice: "0x1" });
    const fee = await new EvmRpcClient("https://node.example", 5_000).feeData();

    expect(fee.baseFeeWei).toBeUndefined();
    expect(fee.gasPriceWei).toBe("1");
  });

  it("degrades the suggested tip when the endpoint does not implement it", async () => {
    stubByMethod({ eth_getBlockByNumber: { baseFeePerGas: "0x10" }, eth_gasPrice: "0x20" });
    const fee = await new EvmRpcClient("https://node.example", 5_000).feeData();

    expect(fee.suggestedPriorityWei).toBeUndefined();
    expect(fee.baseFeeWei).toBe("16");
  });
});

describe("EvmRpcClient.estimateGas", () => {
  it("asks eth_estimateGas and returns a decimal string", async () => {
    const seen = stubRpc("0x5208");
    const gas = await new EvmRpcClient("https://node.example", 5_000).estimateGas({
      from: ADDR,
      to: TOKEN,
      value: "0x0",
    });

    expect(gas).toBe("21000");
    expect(seen[0]).toMatchObject({ method: "eth_estimateGas" });
  });

  /**
   * QUANTITY fields must go out as `0x` hex. Everything above this port speaks decimal, and
   * go-ethereum rejects a bare decimal while reth accepts it — so a decimal `value` against a
   * load-balanced endpoint fails a fraction of requests and reads as a flaky network.
   */
  it("hex-encodes decimal quantities before they reach the node", async () => {
    const seen = stubRpc("0x5208");
    await new EvmRpcClient("https://node.example", 5_000).estimateGas({
      from: ADDR,
      to: TOKEN,
      value: "0",
      nonce: 15,
      maxFeePerGas: "2033933954",
      data: "0xa9059cbb",
    });

    expect((seen[0] as any).params[0]).toEqual({
      from: ADDR,
      to: TOKEN,
      value: "0x0",
      nonce: "0xf",
      maxFeePerGas: "0x793b5e82",
      // DATA, not QUANTITY: hex-encoding an address or calldata would be silent corruption.
      data: "0xa9059cbb",
    });
  });

  it("leaves a value that is already hex untouched", async () => {
    const seen = stubRpc("0x5208");
    await new EvmRpcClient("https://node.example", 5_000).estimateGas({ value: "0x1c" });

    expect((seen[0] as any).params[0]).toEqual({ value: "0x1c" });
  });

  it("reports a quantity field that is not a number rather than sending it", async () => {
    stubRpc("0x5208");

    await expect(
      new EvmRpcClient("https://node.example", 5_000).estimateGas({ value: "lots" }),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });
});

/**
 * Broadcasting.
 *
 * Acceptance is WHITE-LISTED: `eth_sendRawTransaction` answers with a transaction hash, so a
 * result that is not one is a rejection. The TRON adapter learned this the expensive way — a
 * blacklist test (`result === false`) never fired against error responses that simply omit the
 * field, and every rejected transaction was reported as submitted.
 */
/**
 * "There is no token here" has two shapes on EVM: an address with no code answers empty, and a
 * contract without balanceOf reverts. Both are the same answer to a caller, and the reverting one
 * used to surface as rpc_error — which reads as a broken network rather than a wrong address.
 */
describe("EvmRpcClient.getErc20Balance", () => {
  const client = () => new EvmRpcClient("https://node.example", 5_000);
  const OWNER = ADDR;

  function stubCall(body: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => JSON.stringify({ id: 1, ...(body as object) }),
      })),
    );
  }

  it("returns the decoded balance", async () => {
    stubCall({ result: `0x${1234n.toString(16).padStart(64, "0")}` });

    await expect(client().getErc20Balance(TOKEN, OWNER)).resolves.toBe("1234");
  });

  it("reports an address with no code as not a token", async () => {
    stubCall({ result: "0x" });

    await expect(client().getErc20Balance(TOKEN, OWNER)).rejects.toMatchObject({
      code: "token_metadata_unavailable",
    });
  });

  it("reports a reverting contract the same way, not as an rpc fault", async () => {
    stubCall({ error: { code: -32000, message: "execution reverted" } });

    await expect(client().getErc20Balance(TOKEN, OWNER)).rejects.toMatchObject({
      code: "token_metadata_unavailable",
    });
  });

  // The line the classification must not cross: a node that cannot be reached is still a node
  // that cannot be reached.
  it("leaves a transport failure as rpc_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    );

    await expect(client().getErc20Balance(TOKEN, OWNER)).rejects.toMatchObject({
      code: "rpc_error",
    });
  });
});

/**
 * Metadata reads have the same line to hold as the balance read: a contract that does not
 * implement a view answers `undefined`, but a node that cannot be reached is a node that cannot
 * be reached. Catching both would report an outage as "this token has no metadata" — and the
 * caller, seeing an empty result, would go on to say the address is not a token.
 */
describe("EvmRpcClient.getErc20Metadata", () => {
  const client = () => new EvmRpcClient("https://node.example", 5_000);

  it("returns the fields the contract answers", async () => {
    // symbol/name are dynamic strings; decimals is a word. Encoded as ethers would return them.
    const str = (v: string) => {
      const hex = Buffer.from(v, "utf8").toString("hex");
      return (
        "0x" +
        32n.toString(16).padStart(64, "0") +
        BigInt(v.length).toString(16).padStart(64, "0") +
        hex.padEnd(64, "0")
      );
    };
    const answers = [str("USDC"), "0x" + 6n.toString(16).padStart(64, "0"), str("USD Coin")];
    let i = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => JSON.stringify({ id: 1, result: answers[i++] }),
      })),
    );

    await expect(client().getErc20Metadata(TOKEN)).resolves.toMatchObject({
      symbol: "USDC",
      decimals: 6,
    });
  });

  it("returns nothing for a contract that implements none of them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({ id: 1, error: { code: -32000, message: "execution reverted" } }),
      })),
    );

    await expect(client().getErc20Metadata(TOKEN)).resolves.toEqual({});
  });

  it("propagates a transport failure instead of reporting absent metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    );

    await expect(client().getErc20Metadata(TOKEN)).rejects.toMatchObject({ code: "rpc_error" });
  });
});

describe("EvmRpcClient.sendRawTransaction", () => {
  const RAW = "0x02f8b1";
  const HASH = `0x${"ab".repeat(32)}`;

  function stubResponse(body: unknown) {
    const seen: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        seen.push(JSON.parse(init.body));
        return { ok: true, text: async () => JSON.stringify({ id: 1, ...(body as object) }) };
      }),
    );
    return seen;
  }

  it("submits the raw transaction and returns the node's hash", async () => {
    const seen = stubResponse({ result: HASH });
    const out = await new EvmRpcClient("https://node.example", 5_000).sendRawTransaction(RAW);

    expect(seen[0]).toMatchObject({ method: "eth_sendRawTransaction", params: [RAW] });
    expect(out).toEqual({ hash: HASH });
  });

  // The guard is the backstop for a family binding that drops --dry-run; it has to sit in front
  // of the wire call, not merely exist.
  it("refuses to reach the wire while broadcasting is barred", async () => {
    const seen = stubResponse({ result: HASH });

    await barBroadcasts("tx broadcast --dry-run", async () => {
      await expect(
        new EvmRpcClient("https://node.example", 5_000).sendRawTransaction(RAW),
      ).rejects.toMatchObject({ code: "dry_run_violation" });
    });
    expect(seen).toHaveLength(0);
  });

  it("treats a result that is not a transaction hash as a rejection", async () => {
    stubResponse({ result: "ok" });

    await expect(
      new EvmRpcClient("https://node.example", 5_000).sendRawTransaction(RAW),
    ).rejects.toMatchObject({ code: "transaction_rejected" });
  });

  it("treats a missing result as a rejection rather than a success", async () => {
    stubResponse({});

    await expect(
      new EvmRpcClient("https://node.example", 5_000).sendRawTransaction(RAW),
    ).rejects.toMatchObject({ code: "transaction_rejected" });
  });

  it.each([
    ["nonce too low", "nonce_too_low"],
    ["insufficient funds for gas * price + value", "insufficient_balance"],
    ["replacement transaction underpriced", "replacement_underpriced"],
    ["intrinsic gas too low", "gas_too_low"],
  ])("classifies %s as %s", async (message, code) => {
    stubResponse({ error: { code: -32000, message } });

    await expect(
      new EvmRpcClient("https://node.example", 5_000).sendRawTransaction(RAW),
    ).rejects.toMatchObject({ code });
  });

  it("keeps an unrecognised rejection under transaction_rejected with the node's words", async () => {
    stubResponse({ error: { code: -32000, message: "some new validator rule" } });

    await expect(
      new EvmRpcClient("https://node.example", 5_000).sendRawTransaction(RAW),
    ).rejects.toMatchObject({ code: "transaction_rejected" });
  });

  // "already known" means the transaction is ALREADY in the mempool: the user's intent is
  // satisfied, and reporting a failure would deny a fact that already holds. Re-running the same
  // command must not turn a submitted transaction into an error.
  it.each(["already known", "ALREADY KNOWN", "transaction already exists"])(
    "treats %s as an accepted submission",
    async (message) => {
      stubResponse({ error: { code: -32000, message } });
      const out = await new EvmRpcClient("https://node.example", 5_000).sendRawTransaction(RAW);

      expect(out.alreadyKnown).toBe(true);
      expect(out.hash).toBeUndefined();
    },
  );
});

describe("EvmRpcClient.getTransactionReceipt", () => {
  it("returns null while the transaction is still pending", async () => {
    stubRpc(null);
    expect(
      await new EvmRpcClient("https://node.example", 5_000).getTransactionReceipt("0xabc"),
    ).toBeNull();
  });

  // A receipt is NOT proof of success: status 0x0 is a transaction that was mined, paid gas, and
  // reverted. Reporting that as confirmed would be the worst lie this CLI could tell.
  it("reports a reverted transaction as failed, not confirmed", async () => {
    stubRpc({
      status: "0x0",
      gasUsed: "0x5208",
      effectiveGasPrice: "0x3b9aca00",
      blockNumber: "0x10",
    });
    const r = await new EvmRpcClient("https://node.example", 5_000).getTransactionReceipt("0xabc");

    expect(r).toMatchObject({ success: false, gasUsed: "21000", blockNumber: 16 });
  });

  it("reports a successful transaction with its realised fee", async () => {
    stubRpc({
      status: "0x1",
      gasUsed: "0x5208",
      effectiveGasPrice: "0x3b9aca00",
      blockNumber: "0x10",
    });
    const r = await new EvmRpcClient("https://node.example", 5_000).getTransactionReceipt("0xabc");

    // feeWei is gasUsed × effectiveGasPrice — what was actually paid, not the ceiling.
    expect(r).toMatchObject({ success: true, feeWei: String(21000n * 1000000000n) });
  });

  it("carries the deployed contract address when the receipt names one", async () => {
    stubRpc({ status: "0x1", gasUsed: "0x1", contractAddress: "0xdead", blockNumber: "0x1" });
    const r = await new EvmRpcClient("https://node.example", 5_000).getTransactionReceipt("0xabc");

    expect(r?.contractAddress).toBe("0xdead");
  });

  it("rejects a block number that cannot be represented safely", async () => {
    stubRpc({ status: "0x1", blockNumber: "0x20000000000000" });

    await expect(
      new EvmRpcClient("https://node.example", 5_000).getTransactionReceipt("0xabc"),
    ).rejects.toMatchObject({ code: "rpc_error" });
  });
});

describe("EvmRpcClient.encodeErc20Transfer", () => {
  it("encodes transfer(address,uint256) with the recipient and base-unit amount", () => {
    const data = new EvmRpcClient("https://node.example", 5_000).encodeErc20Transfer(
      ADDR,
      "5000000",
    );

    // 0xa9059cbb = transfer(address,uint256); then the padded recipient, then the amount.
    expect(data).toBe(
      `0xa9059cbb${"0".repeat(24)}${ADDR.slice(2).toLowerCase()}${5000000n
        .toString(16)
        .padStart(64, "0")}`,
    );
  });

  it("rejects a recipient that is not an address rather than encoding nonsense", () => {
    expect(() =>
      new EvmRpcClient("https://node.example", 5_000).encodeErc20Transfer("nope", "1"),
    ).toThrow();
  });
});

describe("EvmRpcClient.broadcast (Broadcaster port)", () => {
  it("submits the raw half of a signed transaction and echoes its hash", async () => {
    const HASH = `0x${"cd".repeat(32)}`;
    const seen = stubRpc(HASH);
    const out = await new EvmRpcClient("https://node.example", 5_000).broadcast({
      raw: "0x02f8b1",
      hash: HASH,
    });

    expect(seen[0]).toMatchObject({ method: "eth_sendRawTransaction", params: ["0x02f8b1"] });
    expect(out).toMatchObject({ hash: HASH });
  });

  it("reports an already-known submission without inventing a hash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({ id: 1, error: { code: -32000, message: "already known" } }),
      })),
    );
    const out = await new EvmRpcClient("https://node.example", 5_000).broadcast({
      raw: "0x02f8b1",
      hash: `0x${"11".repeat(32)}`,
    });

    // The locally derived hash still identifies the transaction; the node just had it already.
    expect(out.alreadyKnown).toBe(true);
    expect(out.hash).toBeUndefined();
  });

  it("refuses a signed transaction that carries no raw serialisation", async () => {
    await expect(
      new EvmRpcClient("https://node.example", 5_000).broadcast("0x02f8b1" as never),
    ).rejects.toMatchObject({ code: "invalid_transaction" });
  });
});

/**
 * `tx send --build-only` produces the artifact `tx sign --hex` consumes, so the two must agree on
 * one serialisation: unsigned in, signed out.
 */
describe("EvmRpcClient.encodeTransactionHex", () => {
  const client = () => new EvmRpcClient("https://node.example", 5_000);
  const UNSIGNED_TX = {
    type: 2,
    chainId: 11155111,
    nonce: 0,
    to: "0x000000000000000000000000000000000000dEaD",
    value: "1000000000000000",
    gasLimit: "21000",
    maxFeePerGas: "2034533506",
    maxPriorityFeePerGas: "1000000",
  };

  it("serialises an unsigned transaction so tx sign can read it back", () => {
    const hex = client().encodeTransactionHex(UNSIGNED_TX);

    expect(hex.startsWith("0x02")).toBe(true);
    // round-trips through the same parser tx sign uses
    expect(Transaction.from(hex).signature).toBeNull();
    expect(Transaction.from(hex).nonce).toBe(0);
  });

  it("serialises an already-signed transaction as its signed form", () => {
    const signed = {
      raw: "0x02f87383aa36a780830f424084793b5e8282520894000000000000000000000000000000000000dead87038d7ea4c6800080c001a02958ee6a65975b5f6c2067d08704bc367375ee3fd54f1a0b4cbbc2643ab6b95ca0044e8cb5dea54b08c8b43b68a842e75e4f6627caa3911e4f9e5119ca12c01fc9",
      hash: "0x6bfa290e4749ac903192c155d9b0f534ec9a8c8ab9dbb55bd155a91e3c0d7026",
    };

    expect(client().encodeTransactionHex(signed)).toBe(signed.raw);
  });

  it("refuses something that is not a transaction", () => {
    expect(() => client().encodeTransactionHex({ to: "not-an-address" })).toThrow();
  });
});

describe("EvmRpcClient contract-write encoding", () => {
  const client = () => new EvmRpcClient("https://node.example", 5_000);

  it("encodes a call without sending it", () => {
    const data = client().encodeFunctionCall("transfer(address,uint256)", [
      { type: "address", value: ADDR },
      { type: "uint256", value: "5" },
    ]);

    expect(data.startsWith("0xa9059cbb")).toBe(true);
    expect(data).toHaveLength(2 + 8 + 128);
  });

  const WORD = (n: bigint) => n.toString(16).padStart(64, "0");

  it("appends ABI-encoded constructor arguments to the bytecode", () => {
    const abi = [{ type: "constructor", inputs: [{ type: "uint256", name: "x" }] }];
    const data = client().encodeDeploy("0x6080", { source: "abi", abi, values: [7] });

    expect(data).toBe(`0x6080${WORD(7n)}`);
  });

  /**
   * The defect this replaces: the EVM path encoded against an empty ABI, so ANY constructor
   * argument failed with "expectedCount=0" and `--constructor-params` could not be used at all.
   * Types now come from a signature when no ABI is available — the source `cast send --create`
   * uses for the same situation.
   */
  it("encodes from a constructor signature when there is no ABI", () => {
    const data = client().encodeDeploy("0x6080", {
      source: "signature",
      signature: "constructor(uint256)",
      values: [7],
      flag: "--constructor-signature",
    });

    expect(data).toBe(`0x6080${WORD(7n)}`);
  });

  it.each(["constructor(uint256)", "(uint256)", "uint256"])(
    "accepts the signature written as %s",
    (signature) => {
      const data = client().encodeDeploy("0x6080", {
        source: "signature",
        signature,
        values: [7],
        flag: "--x",
      });

      expect(data).toBe(`0x6080${WORD(7n)}`);
    },
  );

  it("appends nothing when the constructor takes no arguments", () => {
    expect(client().encodeDeploy("0x6080", { source: "none" })).toBe("0x6080");
  });

  it("accepts bare bytecode without a 0x prefix", () => {
    expect(client().encodeDeploy("6080", { source: "none" })).toBe("0x6080");
  });

  it("rejects constructor arguments that do not match the ABI", () => {
    const abi = [{ type: "constructor", inputs: [{ type: "address", name: "a" }] }];
    expect(() =>
      client().encodeDeploy("0x6080", { source: "abi", abi, values: ["not-an-address"] }),
    ).toThrow(/the ABI/);
  });

  it("names the flag a bad signature came from", () => {
    expect(() =>
      client().encodeDeploy("0x6080", {
        source: "signature",
        signature: "constructor(uint256)",
        values: [1, 2],
        flag: "--constructor-args",
      }),
    ).toThrow(/--constructor-args/);
  });

  // CREATE derives the address from the sender and nonce alone, so it is known the moment the
  // transaction is signed — no need to wait for a receipt to tell the user where it landed.
  it("derives the CREATE address from sender and nonce", () => {
    // ethers' own getCreateAddress is the reference; this asserts the wiring, not the algorithm.
    const addr = client().contractAddressFor(ADDR, "0");

    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(client().contractAddressFor(ADDR, "1")).not.toBe(addr);
  });

  it("rejects a CREATE nonce that cannot be represented safely", () => {
    expect(() => client().contractAddressFor(ADDR, "9007199254740993")).toThrow();
  });
});

describe("EvmRpcClient.getTransactionByHash", () => {
  it("returns the node's transaction object", async () => {
    const seen = stubRpc({ hash: "0xabc", input: "0x", value: "0x0" });
    const tx = await new EvmRpcClient("https://node.example", 5_000).getTransactionByHash("0xabc");

    expect(seen[0]).toMatchObject({ method: "eth_getTransactionByHash", params: ["0xabc"] });
    expect(tx).toMatchObject({ hash: "0xabc" });
  });

  // null means "this node has no record of it" — which is NOT the same as "it never existed",
  // and the two are told apart by the caller, not here.
  it("returns null when the node has no record of the hash", async () => {
    stubRpc(null);
    expect(
      await new EvmRpcClient("https://node.example", 5_000).getTransactionByHash("0xabc"),
    ).toBeNull();
  });
});

// A stalled node is a `timeout`, not an `rpc_error`: `--json-schema` documents `timeout` as "the
// node, service or device did not answer in time", and TronRpcClient already reports it that way.
// A script that retries on `timeout` but reports `rpc_error` needs the two families to agree.
describe("EvmRpcClient transport failure classification", () => {
  const transportThrowing = (error: unknown): HttpTransport => ({
    requestText: () => Promise.reject(error),
  });

  it("maps a transport timeout to ChainError(timeout)", async () => {
    const client = new EvmRpcClient("http://node.invalid", 60_000, transportThrowing(new HttpTransportError("timeout")));
    await expect(client.getNativeBalance(ADDR)).rejects.toMatchObject({
      code: "timeout",
      message: "eth_getBalance timed out",
    });
  });

  it("keeps every other transport failure an rpc_error", async () => {
    for (const kind of ["network", "http_status", "redirect", "invalid_request"] as const) {
      const client = new EvmRpcClient("http://node.invalid", 60_000, transportThrowing(new HttpTransportError(kind)));
      await expect(client.getNativeBalance(ADDR)).rejects.toMatchObject({ code: "rpc_error" });
    }
  });

  it("keeps a non-transport throw an rpc_error", async () => {
    const client = new EvmRpcClient("http://node.invalid", 60_000, transportThrowing(new Error("boom")));
    await expect(client.getNativeBalance(ADDR)).rejects.toMatchObject({ code: "rpc_error" });
  });
});
