/**
 * createPayerSigner — the active account, as an x402 payer.
 *
 * `assertCanSign` runs FIRST so a watch-only account fails before any keystore decrypt or network
 * call, the same ordering every write command uses. The keystore itself is still untouched at this
 * point: `SoftwareSigner` decrypts lazily on its first signature, so a dry-run path that builds a
 * payer and never signs never prompts for the master password.
 */
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
