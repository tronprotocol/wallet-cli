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
import type { AppConfig, ChainFamily, SignedTx, Signer, SignerSignOpts, UnsignedTx } from "../../core/types/index.js";
import { ExecutionError, UsageError, WalletError } from "../../core/errors/index.js";
import { COIN_TYPE, Derivation } from "../../core/derivation/index.js";

export interface GetAddressOpts {
  /** false = silent derive (import scan / precheck); true = show on-device for user confirmation. */
  display?: boolean;
  onWait?: () => void;
}

export class Ledger {
  async getAddress(_family: ChainFamily, _path: string, opts?: GetAddressOpts): Promise<string> {
    opts?.onWait?.();
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

/** --index | --path | --address (mutual exclusion enforced by the import contract). */
export interface LedgerLocator {
  index?: number;
  path?: string;
  address?: string;
  scanLimit?: number;
}

const DEFAULT_SCAN_LIMIT = 20;
const PATH_RE = /^m\/44'\/(\d+)'\//;

/**
 * Resolve the BIP32 path to register for a ledger import (plan §7.14.1):
 *   --index  → derive the account path (no device touch)
 *   --path   → use as-is after asserting its coin_type matches the app
 *   --address→ bounded linear scan 0..scan-limit, silent getAddress per index, compare
 */
export async function resolveLedgerPath(ledger: Ledger, family: ChainFamily, loc: LedgerLocator): Promise<string> {
  if (loc.index !== undefined) return Derivation.path(family, loc.index);
  if (loc.path !== undefined) {
    const m = PATH_RE.exec(loc.path);
    const coin = m ? Number(m[1]) : NaN;
    if (coin !== COIN_TYPE[family]) {
      throw new UsageError(
        "invalid_option",
        `--path coin_type ${m ? coin : "?"} does not match --app ${family} (expected ${COIN_TYPE[family]})`,
      );
    }
    return loc.path;
  }
  if (loc.address !== undefined) {
    const limit = loc.scanLimit ?? DEFAULT_SCAN_LIMIT;
    for (let i = 0; i < limit; i++) {
      const path = Derivation.path(family, i);
      if ((await ledger.getAddress(family, path, { display: false })) === loc.address) return path;
    }
    throw new WalletError(
      "ledger_address_not_found",
      `address not found in the first ${limit} accounts; widen with --scan-limit <n>, ` +
        `or specify it directly with --index <i> / --path <m/44'/...>`,
    );
  }
  // contract guarantees exactly one of the three; default to account 0 as belt-and-braces.
  return Derivation.path(family, 0);
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
  async signMessage(message: string, _opts: SignerSignOpts): Promise<string> {
    return this.ledger.signMessage(this.family, this.path, message);
  }
}
