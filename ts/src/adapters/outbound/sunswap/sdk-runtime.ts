// SDK planning must not bypass TxPipeline signing and broadcast checks.
import {
  createRuntime,
  type Runtime,
  type TronClient,
  type WalletAdapter,
} from "@sun-protocol/sun-sdk-runtime";
import { utils as tronUtils } from "tronweb";
import type { ChainGatewayProvider } from "../../../application/ports/chain/gateway-provider.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import { tronBytesToBase58 } from "../../../domain/address/index.js";

const SDK_NETWORKS: Readonly<Record<string, string>> = {
  "tron:728126428": "mainnet",
  "tron:3448148188": "nile",
};

// The runtime and protocol context must use the same SDK network name.
export function sdkNetworkName(network: NetworkDescriptor): string {
  const name = SDK_NETWORKS[network.id];
  if (name === undefined) {
    throw new UsageError(
      "unsupported_network",
      `the SunSwap SDK has no configuration for ${network.id}`,
    );
  }
  return name;
}

// Constant calls execute as from; owner-dependent reads require the correct account.
export function readOnlySdkRuntime(
  gateways: ChainGatewayProvider,
  network: NetworkDescriptor,
  from: string,
): Runtime {
  const sdkNetwork = sdkNetworkName(network);
  const gateway = gateways.get(network, "tron");

  const client: TronClient = {
    kind: "custom",
    network: sdkNetwork as TronClient["network"],

    // Decode declared outputs unless rawResult is requested.
    async readContract<T>(call: {
      target: string;
      functionSelector: string;
      parameters?: readonly { type: string; value: unknown }[];
      outputs?: readonly { type: string; name?: string }[];
      rawResult?: boolean;
    }): Promise<T> {
      const words = await gateway.triggerConstantContract(
        call.target,
        call.functionSelector,
        [...(call.parameters ?? [])],
        from,
      );
      if (call.rawResult === true || call.outputs === undefined) return words as unknown as T;
      return decode(words, call.outputs, call.functionSelector) as T;
    },

    async buildTransaction() {
      throw refusal("buildTransaction");
    },
    async broadcastTransaction() {
      throw refusal("broadcastTransaction");
    },
  } as unknown as TronClient;

  return createRuntime({
    network: sdkNetwork as never,
    tronClient: client,
    wallet: identityOnlyWallet(from),
  });
}

// Expose identity and planning capabilities without permitting SDK signing.
function identityOnlyWallet(from: string): WalletAdapter {
  return {
    kind: "custom",
    capabilities: {
      signTransaction: true,
      signAndSendTransaction: false,
      signTypedData: true,
      userInteractive: false,
    },
    async getAddress() {
      return from as never;
    },
    async signTransaction() {
      throw refusal("signTransaction");
    },
    async signTypedData() {
      throw refusal("signTypedData");
    },
  } as unknown as WalletAdapter;
}

function refusal(operation: string): ChainError {
  return new ChainError(
    "provider_error",
    `the SunSwap SDK runtime is read-only and refused ${operation}: every transaction in this CLI is built, signed and broadcast through TxPipeline, which is where dry-run, permissions and confirmation are guaranteed`,
  );
}

// Decode integers to decimal strings and addresses to TRON base58.
function decode(
  words: readonly string[],
  outputs: readonly { type: string; name?: string }[],
  selector: string,
): unknown[] {
  const data = `0x${words.join("")}`;
  let values: readonly unknown[];
  try {
    values = coder().decode(
      outputs.map((output) => output.type),
      data,
    ) as readonly unknown[];
  } catch (error) {
    throw new ChainError(
      "provider_error",
      `could not decode the answer to ${selector} as (${outputs.map((o) => o.type).join(",")}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return values.map((value, index) => plain(value, outputs[index]!.type));
}

function plain(value: unknown, type: string): unknown {
  if (typeof value === "bigint") return value.toString();
  if (type === "address" && typeof value === "string" && value.startsWith("0x")) {
    return tronBytesToBase58(Uint8Array.from(Buffer.from(`41${value.slice(2)}`, "hex")));
  }
  return value;
}

function coder(): { decode(types: readonly string[], data: string): readonly unknown[] } {
  const AbiCoder = tronUtils.ethersUtils.AbiCoder as unknown as {
    defaultAbiCoder?: () => { decode(types: readonly string[], data: string): readonly unknown[] };
    new (): { decode(types: readonly string[], data: string): readonly unknown[] };
  };
  return AbiCoder.defaultAbiCoder ? AbiCoder.defaultAbiCoder() : new AbiCoder();
}
