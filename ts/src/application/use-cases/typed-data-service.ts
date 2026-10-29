import type { AccountRef, NetworkDescriptor, TypedDataPayload } from "../../domain/types/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import type { SignerResolver } from "../services/signer/index.js";
import type { SigningService } from "../services/signing/signing-service.js";

export class TypedDataService {
  constructor(
    private readonly signers: SignerResolver,
    private readonly signing: SigningService,
  ) {}

  async sign(
    scope: TransactionScope,
    network: NetworkDescriptor,
    account: AccountRef,
    payload: TypedDataPayload,
  ) {
    this.signers.assertCanSign(account, network.family);
    const signer = this.signers.resolve(account, network.family);
    const result = await this.signing.sign(scope, {
      network,
      origin: "imported",
      signer,
      payload: { kind: "typed-data", typedData: payload },
    });
    return { address: signer.address, ...result };
  }
}
