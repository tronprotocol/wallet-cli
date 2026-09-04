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

/** Exported so the `--scan-limit` schema can declare THIS value as its default: one constant, and
 *  `--json-schema` still publishes it. */
export const DEFAULT_SCAN_LIMIT = 20;
/** A whole BIP32 path, not just its head: `m` followed by 2-6 levels, each a number with an
 *  optional hardened mark. The old check only matched the `m/44'/<coin>'/` PREFIX, so
 *  `m/44'/195'/garbage` passed validation and went to the device as-is. */
const BIP32_PATH = /^m(?:\/\d+'?){2,6}$/;
/** the BIP44 template's first two levels, which is what --app has to agree with. */
const BIP44_HEAD = /^m\/44'\/(\d+)'\//;

/** Resolve a Ledger account locator without depending on a concrete transport. */
export async function resolveLedgerPath(
  ledger: LedgerDevice,
  family: ChainFamily,
  locator: LedgerLocator,
): Promise<string> {
  if (locator.index !== undefined) return Derivation.path(family, locator.index);
  if (locator.path !== undefined) {
    // Two different failures, told apart. A malformed path is a bad VALUE — reporting it as
    // "coin_type ? does not match --app tron" describes a mismatch the user never had, and sends
    // them to look at --app when the problem is the string they typed.
    const match = BIP44_HEAD.exec(locator.path);
    if (!BIP32_PATH.test(locator.path) || !match) {
      throw new UsageError(
        "invalid_path",
        `--path must be a BIP44 derivation path like m/44'/${FAMILIES[family].coinType}'/0'/0/0, not '${locator.path}'`,
      );
    }
    // Whereas THIS is a genuine disagreement between two flags the caller gave, so it stays a
    // cross-flag usage error and names both sides.
    const coinType = Number(match[1]);
    const expected = FAMILIES[family].coinType;
    if (coinType !== expected) {
      throw new UsageError(
        "invalid_option",
        `--path coin_type ${coinType} does not match --app ${family} (expected ${expected})`,
      );
    }
    return locator.path;
  }
  if (locator.address !== undefined) {
    const limit = locator.scanLimit ?? DEFAULT_SCAN_LIMIT;
    for (let index = 0; index < limit; index++) {
      const path = Derivation.path(family, index);
      if ((await ledger.getAddress(family, path, { display: false })) === locator.address)
        return path;
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
