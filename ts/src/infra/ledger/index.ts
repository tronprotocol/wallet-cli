/**
 * Ledger (L1) — device transport + per-chain app + LedgerSigner (plan §3 L1 / §7.14).
 *
 * Transport is env-switchable so the same code path drives a real device or the Speculos
 * emulator (their only difference is the @ledgerhq transport; the hw-app-trx layer above is
 * identical). When SPECULOS_PORT is set we open the Speculos HTTP transport; otherwise we open
 * the USB/HID transport. Both @ledgerhq deps are imported lazily so the Speculos path works
 * without node-hid's native build present, and so unit tests that mock these methods never load
 * a native module.
 *
 * Only the TRON app is wired (hw-app-trx); EVM Ledger support is not implemented yet.
 *
 * This module never prints; callers print waiting prompts via StreamManager (修正⑧).
 */
import type { AppConfig, ChainFamily, SignedTx, Signer, SignerSignOpts, UnsignedTx } from "../../core/types/index.js";
import { ChainError, CliError, ExecutionError, UsageError, WalletError } from "../../core/errors/index.js";
import { Derivation } from "../../core/derivation/index.js";
import { FAMILIES } from "../../core/family/index.js";
import type { Prompter, Choice } from "../prompt/index.js";

export interface GetAddressOpts {
  /** false = silent derive (import scan / precheck); true = show on-device for user confirmation. */
  display?: boolean;
  onWait?: () => void;
}

/** Minimal shape of @ledgerhq/hw-app-trx's Trx we depend on (avoids a type-only dep at the seam). */
interface TrxApp {
  getAddress(path: string, display?: boolean): Promise<{ publicKey: string; address: string }>;
  getAppConfiguration(): Promise<{ version: string }>;
  signTransaction(path: string, rawTxHex: string, tokenSignatures: string[]): Promise<string>;
  signPersonalMessage(path: string, messageHex: string): Promise<string>;
}

/** hw-app-trx wants a BIP32 path WITHOUT the leading "m/" (e.g. 44'/195'/0'/0/0). */
function ledgerPath(path: string): string {
  return path.replace(/^m\//, "");
}

/** CJS-with-default interop under ESM/tsx: unwrap `.default` ourselves (cf. the demo's ledger.ts). */
function unwrap<T>(mod: unknown): T {
  return ((mod as { default?: T }).default ?? mod) as T;
}

/** Open the device transport: Speculos HTTP when SPECULOS_PORT is set, else USB/HID. */
async function openTransport(): Promise<{ transport: unknown; close: () => Promise<void> }> {
  const port = process.env.SPECULOS_PORT;
  if (port) {
    const Speculos = unwrap<any>(await import("@ledgerhq/hw-transport-node-speculos-http"));
    const transport = await Speculos.open({
      baseURL: process.env.SPECULOS_HOST ?? "http://127.0.0.1",
      apiPort: port,
    });
    return { transport, close: () => transport.close() };
  }
  const Hid = unwrap<any>(await import("@ledgerhq/hw-transport-node-hid"));
  const transport = await Hid.open("");
  return { transport, close: () => transport.close() };
}

/** Open a transport, run `fn` against the Trx app, then always close (cf. the demo's withDevice). */
async function withTrx<T>(fn: (trx: TrxApp) => Promise<T>): Promise<T> {
  const Trx = unwrap<new (transport: unknown) => TrxApp>(await import("@ledgerhq/hw-app-trx"));
  let handle: { transport: unknown; close: () => Promise<void> };
  try {
    handle = await openTransport();
  } catch (e) {
    // no device / emulator reachable — the pipeline treats this as "device not ready".
    throw new ExecutionError("auth_required", `cannot reach Ledger device: ${errMessage(e)}`);
  }
  try {
    return await fn(new Trx(handle.transport));
  } finally {
    await handle.close().catch(() => {});
  }
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Map a thrown device/app error to a typed CliError (user-rejection vs not-ready). */
function classifyDeviceError(e: unknown): CliError {
  if (e instanceof CliError) return e;
  // hw-transport surfaces APDU status as statusCode; 0x6985 = user declined on the device.
  const status = (e as { statusCode?: number }).statusCode;
  if (status === 0x6985) return new ChainError("signing_rejected", "the operation was rejected on the device");
  return new ExecutionError("auth_required", `Ledger device error: ${errMessage(e)}`);
}

export class Ledger {
  private assertTron(family: ChainFamily): void {
    if (family !== "tron") {
      throw new ExecutionError("auth_required", `Ledger ${family} app is not wired yet (only tron is supported)`);
    }
  }

  async getAddress(family: ChainFamily, path: string, opts?: GetAddressOpts): Promise<string> {
    opts?.onWait?.();
    this.assertTron(family);
    try {
      return await withTrx(async (trx) => (await trx.getAddress(ledgerPath(path), opts?.display ?? false)).address);
    } catch (e) {
      throw classifyDeviceError(e);
    }
  }

  async signTransaction(family: ChainFamily, path: string, tx: UnsignedTx, _signal?: AbortSignal): Promise<SignedTx> {
    this.assertTron(family);
    const rawTxHex = (tx as { raw_data_hex?: string }).raw_data_hex;
    if (!rawTxHex) throw new ChainError("invalid_transaction", "TRON transaction is missing raw_data_hex for Ledger signing");
    try {
      return await withTrx(async (trx) => {
        const signature = await trx.signTransaction(ledgerPath(path), rawTxHex, []);
        return { ...(tx as object), signature: [signature] };
      });
    } catch (e) {
      throw classifyDeviceError(e);
    }
  }

  async signMessage(family: ChainFamily, path: string, message: string): Promise<string> {
    this.assertTron(family);
    const messageHex = Buffer.from(message, "utf8").toString("hex");
    try {
      return await withTrx(async (trx) => `0x${await trx.signPersonalMessage(ledgerPath(path), messageHex)}`);
    } catch (e) {
      throw classifyDeviceError(e);
    }
  }

  async appConfig(family: ChainFamily): Promise<AppConfig> {
    this.assertTron(family);
    try {
      return await withTrx(async (trx) => ({ version: (await trx.getAppConfiguration()).version, ready: true }));
    } catch (e) {
      throw classifyDeviceError(e);
    }
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
    if (coin !== FAMILIES[family].coinType) {
      throw new UsageError(
        "invalid_option",
        `--path coin_type ${m ? coin : "?"} does not match --app ${family} (expected ${FAMILIES[family].coinType})`,
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

/** Interactive ledger account picker: derive in pages of `pageSize`, arrow-select a path. */
export async function interactiveLedgerSelect(
  ledger: Ledger,
  family: ChainFamily,
  prompter: Prompter,
  pageSize = 5,
): Promise<string> {
  const choices: Choice<string>[] = [];
  let next = 0;
  const loadPage = async (): Promise<Choice<string>[]> => {
    const end = next + pageSize;
    for (; next < end; next++) {
      const path = Derivation.path(family, next);
      const address = await ledger.getAddress(family, path, { display: false });
      choices.push({ value: path, label: `[${next}] ${address}` });
    }
    return choices;
  };
  await loadPage();
  return prompter.select({ label: `Select ${family} account`, choices: [...choices], loadMore: loadPage });
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
