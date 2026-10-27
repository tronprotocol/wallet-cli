import type { AccountRef, ChainFamily, TypedDataPayload } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { SignerResolver } from "../services/signer/index.js";
import { obtainSignature } from "../services/signing/obtain-signature.js";

export class TypedDataService {
  constructor(private readonly signers: SignerResolver) {}

  async sign(
    scope: TransactionScope,
    family: ChainFamily,
    account: AccountRef,
    payload: TypedDataPayload,
  ) {
    this.signers.assertCanSign(account, family);
    const signer = this.signers.resolve(account, family);
    const result = await obtainSignature(signer, scope, (opts) =>
      signer.signTypedData(payload, opts),
    );
    return { address: signer.address, ...result };
  }
}
