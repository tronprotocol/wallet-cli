/**
 * RouterExecutionPort over the SunSwap SDK.
 *
 * It uses two SDK entry points and deliberately not a third:
 *
 * - `planRouterPermit2Authorization`, which honours `approveAmountType: 'exact'` and `ttlSeconds`,
 *   for the grant.
 * - `createDeferredContractCallAction` + `materializeUniversalRouterAction`, for the calldata.
 * - NOT `planRouterSwap`. Measured on mainnet, it grants MAX_UINT160 for thirty days in every
 *   authorizing mode and `SwapPlanOptions` offers no way to bound either the amount or the TTL. The
 *   materializer attaches the signature to whatever permit struct the deferred action carries, so
 *   building that action here is what makes the grant ours: exact, one hour, and the same struct the
 *   signature covers.
 *
 * The runtime it plans against is read-only and cannot sign or broadcast (D6). Everything that
 * touches a key or the chain happens in `TxPipeline` and `SignerResolver`.
 */
import {
  createProtocolsContext,
  materializeUniversalRouterAction,
  planRouterPermit2Authorization,
  type ProtocolsContext,
} from "@sun-protocol/sun-sdk-protocols";
import { createDeferredContractCallAction } from "@sun-protocol/sun-sdk-core";
import type {
  RouterExecutionPort,
  RouterSwapCall,
} from "../../../application/ports/sunswap/router-execution.js";
import type { Permit2Plan, Permit2Port } from "../../../application/ports/sunswap/permit2.js";
import type { ContractParameter } from "../../../application/contracts/tron-contract-call.js";
import type { ChainGatewayProvider } from "../../../application/ports/chain/gateway-provider.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import { isTronNetwork } from "../../../domain/types/network.js";
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import { readOnlySdkRuntime, sdkNetworkName } from "./sdk-runtime.js";

/** The kind the SDK's materializer dispatches on. Ours must match it exactly. */
const MATERIALIZATION = "universal-router-swap";
/** Our own id for the signature step, referenced by the deferred action we build. */
const SIGNATURE_ACTION = "wallet-cli-permit2-signature";

export class SunSwapRouterPlanner implements RouterExecutionPort, Permit2Port {
  /**
   * The chain clock, read once.
   *
   * One CLI invocation runs one command, so a field on this planner IS a per-command cache. It is a
   * promise rather than a value so concurrent readers share the single request, and it is handed to
   * the SDK as `getTransactionTime` so the encoder and the caller checking its output cannot read
   * two different numbers.
   */
  #transactionTimeMs?: Promise<number>;

  constructor(private readonly gateways: ChainGatewayProvider) {}

  async transactionTime(network: NetworkDescriptor): Promise<number> {
    // Ceiling, and in seconds, because that is exactly what the encoder does with the same value:
    // `ceil(ms / 1000) + validForSeconds`.
    return Math.ceil((await this.#chainTimeMs(network)) / 1000);
  }

  routerAddress(network: NetworkDescriptor): string {
    const configured = isTronNetwork(network)
      ? network.sunswap?.contracts?.universalRouter
      : undefined;
    if (configured) return configured;
    // The SDK's chain config is the same source the encoder itself uses, so taking the address from
    // anywhere else would risk checking one router and calling another.
    const address = this.#context(network, ZERO_READER).chain.contracts.universalRouter;
    if (typeof address !== "string" || address.length === 0) {
      throw new UsageError(
        "unsupported_network",
        `network ${network.id} has no SunSwap Universal Router`,
      );
    }
    return address;
  }

  /**
   * A grant for whichever spender is named.
   *
   * `spender` is required rather than defaulted to the router: this now serves a swap and a V4 deposit,
   * and a grant to the wrong contract is the entire risk the guard exists to catch. Measured on Nile —
   * handed the V4 position manager, the same planner produces grants bound to it.
   *
   * `undefined` when the standing grant already covers the amount. A repeat depositor needs no permit,
   * and signing one anyway would spend a signature to change nothing.
   */
  async planPermit(
    network: NetworkDescriptor,
    input: {
      readonly owner: string;
      readonly token: string;
      readonly spender: string;
      readonly amount: string;
      readonly ttlSeconds: number;
    },
  ): Promise<Permit2Plan | undefined> {
    const context = this.#context(network, input.owner);
    let plan;
    try {
      plan = await planRouterPermit2Authorization(context, {
        owner: input.owner as never,
        token: input.token as never,
        spender: input.spender as never,
        amount: input.amount,
        approval: "permit2",
        // Both of these are the whole reason this planner is used instead of the swap planner.
        approveAmountType: "exact",
        ttlSeconds: input.ttlSeconds,
        // What this CLI can do, so the planner picks the path the CLI will actually take. It is a
        // claim about the account, not permission to use it: the runtime's own wallet throws.
        walletCapabilities: {
          signTransaction: true,
          signAndSendTransaction: false,
          signTypedData: true,
          userInteractive: false,
        },
      });
    } catch (error) {
      throw new ChainError(
        "provider_error",
        `could not plan the Permit2 authorization for this swap: ${message(error)}`,
      );
    }

    // A standing grant that already covers the amount needs nothing signed. Measured: the planner says
    // `already-approved` and the deposit goes out as a bare call.
    if (plan.mode === "already-approved") return undefined;
    const signature = plan.actions.find((action) => action.type === "typed-data-signature");
    if (plan.mode !== "typed-data" || signature === undefined || plan.permitSingle === undefined) {
      // Every other mode either grants nothing or grants it on chain, and both would leave the
      // calldata carrying a permit we never checked. The caller refuses rather than adapting.
      throw new ChainError(
        "permit_mismatch",
        `the Permit2 planner chose ${plan.mode} rather than a typed-data permit, so there is no grant to check before signing`,
      );
    }
    const grant = plan.permitSingle as { details?: { amount?: unknown; expiration?: unknown } };
    return {
      permit2: this.#permit2(network),
      spender: input.spender,
      typedData: (signature as { typedData?: unknown }).typedData,
      grant: plan.permitSingle,
      amount: String(grant.details?.amount ?? ""),
      expiration: String(grant.details?.expiration ?? ""),
      mode: plan.mode,
    };
  }

  async buildSwapCall(
    network: NetworkDescriptor,
    input: {
      readonly route: unknown;
      readonly slippageBips: number;
      readonly recipient: string;
      readonly validForSeconds: number;
      readonly feeLimitSun: string;
      readonly permit?: { readonly grant: unknown; readonly signature: string };
    },
  ): Promise<RouterSwapCall> {
    const context = this.#context(network, input.recipient);
    const data: Record<string, unknown> = {
      network: sdkNetworkName(network),
      route: input.route,
      // A string, because the materializer takes it through BigInt() and the floor it derives is
      // the only protection the transaction carries.
      slippageBips: String(input.slippageBips),
      transactionValidForSeconds: input.validForSeconds,
      recipient: input.recipient,
      // Ours, always. Left unset the encoder defaults to 500000000 SUN — 500 TRX.
      feeLimit: Number(input.feeLimitSun),
    };
    if (input.permit !== undefined) {
      // The two travel together or not at all: the materializer refuses a signature id with no
      // struct, and a struct with no signature.
      data.signatureActionId = SIGNATURE_ACTION;
      data.permitSingle = input.permit.grant;
    }
    const deferred = createDeferredContractCallAction({
      id: "wallet-cli-router-swap",
      materialization: { kind: MATERIALIZATION, data: data as never },
    });

    let call;
    try {
      call = await materializeUniversalRouterAction(
        context,
        deferred,
        input.permit === undefined
          ? []
          : [{ action: { id: SIGNATURE_ACTION } as never, result: input.permit.signature }],
      );
    } catch (error) {
      throw new ChainError("provider_error", `could not encode the router call: ${message(error)}`);
    }

    return {
      target: call.target,
      functionSelector: call.functionSelector,
      parameters: (call.parameters ?? []).map(plain),
      // Absent rather than zero for a token-for-token swap, which sends no TRX.
      callValue: (call.callValue ?? 0n).toString(),
      feeLimit: String(call.feeLimit ?? ""),
    };
  }

  #permit2(network: NetworkDescriptor): string {
    const address = this.#context(network, ZERO_READER).chain.contracts.permit2;
    if (typeof address !== "string" || address.length === 0) {
      throw new UsageError("unsupported_network", `network ${network.id} has no Permit2 contract`);
    }
    return address;
  }

  #context(network: NetworkDescriptor, from: string): ProtocolsContext {
    return createProtocolsContext({
      network: sdkNetworkName(network) as never,
      runtime: readOnlySdkRuntime(this.gateways, network, from),
      getTransactionTime: () => this.#chainTimeMs(network),
    });
  }

  /**
   * The SUN time service's answer, in milliseconds, read at most once.
   *
   * The SDK would call it again for every plan it builds. Memoising is not an optimisation: it is
   * what makes the deadline the caller expects and the deadline the encoder writes the same number.
   */
  #chainTimeMs(network: NetworkDescriptor): Promise<number> {
    this.#transactionTimeMs ??= this.#readChainTimeMs(network);
    return this.#transactionTimeMs;
  }

  async #readChainTimeMs(network: NetworkDescriptor): Promise<number> {
    // Built without our own `getTransactionTime`, so this one context uses the SDK's default source
    // — the SUN time service. Everything after it reads the cached answer.
    const context = createProtocolsContext({
      network: sdkNetworkName(network) as never,
      runtime: readOnlySdkRuntime(this.gateways, network, ZERO_READER),
    });
    try {
      return await context.getTransactionTime();
    } catch (error) {
      throw new ChainError(
        "provider_error",
        `could not read the chain's transaction time, which a swap's deadline is measured against: ${message(error)}`,
      );
    }
  }
}

/**
 * One encoder parameter in this codebase's own terms.
 *
 * The encoder emits `bigint` for a `uint256` and a string array for `bytes[]`; both are carried as
 * strings, because the gateway re-encodes from `{type, value}` and a bigint would not survive the
 * trip.
 */
function plain(parameter: { type: string; value: unknown }): ContractParameter {
  const { type, value } = parameter;
  if (Array.isArray(value)) return { type, value: value.map((item) => String(item)) };
  return { type, value: typeof value === "bigint" ? value.toString() : String(value) };
}

/**
 * The address a read is executed as when the question is about a contract rather than an account.
 *
 * Reading the chain's configured router needs no owner, and passing a caller's address would imply
 * the answer depends on them.
 */
const ZERO_READER = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
