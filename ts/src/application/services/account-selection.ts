import type { AccountSelector, ChainFamily } from "../../domain/types/index.js";
import type { AccountStore } from "../ports/account-store.js";
import { SOURCE_KINDS, sourceFamily } from "../../domain/sources/index.js";
import { accountRef, walletAddress } from "../../domain/wallet/index.js";
import { addressCodec, familyOf } from "../../domain/family/index.js";
import {
  errorMessage,
  inputRef,
  UsageError,
  WalletError,
  type UserMessage,
} from "../../domain/errors/index.js";

const NO_ACTIVE_ACCOUNT = errorMessage`no active account; import one or pass ${inputRef("account")}`;

// Decides which account a command acts on.
export class AccountSelection {
  constructor(private readonly store: Pick<AccountStore, "activeAccount" | "resolveAccount">) {}

  // The requested account, else the stored active one. An address stands for itself: it may name
  // an account that is not stored, and signing resolves it within the signing family.
  select(requested?: string, missing: UserMessage = NO_ACTIVE_ACCOUNT): AccountSelector {
    if (requested !== undefined && requested !== "") {
      if (familyOf(requested)) return requested;
      const { wallet, index } = this.store.resolveAccount(requested);
      return accountRef(wallet.id, SOURCE_KINDS[wallet.source.type].isHD ? index : null);
    }
    const active = this.store.activeAccount();
    if (!active) throw new WalletError("missing_wallet_address", missing);
    return active;
  }

  // The selected account's address in one family.
  address(selected: AccountSelector, family: ChainFamily): string {
    const codec = addressCodec(family);
    if (codec.validate(selected)) return codec.canonical(selected);
    const { wallet, index } = this.store.resolveAccount(selected, family);
    const address = walletAddress(wallet, family, index);
    if (address) return address;
    const own = sourceFamily(wallet.source);
    throw new UsageError(
      "family_mismatch",
      own
        ? errorMessage`selected account is ${own}-only and has no ${family} address; pass ${inputRef("network")} for a ${own} network, or change defaultNetwork`
        : errorMessage`active account has no ${family} address`,
    );
  }
}
