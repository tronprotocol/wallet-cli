/**
 * SharedTypes (L0) — the single home for all cross-layer types and interfaces.
 *
 * No runtime/value code lives here. Implementations live in their feature layers
 * and `implements` the interfaces declared here, so any module can depend on the
 * type without creating a runtime dependency (see plan §1 / §6.3).
 */
import type { ZodObject, ZodRawShape, ZodType } from "zod";

// ── identity & network ───────────────────────────────────────────────────────
export type ChainFamily = "tron" | "evm";
export type NetworkId = string; // canonical, e.g. "evm:56" / "tron:nile"
export type AccountRef = string; // "wlt_x.0" (HD) / "wlt_k" (privateKey)

export type FeeModel = "legacy" | "eip1559" | "tron-resource";

export interface NetworkDescriptor {
  id: NetworkId;
  family: ChainFamily;
  chainId: string;
  aliases: string[];
  rpcUrl?: string;
  grpcEndpoint?: string;
  solidityGrpcEndpoint?: string;
  /** indexer base URL (TronGrid) for `account history`; absent → indexer_not_configured. */
  tronGridUrl?: string;
  feeModel?: FeeModel;
  capabilities: string[];
  rpc?: RpcClient; // attached lazily by NetworkRegistry.resolve
}

export interface CapabilityDescriptor {
  key: string;
  summary: string;
}

export interface Config {
  defaultOutput: OutputMode;
  timeoutMs: number;
  /** net=optional fallback network per family (§7.5). Missing → builtin mainnet. */
  defaults?: { network?: Partial<Record<ChainFamily, string>> };
  networks: Record<NetworkId, NetworkDescriptor>;
}

// ── wallet data shapes (persisted in wallets.json) ─────────────────────────────
/** one secret derives both chains → both slots always present (non-optional). */
export type ChainAddresses = { tron: string; evm: string };

/**
 * All address caches live inside `source` next to their secret-ref:
 * - seed: index("0","1",…) → both-chain addresses (known indices = Object.keys(addresses))
 * - privateKey: flat both-chain addresses (no index, no "" sentinel)
 * - ledger: single family + path + watch-only address (no index)
 * - watch: single family + address; no secret, no path, no file (= ledger minus path)
 */
export type Source =
  | { type: "seed"; vaultId: string; addresses: Record<string, ChainAddresses> }
  | { type: "privateKey"; keyId: string; addresses: ChainAddresses }
  | { type: "ledger"; family: ChainFamily; path: string; address: string }
  | { type: "watch"; family: ChainFamily; address: string };

export interface Wallet {
  id: string;
  source: Source;
}

export interface WalletsFile {
  version: number;
  activeAccount: AccountRef | null;
  wallets: Wallet[];
  labels: Record<AccountRef, string>;
}

export interface WalletView {
  id: string;
  ref: AccountRef;
  label?: string;
  type: Source["type"];
  index: number | null;
  addresses: { tron?: string; evm?: string };
  active: boolean;
}

export type KeystoreType = "bip39-seed" | "raw-privkey" | "verifier";
export interface CryptoParams {
  cipher: "aes-128-ctr";
  ciphertext: string;
  cipherparams: { iv: string };
  kdf: "scrypt";
  kdfparams: { n: number; r: number; p: number; dklen: number; salt: string };
  mac: string;
}
export interface KeystoreBlob {
  id: string;
  type: KeystoreType;
  version: number;
  crypto: CryptoParams;
}

// ── crypto / signing / tx / rpc (implementations live in upper layers) ─────────
export type Bytes = Uint8Array;
export type KeyPair = { privateKey: Bytes; publicKey: Bytes };

export type UnsignedTx = unknown;
export type SignedTx = unknown;
export type FeeReport = Record<string, unknown>;
export type Signature = { r: string; s: string; v?: number } | { signature: string };

export interface BroadcastResult {
  txId?: string;
  hash?: string;
  [k: string]: unknown;
}

export type TxOutcome =
  | { stage: "plan"; tx: UnsignedTx; fee: FeeReport }
  | { stage: "signed"; signed: SignedTx; fee: FeeReport }
  | ({ stage: "broadcast" } & BroadcastResult);

export interface SignerSignOpts {
  signal?: AbortSignal;
}
export interface Signer {
  kind: "software" | "device";
  address: string;
  precheck?(): Promise<void>;
  sign(tx: UnsignedTx, opts: SignerSignOpts): Promise<SignedTx>;
  /** raw message signing (not via TxPipeline). */
  signMessage(message: string, opts: SignerSignOpts): Promise<string>;
}

export interface RpcClient {
  call(method: string, params: unknown): Promise<unknown>;
  broadcast(signed: SignedTx): Promise<BroadcastResult>;
  /** native-coin balance of an address, in the chain's smallest unit (string). */
  getNativeBalance(address: string): Promise<string>;
}

// ── streams / secrets / network registry (interfaces; classes implement) ───────
export type OutputMode = "text" | "json";
export type DiagnosticLevel = "info" | "debug" | "warn";

export interface StreamManager {
  result(text: string): void;
  diagnostic(level: DiagnosticLevel, msg: string): void;
  /** always-on stderr line (errors must show even under --quiet). */
  errorLine(msg: string): void;
  /** intermediate progress frame → stderr plain line; null is skipped (plan §7.7 / StreamManager 兩段式事件). */
  event(frame: string | null): void;
  readStdinOnce(): string;
  /** warnings accumulated for the JSON envelope's meta.warnings. */
  warnings(): string[];
}

export type SecretKind = "password" | "privateKey" | "mnemonic" | "tx" | "message";
export interface SecretResolver {
  masterPassword(): string;
  /** whether a master-password source exists, WITHOUT consuming stdin. */
  hasMasterPassword(): boolean;
  /** whether a source for `kind` is configured, WITHOUT consuming it. */
  has(kind: SecretKind): boolean;
  read(kind: SecretKind): string;
  /** read a required source; missing → missing_option (usage), not secret_source_error. */
  require(kind: SecretKind): string;
  /** exactly-one selector: inline value XOR the file/stdin source for `kind`. */
  pick(inline: string | undefined, kind: SecretKind, inlineFlag: string): string;
}

export interface NetworkRegistry {
  resolve(idOrAlias: string | undefined): NetworkDescriptor;
  /** net=optional fallback when --network is omitted: config default → builtin mainnet. */
  resolveDefault(family: ChainFamily): NetworkDescriptor;
  all(): NetworkDescriptor[];
}

// ── execution context / command / chain module ────────────────────────────────
export interface ExecutionContext {
  config: Config;
  networkRegistry: NetworkRegistry;
  streams: StreamManager;
  secrets: SecretResolver;
  output: OutputMode;
  timeoutMs: number;
  noDeviceWait: boolean;
  /** lazily resolved active account ref (throws if required but absent). */
  readonly activeAccount: AccountRef;
  /** cached address of the active account on a given family. */
  resolveAddress(family: ChainFamily): string;
  /** emit an intermediate progress event (Ledger wait / sign / broadcast) → stderr (plan §7.7). */
  emit(e: ProgressEvent): void;
}

export interface Example {
  cmd: string;
  note?: string;
}

export type NetworkRequirement = "none" | "optional" | "required";
export type WalletRequirement = "none" | "optional" | "required";
export type AuthRequirement = "none" | "optional" | "required";

export interface CommandDefinition<I = any, O = any> {
  id: string;
  /** path under the namespace, e.g. ["account","balance"] or ["import"]. */
  path: string[];
  family?: ChainFamily;
  network: NetworkRequirement;
  wallet: WalletRequirement;
  auth: AuthRequirement;
  capability?: string;
  summary?: string;
  /** per-field zod object; feeds ZodYargsAdapter (arity) + HelpService. */
  fields: ZodObject<ZodRawShape>;
  /** full validation schema (often fields.superRefine), used in dispatch. */
  input: ZodType<I>;
  examples: Example[];
  run(ctx: ExecutionContext, net: NetworkDescriptor | undefined, input: I): Promise<O>;
}

export interface ChainModule {
  family: ChainFamily;
  networks(): NetworkDescriptor[];
  capabilities(): CapabilityDescriptor[];
  registerCommands(reg: CommandRegistryLike): void;
}

/** structural view of CommandRegistry needed by ChainModule.registerCommands. */
export interface CommandRegistryLike {
  add(cmd: CommandDefinition): void;
}

// ── help / registry metadata ───────────────────────────────────────────────────
export type FlagArity = "boolean" | "value";
export type FlagArityHints = Record<string, FlagArity>;

export interface CommandTreeMeta {
  namespaces: string[];
  commands: Array<{ ns: string; path: string[]; id: string; summary?: string }>;
}

// ── ledger ─────────────────────────────────────────────────────────────────────
export interface AppConfig {
  version: string;
  ready: boolean;
}

// ── output contract (envelopes) ────────────────────────────────────────────────
export interface ChainView {
  family: ChainFamily;
  networkId: NetworkId;
  network: string;
  chainId: string;
}
export interface Meta {
  durationMs: number;
  warnings: string[];
}
export interface ResultEnvelope {
  schema: "wallet-cli.result.v1";
  success: true;
  command: string;
  chain?: ChainView;
  data: unknown;
  meta: Meta;
}
export interface ErrorEnvelope {
  schema: "wallet-cli.result.v1";
  success: false;
  command: string;
  chain?: ChainView;
  error: { code: string; message: string; details?: object };
  meta: Meta;
}

/**
 * Intermediate progress event for long flows (Ledger wait / sign / broadcast).
 * Routed via ExecutionContext.emit → formatter.event → StreamManager.event (stderr).
 * NOT a terminal envelope; carries `type` so json consumers can tell it apart (plan §7.7).
 */
export type ProgressEvent =
  | { type: "awaiting_device"; reason: "sign" | "verify_address" | "open_app" | "unlock" }
  | { type: "pre-verify-address"; address: string }
  | { type: "signed" }
  | { type: "broadcasting" }
  | { type: "dry-run" };

// ── global runtime flags parsed off argv ───────────────────────────────────────
export interface Globals {
  output: OutputMode;
  network?: string;
  account?: string;
  timeoutMs?: number;
  quiet: boolean;
  verbose: boolean;
  noDeviceWait: boolean;
  grpcEndpoint?: string;
  rpcUrl?: string;
}

export type ExitCode = 0 | 1 | 2;
