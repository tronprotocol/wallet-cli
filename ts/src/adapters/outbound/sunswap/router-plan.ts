// Plan authorization separately so the grant uses the exact amount and requested TTL.
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
import { ChainError, UsageError } from "../../../domain/errors/index.js";
import { readOnlySdkRuntime, sdkNetworkName } from "./sdk-runtime.js";

const MATERIALIZATION = "universal-router-swap";
const SIGNATURE_ACTION = "wallet-cli-permit2-signature";

export class SunSwapRouterPlanner implements RouterExecutionPort, Permit2Port {
  // Share one clock request so planning and validation use the same deadline.
  #transactionTimeMs?: Promise<number>;

  constructor(private readonly gateways: ChainGatewayProvider) {}

  async transactionTime(network: NetworkDescriptor): Promise<number> {
    // Match the encoder: ceil(milliseconds / 1000).
    return Math.ceil((await this.#chainTimeMs(network)) / 1000);
  }

  routerAddress(network: NetworkDescriptor): string {
    // Read the router from the same config the encoder uses.
    const address = this.#context(network, ZERO_READER).chain.contracts.universalRouter;
    if (typeof address !== "string" || address.length === 0) {
      throw new UsageError(
        "unsupported_network",
        `network ${network.id} has no SunSwap Universal Router`,
      );
    }
    return address;
  }

  // Returns undefined when the standing grant already covers the amount.
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
        approveAmountType: "exact",
        ttlSeconds: input.ttlSeconds,
        // Capabilities guide planning; the runtime itself refuses signing.
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

    if (plan.mode === "already-approved") return undefined;
    const signature = plan.actions.find((action) => action.type === "typed-data-signature");
    if (plan.mode !== "typed-data" || signature === undefined || plan.permitSingle === undefined) {
      // Other modes leave no typed-data grant to validate before signing.
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
      // The materializer parses slippageBips with BigInt.
      slippageBips: String(input.slippageBips),
      transactionValidForSeconds: input.validForSeconds,
      recipient: input.recipient,
      // Omitting this uses the encoder default of 500 TRX.
      feeLimit: Number(input.feeLimitSun),
    };
    if (input.permit !== undefined) {
      // The materializer requires both the permit struct and its signature.
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

  #chainTimeMs(network: NetworkDescriptor): Promise<number> {
    this.#transactionTimeMs ??= this.#readChainTimeMs(network);
    return this.#transactionTimeMs;
  }

  async #readChainTimeMs(network: NetworkDescriptor): Promise<number> {
    // Use the SDK default time source for the initial clock read.
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

// Use strings across the gateway boundary; bigint cannot cross JSON.
function plain(parameter: { type: string; value: unknown }): ContractParameter {
  const { type, value } = parameter;
  if (Array.isArray(value)) return { type, value: value.map((item) => String(item)) };
  return { type, value: typeof value === "bigint" ? value.toString() : String(value) };
}

const ZERO_READER = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
