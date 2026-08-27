import { describe, expect, it, vi } from "vitest";
import type { AccountDescriptor } from "../../../../domain/types/index.js";
import { CommandRegistry } from "../registry/index.js";
import { isChainCommand } from "../contracts/index.js";
import { registerWalletCommands } from "./wallet.js";

const ADDRESS = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";
const descriptor = {
  accountId: "wlt_selected",
  label: "treasury",
  type: "watch",
  index: null,
  active: false,
  addresses: { tron: ADDRESS },
} satisfies AccountDescriptor;

function command(
  options: {
    output?: "text" | "json";
    encoded?: string | null;
    account?: string;
  } = {},
) {
  const walletService = {
    current: vi.fn(() => descriptor),
  };
  const qr = {
    encode: vi.fn(() => (options.encoded === undefined ? "QR-MATRIX" : options.encoded)),
  };
  const registry = new CommandRegistry();
  registerWalletCommands(registry, {
    walletService: walletService as never,
    ledger: {} as never,
    qr,
  });
  const current = registry.resolveNeutral(["current"]);
  if (!current || isChainCommand(current)) {
    throw new Error("current command missing");
  }
  // ExecutionContext always carries these; --qr now reads the selected network to choose which
  // family's address to encode, so a fixture without them represents no real invocation.
  const tronNet = {
    id: "tron:mainnet",
    family: "tron",
    nativeSymbol: "TRX",
    chainId: "mainnet",
    capabilities: [],
  };
  const context = {
    activeAccount: options.account ?? "wlt_selected",
    output: options.output ?? "text",
    warn: vi.fn(),
    network: undefined,
    networkRegistry: { resolve: () => tronNet, resolveDefault: () => tronNet },
  };
  return { current, context, tronNet, walletService, qr };
}

describe("current --qr", () => {
  it("encodes exactly the selected account's TRON address in text mode", async () => {
    const fixture = command({ account: "wlt_selected", encoded: "QR" });
    const result = await fixture.current.run(fixture.context as never, fixture.tronNet as never, {
      qr: true,
    });

    expect(fixture.walletService.current).toHaveBeenCalledWith("wlt_selected");
    expect(fixture.qr.encode).toHaveBeenCalledWith(ADDRESS);
    expect(result).toMatchObject({
      receiveQr: "QR",
      receiveAddress: ADDRESS,
    });
  });

  // json gets the answer --qr was asked for, and no terminal art: the QR is the only text-shaped
  // part of this command, so it is the only part the output format decides.
  it("gives JSON the receive address and never builds terminal art", async () => {
    const fixture = command({ output: "json" });
    const result = await fixture.current.run(fixture.context as never, fixture.tronNet as never, {
      qr: true,
    });

    expect(result).toEqual({ ...descriptor, receiveAddress: ADDRESS });
    expect(result).not.toHaveProperty("receiveQr");
    expect(fixture.qr.encode).not.toHaveBeenCalled();
  });

  it("warns and returns the full normal descriptor on a narrow terminal", async () => {
    const fixture = command({ encoded: null });
    const result = await fixture.current.run(fixture.context as never, fixture.tronNet as never, {
      qr: true,
    });

    expect(result).toEqual(descriptor);
    expect(fixture.context.warn).toHaveBeenCalledWith(expect.stringContaining("too narrow"));
  });
});

const EVM_ADDRESS = "0xe2E1a54926527Fbb4E4420DE4c6BAb82beAEE24D";

/** the same fixture, but with the network selector the QR now reads. */
function withNetwork(
  addresses: Record<string, string>,
  selected: string | undefined,
  defaultFamily: "tron" | "evm" = "tron",
) {
  const walletService = { current: vi.fn(() => ({ ...descriptor, addresses })) };
  const qr = { encode: vi.fn((a: string) => `QR(${a})`) };
  const registry = new CommandRegistry();
  registerWalletCommands(registry, {
    walletService: walletService as never,
    ledger: {} as never,
    qr,
  });
  const current = registry.resolveNeutral(["current"]);
  if (!current || isChainCommand(current)) throw new Error("current command missing");

  const net = (family: string) => ({ id: `${family}:x`, family, chainId: "x", capabilities: [] });
  const context = {
    activeAccount: "wlt_selected",
    output: "text" as "text" | "json",
    warn: vi.fn(),
  };
  // the shell resolves --network (else config.defaultNetwork) and hands it to run()
  const network = net(selected ? (selected.startsWith("evm") ? "evm" : "tron") : defaultFamily);
  return { current, context, network, qr };
}

// §3.8: --qr encodes the address for the SELECTED NETWORK's family. Handing someone a receive
// code for a different chain is a fund-loss shape, so this never falls back to whatever the
// account happens to have.
describe("current --qr picks the address by network family", () => {
  const both = { tron: ADDRESS, evm: EVM_ADDRESS };

  it("encodes the EVM address when an EVM network is selected", async () => {
    const f = withNetwork(both, "evm:11155111");
    const result = (await f.current.run(f.context as never, f.network as never, { qr: true })) as {
      receiveAddress: string;
    };

    expect(result.receiveAddress).toBe(EVM_ADDRESS);
    expect(f.qr.encode).toHaveBeenCalledWith(EVM_ADDRESS);
  });

  it("encodes the TRON address when a TRON network is selected", async () => {
    const f = withNetwork(both, "tron:nile");
    const result = (await f.current.run(f.context as never, f.network as never, { qr: true })) as {
      receiveAddress: string;
    };

    expect(result.receiveAddress).toBe(ADDRESS);
  });

  it("uses the configured default network when --network is omitted", async () => {
    const f = withNetwork(both, undefined, "evm");
    const result = (await f.current.run(f.context as never, f.network as never, { qr: true })) as {
      receiveAddress: string;
    };

    expect(result.receiveAddress).toBe(EVM_ADDRESS);
  });

  it("refuses instead of falling back when the account has no address for that family", async () => {
    const f = withNetwork({ evm: EVM_ADDRESS }, "tron:nile");

    let code: string | undefined;
    try {
      await f.current.run(f.context as never, f.network as never, { qr: true });
    } catch (e) {
      code = (e as { code?: string }).code;
    }

    expect(code).toBe("family_mismatch");
    expect(f.qr.encode).not.toHaveBeenCalled();
  });

  // The regression this replaces: the family check sat behind `output === "text"`, so the same
  // command exited 2 with family_mismatch for a human and 0 with success for an agent — and the
  // agent is the one that cannot see the QR it was supposedly refusing to draw.
  it("refuses under -o json too, not just in text", async () => {
    const f = withNetwork({ evm: EVM_ADDRESS }, "tron:nile");
    f.context.output = "json";

    await expect(
      f.current.run(f.context as never, f.network as never, { qr: true }),
    ).rejects.toMatchObject({ code: "family_mismatch" });
    expect(f.qr.encode).not.toHaveBeenCalled();
  });

  // The error is scoped to --qr. Looking at an account is local and must not depend on which
  // network happens to be selected.
  it("still shows a mismatched single-family account when --qr is absent", async () => {
    const f = withNetwork({ evm: EVM_ADDRESS }, "tron:nile");

    const result = await f.current.run(f.context as never, f.network as never, { qr: false });

    expect(result).toMatchObject({ addresses: { evm: EVM_ADDRESS } });
  });
});
