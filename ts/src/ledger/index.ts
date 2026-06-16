/**
 * Ledger (L1) — HID transport + per-chain app + LedgerSigner (plan §3 L1 / §7.14).
 *
 * The real @ledgerhq/* HID transport pulls native node-hid builds; it is intentionally
 * NOT wired in this milestone (Ledger is the last step, plan §7.15.11). The architectural
 * slot is complete: the `Signer`/`LedgerSigner` contract exists and SignerResolver routes
 * to it; only the device transport throws until the HID deps are added.
 *
 * This module never prints; callers print waiting prompts via StreamManager (修正⑧).
 */
import type { AppConfig, ChainFamily, SignedTx, Signer, SignerSignOpts, UnsignedTx } from "../types/index.js";
import { ExecutionError } from "../errors/index.js";

export class Ledger {
  async getAddress(_family: ChainFamily, _path: string, hooks?: { onWait?: () => void }): Promise<string> {
    hooks?.onWait?.();
    throw new ExecutionError("auth_required", "Ledger HID transport not available in this build");
  }
  async signTransaction(_family: ChainFamily, _path: string, _tx: UnsignedTx, _signal?: AbortSignal): Promise<SignedTx> {
    throw new ExecutionError("auth_required", "Ledger HID transport not available in this build");
  }
  async signMessage(_family: ChainFamily, _path: string, _message: string): Promise<string> {
    throw new ExecutionError("auth_required", "Ledger HID transport not available in this build");
  }
  async appConfig(_family: ChainFamily): Promise<AppConfig> {
    throw new ExecutionError("auth_required", "Ledger HID transport not available in this build");
  }
}

export class LedgerSigner implements Signer {
  readonly kind = "device" as const;
  constructor(
    private readonly ledger: Ledger,
    private readonly family: ChainFamily,
    private readonly path: string,
    public readonly address: string,
  ) {}

  async precheck(): Promise<void> {
    const cfg = await this.ledger.appConfig(this.family); // throws auth_required if not ready
    if (!cfg.ready) throw new ExecutionError("auth_required", "open the correct app on the Ledger");
  }
  async sign(tx: UnsignedTx, opts: SignerSignOpts): Promise<SignedTx> {
    return this.ledger.signTransaction(this.family, this.path, tx, opts.signal);
  }
  async signMessage(message: string, _opts: SignerSignOpts): Promise<string> {
    return this.ledger.signMessage(this.family, this.path, message);
  }
}
