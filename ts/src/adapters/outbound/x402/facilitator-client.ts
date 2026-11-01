import type { DispatchCheck } from "../../../application/contracts/deadline.js";
import { facilitatorUrl } from "./facilitator-url.js";
import { facilitatorNetwork } from "./facilitator-network.js";
import { sameAddress } from "../../../domain/family/index.js";
import { tokensForScheme } from "./tokens.js";
import { providerPaymentError, sdkPaymentError } from "./payment-error.js";
import { successfulSettlement } from "./settlement.js";
import { fetchBounded } from "../http/http-response.js";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@bankofai/x402-core/http";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { X402Scheme } from "../../../domain/x402/families.js";
import type {
  X402FacilitatorOffer,
  X402FacilitatorPort,
  X402FacilitatorRefusal,
  X402OfferedRequirement,
  X402PaywallTerms,
  X402RegisteredAsset,
} from "../../../application/ports/x402-facilitator.js";
import { TransportError } from "../../../domain/errors/index.js";
import { silenceX402SdkLogs } from "./sdk-logs.js";

type Phase = "verify" | "settle";

export class X402FacilitatorClient implements X402FacilitatorPort {
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch) {
    silenceX402SdkLogs();
  }

  assetBySymbol(
    network: NetworkDescriptor,
    scheme: X402Scheme,
    symbol: string,
  ): X402RegisteredAsset | undefined {
    const key = symbol.toUpperCase();
    const token = tokensForScheme(network.id, scheme)[key];
    return token && { symbol: key, address: token.address, decimals: token.decimals };
  }

  assetByAddress(
    network: NetworkDescriptor,
    scheme: X402Scheme,
    address: string,
  ): X402RegisteredAsset | undefined {
    const entry = Object.entries(tokensForScheme(network.id, scheme)).find(([, token]) =>
      sameAddress(network.family, token.address, address),
    );
    return entry && { symbol: entry[0], address: entry[1].address, decimals: entry[1].decimals };
  }

  async offer(terms: X402PaywallTerms, check: DispatchCheck): Promise<X402FacilitatorOffer> {
    const network = await facilitatorNetwork(
      terms.network,
      terms.scheme,
      terms.facilitatorUrl,
      this.fetcher,
      check,
    );
    const requirement: X402OfferedRequirement = {
      scheme: terms.scheme,
      network,
      amount: terms.rawAmount,
      asset: terms.asset,
      payTo: terms.payTo,
      maxTimeoutSeconds: terms.validForSeconds,
      extra: this.#extra(terms),
    };
    const call = (path: string, paymentSignature: string, requestCheck: DispatchCheck) =>
      this.#facilitator(
        terms.facilitatorUrl,
        path,
        {
          paymentPayload: decodePaymentSignatureHeader(paymentSignature),
          paymentRequirements: requirement,
        },
        requestCheck,
      );
    return {
      requirement,
      encodeChallenge: (challenge) => encodePaymentRequiredHeader(challenge as never),
      verify: async (paymentSignature, requestCheck) => {
        try {
          const verify = await call("/verify", paymentSignature, requestCheck);
          if (verify.valid === true || verify.isValid === true) return { accepted: true };
          return refusal(true, verify.invalidReason ?? verify.errorReason, "verify");
        } catch (error) {
          return failure(error, "verify");
        }
      },
      settle: async (paymentSignature, requestCheck) => {
        try {
          const settle = await call("/settle", paymentSignature, requestCheck);
          if (!successfulSettlement(settle, network))
            return refusal(true, settle.errorReason, "settle", settle);
          return {
            accepted: true,
            transaction: settle.transaction as string,
            receiptHeader: encodePaymentResponseHeader(settle as never),
          };
        } catch (error) {
          return failure(error, "settle");
        }
      },
    };
  }

  // The transfer method the payer uses: Permit2 unless the registered token names an EIP-712 domain.
  #extra(terms: X402PaywallTerms): X402OfferedRequirement["extra"] {
    if (terms.scheme === "exact_gasfree") return {};
    const registered = Object.values(tokensForScheme(terms.network.id, terms.scheme)).find(
      (token) => sameAddress(terms.network.family, token.address, terms.asset),
    );
    if (!registered || registered.permit2) return { assetTransferMethod: "permit2" };
    return { name: registered.name, version: registered.version };
  }

  async #facilitator(
    base: string,
    path: string,
    body: unknown,
    check: DispatchCheck,
  ): Promise<Record<string, unknown>> {
    const response = await fetchBounded(
      this.fetcher,
      facilitatorUrl(base, path),
      {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
      },
      check,
      1024 * 1024,
    );
    if (!response.ok)
      throw new TransportError(
        response.status === 429 ? "provider_rate_limited" : "provider_error",
        `facilitator returned HTTP ${response.status}`,
        {
          httpStatus: response.status,
        },
      );
    return (await response.json()) as Record<string, unknown>;
  }
}

function refusal(
  rejected: boolean,
  reason: unknown,
  phase: Phase,
  evidence?: Record<string, unknown>,
): X402FacilitatorRefusal {
  return { accepted: false, rejected, error: providerPaymentError(reason, phase, evidence) };
}

function failure(error: unknown, phase: Phase): X402FacilitatorRefusal {
  const classified = sdkPaymentError(error, phase);
  const details = classified.details as Record<string, unknown> | undefined;
  return refusal(false, details?.reason ?? classified.code, phase, details);
}
