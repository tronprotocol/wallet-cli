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
import { Transaction, TypedDataEncoder, type TransactionLike } from "ethers";
import { assertTronTxIntegrity } from "../chain/tron/tx-integrity.js";
import type {
  SignedTx,
  TypedDataPayload,
  TypedDataSignature,
  UnsignedTx,
} from "../../../domain/types/index.js";

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
  signTIP712HashedMessage?(
    path: string,
    domainSeparatorHex: string,
    hashStructMessageHex: string,
  ): Promise<string>;
}

/** Minimal shape of @ledgerhq/hw-app-eth's Eth we depend on. Unlike the TRON app it returns
 *  {v, r, s} components rather than a hex string, so the adapter assembles r||s||v itself. */
interface EthApp {
  getAddress(path: string, display?: boolean): Promise<{ publicKey: string; address: string }>;
  getAppConfiguration(): Promise<{ version: string }>;
  signTransaction(
    path: string,
    rawTxHex: string,
    resolution: null,
  ): Promise<{ v: string; r: string; s: string }>;
  signPersonalMessage(
    path: string,
    messageHex: string,
  ): Promise<{ v: number; r: string; s: string }>;
  signEIP712HashedMessage?(
    path: string,
    domainSeparatorHex: string,
    hashStructMessageHex: string,
  ): Promise<{ v: number; r: string; s: string }>;
}

type LedgerApp = TrxApp | EthApp;

/**
 * Which @ledgerhq app module backs each family. Adding a family = one entry (plus its shape).
 *
 * Thunks with LITERAL specifiers, not `import(variable)`: a dynamic specifier cannot be
 * statically resolved, so the module load moves into the timed region (and `vi.mock`, which keys
 * off the specifier, may not apply at all). Both cost real behaviour — a slow first import ate
 * into the device timeout.
 */
const APP_LOADER: Record<ChainFamily, () => Promise<unknown>> = {
  tron: () => import("@ledgerhq/hw-app-trx"),
  evm: () => import("@ledgerhq/hw-app-eth"),
};

/**
 * {v, r, s} from the ethereum app -> Ethereum's 65-byte `r || s || v` hex.
 *
 * `v` is reduced to its PARITY BIT, because the app reports it differently per transaction type:
 * a typed transaction gives a bare parity (0/1), but a legacy one gives it already EIP-155
 * encoded — `chainId * 2 + 35 + parity`, which needs three bytes on Sepolia and cannot fit the
 * one byte a 65-byte signature has. Passing that through produced an over-long signature that
 * ethers rejected outright. Parity is the only part that is not recoverable from the
 * transaction itself, so ethers re-derives the rest from the chain id it already holds.
 */
function joinVrs(sig: { v: number | string; r: string; s: string }): string {
  const raw = typeof sig.v === "number" ? BigInt(sig.v) : BigInt(`0x${sig.v.replace(/^0x/, "")}`);
  // 0/1 and 27/28 are already bare; anything larger is EIP-155 encoded (odd chainId*2+35+parity).
  const parity = raw < 27n ? raw & 1n : raw >= 35n ? (raw - 35n) & 1n : (raw - 27n) & 1n;
  const v = (27n + parity).toString(16);
  return `0x${sig.r.replace(/^0x/, "")}${sig.s.replace(/^0x/, "")}${v.padStart(2, "0")}`;
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
  const Hid = unwrap<any>(await import("@ledgerhq/hw-transport-node-hid-noevents"));
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
  0x6a8c:
    'enable "Sign by Hash" in the Ledger TRON app settings (Settings › Sign by Hash › Allowed)',
  // E_MISSING_SETTING_DATA_ALLOWED — gates transactions carrying extra data.
  0x6a8b:
    'enable "Transactions data" in the Ledger TRON app settings to sign a transaction with extra data',
  // E_MISSING_SETTING_CUSTOM_CONTRACT — gates contracts the app cannot decode.
  0x6a8d: 'enable "Custom contracts" in the Ledger TRON app settings to sign this contract call',
};

/** 0x5515 (LOCKED_DEVICE) — the device is connected but its PIN has not been entered. hw-transport
 *  also raises a named `LockedDeviceError` on paths that never reach an APDU status word. */
function isLockedDevice(e: unknown): boolean {
  return (
    (e as { statusCode?: number }).statusCode === 0x5515 ||
    (e as { name?: string }).name === "LockedDeviceError"
  );
}

/** Map a thrown device/app error to a typed CliError (user-rejection vs not-ready). */
function classifyDeviceError(e: unknown): CliError {
  if (e instanceof CliError) return e;
  // hw-transport surfaces APDU status as statusCode; 0x6985 = user declined on the device.
  const status = (e as { statusCode?: number }).statusCode;
  if (status === 0x6985)
    return new ChainError("signing_rejected", "the operation was rejected on the device");
  // Its own code, not the generic device bucket: "connected but locked" has exactly one fix, and
  // `auth_required` would send the reader looking for a password this CLI never asked for.
  if (isLockedDevice(e))
    return new WalletError(
      "device_locked",
      "the Ledger device is locked — unlock it with your PIN and run the command again",
    );
  // 0x6d00 (INS_NOT_SUPPORTED) is a standard status word every Ledger app shares — the app version
  // does not implement this instruction, or the wrong app is open. Kept chain- and operation-agnostic
  // on purpose: classifyDeviceError fires for any family and any call.
  if (status === 0x6d00) {
    return new WalletError(
      "ledger_unsupported",
      "the Ledger app does not support this operation — make sure the correct app is open on the device and updated to its latest version",
    );
  }
  // 0x6a80 (E_INCORRECT_DATA) is what the TRON app answers when its parser cannot make sense of the
  // payload — a contract type it does not implement (app-tron parse.c falls through to
  // `default: return USTREAM_FAULT`) or a genuinely malformed transaction. The "Sign by Hash"
  // fallback sits in the display switch, past a successful parse, so no app setting rescues this.
  // Keep the wording covering both causes: the status word alone cannot tell them apart.
  if (status === 0x6a80) {
    return new WalletError(
      "ledger_unsupported",
      "the Ledger app could not decode this payload — an unsupported contract type or a malformed transaction",
    );
  }
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
      throw new ExecutionError("auth_required", `Ledger ${family} app is not wired yet`);
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
  #bound<A extends LedgerApp, T>(
    family: ChainFamily,
    fn: (app: A) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
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
      const App = unwrap<new (transport: unknown) => LedgerApp>(await APP_LOADER[family]());
      try {
        handle = await openTransport();
      } catch (e) {
        // Nothing answered on USB/HID (or at the Speculos endpoint). `auth_required` said the wrong
        // thing here — there is no credential to supply, the device simply is not there — and it
        // read the same as a locked device, whose fix is entirely different.
        if (isLockedDevice(e)) throw classifyDeviceError(e);
        throw new WalletError(
          "device_not_found",
          `cannot reach a Ledger device — connect it, unlock it, and open the app: ${errMessage(e)}`,
        );
      }
      if (cancelled) {
        await handle.close().catch(() => {});
        throw new ChainError(
          "cancelled",
          "the Ledger operation was cancelled before it reached the device",
        );
      }
      try {
        return await fn(new App(handle.transport) as A);
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
      return await this.#bound<TrxApp | EthApp, string>(
        family,
        async (app) => (await app.getAddress(ledgerPath(path), opts?.display ?? false)).address,
      );
    } catch (e) {
      throw classifyDeviceError(e);
    }
  }

  async signTransaction(
    family: ChainFamily,
    path: string,
    tx: UnsignedTx,
    signal?: AbortSignal,
  ): Promise<SignedTx> {
    this.assertWired(family);
    if (family === "evm") return this.#signEvmTransaction(path, tx, signal);
    // The device signs raw_data_hex, so the same integrity rules the software strategy enforces
    // apply here — a Ledger account must not be the weaker signer. See tx-integrity.ts.
    assertTronTxIntegrity(tx);
    const rawTxHex = (tx as { raw_data_hex?: string }).raw_data_hex;
    if (!rawTxHex)
      throw new ChainError(
        "invalid_transaction",
        "TRON transaction is missing raw_data_hex for Ledger signing",
      );
    // TRON multi-sig collects several signatures on one transaction, so an existing signature[]
    // must be preserved and appended to — matching the software path (tronweb pushes).
    const existing = (tx as { signature?: unknown }).signature;
    const prior = Array.isArray(existing) ? existing : [];
    try {
      return await this.#bound<TrxApp, SignedTx>(
        family,
        async (trx) => {
          const signature = await trx.signTransaction(ledgerPath(path), rawTxHex, []);
          return {
            ...(tx as object),
            signature: prior.includes(signature) ? prior : [...prior, signature],
          };
        },
        signal,
      );
    } catch (e) {
      throw classifyDeviceError(e);
    }
  }

  async signMessage(
    family: ChainFamily,
    path: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<string> {
    this.assertWired(family);
    const messageHex = Buffer.from(message, "utf8").toString("hex");
    try {
      return await this.#bound<TrxApp | EthApp, string>(
        family,
        async (app) => {
          const signed = await app.signPersonalMessage(ledgerPath(path), messageHex);
          return typeof signed === "string" ? `0x${signed}` : joinVrs(signed);
        },
        signal,
      );
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
  async signTypedData(
    family: ChainFamily,
    path: string,
    payload: TypedDataPayload,
    signal?: AbortSignal,
  ): Promise<TypedDataSignature> {
    this.assertWired(family);
    if (family === "evm") return this.#signEvmTypedData(path, payload, signal);
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
      throw new ChainError(
        "invalid_transaction",
        `typed data could not be hashed: ${errMessage(e)}`,
      );
    }
    try {
      return await this.#bound<TrxApp, TypedDataSignature>(
        family,
        async (trx) => {
          if (typeof trx.signTIP712HashedMessage !== "function") {
            throw new WalletError(
              "ledger_unsupported",
              "this Ledger TRON app version cannot sign TIP-712 typed data; update the app",
            );
          }
          const signature = await trx.signTIP712HashedMessage(
            ledgerPath(path),
            domainHash,
            messageHash,
          );
          return { signature: `0x${signature}`, digest, primaryType };
        },
        signal,
      );
    } catch (e) {
      throw classifyDeviceError(e);
    }
  }

  /**
   * The ethereum app signs the UNSIGNED typed-transaction serialisation and returns {v, r, s};
   * ethers reassembles it into the raw transaction `eth_sendRawTransaction` accepts.
   */
  async #signEvmTransaction(path: string, tx: UnsignedTx, signal?: AbortSignal): Promise<SignedTx> {
    let transaction: Transaction;
    try {
      transaction = Transaction.from(tx as TransactionLike);
    } catch (e) {
      throw new ChainError(
        "invalid_transaction",
        `EVM transaction could not be encoded for Ledger signing: ${errMessage(e)}`,
      );
    }
    const unsignedHex = transaction.unsignedSerialized.replace(/^0x/, "");
    try {
      return await this.#bound<EthApp, SignedTx>(
        "evm",
        async (eth) => {
          // `resolution: null` on purpose — a non-null resolution makes hw-app-eth fetch
          // clear-signing descriptors from Ledger's CDN mid-signature, and the CLI must not
          // phone out while signing. The device shows the raw hash instead.
          const signed = await eth.signTransaction(ledgerPath(path), unsignedHex, null);
          transaction.signature = joinVrs(signed);
          // `{ raw, hash }`, matching the software strategy: the pipeline does not know which
          // signer produced a transaction, and a bare string would lose the locally derived id
          // that authoritativeTxId uses to refuse a node's claim about which tx it accepted.
          return { raw: transaction.serialized, hash: transaction.hash! };
        },
        signal,
      );
    } catch (e) {
      throw classifyDeviceError(e);
    }
  }

  async #signEvmTypedData(
    path: string,
    payload: TypedDataPayload,
    signal?: AbortSignal,
  ): Promise<TypedDataSignature> {
    const { domain, types, message } = payload;
    // ethers' EIP-712 encoder rather than tronweb's TIP-712 one. The two agree on EVM input
    // today (TIP-712 is a fork of this same code that also accepts TRON base58 addresses), so
    // this is about coupling, not a current behavioural difference: EVM signing must not depend
    // on a TRON SDK's typed-data implementation, which is free to diverge.
    const structTypes = Object.fromEntries(
      Object.entries(types as Record<string, unknown>).filter(([name]) => name !== "EIP712Domain"),
    ) as Record<string, Array<{ name: string; type: string }>>;
    let digest: string;
    let primaryType: string;
    let domainHash: string;
    let messageHash: string;
    try {
      primaryType = payload.primaryType ?? TypedDataEncoder.from(structTypes).primaryType;
      digest = TypedDataEncoder.hash(domain as never, structTypes, message);
      domainHash = TypedDataEncoder.hashDomain(domain as never).replace(/^0x/, "");
      messageHash = TypedDataEncoder.hashStruct(primaryType, structTypes, message).replace(
        /^0x/,
        "",
      );
    } catch (e) {
      throw new ChainError(
        "invalid_transaction",
        `typed data could not be hashed: ${errMessage(e)}`,
      );
    }
    try {
      return await this.#bound<EthApp, TypedDataSignature>(
        "evm",
        async (eth) => {
          if (typeof eth.signEIP712HashedMessage !== "function") {
            throw new WalletError(
              "ledger_unsupported",
              "this Ledger Ethereum app version cannot sign EIP-712 typed data; update the app",
            );
          }
          const signed = await eth.signEIP712HashedMessage(
            ledgerPath(path),
            domainHash,
            messageHash,
          );
          return { signature: joinVrs(signed), digest, primaryType };
        },
        signal,
      );
    } catch (e) {
      throw classifyDeviceError(e);
    }
  }

  async appConfig(family: ChainFamily): Promise<AppConfig> {
    this.assertWired(family);
    try {
      return await this.#bound<TrxApp | EthApp, AppConfig>(family, async (trx) => ({
        version: (await trx.getAppConfiguration()).version,
        ready: true,
      }));
    } catch (e) {
      throw classifyDeviceError(e);
    }
  }
}
