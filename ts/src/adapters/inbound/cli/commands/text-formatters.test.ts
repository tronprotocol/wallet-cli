import { describe, expect, it } from "vitest";
import { CommandRegistry } from "../registry/index.js";
import { registerWalletCommands } from "./wallet.js";
import { registerConfigCommands } from "./config.js";
import { registerNetworkCommands } from "./network.js";
import { registerTronChainCommands, type TronChainCommandDependencies } from "../../../../bootstrap/families/tron.js";
import { commandId } from "../command-id.js";
import { TextFormatters } from "../render/index.js";
import { isChainCommand } from "../contracts/index.js";
import type { TextRenderContext } from "../contracts/index.js";
import type { ConfigService } from "../../../../application/use-cases/config-service.js";
import { registerContactCommands } from "./contact.js";
import { registerAddressCommands } from "./address.js";
import { registerEncodingCommands } from "./encoding.js";

const ctx = (over: Partial<TextRenderContext> = {}): TextRenderContext => ({ command: "x", ...over });

describe("text formatters", () => {
  it("every registered command has a command-owned text formatter", () => {
    const registry = new CommandRegistry();
    registerWalletCommands(registry, {} as Parameters<typeof registerWalletCommands>[1]);
    registerConfigCommands(registry, {} as ConfigService);
    registerNetworkCommands(registry);
    registerContactCommands(registry, {} as never);
    registerAddressCommands(registry, {} as never);
    registerEncodingCommands(registry, {} as never);
    registerTronChainCommands(registry, {} as TronChainCommandDependencies);

    const missing = registry.all()
      .filter((cmd) => typeof (isChainCommand(cmd) ? cmd.spec.formatText : cmd.formatText) !== "function")
      .map((cmd) => commandId(isChainCommand(cmd) ? { path: cmd.spec.path } : cmd))
      .sort();

    expect(missing).toEqual([]);
  });
});

describe("accountBalance formatter", () => {
  it("converts native balance to the human coin amount using decimals + symbol", () => {
    const out = TextFormatters.accountBalance({ address: "TXaddress", balance: "1983993000", decimals: 6, symbol: "TRX" }, ctx());
    expect(out).toContain("1983.993 TRX");
    expect(out).not.toContain("sun");
  });
  it("falls back to raw scalar balance when decimals are missing", () => {
    const out = TextFormatters.accountBalance({ address: "TXaddress", balance: "1983993000" }, ctx());
    expect(out).toContain("1983993000");
  });
  it("prefers the account label over the address when present", () => {
    const out = TextFormatters.accountBalance({ address: "TXaddress", balance: "1", decimals: 6, symbol: "TRX" }, ctx({ accountLabel: "main" }));
    expect(out).toContain("main");
    expect(out).not.toContain("TXaddress");
  });
});

describe("stake/chain TRX amount formatting", () => {
  it("groups the integer part without truncating fractional TRX", () => {
    const stake = TextFormatters.stakeDelegated({
      direction: "out",
      canDelegateMaxSun: { energy: "1234456789", bandwidth: "0" },
      delegations: [],
    }, ctx());
    const chain = TextFormatters.chainPrices({
      energy: { currentSunPerUnit: 210 },
      bandwidth: { currentSunPerUnit: 1000 },
      memoFeeSun: "1234456789",
    });
    expect(stake).toContain("1,234.456789 TRX");
    expect(chain).toContain("1,234.456789 TRX");
  });
});

describe("stakeInfo unfreezing list", () => {
  const data = {
    staked: { energySun: "1000000000", bandwidthSun: "500000000" },
    votingPower: { total: 1500, used: 1000, available: 500 },
    resource: { energy: { used: 12000, limit: 65000 }, bandwidth: { used: 600, limit: 1500 } },
    unfreezing: [
      { amountSun: "500000000", withdrawableAt: 1784073600000 },
      { amountSun: "300000000", withdrawableAt: 1784160000000 },
    ],
    withdrawableSun: "0",
    unfreeze: { used: 2, max: 32, remaining: 30 },
  };

  it("renders each pending unstake as a tree branch (├─ / └─), last one └─", () => {
    const out = TextFormatters.stakeInfo(data, ctx({ accountLabel: "main" }));
    const lines = out.split("\n");
    const branch = lines.filter((l) => l.includes("─"));
    expect(branch).toHaveLength(2);
    expect(branch[0]).toContain("├─ 500 TRX  withdrawable");
    expect(branch[1]).toContain("└─ 300 TRX  withdrawable");
    // no legacy "  1) "/"  2) " line-leading numbering survives
    expect(out).not.toMatch(/^\s*\d+\)\s/m);
  });

  it("aligns the branch under the value column", () => {
    const out = TextFormatters.stakeInfo(data, ctx({ accountLabel: "main" }));
    const lines = out.split("\n");
    const valueCol = lines.find((l) => l.startsWith("Unfreezing"))!.indexOf("2 pending");
    const branchLine = lines.find((l) => l.includes("├─"))!;
    expect(branchLine.indexOf("├─")).toBe(valueCol);
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
    const out = TextFormatters.txReceipt(
      { kind: "send", stage: "submitted", txId: "abc123", rawAmount: "5000000", token: "USDT", decimals: 6, to: "TrecipientAddress" },
      ctx({ net: { id: "tron:nile", family: "tron", chainId: "nile", feeModel: "tron-resource", aliases: [], capabilities: [] } }),
    );
    expect(out).toContain("⏳");
    expect(out).toContain("Sent 5 USDT");
    expect(out).toContain("TrecipientAddress");
    expect(out).toContain("abc123");
    expect(out).toContain("pending — not yet on-chain");
    expect(out).toContain("Track it: wallet-cli tx info --network tron:nile --txid abc123");
    expect(out).not.toContain("Fee");
  });
  it("tx send TRC20 via --contract --raw-amount (no symbol): never mislabels as TRX", () => {
    const out = TextFormatters.txReceipt({ kind: "send", stage: "submitted", txId: "t20", rawAmount: "10000", contract: "TXYZtokenContract", to: "Tdest" });
    expect(out).toContain("Sent 10000 TXYZtokenContract");
    expect(out).not.toContain("TRX");
  });
  it("tx send TRC10 via --asset-id --raw-amount (no symbol): labels by asset id, not TRX", () => {
    const out = TextFormatters.txReceipt({ kind: "send", stage: "submitted", txId: "t10", rawAmount: "500000", assetId: "1005416", to: "Tdest" });
    expect(out).toContain("Sent 500000 asset 1005416");
    expect(out).not.toContain("TRX");
  });
  it("tx send confirmed (--wait): success receipt with real block + fee", () => {
    const out = TextFormatters.txReceipt({ kind: "send", stage: "confirmed", txId: "abc", rawAmount: "1000000", to: "Tdest", blockNumber: 66000000, feeSun: "268000" });
    expect(out).toContain("✅");
    expect(out).toContain("Sent 1 TRX");
    expect(out).toContain("#66,000,000");
    expect(out).toContain("0.268 TRX");
    expect(out).toContain("success");
  });
  it("confirmed receipt preserves legitimate zero-valued chain fields", () => {
    const out = TextFormatters.txReceipt({
      kind: "send", stage: "confirmed", txId: "zero",
      rawAmount: "0", to: "Tdest", blockNumber: 0, energyUsed: 0, feeSun: 0,
    });
    expect(out).toContain("#0");
    expect(out).toMatch(/Energy\s+0/);
    expect(out).toContain("0 TRX");
  });
  it("contract send failed (--wait): failure receipt with reason", () => {
    const out = TextFormatters.txReceipt({ kind: "contract-send", stage: "failed", txId: "abc", method: "transfer(address,uint256)", contract: "TR7contract", result: "OUT_OF_ENERGY", blockNumber: 1, failed: true });
    expect(out).toContain("❌");
    expect(out).toContain("Called transfer");
    expect(out).toContain("TR7contract");
    expect(out).toContain("OUT_OF_ENERGY");
  });
  it("contract deploy submitted: renders populated Address row", () => {
    const out = TextFormatters.txReceipt(
      { kind: "contract-deploy", stage: "submitted", txId: "dep1", contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" },
      ctx({ net: { id: "tron:nile", family: "tron", chainId: "nile", feeModel: "tron-resource", aliases: [], capabilities: [] } }),
    );
    expect(out).toContain("Contract deployed");
    expect(out).toContain("Address");
    expect(out).toContain("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
  });
  it("dry-run with an energy estimate (TRC20/contract): renders energy, never [object Object]", () => {
    const out = TextFormatters.txReceipt({
      kind: "send", mode: "dry-run",
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
      kind: "send", mode: "dry-run",
      fee: { feeModel: "tron-resource", energy: 29650, availableEnergy: 100 } as any,
      tx: { txID: "deadbeef" } as any, rawAmount: "10000", contract: "TXYZtoken", to: "Tdest",
    } as any);
    expect(out).toContain("29,650 energy");
    expect(out).not.toContain("covered by staked energy");
  });
  it("stake freeze submitted: renders staked amount and resource", () => {
    const out = TextFormatters.txReceipt({ kind: "stake-freeze", stage: "submitted", txId: "abc", amountSun: "2000000", resource: "energy" });
    expect(out).toContain("Staked");
    expect(out).toContain("2 TRX");
    expect(out).toContain("energy");
  });
});

describe("local multisig formatters", () => {
  const approval = {
    txId: "abc123",
    contractType: "TransferContract",
    operation: "TransferContract",
    from: "Towner",
    to: "Trecipient",
    rawAmount: "1000000",
    permission: { id: 2, name: "operations", threshold: 2 },
    currentWeight: 1,
    missingWeight: 1,
    thresholdReached: false,
    approved: [{ address: "Tsigner", weight: 1 }],
    expiration: Date.now() + 60_000,
    expired: false,
    signatures: 1,
  };

  it("shows permission progress and approved signer weight", () => {
    const out = TextFormatters.txApprovals(approval) as string;
    expect(out).toContain('active "operations" (id 2)');
    expect(out).toContain("Progress  1 / 2");
    expect(out).toContain("1 more weight needed");
    expect(out).toContain("Tsigner");
  });

  it("shows the next broadcast command only after threshold is reached", () => {
    const pending = TextFormatters.txSign({
      kind: "tx-sign",
      signer: "Tsigner",
      signerWeight: 1,
      hex: "aabb",
      transaction: approval,
    }) as string;
    expect(pending).not.toContain("wallet-cli tx broadcast");

    const ready = TextFormatters.txSign({
      kind: "tx-sign",
      signer: "Tsigner2",
      signerWeight: 1,
      hex: "ccdd",
      out: "signed.hex",
      transaction: {
        ...approval,
        currentWeight: 2,
        missingWeight: 0,
        thresholdReached: true,
      },
    }) as string;
    expect(ready).toContain("wallet-cli tx broadcast --file signed.hex");
  });
});

describe("txStatus formatter (family-agnostic; command supplies `state`)", () => {
  it("tron: confirmed when not failed", () => {
    const out = TextFormatters.txStatus({ txid: "abc", state: "confirmed", confirmed: true, failed: false, blockNumber: 123 });
    expect(out).toContain("confirmed");
    expect(out).toContain("#123");
  });
  it("tron: failed when command flags it", () => {
    const out = TextFormatters.txStatus({ txid: "abc", state: "failed", confirmed: true, failed: true, blockNumber: 1 });
    expect(out).toContain("failed");
  });
  it("pending when known but not yet confirmed", () => {
    const out = TextFormatters.txStatus({ txid: "abc", state: "pending", confirmed: false, failed: false });
    expect(out).toContain("pending");
  });
  it("not found when the node has no record of the tx", () => {
    const out = TextFormatters.txStatus({ txid: "abc", state: "not_found", confirmed: false, failed: false });
    expect(out).toContain("not found");
  });
});

describe("txInfo formatter (per-family, narrowed on ctx.net.family)", () => {
  it("tron: shows TRX amount, energy and fee in TRX", () => {
    const out = TextFormatters.txInfo({
      txid: "abc", from: "Tfrom", to: "Tto", amount: "1.5", symbol: "TRX",
      status: "SUCCESS", blockNumber: 66000000, energyUsed: 28000, feeSun: 268000, transaction: {}, info: {},
    }, ctx({ net: { id: "tron:nile", family: "tron", chainId: "nile", feeModel: "tron-resource", aliases: [], capabilities: [] } }));
    expect(out).toContain("1.5 TRX");
    expect(out).toContain("#66,000,000");
    expect(out).toContain("28,000");
    expect(out).toContain("0.268 TRX");
    expect(out).toContain("SUCCESS");
  });
});

describe("accountInfo staking summary", () => {
  const accountInfo = (amount: unknown) => TextFormatters.accountInfo({
    address: "Towner",
    account: { balance: 0, frozenV2: [{ type: "ENERGY", amount }] },
    resources: {},
  }, ctx());

  it("preserves staking amounts above Number.MAX_SAFE_INTEGER when supplied as strings", () => {
    expect(accountInfo("9007199254740993")).toContain("9007199254.740993 TRX");
  });

  it("omits the staking summary for an already-unsafe numeric amount", () => {
    expect(accountInfo(9007199254740992)).not.toContain("Staked");
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

describe("sign-only receipt", () => {
  const base = { kind: "sign" as const, mode: "sign-only" as const, address: "TSigner", txId: "abc123" };
  const ctx = { command: "tx sign", net: { family: "tron", id: "nile" } } as never;

  // The signature is the product of a signing command and has to be copied somewhere, so it must
  // never be shortened. Before this it showed a truncated txID — redundant with the TxID row and
  // useless as output.
  it("prints the signature in full", () => {
    const sig = "16a2ec10".repeat(16) + "1C";
    const out = TextFormatters.txReceipt({ ...base, signed: { txID: "abc123", signature: [sig] } }, ctx) as string;
    expect(out).toContain(sig);
    expect(out).not.toMatch(/\.\.\./);
    expect(out).toContain("Signature");
  });

  it("numbers the signatures when a multi-sig transaction carries several", () => {
    const out = TextFormatters.txReceipt(
      { ...base, signed: { txID: "abc123", signature: ["aa".repeat(65), "bb".repeat(65)] } },
      ctx,
    ) as string;
    expect(out).toContain("Signature 1");
    expect(out).toContain("Signature 2");
  });

  // tx sign estimates nothing, so there is no fee to report and the row is dropped entirely
  // rather than rendered as "unknown".
  it("omits the fee row when nothing was estimated", () => {
    const out = TextFormatters.txReceipt({ ...base, signed: { signature: ["aa".repeat(65)] } }, ctx) as string;
    expect(out).not.toContain("Fee");
  });
});
