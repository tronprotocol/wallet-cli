/**
 * A read-only `@sun-sdk/runtime` Runtime, and the ONLY file allowed to import it (D6).
 *
 * Some SDK planners need a Runtime rather than a bare chain config — the Router's Permit2
 * planner, for instance, reads the Permit2Helper's "already approved?" answer and the Permit2
 * allowance for its nonce. Both are reads. Nothing in this codebase wants the SDK to sign or
 * broadcast anything: that is `TxPipeline`'s job, and it is where dry-run, permissions,
 * confirmation and the receipt shape are guaranteed.
 *
 * So this Runtime answers reads and THROWS on everything else. The throw is not defensive
 * clutter — it is the assertion that the boundary holds. A future caller who reaches for
 * `sendAction` gets a failure naming the rule rather than a second, unguarded path to the chain,
 * and `depcruise` keeps anything but this file from importing the package at all.
 *
 * It is built with NO wallet, deliberately. A Runtime with a wallet could sign; this one has
 * nothing to sign with, which is a stronger guarantee than a policy.
 */
import { createRuntime, type Runtime, type TronClient, type WalletAdapter } from "@sun-sdk/runtime";
import { utils as tronUtils } from "tronweb";
import type { ChainGatewayProvider } from "../../../application/ports/chain/gateway-provider.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import { tronBytesToBase58 } from "../../../domain/address/index.js";

/** The SDK's own network names. Ours are canonical ids, so the two are mapped explicitly. */
const SDK_NETWORKS: Readonly<Record<string, string>> = {
  "tron:728126428": "mainnet",
  "tron:3448148188": "nile",
};

/**
 * The SDK's name for one of our networks.
 *
 * Exported because the planners need the same name the runtime was built with: passing one name to
 * `createRuntime` and another to `createProtocolsContext` makes the materializer refuse with
 * "Network changed; rebuild the swap plan", which is a confusing way to learn about a typo.
 */
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

/**
 * A Runtime for `network`, able to read and nothing else.
 *
 * `from` matters: a constant call is executed as if sent by an address, and the Permit2 reads are
 * about a specific owner. Passing the wrong one would answer a question about somebody else.
 */
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

    /**
     * The one thing this client does: a constant call through our own gateway.
     *
     * The SDK asks for DECODED values and says what it expects in `outputs`. Our gateway answers
     * in ABI words, so the two are joined here — measured, not assumed: handing the words back
     * raw got "Invalid Permit2Helper approval result" from a planner that wanted a boolean.
     */
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

    // Everything below could put a transaction on chain. `TxPipeline` owns that path, so these
    // exist only to satisfy the interface and to fail loudly if anything ever calls them.
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

/**
 * A wallet that says WHO is trading and WHAT this CLI can sign, and signs nothing itself.
 *
 * The Router's swap planner requires a wallet on the runtime: it needs the owner's address, and it
 * reads `capabilities` to decide between a typed-data permit and an on-chain one. Both are
 * questions about the account, not requests to use it, so both are answered.
 *
 * The capability flags describe THIS CLI, because the planner's job is to pick the path the CLI
 * will actually take: it signs transactions and TIP-712 typed data, it never asks a wallet to
 * broadcast on its behalf, and it prompts on its own terms rather than the SDK's. Every signing
 * method then throws, which is the D6 guarantee: the planner may know what we can do, and may not
 * do any of it. Producing a signature is `TxPipeline`'s and `SignerResolver`'s job, where the
 * password flow, Ledger handling, dry-run and confirmation live.
 */
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

/**
 * ABI words as the values their types describe.
 *
 * The coder is TronWeb's own — the same ethers coder it encodes calls with — rather than a
 * hand-written one: a decoder written here would be a second, untested implementation of a
 * standard, and getting `uint48` or a dynamic type subtly wrong produces a plausible number
 * instead of an error.
 *
 * Two conversions are deliberate. Integers come back as `bigint` and are handed over as decimal
 * STRINGS, because an amount that crosses a JSON boundary as a bigint throws and as a number
 * loses digits. Addresses come back as EVM hex and are handed over as TRON base58, which is what
 * the SDK's own `TronAddress` means and what every other address in this codebase is.
 */
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

/** ethers' coder, reached through TronWeb so the CLI carries no second ABI implementation. */
function coder(): { decode(types: readonly string[], data: string): readonly unknown[] } {
  const AbiCoder = tronUtils.ethersUtils.AbiCoder as unknown as {
    defaultAbiCoder?: () => { decode(types: readonly string[], data: string): readonly unknown[] };
    new (): { decode(types: readonly string[], data: string): readonly unknown[] };
  };
  return AbiCoder.defaultAbiCoder ? AbiCoder.defaultAbiCoder() : new AbiCoder();
}
