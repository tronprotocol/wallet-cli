import type { ChainAddresses, ChainFamily, Source, Wallet, WalletsFile } from "../types/index.js";
import { ExecutionError } from "../errors/index.js";
import { addressCodec, CHAIN_FAMILIES } from "../family/index.js";
import { SOURCE_KINDS } from "../sources/index.js";
import { isStoredLabel, labelKey } from "./label.js";

const WALLET_ID = /^wlt_[A-Za-z0-9_-]+$/;
// Blob ids name files under the keystore root.
const BLOB_ID = /^[A-Za-z0-9_-]+$/;
const ACCOUNT_INDEX = /^(0|[1-9]\d*)$/;

// Applies the write paths' rules to a loaded wallets.json. Unknown source kinds pass through so a newer
// file stays readable.
export function parseWalletsFile(raw: unknown): WalletsFile {
  if (!isRecord(raw)) throw invalid("the document is not an object");
  const { version, activeAccount = null, wallets, labels = {} } = raw;
  if (typeof version !== "number") throw invalid("version is not a number");
  if (activeAccount !== null && typeof activeAccount !== "string") {
    throw invalid("activeAccount is not a string");
  }
  if (!Array.isArray(wallets)) throw invalid("wallets is not a list");
  if (!isRecord(labels)) throw invalid("labels is not an object");
  const seen = new Set<string>();
  for (const [ref, label] of Object.entries(labels)) {
    if (typeof label !== "string" || !isStoredLabel(label)) {
      throw invalid(`the label of ${ref} is not a valid label`);
    }
    if (seen.has(labelKey(label))) throw invalid(`label '${label.trim()}' is used twice`);
    seen.add(labelKey(label));
  }
  const ids = new Set<string>();
  for (const wallet of wallets) {
    assertWallet(wallet);
    if (ids.has(wallet.id)) throw invalid(`wallet ${wallet.id} appears twice`);
    ids.add(wallet.id);
  }
  return { ...raw, version, activeAccount, wallets, labels } as WalletsFile;
}

function assertWallet(wallet: unknown): asserts wallet is Wallet {
  if (!isRecord(wallet) || typeof wallet.id !== "string" || !WALLET_ID.test(wallet.id)) {
    throw invalid("a wallet has no valid id");
  }
  const { id, source } = wallet;
  if (!isRecord(source) || typeof source.type !== "string") {
    throw invalid(`wallet ${id} has no source type`);
  }
  if (!(source.type in SOURCE_KINDS)) return;
  const s = source as Partial<Record<string, unknown>> & { type: Source["type"] };
  switch (s.type) {
    case "seed":
      if (typeof s.vaultId !== "string" || !BLOB_ID.test(s.vaultId)) {
        throw invalid(`wallet ${id} has an invalid vault id`);
      }
      if (!isRecord(s.addresses)) throw invalid(`wallet ${id} has no address map`);
      for (const [index, addresses] of Object.entries(s.addresses)) {
        if (!ACCOUNT_INDEX.test(index) || !isChainAddresses(addresses)) {
          throw invalid(`wallet ${id} has invalid addresses for account ${index}`);
        }
      }
      return;
    case "privateKey":
      if (typeof s.keyId !== "string" || !BLOB_ID.test(s.keyId)) {
        throw invalid(`wallet ${id} has an invalid key id`);
      }
      if (!isChainAddresses(s.addresses)) throw invalid(`wallet ${id} has invalid addresses`);
      return;
    case "ledger":
      if (typeof s.path !== "string" || s.path === "") {
        throw invalid(`wallet ${id} has no derivation path`);
      }
      assertSingleAddress(id, s.family, s.address);
      return;
    case "watch":
      assertSingleAddress(id, s.family, s.address);
  }
}

function assertSingleAddress(id: string, family: unknown, address: unknown): void {
  if (!CHAIN_FAMILIES.includes(family as ChainFamily)) {
    throw invalid(`wallet ${id} has an unsupported family`);
  }
  if (typeof address !== "string" || !addressCodec(family as ChainFamily).validate(address)) {
    throw invalid(`wallet ${id} has an invalid ${String(family)} address`);
  }
}

function isChainAddresses(value: unknown): value is ChainAddresses {
  return (
    isRecord(value) &&
    CHAIN_FAMILIES.every((family) => {
      const address = value[family];
      return typeof address === "string" && addressCodec(family).validate(address);
    })
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(reason: string): ExecutionError {
  return new ExecutionError("encoding_error", `wallets.json is invalid: ${reason}`);
}
