/**
 * Ledger — device transport plus per-chain app.
 *
 * Transport is env-switchable so the same code path drives a real device or the Speculos
 * emulator (their only difference is the @ledgerhq transport; the hw-app-trx layer above is
 * identical). When SPECULOS_PORT is set we open the Speculos HTTP transport; otherwise we open
 * the USB/HID transport. Both @ledgerhq deps are imported lazily so the Speculos path works
 * without node-hid's native build present, and so unit tests that mock these methods never load
 * a native module.
 *
 * Only the TRON app is wired (hw-app-trx).
 *
 * This module never prints; callers print waiting prompts via StreamManager.
 */
import type { SignedTx, UnsignedTx } from "../../../domain/types/index.js";

/** a Ledger app's reported version + readiness (returned by `appConfig`). */
export interface AppConfig {
  version: string;
  ready: boolean;
}
import { ChainError, CliError, ExecutionError } from "../../../domain/errors/index.js";
import { ChainFamily, FAMILIES } from "../../../domain/family/index.js";
import { withTimeout } from "../../../domain/async/index.js";

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
  // effective per-invocation timeout (--timeout, else config default); bounds every device call so an
  // unresponsive device or an un-tapped on-device prompt can't hang the CLI. Mirrors TronChain for RPC.
  constructor(private readonly timeoutMs = 60_000) {}

  private assertWired(family: ChainFamily): void {
    if (!FAMILIES[family].ledger) {
      throw new ExecutionError("auth_required", `Ledger ${family} app is not wired yet (only tron is supported)`);
    }
  }

  // Timeout wraps the transport run so a timed-out call surfaces as ChainError("timeout"); callers'
  // classifyDeviceError passes CliError through, so it isn't remapped to auth_required. onTimeout is a
  // no-op (as in TronChain): the HID call isn't truly cancelable, but the CLI unblocks.
  #bound<T>(fn: (trx: TrxApp) => Promise<T>): Promise<T> {
    return withTimeout(withTrx(fn), this.timeoutMs, () => {});
  }

  async getAddress(family: ChainFamily, path: string, opts?: GetAddressOpts): Promise<string> {
    opts?.onWait?.();
    this.assertWired(family);
    try {
      return await this.#bound(async (trx) => (await trx.getAddress(ledgerPath(path), opts?.display ?? false)).address);
    } catch (e) {
      throw classifyDeviceError(e);
    }
  }

  async signTransaction(family: ChainFamily, path: string, tx: UnsignedTx, _signal?: AbortSignal): Promise<SignedTx> {
    this.assertWired(family);
    const rawTxHex = (tx as { raw_data_hex?: string }).raw_data_hex;
    if (!rawTxHex) throw new ChainError("invalid_transaction", "TRON transaction is missing raw_data_hex for Ledger signing");
    try {
      return await this.#bound(async (trx) => {
        const signature = await trx.signTransaction(ledgerPath(path), rawTxHex, []);
        return { ...(tx as object), signature: [signature] };
      });
    } catch (e) {
      throw classifyDeviceError(e);
    }
  }

  async signMessage(family: ChainFamily, path: string, message: string): Promise<string> {
    this.assertWired(family);
    const messageHex = Buffer.from(message, "utf8").toString("hex");
    try {
      return await this.#bound(async (trx) => `0x${await trx.signPersonalMessage(ledgerPath(path), messageHex)}`);
    } catch (e) {
      throw classifyDeviceError(e);
    }
  }

  async appConfig(family: ChainFamily): Promise<AppConfig> {
    this.assertWired(family);
    try {
      return await this.#bound(async (trx) => ({ version: (await trx.getAppConfiguration()).version, ready: true }));
    } catch (e) {
      throw classifyDeviceError(e);
    }
  }
}
