import { CliError, TransportError, UsageError } from "../../../domain/errors/index.js";
import type { ChainFamily } from "../../../domain/family/chain-family.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { PayerSigner } from "../../contracts/x402-payer.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { SignerResolver } from "../signer/index.js";
import type { SigningService } from "../signing/signing-service.js";
import { withPayerPolicy, type PayerPolicy } from "./payer-policy.js";

export function createPayerSigner(
  signers: SignerResolver,
  signing: Pick<SigningService, "sign">,
  scope: TransactionScope,
  network: NetworkDescriptor,
  policy: PayerPolicy,
): PayerSigner {
  const family = policy.family;
  // Resolving the signer checks public metadata without decrypting keys.
  const signer = payerPreparation(() => {
    signers.assertCanSign(scope.activeAccount, family);
    return signers.resolve(scope.activeAccount, family);
  }, "create_payment");
  return withPayerPolicy(
    {
      address: signer.address,
      // SDK-built payloads; the entry checks their chain identity against the payment network.
      signTypedData: (typedData) =>
        signing.sign(scope, {
          network,
          origin: "service",
          signer,
          payload: { kind: "typed-data", typedData },
        }),
      signTransaction: (transaction) =>
        signing.sign(scope, {
          network,
          origin: "service",
          signer,
          payload: { kind: "transaction", transaction },
        }),
    },
    policy,
  );
}

export function preparePayerSigner(
  signers: SignerResolver,
  scope: TransactionScope,
  family: ChainFamily,
): void {
  payerPreparation(() => signers.prepare(scope.activeAccount, family), "sign");
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
