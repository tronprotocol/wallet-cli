import type { ChainFamily } from "../../domain/types/index.js";
import type { PromptPort } from "../ports/prompt.js";
import { Derivation } from "../../domain/derivation/index.js";
import { FAMILIES } from "../../domain/family/index.js";
import { UsageError, WalletError } from "../../domain/errors/index.js";
import type { LedgerDevice } from "../ports/ledger-device.js";

export interface LedgerLocator {
  index?: number;
  path?: string;
  address?: string;
  scanLimit?: number;
}

const DEFAULT_SCAN_LIMIT = 20;
const PATH_PATTERN = /^m\/44'\/(\d+)'\//;

/** Resolve a Ledger account locator without depending on a concrete transport. */
export async function resolveLedgerPath(
  ledger: LedgerDevice,
  family: ChainFamily,
  locator: LedgerLocator,
): Promise<string> {
  if (locator.index !== undefined) return Derivation.path(family, locator.index);
  if (locator.path !== undefined) {
    const match = PATH_PATTERN.exec(locator.path);
    const coinType = match ? Number(match[1]) : Number.NaN;
    const expected = FAMILIES[family].coinType;
    if (coinType !== expected) {
      throw new UsageError(
        "invalid_option",
        `--path coin_type ${match ? coinType : "?"} does not match --app ${family} (expected ${expected})`,
      );
    }
    return locator.path;
  }
  if (locator.address !== undefined) {
    const limit = locator.scanLimit ?? DEFAULT_SCAN_LIMIT;
    for (let index = 0; index < limit; index++) {
      const path = Derivation.path(family, index);
      if (await ledger.getAddress(family, path, { display: false }) === locator.address) return path;
    }
    throw new WalletError(
      "ledger_address_not_found",
      `address not found in the first ${limit} accounts; widen with --scan-limit <n>, ` +
        `or specify it directly with --index <i> / --path <m/44'/...>`,
    );
  }
  return Derivation.path(family, 0);
}

/** Derive Ledger accounts lazily in pages and let the inbound prompt port select one. */
export async function selectLedgerPath(
  ledger: LedgerDevice,
  family: ChainFamily,
  prompt: PromptPort,
  pageSize = 5,
): Promise<string> {
  const choices: Array<{ value: string; label: string }> = [];
  let nextIndex = 0;
  const loadPage = async () => {
    const end = nextIndex + pageSize;
    for (; nextIndex < end; nextIndex++) {
      const path = Derivation.path(family, nextIndex);
      const address = await ledger.getAddress(family, path, { display: false });
      choices.push({ value: path, label: `[${nextIndex}] ${address}` });
    }
    return choices;
  };
  await loadPage();
  return prompt.select({
    label: `Select ${family} account`,
    choices: [...choices],
    loadMore: loadPage,
  });
}
