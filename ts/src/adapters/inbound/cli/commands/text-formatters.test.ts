import { describe, expect, it } from "vitest";
import { CommandRegistry } from "../registry/index.js";
import { registerWalletCommands } from "./wallet.js";
import { registerConfigCommands } from "./config.js";
import { registerNetworkCommands } from "./network.js";
import {
  registerTronChainCommands,
  type TronChainCommandDependencies,
} from "../../../../bootstrap/families/tron.js";
import { commandId } from "../command-id.js";
import { TextFormatters } from "../render/index.js";
import { introspectFields } from "../arity/index.js";
import { isChainCommand } from "../contracts/index.js";
import type { TextRenderContext } from "../contracts/index.js";
import type { ConfigService } from "../../../../application/use-cases/config-service.js";
import { registerContactCommands } from "./contact.js";
import { registerAddressCommands } from "./address.js";
import { registerEncodingCommands } from "./encoding.js";

// A chain command always has a resolved network by the time its formatter runs, so the default
// carries one. renderFamily() now refuses to guess (it used to silently default to tron, which
// would render wei as TRX), and a fixture without `net` would not represent any real invocation.
const ctx = (over: Partial<TextRenderContext> = {}): TextRenderContext => ({
  command: "x",
  net: { id: "tron:nile", family: "tron", nativeSymbol: "TRX" } as never,
  ...over,
});

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

    const missing = registry
      .all()
      .filter(
        (cmd) => typeof (isChainCommand(cmd) ? cmd.spec.formatText : cmd.formatText) !== "function",
      )
      .map((cmd) => commandId(isChainCommand(cmd) ? { path: cmd.spec.path } : cmd))
      .sort();

    expect(missing).toEqual([]);
  });

  // Help renders a field's description for both flags and positionals (help/index.ts Args + Flags).
  // A field without one prints a bare name and leaves the reader — often an agent — guessing what
  // to pass. Registry-wide so a new command cannot quietly ship undocumented inputs.
  it("every registered command field carries a help description", () => {
    const registry = new CommandRegistry();
    registerWalletCommands(registry, {} as Parameters<typeof registerWalletCommands>[1]);
    registerConfigCommands(registry, {} as ConfigService);
    registerNetworkCommands(registry);
    registerContactCommands(registry, {} as never);
    registerAddressCommands(registry, {} as never);
    registerEncodingCommands(registry, {} as never);
    registerTronChainCommands(registry, {} as TronChainCommandDependencies);

    const missing: string[] = [];
    for (const cmd of registry.all()) {
      const spec = isChainCommand(cmd) ? cmd.spec : cmd;
      const fields = isChainCommand(cmd) ? cmd.spec.baseFields : cmd.fields;
      if (!fields) continue;
      for (const field of introspectFields(fields)) {
        if (!field.description) missing.push(`${spec.path.join(" ")} --${field.kebab}`);
      }
    }

    expect(missing.sort()).toEqual([]);
  });
});

describe("permissionShow formatter", () => {
  const view = {
    address: "Towner",
    owner: {
      id: 0,
      name: "owner",
      threshold: 1,
      keys: [{ address: "Towner", weight: 1, local: "main" }],
    },
    actives: [
      {
        id: 2,
        name: "finance",
        threshold: 2,
        keys: [
          { address: "TQkX", weight: 1 },
          { address: "TXe4", weight: 1, local: "cold" },
        ],
        operations: ["TransferContract"],
        operationsHex: "7fff1fc0033e0100000000000000000000000000000000000000000000000000",
        operationLabels: ["Transfer TRX"],
        unknownOperationIds: [],
      },
    ],
  } as any;

  // Doc §3.1.1 keeps operationsHex in json — it is a machine value, and the human column already
  // carries the decoded operation labels next to it.
  it("does not print the operations bitmap in the text card", () => {
    const out = TextFormatters.permissionShow(view, ctx()) as string;
    expect(out).not.toContain("Operations Hex");
    expect(out).not.toContain("7fff1fc0033e0100");
  });

  it("still prints the decoded operation labels, the total, and local key annotations", () => {
    const out = TextFormatters.permissionShow(view, ctx()) as string;
    expect(out).toContain("Transfer TRX");
    expect(out).toContain("(1 total)");
    expect(out).toContain("(this wallet: cold)");
    expect(out).toContain("finance  (id 2, active)");
  });
});

describe("accountBalance formatter", () => {
  it("converts native balance to the human coin amount using decimals + symbol", () => {
    const out = TextFormatters.accountBalance(
      { address: "TXaddress", balance: "1983993000", decimals: 6, symbol: "TRX" },
      ctx(),
    );
    expect(out).toContain("1983.993 TRX");
    expect(out).not.toContain("sun");
  });
  it("falls back to raw scalar balance when decimals are missing", () => {
    const out = TextFormatters.accountBalance(
      { address: "TXaddress", balance: "1983993000" },
      ctx(),
    );
    expect(out).toContain("1983993000");
  });
  it("prefers the account label over the address when present", () => {
    const out = TextFormatters.accountBalance(
      { address: "TXaddress", balance: "1", decimals: 6, symbol: "TRX" },
      ctx({ accountLabel: "main" }),
    );
    expect(out).toContain("main");
    expect(out).not.toContain("TXaddress");
  });
});

describe("walletCurrent formatter", () => {
  it("renders a receive QR followed by the full address for manual verification", () => {
    const out = TextFormatters.walletCurrent({
      accountId: "wlt_selected",
      label: "treasury",
      active: false,
      addresses: {
        tron: "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC",
      },
      receiveQr: "█▀█\n▀▄▀",
      receiveAddress: "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC",
    });

    expect(out).toContain("Selected account: treasury");
    expect(out).toContain("█▀█\n▀▄▀");
    expect(out).toMatch(/█▀█\n▀▄▀\nReceive address\s+TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC/);
  });
});

describe("stake/chain TRX amount formatting", () => {
  it("groups the integer part without truncating fractional TRX", () => {
    const stake = TextFormatters.stakeDelegated(
      {
        direction: "out",
        canDelegateMaxSun: { energy: "1234456789", bandwidth: "0" },
        delegations: [],
      },
      ctx(),
    );
    const chain = TextFormatters.chainPrices(
      {
        energy: { currentSunPerUnit: 210 },
        bandwidth: { currentSunPerUnit: 1000 },
        memoFeeSun: "1234456789",
      },
      ctx(),
    );
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
    const out = TextFormatters.tokenBalance(
      {
        address: "TXaddress",
        token: "TR7token",
        balance: "1204560000",
        symbol: "USDT",
        decimals: 6,
      },
      ctx(),
    );
    expect(out).toContain("1204.56");
    expect(out).toContain("USDT");
  });
  it("falls back to raw scalar balance when metadata is missing", () => {
    const out = TextFormatters.tokenBalance(
      { address: "TXaddress", token: "TR7token", balance: "1204560000" },
      ctx(),
    );
    expect(out).toContain("1204560000");
  });
  it("prefers the account label over the address when present", () => {
    const out = TextFormatters.tokenBalance(
      { address: "TXaddress", token: "t", balance: "1" },
      ctx({ accountLabel: "main" }),
    );
    expect(out).toContain("main");
    expect(out).not.toContain("TXaddress");
  });
});

describe("txReceipt formatter (typed kind, narrowed — no command-id matching)", () => {
  it("tx send submitted (default): pending receipt with txid + track hint, no fee/energy", () => {
    const out = TextFormatters.txReceipt(
      {
        kind: "send",
        stage: "submitted",
        txId: "abc123",
        rawAmount: "5000000",
        token: "USDT",
        decimals: 6,
        to: "TrecipientAddress",
      },
      ctx({
        net: {
          id: "tron:nile",
          family: "tron",
          nativeSymbol: "TRX",
          chainId: "nile",
          feeModel: "tron-resource",
          capabilities: [],
        },
      }),
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
    const out = TextFormatters.txReceipt(
      {
        kind: "send",
        stage: "submitted",
        txId: "t20",
        rawAmount: "10000",
        contract: "TXYZtokenContract",
        to: "Tdest",
      },
      ctx(),
    );
    expect(out).toContain("Sent 10000 TXYZtokenContract");
    expect(out).not.toContain("TRX");
  });
  it("tx send TRC10 via --asset-id --raw-amount (no symbol): labels by asset id, not TRX", () => {
    const out = TextFormatters.txReceipt(
      {
        kind: "send",
        stage: "submitted",
        txId: "t10",
        rawAmount: "500000",
        assetId: "1005416",
        to: "Tdest",
      },
      ctx(),
    );
    expect(out).toContain("Sent 500000 asset 1005416");
    expect(out).not.toContain("TRX");
  });
  it("tx send confirmed (--wait): success receipt with real block + fee", () => {
    const out = TextFormatters.txReceipt(
      {
        kind: "send",
        stage: "confirmed",
        txId: "abc",
        rawAmount: "1000000",
        to: "Tdest",
        blockNumber: 66000000,
        feeSun: "268000",
      },
      ctx(),
    );
    expect(out).toContain("✅");
    expect(out).toContain("Sent 1 TRX");
    expect(out).toContain("#66,000,000");
    expect(out).toContain("0.268 TRX");
    expect(out).toContain("success");
  });
  it("confirmed receipt preserves legitimate zero-valued chain fields", () => {
    const out = TextFormatters.txReceipt(
      {
        kind: "send",
        stage: "confirmed",
        txId: "zero",
        rawAmount: "0",
        to: "Tdest",
        blockNumber: 0,
        energyUsed: 0,
        feeSun: 0,
      },
      ctx(),
    );
    expect(out).toContain("#0");
    expect(out).toMatch(/Energy\s+0/);
    expect(out).toContain("0 TRX");
  });
  it("contract send failed (--wait): failure receipt with reason", () => {
    const out = TextFormatters.txReceipt(
      {
        kind: "contract-send",
        stage: "failed",
        txId: "abc",
        method: "transfer(address,uint256)",
        contract: "TR7contract",
        result: "OUT_OF_ENERGY",
        blockNumber: 1,
        failed: true,
      },
      ctx(),
    );
    expect(out).toContain("❌");
    expect(out).toContain("Called transfer");
    expect(out).toContain("TR7contract");
    expect(out).toContain("OUT_OF_ENERGY");
  });
  it("contract deploy submitted: renders populated Address row", () => {
    const out = TextFormatters.txReceipt(
      {
        kind: "contract-deploy",
        stage: "submitted",
        txId: "dep1",
        contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      },
      ctx({
        net: {
          id: "tron:nile",
          family: "tron",
          nativeSymbol: "TRX",
          chainId: "nile",
          feeModel: "tron-resource",
          capabilities: [],
        },
      }),
    );
    expect(out).toContain("Contract deployed");
    expect(out).toContain("Address");
    expect(out).toContain("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
  });
  it("dry-run with an energy estimate (TRC20/contract): renders energy, never [object Object]", () => {
    const out = TextFormatters.txReceipt(
      {
        kind: "send",
        mode: "dry-run",
        fee: { feeModel: "tron-resource", energy: 29650, availableEnergy: 133440569 } as any,
        tx: { txID: "deadbeef" } as any,
        rawAmount: "10000",
        contract: "TXYZtoken",
        to: "Tdest",
      } as any,
      ctx(),
    );
    expect(out).toContain("Dry run");
    expect(out).not.toContain("[object Object]");
    expect(out).toContain("29,650 energy");
    expect(out).toContain("covered by staked energy"); // availableEnergy >= energy
  });
  it("dry-run energy estimate with insufficient available energy: no 'covered' note", () => {
    const out = TextFormatters.txReceipt(
      {
        kind: "send",
        mode: "dry-run",
        fee: { feeModel: "tron-resource", energy: 29650, availableEnergy: 100 } as any,
        tx: { txID: "deadbeef" } as any,
        rawAmount: "10000",
        contract: "TXYZtoken",
        to: "Tdest",
      } as any,
      ctx(),
    );
    expect(out).toContain("29,650 energy");
    expect(out).not.toContain("covered by staked energy");
  });
  // `account activate` estimates its fee from two chain parameters, so its fee object carries
  // neither `feeSun` nor `energy`. Every such shape must still render as TRX — and no fee shape,
  // known or not, may ever reach the user as a stringified object.
  const activateFee = {
    feeModel: "tron-resource",
    createAccountFeeSun: "100000",
    systemContractFeeSun: "1000000",
    minimumFeeSun: "1100000",
    balanceSun: "1862126000",
  };
  const dryRun = (fee: unknown) =>
    TextFormatters.txReceipt(
      {
        kind: "account-activate",
        mode: "dry-run",
        fee,
        tx: { txID: "cc0a6f68" },
        address: "TEF2CvkixrkzwbreCRFCQ7sZGj9AVFAkQq",
        payer: "TMSgJxtPw29",
      } as any,
      ctx(),
    ) as string;

  it("account activate dry-run: renders the total creation fee, not [object Object]", () => {
    const out = dryRun(activateFee);
    expect(out).not.toContain("[object Object]");
    // doc §3.4.1 shows the confirmed receipt as `Fee 1.1 TRX`; dry-run must be comparable
    expect(out).toContain("1.1 TRX");
  });

  it.each([
    ["createAccountFeeSun alone", { minimumFeeSun: "100000" }, "0.1 TRX"],
    ["a zero fee", { minimumFeeSun: "0" }, "0 TRX"],
    // fees use fromBaseUnits (exact decimal, no thousands separators) like every other Fee row
    ["a large fee", { minimumFeeSun: "9000000000" }, "9,000 TRX"], // §1.4 grouping
  ])("account activate dry-run: %s", (_name, fee, expected) => {
    expect(dryRun(fee)).toContain(expected);
  });

  it("prefers an explicit feeSun over the derived minimum when both are present", () => {
    expect(dryRun({ feeSun: "2000000", minimumFeeSun: "1100000" })).toContain("2 TRX");
  });

  // The regression net: every fee shape the renderer already understood must keep working, so
  // adding a branch cannot silently reorder or shadow an existing one.
  it.each([
    ["feeSun", { feeSun: "268000" }, "0.268 TRX"],
    ["bandwidth burn", { bandwidthBurnSunIfNoFreeze: "1000000" }, "1 TRX"],
    ["a note", { note: "no fee for this operation" }, "no fee for this operation"],
    ["a bare sun scalar", "1100000", "1.1 TRX"],
  ])("still renders %s", (_name, fee, expected) => {
    expect(dryRun(fee)).toContain(expected);
  });

  // The root cause of the activate bug: an unrecognized fee object fell through to a fallback that
  // stringified it. Failing honestly is required; leaking "[object Object]" is not acceptable for
  // any shape, including ones added later.
  it.each([
    ["an unrecognized fee object", { someFutureFeeModel: "42" }],
    ["an empty fee object", {}],
    ["a nested fee object", { fee: { inner: "1" } }],
  ])("never leaks a stringified object for %s", (_name, fee) => {
    const out = dryRun(fee);
    expect(out).not.toContain("[object Object]");
    expect(out).toContain("unknown");
  });

  // `tx broadcast` carries the full approval view in json, but text projected none of it: the
  // dry-run receipt was a bare header plus a fee line, and the fee was printed twice whenever the
  // multi-sign fee was non-zero (receiptRows pushed one row, the dry-run branch another). The QA
  // pass missed the duplicate because its sample fee was 0, which is falsy.
  const broadcastApproval = {
    txId: "abc123",
    contractType: "TransferContract",
    operation: "Transfer TRX",
    from: "Towner",
    to: "Trecipient",
    rawAmount: "1000000",
    permission: { id: 2, name: "finance", threshold: 2 },
    currentWeight: 2,
    missingWeight: 0,
    thresholdReached: true,
    approved: [
      { address: "TQkX", weight: 1 },
      { address: "TXe4", weight: 1 },
    ],
    expiration: 1784388720000,
    expired: false,
    signatures: 2,
  };

  it("broadcast dry-run: projects the permission and approval block json already carries", () => {
    const out = TextFormatters.txReceipt(
      {
        kind: "broadcast",
        mode: "dry-run",
        transaction: broadcastApproval,
        multiSignFeeSun: 1000000,
      } as any,
      ctx(),
    ) as string;
    expect(out).toContain("Dry run tx broadcast");
    expect(out).toContain('Permission  active "finance" (id 2)  threshold 2');
    expect(out).toContain("Progress  2 / 2 — threshold reached");
    expect(out).toContain("Approved signer");
    expect(out).toContain("TQkX");
  });

  it("broadcast dry-run: identifies the transaction instead of leaving an empty Tx row", () => {
    const out = TextFormatters.txReceipt(
      {
        kind: "broadcast",
        mode: "dry-run",
        transaction: broadcastApproval,
        multiSignFeeSun: 0,
      } as any,
      ctx(),
    ) as string;
    expect(out).toContain("abc123");
  });

  it.each([
    ["non-zero multi-sign fee", 1000000, "1 TRX"],
    ["zero multi-sign fee", 0, "0 TRX"],
  ])("broadcast dry-run: states the multi-sign fee exactly once (%s)", (_n, fee, expected) => {
    const out = TextFormatters.txReceipt(
      {
        kind: "broadcast",
        mode: "dry-run",
        transaction: broadcastApproval,
        multiSignFeeSun: fee,
      } as any,
      ctx(),
    ) as string;
    expect(out.match(/multi-sign fee/gi) ?? []).toHaveLength(1);
    expect(out).toContain(expected);
  });

  it("broadcast submitted: keeps txid, status and the tracking hint, and does not duplicate the fee", () => {
    const out = TextFormatters.txReceipt(
      {
        kind: "broadcast",
        stage: "submitted",
        txId: "abc123",
        transaction: broadcastApproval,
        multiSignFeeSun: 1000000,
      } as any,
      ctx(),
    ) as string;
    expect(out).toContain("abc123");
    expect(out).toContain("pending — not yet on-chain");
    expect(out).toContain("Track it:");
    expect(out.match(/multi-sign fee/gi) ?? []).toHaveLength(1);
  });

  it("stake freeze submitted: renders staked amount and resource", () => {
    const out = TextFormatters.txReceipt(
      {
        kind: "stake-freeze",
        stage: "submitted",
        txId: "abc",
        amountSun: "2000000",
        resource: "energy",
      },
      ctx(),
    );
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

  // Doc §3.2.1: the default `tx sign` receipt is the action block plus the same transaction and
  // signature-progress block `tx approvals` prints — permission group name and threshold, a
  // Progress line, and the per-signer weight table. The offline receipt cannot carry any of it.
  it("prints the documented progress block on the default (checked) sign receipt", () => {
    const out = TextFormatters.txSign({
      kind: "tx-sign",
      signer: "Tsigner",
      checked: true,
      signerWeight: 1,
      hex: "aabb",
      transaction: {
        txId: approval.txId,
        contractType: approval.contractType,
        permissionId: approval.permission.id,
        expiration: approval.expiration,
        expired: false,
        signatures: 1,
      },
      approval,
    }) as string;
    expect(out).toContain("Signature added");
    expect(out).toContain("Tsigner  (weight 1)"); // signer weight on the action block
    expect(out).toContain('Permission  active "operations" (id 2)  threshold 2');
    expect(out).toContain("Progress  1 / 2");
    expect(out).toContain("Approved signer"); // weight table header
    expect(out).not.toContain("local inspection");
    expect(out).not.toContain("was not checked online");
  });

  // Doc §3.2: text gets the human operation name; the machine-readable contractType enum stays in
  // json. Printing both put a machine value in a human column.
  it("prints the human operation name without the contract-type enum", () => {
    const out = TextFormatters.txApprovals({ ...approval, operation: "Transfer TRX" }) as string;
    expect(out).toContain("Transfer TRX");
    expect(out).not.toContain("(TransferContract)");
  });

  it("falls back to the raw contract type when no human name is known", () => {
    const out = TextFormatters.txApprovals({ ...approval, operation: undefined }) as string;
    expect(out).toContain("TransferContract");
  });

  it("prints the human operation name on the offline sign receipt too", () => {
    const out = TextFormatters.txSign({
      kind: "tx-sign",
      signer: "Tsigner",
      checked: false,
      hex: "aabb",
      transaction: {
        txId: approval.txId,
        contractType: "TransferContract",
        operation: "Transfer TRX",
        rawAmount: "1000000",
        permissionId: 2,
        expiration: approval.expiration,
        expired: false,
        signatures: 1,
      },
    } as any) as string;
    expect(out).toContain("Transfer TRX");
    expect(out).not.toContain("(TransferContract)");
  });

  it("shows the next broadcast command only after threshold is reached", () => {
    const transaction = {
      txId: approval.txId,
      contractType: approval.contractType,
      operation: approval.operation,
      from: approval.from,
      to: approval.to,
      rawAmount: approval.rawAmount,
      permissionId: approval.permission.id,
      expiration: approval.expiration,
      expired: approval.expired,
      signatures: approval.signatures,
    };
    const pending = TextFormatters.txSign({
      kind: "tx-sign",
      signer: "Tsigner",
      checked: true,
      signerWeight: 1,
      hex: "aabb",
      transaction,
      approval,
    }) as string;
    expect(pending).not.toContain("wallet-cli tx broadcast");

    const ready = TextFormatters.txSign({
      kind: "tx-sign",
      signer: "Tsigner2",
      checked: true,
      signerWeight: 1,
      hex: "ccdd",
      out: "signed.hex",
      transaction: { ...transaction, signatures: 2 },
      approval: {
        ...approval,
        currentWeight: 2,
        missingWeight: 0,
        thresholdReached: true,
      },
    }) as string;
    expect(ready).toContain("wallet-cli tx broadcast --file signed.hex");
  });

  it("labels offline signing and points to the explicit approval check", () => {
    const out = TextFormatters.txSign({
      kind: "tx-sign",
      signer: "Tsigner",
      checked: false,
      hex: "aabb",
      transaction: {
        txId: approval.txId,
        contractType: approval.contractType,
        permissionId: approval.permission.id,
        expiration: approval.expiration,
        expired: false,
        signatures: 1,
      },
    }) as string;
    expect(out).toContain("Approval state was not checked online");
    expect(out).toContain("wallet-cli tx approvals --hex <hex-above>");
    expect(out).not.toContain("weight");
  });
});

describe("txStatus formatter (family-agnostic; command supplies `state`)", () => {
  it("tron: confirmed when not failed", () => {
    const out = TextFormatters.txStatus({
      txid: "abc",
      state: "confirmed",
      confirmed: true,
      failed: false,
      blockNumber: 123,
    });
    expect(out).toContain("confirmed");
    expect(out).toContain("#123");
  });
  it("tron: failed when command flags it", () => {
    const out = TextFormatters.txStatus({
      txid: "abc",
      state: "failed",
      confirmed: true,
      failed: true,
      blockNumber: 1,
    });
    expect(out).toContain("failed");
  });
  it("pending when known but not yet confirmed", () => {
    const out = TextFormatters.txStatus({
      txid: "abc",
      state: "pending",
      confirmed: false,
      failed: false,
    });
    expect(out).toContain("pending");
  });
  it("not found when the node has no record of the tx", () => {
    const out = TextFormatters.txStatus({
      txid: "abc",
      state: "not_found",
      confirmed: false,
      failed: false,
    });
    expect(out).toContain("not found");
  });
});

describe("txInfo formatter (per-family, narrowed on ctx.net.family)", () => {
  it("tron: shows TRX amount, energy and fee in TRX", () => {
    const out = TextFormatters.txInfo(
      {
        txid: "abc",
        from: "Tfrom",
        to: "Tto",
        amount: "1.5",
        symbol: "TRX",
        status: "SUCCESS",
        blockNumber: 66000000,
        energyUsed: 28000,
        feeSun: 268000,
        transaction: {},
        info: {},
      },
      ctx({
        net: {
          id: "tron:nile",
          family: "tron",
          nativeSymbol: "TRX",
          chainId: "nile",
          feeModel: "tron-resource",
          capabilities: [],
        },
      }),
    );
    expect(out).toContain("1.5 TRX");
    expect(out).toContain("#66,000,000");
    expect(out).toContain("28,000");
    expect(out).toContain("0.268 TRX");
    expect(out).toContain("SUCCESS");
  });
});

describe("accountInfo staking summary", () => {
  const accountInfo = (amount: unknown) =>
    TextFormatters.accountInfo(
      {
        address: "Towner",
        account: { balance: 0, frozenV2: [{ type: "ENERGY", amount }] },
        resources: {},
      },
      ctx(),
    );

  it("preserves staking amounts above Number.MAX_SAFE_INTEGER when supplied as strings", () => {
    // grouped per §1.4; the point of this test is that the fraction survives intact past
    // Number.MAX_SAFE_INTEGER, which it still does.
    expect(accountInfo("9007199254740993")).toContain("9,007,199,254.740993 TRX");
  });

  it("omits the staking summary for an already-unsafe numeric amount", () => {
    expect(accountInfo(9007199254740992)).not.toContain("Staked");
  });
});

describe("contractInfo formatter", () => {
  it("uses normalized methods + count", () => {
    const out = TextFormatters.contractInfo({
      address: "TR7c",
      name: "Foo",
      methods: ["a", "b"],
      functionCount: 2,
    });
    expect(out).toContain("Foo");
    expect(out).toContain("Methods");
    expect(out).toContain("2 (a / b)");
  });
  it("falls back to raw contract/info ABI shape", () => {
    const out = TextFormatters.contractInfo({
      address: "TR7c",
      contract: { name: "Bar", abi: { entrys: [{ type: "Function", name: "x" }] } },
    });
    expect(out).toContain("Bar");
    expect(out).toContain("1 (x)");
  });
});

describe("accountHistory formatter", () => {
  it("renders normalized rows", () => {
    const out = TextFormatters.accountHistory(
      {
        address: "TXaddr",
        records: [
          {
            time: 1700000000000,
            type: "Transfer",
            amount: "1000000",
            symbol: "TRX",
            counterparty: "Tother",
            status: "ok",
          },
        ],
      },
      ctx(),
    );
    expect(out).toContain("Transfer");
    expect(out).toContain("Tother");
  });
});

describe("sign-only receipt", () => {
  const base = {
    kind: "sign" as const,
    mode: "sign-only" as const,
    address: "TSigner",
    txId: "abc123",
  };
  const ctx = {
    command: "tx sign",
    net: { family: "tron", nativeSymbol: "TRX", id: "nile" },
  } as never;

  // The signature is the product of a signing command and has to be copied somewhere, so it must
  // never be shortened. Before this it showed a truncated txID — redundant with the TxID row and
  // useless as output.
  it("prints the signature in full", () => {
    const sig = "16a2ec10".repeat(16) + "1C";
    const out = TextFormatters.txReceipt(
      { ...base, signed: { txID: "abc123", signature: [sig] } },
      ctx,
    ) as string;
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
    const out = TextFormatters.txReceipt(
      { ...base, signed: { signature: ["aa".repeat(65)] } },
      ctx,
    ) as string;
    expect(out).not.toContain("Fee");
  });
});

// `config networks` used to be a list of ids (an array, which rendered fine). It is now a map of
// id -> endpoint, and `aliases` is a map too — both printed as "[object Object]" until this.
describe("config renders map-valued keys", () => {
  it("renders a single-key read as a titled block", () => {
    const out = TextFormatters.config({
      key: "aliases",
      value: { nile: "tron:nile", sepolia: "evm:11155111" },
    });

    // `titled` is the house shape: bare title line, then indented fields (no colon) — see
    // asset.ts / exchange.ts / governance.ts for the same form.
    expect(out.split("\n")[0]).toBe("aliases");
    expect(out).toMatch(/^ {2}nile\s+tron:nile$/m);
    expect(out).toMatch(/^ {2}sepolia\s+evm:11155111$/m);
    expect(out).not.toContain("[object Object]");
  });

  // The whole-config view used to SUMMARISE a map by listing its keys ("networks  tron:nile,
  // evm:1"), which said a network existed but never what it was configured with. §2.4 (revised):
  // config renders every configurable value, nested — the file's own shape, indented.
  it("expands map-valued keys in the whole-config view", () => {
    const out = TextFormatters.config({
      defaultOutput: "text",
      networks: {
        "tron:nile": { httpEndpoint: "nile.trongrid.io" },
        "evm:1": { httpEndpoint: "ethereum-rpc.publicnode.com" },
      },
    });

    // No trailing colon: a network id already contains one, so `tron:nile:` would hide where the
    // id ends — and the id is what a reader copies into `--network` / `config networks.<id>`.
    expect(out).toMatch(/^networks$/m);
    expect(out).toMatch(/^ {2}tron:nile$/m);
    expect(out).toMatch(/^ {4}httpEndpoint {2}nile\.trongrid\.io$/m);
    expect(out).toMatch(/^ {2}evm:1$/m);
    expect(out).not.toContain("[object Object]");
  });

  // Two levels deep, under a named read: the block below a network is its fields, indented once.
  it("renders a single network read as a nested block", () => {
    const out = TextFormatters.config({
      key: "networks.tron:nile",
      value: {
        httpEndpoint: "https://nile.trongrid.io",
        apiKeyHeader: "TRON-PRO-API-KEY",
        apiKey: "********",
      },
    });

    expect(out.split("\n")[0]).toBe("networks.tron:nile");
    expect(out).toMatch(/^ {2}httpEndpoint {2}https:\/\/nile\.trongrid\.io$/m);
    expect(out).toMatch(/^ {2}apiKey {8}\*{8}$/m);
  });

  // A scalar leaf keeps its one-line form; nesting must not swallow the simple case.
  it("keeps a scalar read on one line", () => {
    expect(TextFormatters.config({ key: "timeoutMs", value: 60_000 })).toMatch(
      /^timeoutMs {2}60000$/,
    );
  });
});

// §1.4 draws a distinction the renderer previously did not: a VALUATION gets 2 decimals, a UNIT
// PRICE gets 4. This column had no coverage at all, so the two were silently the same.
describe("portfolio price vs valuation precision", () => {
  const portfolio = (priceUsd: string, valueUsd: string) =>
    TextFormatters.accountPortfolio(
      {
        address: "Towner",
        holdings: [{ symbol: "USDT", balance: "1000", priceUsd, valueUsd }],
        totalValueUsd: valueUsd,
      },
      ctx(),
    ) as string;

  it("shows a depegged stablecoin's price instead of rounding it to a dollar", () => {
    expect(portfolio("0.9998", "999.80")).toContain("$0.9998");
  });

  it("keeps the valuation at two decimals", () => {
    expect(portfolio("0.9998", "999.8")).toContain("$999.80");
  });

  it("does not collapse a sub-cent price to zero", () => {
    expect(portfolio("0.0001", "0.10")).toContain("$0.0001");
  });
});

// The address already says which chain it is (T… / 0x…), so a Family column repeats it in
// vocabulary the user never needs otherwise. Externally the book is a flat name↔address map.
describe("contact list is a flat name-to-address map", () => {
  const listed = () =>
    TextFormatters.contactList({
      contacts: [
        { name: "tron-friend", address: "TWer2Ygk5", note: null },
        { name: "evm-friend", address: "0xe2E1a549", note: "team" },
      ],
    }) as string;

  it("has no Family column — the address already tells you the chain", () => {
    expect(listed().split("\n")[0]).not.toMatch(/\bFamily\b/);
  });

  it("still lists every entry, whichever chain it belongs to", () => {
    const out = listed();
    expect(out).toContain("TWer2Ygk5");
    expect(out).toContain("0xe2E1a549");
  });
});

// §3.7: the address column follows the SELECTED NETWORK's family. text never puts both families
// side by side — the table doubles in width and the user only cares about the chain in use.
describe("list shows one family's addresses at a time", () => {
  const accounts = [
    {
      accountId: "wlt_a.0",
      label: "main",
      type: "seed",
      index: 0,
      active: true,
      addresses: { tron: "TSRmq8kP9dEf", evm: "0x7a3fc19b" },
    },
    {
      accountId: "wlt_l",
      label: "ledger-evm",
      type: "ledger",
      index: null,
      active: false,
      family: "evm",
      nativeSymbol: "ETH",
      addresses: { evm: "0x91b24d0e" },
    },
    {
      accountId: "wlt_w",
      label: "team-vault",
      type: "watch",
      index: null,
      active: false,
      family: "tron",
      nativeSymbol: "TRX",
      addresses: { tron: "TBhCfAyt3TCUp" },
    },
  ];
  const listed = (family: "tron" | "evm") =>
    TextFormatters.walletList(accounts, ctx({ net: { family } as never })) as string;

  it("shows the TRON column under a TRON network", () => {
    const out = listed("tron");
    expect(out).toContain("TSRmq8kP9dEf");
    expect(out).not.toContain("0x7a3fc19b");
  });

  it("shows the EVM column under an EVM network", () => {
    const out = listed("evm");
    expect(out).toContain("0x7a3fc19b");
    expect(out).not.toContain("TSRmq8kP9dEf");
  });

  // A single-family account has nothing to show on the other family's network, and an empty row
  // is worse than no row.
  it("hides single-family accounts that do not belong to the selected network", () => {
    expect(listed("tron")).not.toContain("ledger-evm");
    expect(listed("evm")).not.toContain("team-vault");
  });

  it("keeps the accounts that do belong", () => {
    expect(listed("tron")).toContain("team-vault");
    expect(listed("evm")).toContain("ledger-evm");
  });
});

// `--keystore` picks ONE of a seed account's two keys, and with --network omitted that choice
// comes from config.defaultNetwork. The receipt has to say which key was written, or the same
// command on two machines silently produces different secrets with nothing to tell them apart.
describe("keystore receipt names the exported family", () => {
  const receipt = (extra: Record<string, unknown>) =>
    TextFormatters.walletBackup({
      accountId: "wlt_a.0",
      out: "/tmp/x.keystore.json",
      format: "keystore",
      secretType: "privateKey",
      fileMode: "0600",
      bytes: 491,
      ...extra,
    }) as string;

  it("shows the family a keystore export used", () => {
    expect(receipt({ family: "evm" })).toMatch(/^\s*Family\s+evm$/m);
  });

  // A mnemonic covers every family, so there is nothing to disambiguate and a row would imply
  // a choice that was never made.
  it("omits the row for a native backup", () => {
    const out = TextFormatters.walletBackup({
      accountId: "wlt_a.0",
      out: "/tmp/x.json",
      secretType: "mnemonic",
      bytes: 313,
    }) as string;

    expect(out).not.toMatch(/\bFamily\b/);
  });
});
