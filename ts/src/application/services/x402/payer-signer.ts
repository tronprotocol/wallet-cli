// Reject watch-only accounts before payment work; resolving the signer does not decrypt keys.
import type { ChainFamily } from "../../../domain/family/chain-family.js";
import type { PayerSigner } from "../../contracts/x402-payer.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { SignerResolver } from "../signer/index.js";
import { obtainSignature } from "../signing/obtain-signature.js";

export function createPayerSigner(
  signers: SignerResolver,
  scope: TransactionScope,
  family: ChainFamily,
): PayerSigner {
  signers.assertCanSign(scope.activeAccount, family);
  const signer = signers.resolve(scope.activeAccount, family);
  return {
    address: signer.address,
    signTypedData: (payload) =>
      obtainSignature(signer, scope, (opts) => signer.signTypedData(payload, opts)),
    signTransaction: (tx) => obtainSignature(signer, scope, (opts) => signer.sign(tx, opts)),
  };
}
