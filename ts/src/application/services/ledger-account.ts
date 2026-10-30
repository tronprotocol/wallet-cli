import type { ChainFamily } from "../../domain/types/index.js";
import type { PromptPort } from "../ports/prompt.js";
import { Derivation } from "../../domain/derivation/index.js";
import { FAMILIES, canonicalAddress } from "../../domain/family/index.js";
import { errorMessage, inputRef, UsageError, WalletError } from "../../domain/errors/index.js";
import type { LedgerDevice } from "../ports/ledger-device.js";

export interface LedgerLocator {
  index?: number;
  path?: string;
  address?: string;
  scanLimit?: number;
}

export const DEFAULT_SCAN_LIMIT = 20;
// Validate the whole path, not just the BIP44 prefix.
const BIP32_PATH = /^m(?:\/\d+'?){2,6}$/;
const BIP44_HEAD = /^m\/44'\/(\d+)'\//;

export async function resolveLedgerPath(
  ledger: LedgerDevice,
  family: ChainFamily,
  locator: LedgerLocator,
): Promise<string> {
  if (locator.index !== undefined) return Derivation.ledgerPath(family, locator.index);
  if (locator.path !== undefined) {
    const match = BIP44_HEAD.exec(locator.path);
    if (!BIP32_PATH.test(locator.path) || !match) {
      throw new UsageError(
        "invalid_path",
        errorMessage`${inputRef("path")} must be a BIP44 derivation path like m/44'/${FAMILIES[family].coinType}'/0'/0/0, not '${locator.path}'`,
      );
    }
    const coinType = Number(match[1]);
    const expected = FAMILIES[family].coinType;
    if (coinType !== expected) {
      throw new UsageError(
        "invalid_option",
        errorMessage`${inputRef("path")} coin_type ${coinType} does not match ${inputRef("app")} ${family} (expected ${expected})`,
      );
    }
    return locator.path;
  }
  if (locator.address !== undefined) {
    const limit = locator.scanLimit ?? DEFAULT_SCAN_LIMIT;
    const wanted = canonicalAddress(locator.address);
    for (let index = 0; index < limit; index++) {
      const path = Derivation.ledgerPath(family, index);
      const found = await ledger.getAddress(family, path, { display: false });
      if (canonicalAddress(found) === wanted) return path;
    }
    throw new WalletError(
      "ledger_address_not_found",
      errorMessage`address not found among the first ${limit} Ledger Live accounts; increase ${inputRef("scanLimit")}, select a known account with ${inputRef("index")}, or register its exact derivation path with ${inputRef("path")}`,
    );
  }
  return Derivation.ledgerPath(family, 0);
}

export async function selectLedgerPath(
  ledger: LedgerDevice,
  family: ChainFamily,
  prompt: PromptPort,
  label: string,
  pageSize = 5,
): Promise<string> {
  const choices: Array<{ value: string; label: string }> = [];
  let nextIndex = 0;
  const loadPage = async () => {
    const end = nextIndex + pageSize;
    for (; nextIndex < end; nextIndex++) {
      const path = Derivation.ledgerPath(family, nextIndex);
      const address = await ledger.getAddress(family, path, { display: false });
      // Show the derivation scheme so users can recognize accounts outside this template.
      choices.push({ value: path, label: `[${nextIndex}] ${address}  ${path}` });
    }
    return choices;
  };
  await loadPage();
  return prompt.select({
    label,
    choices: [...choices],
    loadMore: loadPage,
  });
}
