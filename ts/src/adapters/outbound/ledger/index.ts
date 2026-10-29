import { hidHandle } from "./hid-handle.js";
import { utils as tronUtils } from "tronweb";
import { createHash } from "node:crypto";
import { Transaction, TypedDataEncoder, type TransactionLike } from "ethers";
import { assertTronTxIntegrity } from "../chain/tron/tx-integrity.js";
import type {
  SignedTx,
  TronTransactionArtifact,
  TypedDataPayload,
  TypedDataSignature,
  UnsignedTx,
} from "../../../domain/types/index.js";

export interface AppConfig {
  version: string;
  ready: boolean;
}
import { ChainError, CliError, ExecutionError, WalletError } from "../../../domain/errors/index.js";
import { ChainFamily, FAMILIES } from "../../../domain/family/index.js";
import { withTimeout } from "../../../domain/async/index.js";

export interface GetAddressOpts {
  // Show the address on-device for confirmation; false derives silently.
  display?: boolean;
  onWait?: () => void;
}

interface TrxApp {
  getAddress(path: string, display?: boolean): Promise<{ publicKey: string; address: string }>;
  getAppConfiguration(): Promise<{ version: string }>;
  signTransaction(path: string, rawTxHex: string, tokenSignatures: string[]): Promise<string>;
  signTransactionHash?(path: string, rawTxHashHex: string): Promise<string>;
  signPersonalMessage(path: string, messageHex: string): Promise<string>;
  signTIP712HashedMessage?(
    path: string,
    domainSeparatorHex: string,
    hashStructMessageHex: string,
  ): Promise<string>;
}

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

// Literal import specifiers allow static resolution and test mocking.
const APP_LOADER: Record<ChainFamily, () => Promise<unknown>> = {
  tron: () => import("@ledgerhq/hw-app-trx"),
  evm: () => import("@ledgerhq/hw-app-eth"),
};

// Normalize parity or EIP-155-encoded v to 27/28 for a 65-byte r || s || v signature.
function joinVrs(sig: { v: number | string; r: string; s: string }): string {
  const raw = typeof sig.v === "number" ? BigInt(sig.v) : BigInt(`0x${sig.v.replace(/^0x/, "")}`);
  const parity = raw < 27n ? raw & 1n : raw >= 35n ? (raw - 35n) & 1n : (raw - 27n) & 1n;
  const v = (27n + parity).toString(16);
  return `0x${sig.r.replace(/^0x/, "")}${sig.s.replace(/^0x/, "")}${v.padStart(2, "0")}`;
}

// TIP-712 returns parity 0/1; contract ecrecover requires 27/28, unlike raw transaction signatures.
function normalizeTronTypedSignature(signature: string): string {
  if (!/^[0-9a-fA-F]{128}(?:00|01|1[bBcC])$/.test(signature)) {
    throw new ExecutionError(
      "encoding_error",
      "Ledger returned an invalid TIP-712 signature encoding",
    );
  }
  const recovery = Number.parseInt(signature.slice(128), 16);
  const v = recovery < 2 ? recovery + 27 : recovery;
  return `0x${signature.slice(0, 128)}${v.toString(16)}`;
}

// Ledger paths omit the leading m/.
function ledgerPath(path: string): string {
  return path.replace(/^m\//, "");
}

// Unwrap CommonJS default exports under ESM.
function unwrap<T>(mod: unknown): T {
  return ((mod as { default?: T }).default ?? mod) as T;
}

// Import transports lazily so Speculos does not require native HID.
async function openTransport(): Promise<{
  transport: unknown;
  close: () => Promise<void>;
  abort: () => void;
}> {
  const port = process.env.SPECULOS_PORT;
  if (port) {
    const Speculos = unwrap<any>(await import("@ledgerhq/hw-transport-node-speculos-http"));
    const transport = await Speculos.open({
      baseURL: process.env.SPECULOS_HOST ?? "http://127.0.0.1",
      apiPort: port,
    });
    return hidHandle(transport);
  }
  const Hid = unwrap<any>(await import("@ledgerhq/hw-transport-node-hid-noevents"));
  const transport = await Hid.open("");
  return hidHandle(transport);
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const APP_SETTING_REQUIRED: Record<number, string> = {
  0x6a8c:
    'enable "Sign by Hash" in the Ledger TRON app settings (Settings › Sign by Hash › Allowed)',
  0x6a8b:
    'enable "Transactions data" in the Ledger TRON app settings to sign a transaction with extra data',
  0x6a8d: 'enable "Custom contracts" in the Ledger TRON app settings to sign this contract call',
};

function isLockedDevice(e: unknown): boolean {
  return (
    (e as { statusCode?: number }).statusCode === 0x5515 ||
    (e as { name?: string }).name === "LockedDeviceError"
  );
}

function classifyDeviceError(e: unknown): CliError {
  if (e instanceof CliError) return e;
  const status = (e as { statusCode?: number }).statusCode;
  if (status === 0x6985)
    return new ChainError("signing_rejected", "the operation was rejected on the device");
  if (
    ["DisconnectedDevice", "DisconnectedDeviceDuringOperation"].includes(
      (e as { name?: string })?.name ?? "",
    )
  ) {
    return new WalletError(
      "device_disconnected",
      "the Ledger device disconnected; reconnect it, unlock it, open the correct app and retry",
    );
  }
  if (isLockedDevice(e))
    return new WalletError(
      "device_locked",
      "the Ledger device is locked — unlock it with your PIN and run the command again",
    );
  if (status === 0x6d00 || status === 0x6d02) {
    return new WalletError(
      "ledger_unsupported",
      "the Ledger app does not support this operation — make sure the correct app is open on the device and updated to its latest version",
    );
  }
  // 0x6a80 covers unsupported contract types and malformed payloads; settings cannot fix it.
  if (status === 0x6a80) {
    return new WalletError(
      "ledger_unsupported",
      "the Ledger app could not decode this payload — an unsupported contract type or a malformed transaction",
    );
  }
  const setting = status === undefined ? undefined : APP_SETTING_REQUIRED[status];
  if (setting) return new WalletError("ledger_setting_required", setting);
  return new ExecutionError(
    "auth_required",
    "Ledger operation failed; reconnect the device, unlock it and open the correct app",
    status === undefined ? undefined : { statusCode: status },
  );
}

export class Ledger {
  constructor(private readonly timeoutMs = 60_000) {}

  private assertWired(family: ChainFamily): void {
    if (!FAMILIES[family].ledger) {
      throw new ExecutionError("auth_required", `Ledger ${family} app is not wired yet`);
    }
  }

  // Abort bypasses the transport's APDU wait; completed operations close normally.
  #bound<A extends LedgerApp, T>(
    family: ChainFamily,
    fn: (app: A) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    let handle: { transport: unknown; close: () => Promise<void>; abort: () => void } | undefined;
    // Remember early cancellation so a transport that opens later is still closed.
    let cancelled = false;
    const closeTransport = (): void => {
      cancelled = true;
      handle?.abort();
    };
    const run = (async () => {
      const App = unwrap<new (transport: unknown) => LedgerApp>(await APP_LOADER[family]());
      try {
        handle = await openTransport();
      } catch (e) {
        if (isLockedDevice(e)) throw classifyDeviceError(e);
        const noDevice =
          (e as { id?: string })?.id === "NoDevice" ||
          (e as { name?: string })?.name === "NoDevice";
        throw new WalletError(
          noDevice ? "device_not_found" : "device_unavailable",
          noDevice
            ? "no Ledger device was found; connect it, unlock it and open the correct app"
            : "cannot open the Ledger device; close Ledger Live and other applications using it, check USB access, reconnect it and retry",
        );
      }
      if (cancelled) {
        handle.abort();
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
    let rejectCancelled!: (error: ChainError) => void;
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancelled = reject;
    });
    const onAbort = () => {
      closeTransport();
      rejectCancelled(new ChainError("cancelled", "the Ledger operation was cancelled"));
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    return withTimeout(Promise.race([run, cancellation]), this.timeoutMs, closeTransport).finally(
      () => {
        signal?.removeEventListener("abort", onAbort);
      },
    );
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
    options?: { onWarning?: (message: string) => void },
  ): Promise<SignedTx> {
    this.assertWired(family);
    if (family === "evm") return this.#signEvmTransaction(path, tx, signal);
    // Validate the bytes the device will sign against the displayed transaction.
    assertTronTxIntegrity(tx);
    const rawTxHex = (tx as { raw_data_hex?: string }).raw_data_hex;
    if (!rawTxHex)
      throw new ChainError(
        "invalid_transaction",
        "TRON transaction is missing raw_data_hex for Ledger signing",
      );
    // Preserve earlier signatures when adding a multisig approval.
    const existing = (tx as { signature?: unknown }).signature;
    const prior = Array.isArray(existing) ? existing : [];
    try {
      return await this.#bound<TrxApp, SignedTx>(
        family,
        async (trx) => {
          let signature: string;
          try {
            signature = await trx.signTransaction(ledgerPath(path), rawTxHex, []);
          } catch (error) {
            // This packing error occurs before any APDU is sent.
            // Never retry a device rejection, transport failure, or cancelled operation as a hash.
            if (
              !(error instanceof Error) ||
              error.message !== "Too many bytes to encode." ||
              (error as { statusCode?: number }).statusCode !== undefined ||
              signal?.aborted
            ) {
              throw error;
            }
            if (typeof trx.signTransactionHash !== "function") {
              throw new WalletError(
                "ledger_unsupported",
                "this Ledger SDK cannot sign TRON transaction hashes",
              );
            }
            options?.onWarning?.(
              "Ledger transaction data exceeds the SDK field-size limit; falling back to hash signing. The device cannot display the URI or full transaction details. Verify the transaction on this computer before approving its hash.",
            );
            // Hash the validated bytes rather than trusting the supplied txID.
            const hash = createHash("sha256")
              .update(Buffer.from(rawTxHex.replace(/^0x/, ""), "hex"))
              .digest("hex");
            signature = await trx.signTransactionHash(ledgerPath(path), hash);
          }
          return {
            ...(tx as TronTransactionArtifact),
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

  // Hashed signing shows only hashes on-device, not the structured message.
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
          return { signature: normalizeTronTypedSignature(signature), digest, primaryType };
        },
        signal,
      );
    } catch (e) {
      throw classifyDeviceError(e);
    }
  }

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
          // Null resolution prevents the SDK from fetching CDN descriptors while signing.
          const signed = await eth.signTransaction(ledgerPath(path), unsignedHex, null);
          transaction.signature = joinVrs(signed);
          // Retain the local hash so broadcast verification can reject a mismatched node txID.
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
