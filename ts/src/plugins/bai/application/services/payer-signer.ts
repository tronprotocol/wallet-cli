import { CliError, TransportError, UsageError } from "../../../../plugin-api/domain.js";
import type { ChainFamily } from "../../../../plugin-api/domain.js";
import type { NetworkDescriptor } from "../../../../plugin-api/domain.js";
import type { PayerSigner } from "../contracts/x402-payer.js";
import type { PluginSigningService, TransactionScope } from "../../../../plugin-api/application.js";
import { withPayerPolicy, type PayerPolicy } from "./payer-policy.js";

export type PayerSigning = Pick<
  PluginSigningService,
  "assertCanSign" | "prepare" | "signerAddress" | "sign"
>;

export function createPayerSigner(
  signing: PayerSigning,
  scope: TransactionScope,
  network: NetworkDescriptor,
  policy: PayerPolicy,
): PayerSigner {
  const family = policy.family;
  // Resolving the signer checks public metadata without decrypting keys.
  const address = payerPreparation(() => {
    signing.assertCanSign(scope.activeAccount, family);
    return signing.signerAddress(scope.activeAccount, family);
  }, "create_payment");
  return withPayerPolicy(
    {
      address,
      // SDK-built payloads; the entry checks their chain identity against the payment network.
      signTypedData: (typedData) =>
        signing.sign(scope, { network, family, payload: { kind: "typed-data", typedData } }),
      signTransaction: (transaction) =>
        signing.sign(scope, { network, family, payload: { kind: "transaction", transaction } }),
    },
    policy,
  );
}

export function preparePayerSigner(
  signing: Pick<PayerSigning, "prepare">,
  scope: TransactionScope,
  family: ChainFamily,
): void {
  payerPreparation(() => signing.prepare(scope.activeAccount, family), "sign");
}

function payerPreparation<T>(operation: () => T, phase: "sign" | "create_payment"): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof CliError) {
      const ErrorType = error.kind === "usage" ? UsageError : TransportError;
      throw new ErrorType(error.code, error, {
        phase,
        ...error.details,
        paymentStatus: "not_sent",
        retryPayment: false,
      });
    }
    const timeout =
      error instanceof Error && /timeout|aborted/i.test(`${error.name} ${error.message}`);
    throw new TransportError(
      timeout ? "timeout" : "provider_error",
      timeout
        ? "x402 request timed out; no payment was sent"
        : "x402 request or payment failed; no payment was sent",
      { phase, paymentStatus: "not_sent", retryPayment: false },
    );
  }
}
