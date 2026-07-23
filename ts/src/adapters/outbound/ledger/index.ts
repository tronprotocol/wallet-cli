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
import { utils as tronUtils } from "tronweb";
import { assertTronTxIntegrity } from "../chain/tron/tx-integrity.js";
import type { SignedTx, TypedDataPayload, TypedDataSignature, UnsignedTx } from "../../../domain/types/index.js";

/** a Ledger app's reported version + readiness (returned by `appConfig`). */
export interface AppConfig {
  version: string;
  ready: boolean;
}
import { ChainError, CliError, ExecutionError, WalletError } from "../../../domain/errors/index.js";
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
  signTIP712HashedMessage?(path: string, domainSeparatorHex: string, hashStructMessageHex: string): Promise<string>;
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

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** TRON app settings that gate a whole class of signing, each surfaced as its own APDU status.
 *  Without this mapping they arrive as an opaque "UNKNOWN_ERROR (0x6a8c)" and the user has no way
 *  to know the fix is a toggle in the app's own settings menu. */
const APP_SETTING_REQUIRED: Record<number, string> = {
  // E_MISSING_SETTING_SIGN_BY_HASH — gates TIP-712 typed data and any hash-only signing.
  0x6a8c: 'enable "Sign by Hash" in the Ledger TRON app settings (Settings › Sign by Hash › Allowed)',
  // E_MISSING_SETTING_DATA_ALLOWED — gates transactions carrying extra data.
  0x6a8b: 'enable "Transactions data" in the Ledger TRON app settings to sign a transaction with extra data',
  // E_MISSING_SETTING_CUSTOM_CONTRACT — gates contracts the app cannot decode.
  0x6a8d: 'enable "Custom contracts" in the Ledger TRON app settings to sign this contract call',
};

/** Map a thrown device/app error to a typed CliError (user-rejection vs not-ready). */
function classifyDeviceError(e: unknown): CliError {
  if (e instanceof CliError) return e;
  // hw-transport surfaces APDU status as statusCode; 0x6985 = user declined on the device.
  const status = (e as { statusCode?: number }).statusCode;
  if (status === 0x6985) return new ChainError("signing_rejected", "the operation was rejected on the device");
  const setting = status === undefined ? undefined : APP_SETTING_REQUIRED[status];
  if (setting) return new WalletError("ledger_setting_required", setting);
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

  // Open a transport, run `fn` against the Trx app, then always close (cf. the demo's withDevice).
  // Timeout wraps the run so a timed-out call surfaces as ChainError("timeout"); callers'
  // classifyDeviceError passes CliError through, so it isn't remapped to auth_required. Unlike an
  // HTTP RPC, an in-flight HID APDU is not self-canceling: onTimeout MUST close the transport, which
  // rejects the pending APDU (so the run unwinds) and releases the native handle. Without this the
  // handle leaks, pins libuv, and the process hangs after a timeout — breaking the deterministic-exit
  // contract. close() may run twice (here and in the finally); both swallow errors so double-close is
  // harmless.
  //
  // An optional `signal` gives callers the same lever the timeout uses: aborting closes the
  // transport, which rejects the pending APDU and frees the native handle immediately instead of
  // leaving it open until this method's own timeout expires.
  #bound<T>(fn: (trx: TrxApp) => Promise<T>, signal?: AbortSignal): Promise<T> {
    let handle: { transport: unknown; close: () => Promise<void> } | undefined;
    // `cancelled` matters because the abort can land before openTransport() resolves: at that
    // moment there is no handle to close, and a fire-once listener will not run again. Recording
    // it lets the opener close the transport it is about to receive instead of leaking it.
    let cancelled = false;
    const closeTransport = (): void => {
      cancelled = true;
      handle?.close().catch(() => {});
    };
    const run = (async () => {
      const Trx = unwrap<new (transport: unknown) => TrxApp>(await import("@ledgerhq/hw-app-trx"));
      try {
        handle = await openTransport();
      } catch (e) {
        // no device / emulator reachable — the pipeline treats this as "device not ready".
        throw new ExecutionError("auth_required", `cannot reach Ledger device: ${errMessage(e)}`);
      }
      if (cancelled) {
        await handle.close().catch(() => {});
        throw new ChainError("cancelled", "the Ledger operation was cancelled before it reached the device");
      }
      try {
        return await fn(new Trx(handle.transport));
      } finally {
        await handle.close().catch(() => {});
      }
    })();
    if (signal) {
      if (signal.aborted) closeTransport();
      else signal.addEventListener("abort", closeTransport, { once: true });
    }
    return withTimeout(run, this.timeoutMs, closeTransport).finally(() => {
      signal?.removeEventListener("abort", closeTransport);
    });
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

  async signTransaction(family: ChainFamily, path: string, tx: UnsignedTx, signal?: AbortSignal): Promise<SignedTx> {
    this.assertWired(family);
    // The device signs raw_data_hex, so the same integrity rules the software strategy enforces
    // apply here — a Ledger account must not be the weaker signer. See tx-integrity.ts.
    if (family === "tron") assertTronTxIntegrity(tx);
    const rawTxHex = (tx as { raw_data_hex?: string }).raw_data_hex;
    if (!rawTxHex) throw new ChainError("invalid_transaction", "TRON transaction is missing raw_data_hex for Ledger signing");
    // TRON multi-sig collects several signatures on one transaction, so an existing signature[]
    // must be preserved and appended to — matching the software path (tronweb pushes).
    const existing = (tx as { signature?: unknown }).signature;
    const prior = Array.isArray(existing) ? existing : [];
    try {
      return await this.#bound(async (trx) => {
        const signature = await trx.signTransaction(ledgerPath(path), rawTxHex, []);
        return { ...(tx as object), signature: prior.includes(signature) ? prior : [...prior, signature] };
      }, signal);
    } catch (e) {
      throw classifyDeviceError(e);
    }
  }

  async signMessage(family: ChainFamily, path: string, message: string, signal?: AbortSignal): Promise<string> {
    this.assertWired(family);
    const messageHex = Buffer.from(message, "utf8").toString("hex");
    try {
      return await this.#bound(async (trx) => `0x${await trx.signPersonalMessage(ledgerPath(path), messageHex)}`, signal);
    } catch (e) {
      throw classifyDeviceError(e);
    }
  }

  /**
   * TIP-712 structured-data signing. The TRON app exposes only the *hashed* variant, so the two
   * EIP-712 hashes are computed here — in the adapter, where the SDK dependency already lives —
   * and the device can display only those hashes, not the message. The port deliberately takes the
   * whole payload rather than pre-computed hashes: the Ethereum app also offers a full
   * clear-signing APDU, and a hash-shaped port would lock a future EVM adapter out of it.
   */
  async signTypedData(family: ChainFamily, path: string, payload: TypedDataPayload, signal?: AbortSignal): Promise<TypedDataSignature> {
    this.assertWired(family);
    const { domain, types, message } = payload;
    let digest: string;
    let primaryType: string;
    let domainHash: string;
    let messageHash: string;
    try {
      const encoder = tronUtils.typedData.TypedDataEncoder;
      primaryType = payload.primaryType ?? encoder.from(types as never).primaryType;
      digest = encoder.hash(domain as never, types as never, message);
      domainHash = encoder.hashDomain(domain as never).replace(/^0x/, "");
      messageHash = encoder.hashStruct(primaryType, types as never, message).replace(/^0x/, "");
    } catch (e) {
      throw new ChainError("invalid_transaction", `typed data could not be hashed: ${errMessage(e)}`);
    }
    try {
      return await this.#bound(async (trx) => {
        if (typeof trx.signTIP712HashedMessage !== "function") {
          throw new WalletError("ledger_unsupported", "this Ledger TRON app version cannot sign TIP-712 typed data; update the app");
        }
        const signature = await trx.signTIP712HashedMessage(ledgerPath(path), domainHash, messageHash);
        return { signature: `0x${signature}`, digest, primaryType };
      }, signal);
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
