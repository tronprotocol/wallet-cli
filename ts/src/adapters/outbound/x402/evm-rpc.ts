import { Interface, type InterfaceAbi } from "ethers";
import type { DispatchCheck } from "../../../application/contracts/deadline.js";
import { TransportError } from "../../../domain/errors/index.js";
import { createTimedFetch } from "../http/timed-fetch.js";

// The reads the EVM SDK makes for an approval extension. Given on the signer, they replace the
// SDK's own RPC client, so every request runs the command's dispatch check and aborts with it.
export interface EvmRpcCapabilities {
  readContract(args: {
    address: string;
    abi: unknown;
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
  getTransactionCount(args: { address: string }): Promise<number>;
  estimateFeesPerGas(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
}

export function evmRpcCapabilities(endpoint: string, check: DispatchCheck): EvmRpcCapabilities {
  const fetcher = createTimedFetch({ check });
  let id = 0;
  const call = async (method: string, params: readonly unknown[]): Promise<unknown> => {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    if (!response.ok)
      throw new TransportError("rpc_error", `EVM RPC returned HTTP ${response.status}`);
    let body: { result?: unknown; error?: unknown };
    try {
      body = (await response.json()) as typeof body;
    } catch {
      throw new TransportError("rpc_error", "EVM RPC returned invalid JSON");
    }
    if (body.error !== undefined && body.error !== null)
      throw new TransportError("rpc_error", `EVM RPC ${method} failed`);
    return body.result;
  };
  const quantity = (value: unknown, label: string): bigint => {
    if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value))
      throw new TransportError("rpc_error", `EVM RPC returned an invalid ${label}`);
    return BigInt(value);
  };
  return {
    async readContract({ address, abi, functionName, args = [] }) {
      const contract = new Interface(abi as InterfaceAbi);
      const data = contract.encodeFunctionData(functionName, args);
      const result = await call("eth_call", [{ to: address, data }, "latest"]);
      if (typeof result !== "string")
        throw new TransportError("rpc_error", "EVM RPC returned an invalid call result");
      const decoded = contract.decodeFunctionResult(functionName, result);
      return decoded.length === 1 ? decoded[0] : decoded.toArray();
    },
    async getTransactionCount({ address }) {
      const count = quantity(await call("eth_getTransactionCount", [address, "latest"]), "nonce");
      return Number(count);
    },
    // Same estimate as viem's EIP-1559 default: base fee * 1.2 plus the node's priority fee.
    async estimateFeesPerGas() {
      const block = (await call("eth_getBlockByNumber", ["latest", false])) as {
        baseFeePerGas?: unknown;
      } | null;
      const baseFee = quantity(block?.baseFeePerGas, "base fee");
      let priority: bigint;
      try {
        priority = quantity(await call("eth_maxPriorityFeePerGas", []), "priority fee");
      } catch (error) {
        if (!(error instanceof TransportError) || error.code !== "rpc_error") throw error;
        const gasPrice = quantity(await call("eth_gasPrice", []), "gas price");
        priority = gasPrice > baseFee ? gasPrice - baseFee : 0n;
      }
      return { maxFeePerGas: (baseFee * 12n) / 10n + priority, maxPriorityFeePerGas: priority };
    },
  };
}
