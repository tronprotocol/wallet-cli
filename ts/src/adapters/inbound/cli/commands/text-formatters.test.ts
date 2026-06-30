import { describe, expect, it } from "vitest";
import type { TronUseCases } from "./tron/index.js";
import { CommandRegistry } from "../registry/index.js";
import { registerWalletCommands } from "./wallet.js";
import { registerConfigCommands } from "./config.js";
import { registerNetworkCommands } from "./network.js";
import { TronModule } from "./tron/index.js";
import { commandId } from "../command-id.js";
import { TextFormatters } from "../render/index.js";
import type { TextRenderContext } from "../contracts/index.js";
import type { ConfigService } from "../../../../application/use-cases/config-service.js";

const ctx = (over: Partial<TextRenderContext> = {}): TextRenderContext => ({ command: "x", ...over });

describe("text formatters", () => {
  it("every registered command has a command-owned text formatter", () => {
    const services = {} as TronUseCases;
    const registry = new CommandRegistry();
    registerWalletCommands(registry, {} as Parameters<typeof registerWalletCommands>[1]);
    registerConfigCommands(registry, {} as ConfigService);
    registerNetworkCommands(registry);
    new TronModule(services).registerCommands(registry);

    const missing = registry.all()
      .filter((cmd) => typeof cmd.formatText !== "function")
      .map(commandId)
      .sort();

    expect(missing).toEqual([]);
  });
});

describe("tokenBalance formatter", () => {
  it("formats balance with decimals and symbol when metadata is present", () => {
    const out = TextFormatters.tokenBalance({ address: "TXaddress", token: "TR7token", balance: "1204560000", symbol: "USDT", decimals: 6 }, ctx());
    expect(out).toContain("1204.56");
    expect(out).toContain("USDT");
  });
  it("falls back to raw scalar balance when metadata is missing", () => {
    const out = TextFormatters.tokenBalance({ address: "TXaddress", token: "TR7token", balance: "1204560000" }, ctx());
    expect(out).toContain("1204560000");
  });
  it("prefers the account label over the address when present", () => {
    const out = TextFormatters.tokenBalance({ address: "TXaddress", token: "t", balance: "1" }, ctx({ accountLabel: "main" }));
    expect(out).toContain("main");
    expect(out).not.toContain("TXaddress");
  });
});

describe("txReceipt formatter (typed kind, narrowed — no command-id matching)", () => {
  it("tx send submitted (default): pending receipt with txid + track hint, no fee/energy", () => {
    const out = TextFormatters.txReceipt({ kind: "send", family: "tron", stage: "submitted", txId: "abc123", rawAmount: "5000000", token: "USDT", decimals: 6, to: "TrecipientAddress" });
    expect(out).toContain("⏳");
    expect(out).toContain("Sent 5 USDT");
    expect(out).toContain("TrecipientAddress");
    expect(out).toContain("abc123");
    expect(out).toContain("pending — not yet on-chain");
    expect(out).toContain("Track it: wallet-cli tx info --txid abc123");
    expect(out).not.toContain("Fee");
  });
  it("tx send TRC20 via --contract --raw-amount (no symbol): never mislabels as TRX", () => {
    const out = TextFormatters.txReceipt({ kind: "send", family: "tron", stage: "submitted", txId: "t20", rawAmount: "10000", contract: "TXYZtokenContract", to: "Tdest" });
    expect(out).toContain("Sent 10000 TXYZtokenContract");
    expect(out).not.toContain("TRX");
  });
  it("tx send TRC10 via --asset-id --raw-amount (no symbol): labels by asset id, not TRX", () => {
    const out = TextFormatters.txReceipt({ kind: "send", family: "tron", stage: "submitted", txId: "t10", rawAmount: "500000", assetId: "1005416", to: "Tdest" });
    expect(out).toContain("Sent 500000 asset 1005416");
    expect(out).not.toContain("TRX");
  });
  it("tx send confirmed (--wait): success receipt with real block + fee", () => {
    const out = TextFormatters.txReceipt({ kind: "send", family: "tron", stage: "confirmed", txId: "abc", rawAmount: "1000000", to: "Tdest", blockNumber: 66000000, feeSun: "268000" });
    expect(out).toContain("✅");
    expect(out).toContain("Sent 1 TRX");
    expect(out).toContain("#66,000,000");
    expect(out).toContain("0.268 TRX");
    expect(out).toContain("success");
  });
  it("contract send failed (--wait): failure receipt with reason", () => {
    const out = TextFormatters.txReceipt({ kind: "contract-send", family: "tron", stage: "failed", txId: "abc", method: "transfer(address,uint256)", contract: "TR7contract", result: "OUT_OF_ENERGY", blockNumber: 1, failed: true });
    expect(out).toContain("❌");
    expect(out).toContain("Called transfer");
    expect(out).toContain("TR7contract");
    expect(out).toContain("OUT_OF_ENERGY");
  });
  it("dry-run with an energy estimate (TRC20/contract): renders energy, never [object Object]", () => {
    const out = TextFormatters.txReceipt({
      kind: "send", family: "tron", mode: "dry-run",
      fee: { feeModel: "tron-resource", energy: 29650, availableEnergy: 133440569 } as any,
      tx: { txID: "deadbeef" } as any, rawAmount: "10000", contract: "TXYZtoken", to: "Tdest",
    } as any);
    expect(out).toContain("Dry run");
    expect(out).not.toContain("[object Object]");
    expect(out).toContain("29,650 energy");
    expect(out).toContain("covered by staked energy"); // availableEnergy >= energy
  });
  it("dry-run energy estimate with insufficient available energy: no 'covered' note", () => {
    const out = TextFormatters.txReceipt({
      kind: "send", family: "tron", mode: "dry-run",
      fee: { feeModel: "tron-resource", energy: 29650, availableEnergy: 100 } as any,
      tx: { txID: "deadbeef" } as any, rawAmount: "10000", contract: "TXYZtoken", to: "Tdest",
    } as any);
    expect(out).toContain("29,650 energy");
    expect(out).not.toContain("covered by staked energy");
  });
  it("stake freeze submitted: renders staked amount and resource", () => {
    const out = TextFormatters.txReceipt({ kind: "stake-freeze", family: "tron", stage: "submitted", txId: "abc", amountSun: "2000000", resource: "energy" });
    expect(out).toContain("Staked");
    expect(out).toContain("2 TRX");
    expect(out).toContain("energy");
  });
});

describe("txStatus formatter (family-agnostic; command supplies `failed`)", () => {
  it("tron: confirmed when not failed", () => {
    const out = TextFormatters.txStatus({ family: "tron", txid: "abc", confirmed: true, failed: false, blockNumber: 123 });
    expect(out).toContain("confirmed");
    expect(out).toContain("#123");
  });
  it("tron: failed when command flags it", () => {
    const out = TextFormatters.txStatus({ family: "tron", txid: "abc", confirmed: true, failed: true, blockNumber: 1 });
    expect(out).toContain("failed");
  });
  it("pending when not yet confirmed", () => {
    const out = TextFormatters.txStatus({ family: "tron", txid: "abc", confirmed: false, failed: false });
    expect(out).toContain("pending");
  });
});

describe("txInfo formatter (per-family, narrowed on family)", () => {
  it("tron: shows TRX amount, energy and fee in TRX", () => {
    const out = TextFormatters.txInfo({
      family: "tron", txid: "abc", from: "Tfrom", to: "Tto", amount: "1.5", symbol: "TRX",
      status: "SUCCESS", blockNumber: 66000000, energyUsed: 28000, feeSun: 268000, transaction: {}, info: {},
    });
    expect(out).toContain("1.5 TRX");
    expect(out).toContain("#66,000,000");
    expect(out).toContain("28,000");
    expect(out).toContain("0.268 TRX");
    expect(out).toContain("SUCCESS");
  });
});

describe("contractInfo formatter", () => {
  it("uses normalized methods + count", () => {
    const out = TextFormatters.contractInfo({ address: "TR7c", name: "Foo", methods: ["a", "b"], functionCount: 2 });
    expect(out).toContain("Foo");
    expect(out).toContain("Methods");
    expect(out).toContain("2 (a / b)");
  });
  it("falls back to raw contract/info ABI shape", () => {
    const out = TextFormatters.contractInfo({ address: "TR7c", contract: { name: "Bar", abi: { entrys: [{ type: "Function", name: "x" }] } } });
    expect(out).toContain("Bar");
    expect(out).toContain("1 (x)");
  });
});

describe("accountHistory formatter", () => {
  it("renders normalized rows", () => {
    const out = TextFormatters.accountHistory({
      address: "TXaddr",
      records: [{ time: 1700000000000, type: "Transfer", amount: "1000000", symbol: "TRX", counterparty: "Tother", status: "ok" }],
    }, ctx());
    expect(out).toContain("Transfer");
    expect(out).toContain("Tother");
  });
});
