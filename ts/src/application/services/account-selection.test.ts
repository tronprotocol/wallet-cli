import { describe, expect, it, vi } from "vitest";
import { AccountSelection } from "./account-selection.js";
import { errorMessage, UsageError, type CliError } from "../../domain/errors/index.js";
import { cliMessage } from "../../adapters/inbound/cli/output/errors.js";
import type { Wallet } from "../../domain/types/index.js";

const TRON = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const EVM = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const seed: Wallet = {
  id: "wlt_s",
  source: { type: "seed", vaultId: "vlt_s", addresses: { "2": { tron: TRON, evm: EVM } } },
};
const evmWatch: Wallet = { id: "wlt_w", source: { type: "watch", family: "evm", address: EVM } };

function store(wallet: Wallet | undefined, active: string | null = null) {
  return {
    activeAccount: vi.fn(() => active),
    resolveAccount: vi.fn((input: string) => {
      if (!wallet) throw new UsageError("account_not_found", `no account labelled '${input}'`);
      return { wallet, index: wallet.source.type === "seed" ? 2 : -1 };
    }),
  };
}

function thrown(run: () => unknown): CliError {
  try {
    run();
  } catch (e) {
    return e as CliError;
  }
  throw new Error("expected an error");
}

describe("AccountSelection.select", () => {
  it("returns a requested address as given, without consulting the store", () => {
    const accounts = store(undefined);
    expect(new AccountSelection(accounts).select(TRON)).toBe(TRON);
    expect(accounts.resolveAccount).not.toHaveBeenCalled();
  });

  it("resolves a requested label to the HD account ref", () => {
    expect(new AccountSelection(store(seed)).select("main")).toBe("wlt_s.2");
  });

  it("resolves a requested non-HD account to its wallet id", () => {
    expect(new AccountSelection(store(evmWatch)).select("watcher")).toBe("wlt_w");
  });

  it("keeps the store's error for an unknown requested account", () => {
    expect(thrown(() => new AccountSelection(store(undefined)).select("nope")).code).toBe(
      "account_not_found",
    );
  });

  it("falls back to the stored active account when none is requested", () => {
    expect(new AccountSelection(store(seed, "wlt_s.0")).select()).toBe("wlt_s.0");
    expect(new AccountSelection(store(seed, "wlt_s.0")).select("")).toBe("wlt_s.0");
  });

  it("reports missing_wallet_address naming the account option when nothing is active", () => {
    const error = thrown(() => new AccountSelection(store(seed)).select());
    expect(error.code).toBe("missing_wallet_address");
    expect(cliMessage(error.userMessage).message).toBe(
      "no active account; import one or pass --account",
    );
  });

  it("uses the caller's message when nothing is active", () => {
    const error = thrown(() =>
      new AccountSelection(store(seed)).select(undefined, errorMessage`import one first`),
    );
    expect(error).toMatchObject({ code: "missing_wallet_address", message: "import one first" });
  });
});

describe("AccountSelection.address", () => {
  it("returns a selected address of the family in canonical form", () => {
    const accounts = store(undefined);
    expect(new AccountSelection(accounts).address(EVM.toLowerCase(), "evm")).toBe(EVM);
    expect(accounts.resolveAccount).not.toHaveBeenCalled();
  });

  it("resolves a stored account's address in the family", () => {
    const accounts = store(seed);
    expect(new AccountSelection(accounts).address("wlt_s.2", "tron")).toBe(TRON);
    expect(accounts.resolveAccount).toHaveBeenCalledWith("wlt_s.2", "tron");
  });

  it("reports family_mismatch naming the account's family and the network option", () => {
    const error = thrown(() => new AccountSelection(store(evmWatch)).address("wlt_w", "tron"));
    expect(error.code).toBe("family_mismatch");
    expect(cliMessage(error.userMessage).message).toBe(
      "selected account is evm-only and has no tron address; pass --network for a evm network, or change defaultNetwork",
    );
  });

  it("reports family_mismatch for a multi-family account without that address", () => {
    const partial: Wallet = {
      id: "wlt_k",
      source: { type: "privateKey", keyId: "key_k", addresses: { evm: EVM } as never },
    };
    const error = thrown(() => new AccountSelection(store(partial)).address("wlt_k", "tron"));
    expect(error).toMatchObject({
      code: "family_mismatch",
      message: "active account has no tron address",
    });
  });
});
