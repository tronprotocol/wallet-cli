/**
 * LedgerSigner — device-backed signing through the LedgerDevice port.
 * Lives next to SoftwareSigner so all Signer implementations share one home; the device protocol
 * detail stays inside the injected `Ledger` (path/hex encoding, @ledgerhq, hw-app-trx).
 */
import type { ChainFamily } from "../../../domain/family/index.js";
import type { SignedTx, Signer, SignerSignOpts, TypedDataPayload, TypedDataSignature, UnsignedTx } from "../../../domain/types/index.js";
import { ExecutionError, WalletError } from "../../../domain/errors/index.js";
import type { LedgerDevice } from "../../ports/ledger-device.js";

export class LedgerSigner implements Signer {
  readonly kind = "device" as const;
  constructor(
    private readonly ledger: LedgerDevice,
    private readonly family: ChainFamily,
    private readonly path: string,
    public readonly address: string,
  ) {}

  async precheck(): Promise<void> {
    const cfg = await this.ledger.appConfig(this.family); // throws auth_required if not ready
    if (!cfg.ready) throw new ExecutionError("auth_required", "open the correct app on the Ledger");
    // the device's current seed/passphrase must still derive this account's cached address.
    const onDevice = await this.ledger.getAddress(this.family, this.path, { display: false });
    if (onDevice !== this.address) {
      throw new WalletError(
        "wrong_device_seed",
        "the connected device derives a different address for this account (wrong seed or passphrase)",
      );
    }
  }
  async sign(tx: UnsignedTx, opts: SignerSignOpts): Promise<SignedTx> {
    return this.ledger.signTransaction(this.family, this.path, tx, opts.signal);
  }
  async signMessage(message: string, opts: SignerSignOpts): Promise<string> {
    return this.ledger.signMessage(this.family, this.path, message, opts.signal);
  }
  async signTypedData(payload: TypedDataPayload, opts: SignerSignOpts): Promise<TypedDataSignature> {
    return this.ledger.signTypedData(this.family, this.path, payload, opts.signal);
  }
}
